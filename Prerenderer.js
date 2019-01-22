const EventEmitter = require('events')
const puppeteer = require('puppeteer')
const { URL } = require('url')
const { parse, parseMetaFromDocument } = require('parse-open-graph')
const urlRewrite = require('./urlRewrite')

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
  render(url, {
    userAgent = this.userAgent,
    timeout = this.timeout,
    followRedirect = this.followRedirect,
    extraMeta = this.extraMeta,
    parseOpenGraphOptions = this.parseOpenGraphOptions,
    rewrites = this.rewrites
  } = {}) {
    return new Promise(async(resolve, reject) => {
      let browser, page
      try {
        browser = await this.launch()
        const timerOpenTab = this.timer('open tab')
        page = await browser.newPage()
        timerOpenTab()
      } catch (e) {
        reject(e)
        return
      }

      let status = null
      let redirect = null
      let meta = null
      let openGraph = null
      let links = null
      let html = null
      let staticHTML = null

      page.on('request', async req => {
        const resourceType = req.resourceType()
        let url = req.url()
        const headers = req.headers()
        delete headers['x-devtools-emulate-network-conditions-client-id']

        if (rewrites) {
          const url2 = urlRewrite(url, rewrites)
          if (url !== url2) {
            this.debug(`${url} rewrites to ${url2}`)

            if (!url2) {
              this.debug('abort', url)
              await req.abort()
              return
            } else {
              url = url2
              try {
                headers.host = new URL(url).host
              } catch (e) {
                this.debug('Invalid URL', url)
                await req.abort()
                return
              }
            }
          }
        }

        if (req.isNavigationRequest()) {
          // abort iframe requests
          if (req.frame() !== page.mainFrame()) {
            this.debug('abort', url)
            await req.abort()
            return
          }

          this.debug(resourceType, url)
          req.continue({ url, headers })
        } else if (['script', 'stylesheet', 'xhr', 'fetch', 'eventsource', 'other'].includes(resourceType)) {
          this.debug(resourceType, url)
          req.continue({ url, headers })
        } else {
          this.debug('abort', resourceType, url)
          await req.abort()
        }
      })

      page.on('error', e => {
        this.debug('page crashed:', url, e)
        reject(e)
      })

      try {
        const timerGotoURL = this.timer(`goto ${url}`)

        if (userAgent) await page.setUserAgent(userAgent)
        await page.setRequestInterception(true)

        const time = Date.now()
        const res = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout
        })

        this.debug('domcontentloaded', url)

        const redirects = res.request().redirectChain()

        if (redirects.length) {
          status = redirects[0].response().status()
          redirect = redirects[0].url()

          if (!followRedirect) {
            resolve({ status, redirect, meta, openGraph, links, html, staticHTML })
            return
          }
        } else {
          status = res.status()
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
        await page.evaluate(() => {
          let baseEl = document.getElementsByTagName('base')[0]
          if (!baseEl) {
            baseEl = document.createElement('base')
            baseEl.href = location.href
            document.head.prepend(baseEl)
          }
        })

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

        resolve({ status, redirect, meta, openGraph, links, html, staticHTML })
      } catch (e) {
        reject(e)
      } finally {
        try {
          await page.close()
        } catch (e) {
          // UnhandledPromiseRejectionWarning will be thrown if page.close() is called after browser.close()
        }
      }
    })
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
