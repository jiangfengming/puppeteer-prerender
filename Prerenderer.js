const EventEmitter = require('events')
const puppeteer = require('puppeteer')
const { parse, parseMetaFromDocument } = require('parse-open-graph')
const urlRewrite = require('url-rewrite/es6')
const fs = require('fs')
const emptyMedia = fs.readFileSync(__dirname + '/empty.wav')

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
    this._lastStart = 0

    this._onBrowserDisconnected = this._onBrowserDisconnected.bind(this)
  }

  timer(name) {
    const time = Date.now()

    return () => {
      this.debug(`${name}: ${Date.now() - time}ms`)
    }
  }

  async launch() {
    if (this.browser) {
      // launch a new browser every hour
      if (this._lastStart + 60 * 60 * 1000 > Date.now()) {
        return this.browser
      } else {
        this.browser.off('disconnected', this._onBrowserDisconnected)
        setTimeout(() => this.browser.close(), 60 * 1000)
      }
    }

    this.debug('launch the browser with args:', this.puppeteerLaunchOptions)
    this.browser = await puppeteer.launch(this.puppeteerLaunchOptions)
    this.browser.on('disconnected', this._onBrowserDisconnected)
    this._lastStart = Date.now()

    return this.browser
  }

  _onBrowserDisconnected() {
    if (!this.closing) {
      this.browser = null
      // only emit 'disconnected' event when the browser is crashed
      this.emit('disconnected')
    }
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

    const result = {
      status: null,
      redirect: null,
      meta: null,
      openGraph: null,
      links: null,
      html: null,
      staticHTML: null
    }

    let navigated = 0

    page.on('request', async req => {
      const resourceType = req.resourceType()
      let url = req.url()

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
        }
      }

      if (req.isNavigationRequest()) {
        // abort iframe requests
        if (req.frame() !== page.mainFrame()) {
          this.debug('abort', url)
          return await req.abort()
        }

        navigated++

        if (navigated === 1 || followRedirect) {
          await req.continue({ url })
        } else {
          await req.respond({
            status: 200,
            contentType: 'text/plain',
            body: 'redirect cancelled'
          })
        }
      } else if (['script', 'xhr', 'fetch'].includes(resourceType)) {
        this.debug(resourceType, url)
        await req.continue({ url })
      } else if (resourceType === 'stylesheet') {
        this.debug(resourceType, url)

        await req.respond({
          contentType: 'text/css',
          body: ''
        })
      } else if (resourceType === 'media') {
        this.debug(resourceType, url)

        await req.respond({
          contentType: 'audio/wav',
          body: emptyMedia
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

      if (userAgent) {
        await page.setUserAgent(userAgent)
      }

      await page.setRequestInterception(true)

      const res = await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout
      })

      this.debug('networkidle0', url)

      const redirects = res.request().redirectChain()

      if (redirects.length) {
        result.status = redirects[0].response().status()
        result.redirect = redirects[0].response().headers().location

        if (!followRedirect) {
          return result
        }
      } else if (navigated > 1) { // redirect by js
        if (!followRedirect) {
          result.status = 302
          result.redirect = await page.url()

          return result
        }
      } else {
        result.status = res.status()
        const ok = result.status === 304 || res.ok()

        if (result.status === 304) {
          result.status = 200
        }

        if (!ok) {
          const text = await res.text()

          if (!text.length) {
            return result
          }
        }
      }

      timerGotoURL()

      const timerParseDoc = this.timer(`parse ${url}`)

      // html
      result.html = await page.content()

      // open graph
      const openGraphMeta = await page.evaluate(parseMetaFromDocument)
      const openGraph = result.openGraph = openGraphMeta.length
        ? parse(openGraphMeta, parseOpenGraphOptions)
        : null

      // extract meta info from open graph
      const meta = result.meta = {}

      if (openGraph) {
        if (openGraph.og) {
          if (openGraph.og.title) {
            meta.title = openGraph.og.title
          }

          if (openGraph.og.description) {
            meta.description = openGraph.og.description
          }

          if (openGraph.og.image) {
            meta.image = openGraph.og.image[0].url
          }

          if (openGraph.og.url) {
            meta.canonicalURL = openGraph.og.url
          }
        }

        if (openGraph.article) {
          if (openGraph.article.tag) {
            meta.keywords = openGraph.article.tag
          }
        } else if (openGraph.video && openGraph.video.tag) {
          meta.keywords = openGraph.video.tag
        } else if (openGraph.book && openGraph.book.tag) {
          meta.keywords = openGraph.book.tag
        }
      }

      const metaAndLinks = await page.evaluate((meta, extraMeta) => {
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

        if (!meta.title && document.title) {
          meta.title = document.title
        }

        ['author', 'description'].forEach(name => {
          const el = document.querySelector(`meta[name="${name}"]`)

          if (el) {
            meta[name] = el.content
          }
        })

        ;['robots', 'keywords'].forEach(name => {
          const el = document.querySelector(`meta[name="${name}"]`)

          if (el) {
            meta[name] = el.content.split(/\s*,\s*/)
          }
        })

        const link = document.querySelector('link[rel="canonical"]')

        if (link) {
          meta.canonicalURL = link.href
        }

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
      }, meta, extraMeta)

      Object.assign(result, metaAndLinks)
      result.staticHTML = await page.content()
      timerParseDoc()

      return result
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
