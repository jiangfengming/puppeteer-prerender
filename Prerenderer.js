const request = require('request')
const puppeteer = require('puppeteer')
const { URL } = require('url')
const { parse, parseMetaFromDocument } = require('parse-open-graph')

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
    parseOpenGraphOptions
  } = {}) {
    this.debug = debug
    this.puppeteerLaunchOptions = puppeteerLaunchOptions
    this.timeout = timeout
    this.userAgent = userAgent
    this.followRedirect = followRedirect
    this.extraMeta = extraMeta
    this.parseOpenGraphOptions = parseOpenGraphOptions
    this.browser = null
  }

  log(...args) {
    if (this.debug) {
      console.log(...args) // eslint-disable-line no-console
    }
  }

  async launch() {
    if (this.browser) return this.browser

    this.log('launch the browser with args:')
    this.log(this.puppeteerLaunchOptions)
    this.browser = await puppeteer.launch(this.puppeteerLaunchOptions)

    return this.browser
  }

  fetchDocument(url, headers, timeout) {
    return new Promise((resolve, reject) => {
      request.debug = this.debug

      const req = request({
        url,
        headers,
        gzip: true,
        timeout,
        followRedirect: false
      }, (e, res, body) => {
        if (e) {
          reject(new Error(ERRORS_MAPPING[e.code] || 'failed'))
        } else {
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
    parseOpenGraphOptions = this.parseOpenGraphOptions
  } = {}) {
    return new Promise(async(resolve, reject) => {
      const browser = await this.launch()
      url = new URL(url)
      const page = await browser.newPage()
      if (userAgent) page.setUserAgent(userAgent)
      await page.setRequestInterception(true)

      let status, redirect, meta, openGraph, links, html, staticHTML

      page.on('request', async req => {
        const resourceType = req.resourceType()
        const url = req.url()
        const headers = req.headers()
        this.log(resourceType, url, headers)

        if (resourceType === 'document') {
          // abort iframe request
          if (req.frame() !== page.mainFrame()) {
            this.log('abort', url)
            return req.abort()
          }

          try {
            delete headers['x-devtools-emulate-network-conditions-client-id']
            const res = await this.fetchDocument(url, headers, timeout - 1000)
            this.log(res.status, res.headers)

            if (res.status >= 200 && res.status <= 299) {
              status = res.status
              req.respond(res)
            } else {
              status = res.status

              if ([301, 302].includes(res.status)) {
                redirect = res.headers.location
                if (followRedirect) return req.respond(res)
              }

              resolve({ status, redirect, meta, openGraph, links, html, staticHTML })

              req.abort()
            }
          } catch (e) {
            this.log(e)
            if (e.message === 'PARSE::ERR_INVALID_FILE_TYPE') {
              reject(e)
              req.abort()
            } else {
              req.abort(e.message)
            }
          }
        } else if (['script', 'xhr', 'fetch', 'eventsource', 'websocket'].includes(resourceType)) {
          req.continue()
        } else {
          this.log('abort', url)
          req.abort()
        }
      })

      try {
        await page.goto(url.href, {
          waitUntil: 'networkidle0',
          timeout
        })

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

        ({ meta, links, html, staticHTML } = await page.evaluate((meta, extraMeta) => {
          const html = document.documentElement.outerHTML

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

          let baseEl = document.getElementsByTagName('base')[0]
          if (!baseEl) {
            baseEl = document.createElement('base')
            baseEl.href = location.href
            document.head.prepend(baseEl)
          }

          const staticHTML = document.documentElement.outerHTML

          if (!meta.title) meta.title = document.title

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
            links.add(a.href)
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

          return { meta, links, html, staticHTML }
        }, meta, extraMeta))

        resolve({ status, redirect, meta, openGraph, links, html, staticHTML })
      } catch (e) {
        reject(e)
      } finally {
        page.close()
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
