const request = require('request')
const puppeteer = require('puppeteer')
const { TimeoutError } = require('puppeteer/Errors')
const { URL } = require('url')
const { parse, parseMetaFromDocument } = require('parse-open-graph')
const urlRewrite = require('./urlRewrite')

const ERRORS_MAPPING = {
  EACCES: 'accessdenied',
  EHOSTUNREACH: 'addressunreachable',
  ECONNABORTED: 'connectionaborted',
  ECONNREFUSED: 'connectionrefused',
  ECONNRESET: 'connectionreset',
  ENOTFOUND: 'namenotresolved',
  ETIMEDOUT: 'timedout'
}

class Prerenderer {
  constructor({
    debug = false,
    puppeteerLaunchOptions,
    timeout = 30000,
    userAgent,
    followRedirect = false,
    extraMeta,
    parseOpenGraphOptions,
    appendSearchParams,
    rewrites
  } = {}) {
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
    this.appendSearchParams = appendSearchParams
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

    return this.browser
  }

  fetchDocument(url, headers, timeout) {
    return new Promise((resolve, reject) => {
      const req = request({
        url,
        headers,
        gzip: true,
        timeout,
        followRedirect: false,
        encoding: null // return body as buffer
      }, (e, res, body) => {
        if (e) {
          reject(new Error(ERRORS_MAPPING[e.code] || 'failed'))
        } else {
          delete res.headers['content-disposition']
          delete res.headers['content-encoding']
          delete res.headers['content-length']

          resolve({
            status: res.statusCode,
            headers: res.headers,
            body
          })
        }
      }).on('response', res => {
        if (res.statusCode >= 200 && res.statusCode <= 299 && !res.headers['content-type'].includes('text/html')) {
          req.abort()
          reject(new Error('PARSE::ERR_INVALID_FILE_TYPE'))
        }
      })
    })
  }

  // returns: { status, redirect, meta, openGraph, links, html, staticHTML }
  render(url, {
    userAgent = this.userAgent,
    timeout = this.timeout,
    followRedirect = this.followRedirect,
    extraMeta = this.extraMeta,
    parseOpenGraphOptions = this.parseOpenGraphOptions,
    appendSearchParams = this.appendSearchParams,
    rewrites = this.rewrites
  } = {}) {
    return new Promise(async(resolve, reject) => {
      const browser = await this.launch()
      url = new URL(url)

      const timerOpenTab = this.timer('open tab')
      const page = await browser.newPage()
      if (userAgent) page.setUserAgent(userAgent)
      await page.setRequestInterception(true)
      timerOpenTab()

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
        this.debug({ resourceType, url, headers })

        if (rewrites) {
          const url2 = urlRewrite(url, rewrites)
          if (url !== url2) {
            this.debug(`${url} rewrites to ${url2}`)

            if (!url2) {
              this.debug('abort', url)
              return req.abort()
            } else {
              url = url2
              try {
                headers.host = new URL(url).host
              } catch (e) {
                this.debug('Invalid URL', url)
                return req.abort()
              }
            }
          }
        }

        if (resourceType === 'document') {
          // abort iframe request
          if (req.frame() !== page.mainFrame()) {
            this.debug('abort', url)
            return req.abort()
          }

          try {
            if (appendSearchParams) {
              url = new URL(url)
              for (const [name, value] of Object.entries(appendSearchParams)) {
                url.searchParams.append(name, value)
              }
              url = url.href
            }

            delete headers['x-devtools-emulate-network-conditions-client-id']
            const res = await this.fetchDocument(url, headers, timeout - 1000)
            this.debug({ url, status: res.status, headers: res.headers })

            status = res.status

            if ([301, 302].includes(status)) {
              redirect = res.headers.location
              if (followRedirect) return req.respond(res)
            }

            if (res.body) {
              req.respond(res)
            } else {
              resolve({ status, redirect, meta, openGraph, links, html, staticHTML })
              req.abort()
            }
          } catch (e) {
            this.debug(e)
            if (e.message === 'PARSE::ERR_INVALID_FILE_TYPE') {
              reject(e)
              req.abort()
            } else {
              req.abort(e.message)
            }
          }
        } else if (['script', 'xhr', 'fetch', 'eventsource', 'websocket', 'other'].includes(resourceType)) {
          req.continue({ url, headers })
        } else {
          this.debug('abort', url)
          req.abort()
        }
      })

      try {
        const timerGotoURL = this.timer(`goto ${url.href}`)

        await Promise.race([
          page.goto(url.href, {
            waitUntil: 'networkidle0',
            timeout
          }).catch(e => {
            if (e instanceof TimeoutError) {
              // https://github.com/GoogleChrome/puppeteer/issues/3471
              // nop
            } else {
              throw e
            }
          }),

          page.waitFor(() => window.PAGE_READY)
        ])

        timerGotoURL()

        const timerParseDoc = this.timer('parseDoc')
        const openGraphMeta = await page.evaluate(parseMetaFromDocument)
        if (openGraphMeta.length) openGraph = parse(openGraphMeta, parseOpenGraphOptions)

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

        await page.evaluate(() => {
          let baseEl = document.getElementsByTagName('base')[0]
          if (!baseEl) {
            baseEl = document.createElement('base')
            baseEl.href = location.href
            document.head.prepend(baseEl)
          }
        })

        html = await page.content()

        ;({ meta, links } = await page.evaluate((meta, extraMeta) => {
          // staticHTML
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

          let links = new Set()
          const linkEls = document.links
          for (const a of linkEls) {
            if (a.protocol !== 'javascript:') {
              links.add(a.href)
            }
          }
          links = [...links]

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
      await this.browser.close()
      this.browser = null
    }
  }
}

module.exports = Prerenderer
