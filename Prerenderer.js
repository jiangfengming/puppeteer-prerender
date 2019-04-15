const EventEmitter = require('events')
const puppeteer = require('puppeteer')
const { parse, parseMetaFromDocument } = require('parse-open-graph')
const urlRewrite = require('url-rewrite/es6')

class Prerenderer extends EventEmitter {
  constructor({
    debug = false,
    puppeteerLaunchOptions,
    timeout = 30000,
    userAgent,
    followRedirect = false,
    extraMeta,
    parseOpenGraphOptions,
    rewrites
  } = {}) {
    super()

    if (debug instanceof Function) {
      this.debug = debug
    } else if (debug === true) {
      this.debug = (...args) => {
        console.log(...args) // eslint-disable-line no-console
      }
    } else {
      this.debug = () => {}
    }

    this.puppeteerLaunchOptions = puppeteerLaunchOptions
    this.timeout = timeout
    this.userAgent = userAgent
    this.followRedirect = followRedirect
    this.extraMeta = extraMeta
    this.parseOpenGraphOptions = parseOpenGraphOptions
    this.browser = null
    this.rewrites = rewrites
  }

  timer(name) {
    const time = Date.now()
    return () => {
      this.debug(`${name}: ${Date.now() - time}ms`)
    }
  }

  async launch() {
    if (this.browser) return this.browser

    this.debug('launch the browser with args:', this.puppeteerLaunchOptions)
    this.browser = await puppeteer.launch(this.puppeteerLaunchOptions)

    this.browser.on('disconnected', () => {
      if (!this.closing) {
        this.browser = null
        // only emit 'disconnected' event when the browser is crashed
        this.emit('disconnected')
      }
    })

    return this.browser
  }

  // returns: { status, redirect, meta, openGraph, links, html, staticHTML }
  async render(url, {
    userAgent = this.userAgent,
    timeout = this.timeout,
    followRedirect = this.followRedirect,
    extraMeta = this.extraMeta,
    parseOpenGraphOptions = this.parseOpenGraphOptions,
    rewrites = this.rewrites
  } = {}) {
    const browser = await this.launch()
    const timerOpenTab = this.timer('open tab')
    const page = await browser.newPage()
    timerOpenTab()

    let status = null
    let redirect = null
    let meta = null
    let openGraph = null
    let links = null
    let html = null
    let staticHTML = null
    let navigated = false

    page.on('request', async req => {
      const resourceType = req.resourceType()
      let url = req.url()
      const headers = req.headers()

      if (rewrites) {
        let url2
        try {
          url2 = urlRewrite(url, rewrites, true)
        } catch (e) {
          this.debug('url rewrite error.', url)
          return await req.abort()
        }

        if (!url2) {
          this.debug(url, 'rewrites to null.')
          return await req.abort()
        } else if (url2.href !== url) {
          this.debug(url, 'rewrites to', url2.href)
          url = url2.href
          headers.host = url2.host
        }
      }

      if (req.isNavigationRequest()) {
        // abort iframe requests
        if (req.frame() !== page.mainFrame()) {
          this.debug('abort', url)
          return await req.abort()
        }

        // no redirect chain means the navigation is caused by setting `location.href`
        if (!navigated || (followRedirect && req.redirectChain().length)) {
          navigated = true
          await req.continue({ url, headers })
        } else {
          await (req.redirectChain().length ? req.respond({ body: '' }) : req.abort('aborted'))
        }
      } else if (['script', 'xhr', 'fetch', 'eventsource', 'other'].includes(resourceType)) {
        this.debug(resourceType, url)
        await req.continue({ url, headers })
      } else if (resourceType === 'stylesheet') {
        this.debug(resourceType, url)
        await req.respond({
          contentType: 'text/css',
          body: ''
        })
      } else {
        this.debug('abort', resourceType, url)
        await req.abort()
      }
    })

    page.on('error', e => {
      this.debug('page crashed:', url, e)
    })

    try {
      const timerGotoURL = this.timer(`goto ${url}`)

      if (userAgent) await page.setUserAgent(userAgent)
      await page.setRequestInterception(true)

      const time = Date.now()
      const res = await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout
      })

      this.debug('networkidle0', url)

      const redirects = res.request().redirectChain()

      if (redirects.length) {
        status = redirects[0].response().status()
        redirect = redirects[0].response().headers().location

        if (!followRedirect) {
          return { status, redirect, meta, openGraph, links, html, staticHTML }
        }
      } else {
        status = res.status()
        const ok = status === 304 || res.ok()
        if (status === 304) status = 200

        if (!ok) {
          const text = await res.text()
          if (!text.length) {
            return { status, redirect, meta, openGraph, links, html, staticHTML }
          }
        }
      }

