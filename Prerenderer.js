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
    puppeteerLaunchOptions = null,
    timeout = 30000,
    userAgent = null,
    followRedirect = false,
    removeScript = true
  } = {}) {
    this.debug = debug
    this.puppeteerLaunchOptions = puppeteerLaunchOptions
    this.timeout = timeout
    this.userAgent = userAgent
    this.followRedirect = followRedirect
    this.removeScript = removeScript
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


  // returns: { status, redirect, meta, openGraph, links, content }
  render(url, {
    userAgent = this.userAgent,
    timeout = this.timeout,
    followRedirect = this.followRedirect,
    removeScript = this.removeScript
  } = {}) {
    return new Promise(async(resolve, reject) => {
      const browser = await this.launch()
      url = new URL(url)
      const page = await browser.newPage()
      if (userAgent) page.setUserAgent(userAgent)
      await page.setRequestInterception(true)

      let status = null, redirect = null, meta = null, openGraph = null, links = null, content = null

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

              resolve({ status, redirect, meta, openGraph, links, content })

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

        const metaStatus = await page.evaluate(() => {
          const meta = document.querySelector('meta[http-equiv="status" i]')
          if (meta) {
            const status = parseInt(meta.content)
            if (!isNaN(status)) return status
          }
        })

        if (metaStatus) {
          status = metaStatus

          if ([301, 302].includes(status)) {
            redirect = page.url()
          } else if (status < 200 || status >= 300) {
            return resolve({ status, redirect, meta, openGraph, links, content })
          }
        }

        const openGraphMeta = await page.evaluate(parseMetaFromDocument)
        if (openGraphMeta.length) openGraph = parse(openGraphMeta)

        content = await page.content()

        meta = {
          title: null,
          lastModified: null,
          author: null,
          description: null,
          image: null,
          keywords: null,
          canonicalURL: null,
          locales: null,
          media: null
        }

        if (openGraph) {
          if (openGraph.og) {
            if (openGraph.og.title) meta.title = openGraph.og.title
            if (openGraph.og.description) meta.description = openGraph.og.description
            if (openGraph.og.image) meta.image = openGraph.og.image[0].url
            if (openGraph.og.url) meta.canonicalURL = openGraph.og.url
          }

          if (openGraph.article) {
            if (openGraph.article.tag) meta.keywords = openGraph.article.tag
            if (openGraph.article.modified_time) {
              const date = new Date(openGraph.article.modified_time)
              if (!isNaN(date.getTime())) {
                meta.lastModified = date.toISOString()
              }
            }
          } else if (openGraph.video && openGraph.video.tag) {
            meta.keywords = openGraph.video.tag
          } else if (openGraph.book && openGraph.book.tag) {
            meta.keywords = openGraph.book.tag
          }
        }

        ({ meta, links } = await page.evaluate((meta, removeScript) => {
          if (removeScript) {
            const scripts = document.getElementsByTagName('script')
            ;[...scripts].forEach(el => el.parentNode.removeChild(el))
          }

          if (!meta.title) meta.title = document.title

          const metaAuthor = document.querySelector('meta[name="author"]')
          if (metaAuthor) meta.author = metaAuthor.content

          if (!meta.lastModified) {
            const metaLastMod = document.querySelector('meta[http-equiv="last-modified" i]')
            if (metaLastMod) {
              const date = new Date(metaLastMod.content)
              if (!isNaN(date.getTime())) {
                meta.lastModified = date.toISOString()
              }
            }
          }

          if (!meta.description) {
            const metaDesc = document.querySelector('meta[name="description"]')
            if (metaDesc) meta.description = metaDesc.content
          }

          if (!meta.keywords) {
            const metaKeywords = document.querySelector('meta[name="keywords"]')
            if (metaKeywords) meta.keywords = metaKeywords.content.split(/\s*,\s*/)
          }

          if (!meta.canonicalURL) {
            const link = document.querySelector('link[rel="canonical"]')
            if (link) meta.canonicalURL = link.href
          }

          const locales = document.querySelectorAll('link[rel="alternate"][hreflang]')
          if (locales.length) {
            meta.locales = []
            for (const alt of locales) {
              meta.locales.push({
                lang: alt.hreflang,
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

          const anchors = document.getElementsByTagName('a')
          const links = []
          const loc = location.origin + location.pathname + location.search
          for (const a of anchors) {
            const link = a.origin + a.pathname + a.search
            if (['https:', 'http:'].includes(a.protocol) && link !== loc && !links.includes(link)) {
              links.push(link)
            }
          }

          return { meta, links }
        }, meta, removeScript))

        resolve({ status, redirect, meta, openGraph, links, content })
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