      const pageReady = await page.evaluate(() => window.PAGE_READY)
      if (pageReady === false) {
        await page.waitForFunction(() => window.PAGE_READY, {
          timeout: timeout - (Date.now() - time)
        })

        this.debug('PAGE_READY', url)
      }

      timerGotoURL()

      const timerParseDoc = this.timer(`parse ${url}`)

      // html
      html = await page.content()

      // open graph
      const openGraphMeta = await page.evaluate(parseMetaFromDocument)
      if (openGraphMeta.length) {
        openGraph = parse(openGraphMeta, parseOpenGraphOptions)
      }

      // extract meta info from open graph
      meta = {}

      if (openGraph) {
        if (openGraph.og) {
          if (openGraph.og.title) meta.title = openGraph.og.title
          if (openGraph.og.description) meta.description = openGraph.og.description
          if (openGraph.og.image) meta.image = openGraph.og.image[0].url
          if (openGraph.og.url) meta.canonicalURL = openGraph.og.url
        }

        if (openGraph.article) {
          if (openGraph.article.tag) meta.keywords = openGraph.article.tag
        } else if (openGraph.video && openGraph.video.tag) {
          meta.keywords = openGraph.video.tag
        } else if (openGraph.book && openGraph.book.tag) {
          meta.keywords = openGraph.book.tag
        }
      }

      ({ meta, links } = await page.evaluate((meta, extraMeta) => {
        // staticHTML
        // remove <script> tags
        const scripts = document.getElementsByTagName('script')
        ;[...scripts].forEach(el => el.parentNode.removeChild(el))

        // remove on* attributes
        const snapshot = document.evaluate(
          '//*[@*[starts-with(name(), "on")]]',
          document,
          null,
          XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
          null
        )

        for (let i = 0; i < snapshot.snapshotLength; i++) {
          const el = snapshot.snapshotItem(i)
          const attrNames = el.getAttributeNames()
          attrNames.forEach(attr => {
            if (attr.startsWith('on')) {
              el.removeAttribute(attr)
            }
          })
        }

        // remove <a href="javascript:*">
        // and collect links
        let links = new Set()
        const linkEls = document.links
        for (const a of linkEls) {
          if (a.protocol === 'javascript:') {
            a.href = '#'
          } else {
            links.add(a.href)
          }
        }
        links = [...links]

        // remove conditional comments
        // no need to keep comments
        // so actually we can remove all comments
        const nodeIterator = document.createNodeIterator(document.documentElement, NodeFilter.SHOW_COMMENT)
        let node
        while (node = nodeIterator.nextNode()) { // eslint-disable-line no-cond-assign
          node.parentNode.removeChild(node)
        }

        if (!meta.title && document.title) meta.title = document.title

        ;['author', 'description'].forEach(name => {
          const el = document.querySelector(`meta[name="${name}"]`)
          if (el) meta[name] = el.content
        })

        ;['robots', 'keywords'].forEach(name => {
          const el = document.querySelector(`meta[name="${name}"]`)
          if (el) meta[name] = el.content.split(/\s*,\s*/)
        })

        const link = document.querySelector('link[rel="canonical"]')
        if (link) meta.canonicalURL = link.href

        const locales = document.querySelectorAll('link[rel="alternate"][hreflang]')
        if (locales.length) {
          meta.locales = []
          for (const alt of locales) {
            meta.locales.push({
              hreflang: alt.hreflang,
              href: alt.href
            })
          }
        }

        const media = document.querySelectorAll('link[rel="alternate"][media]')
        if (media.length) {
          meta.media = []
          for (const m of media) {
            meta.media.push({
              media: m.media,
              href: m.href
            })
          }
        }

        if (!meta.image) {
          const imgs = document.getElementsByTagName('img')
          for (const img of imgs) {
            if (img.width >= 200 && img.height >= 200) {
              meta.image = img.href
              break
            }
          }
        }

        if (extraMeta) {
          for (const name of Object.keys(extraMeta)) {
            const { selector, property } = extraMeta[name]
            const el = document.querySelector(selector)
            if (el) {
              meta[name] = el[property]
            }
          }
        }

        return {
          meta: Object.keys(meta).length ? meta : null,
          links: links.length ? links : null
        }
      }, meta, extraMeta))

      staticHTML = await page.content()
      timerParseDoc()

      return { status, redirect, meta, openGraph, links, html, staticHTML }
    } finally {
      try {
        await page.close()
      } catch (e) {
        // UnhandledPromiseRejectionWarning will be thrown if page.close() is called after browser.close()
      }
    }
  }

  async close() {
    if (this.browser) {
      this.closing = true
      await this.browser.close()
      this.browser = null
      this.closing = false
    }
  }
}

module.exports = Prerenderer
