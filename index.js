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

let browser

async function launch() {
  if (browser) return browser

  browser = await puppeteer.launch({
    headless: prerender.headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  })

  return browser
}

function log(...args) {
  if (prerender.debug) {
    console.log(...args) // eslint-disable-line
  }
}

function fetchDocument(url, headers, timeout) {
  return new Promise((resolve, reject) => {
    request.debug = prerender.debug

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

function prerender(url, { userAgent = prerender.userAgent, timeout = prerender.timeout, followRedirect = false } = {}) {
  return new Promise(async(resolve, reject) => {
    await launch()
    url = new URL(url)

    const page = await browser.newPage()
    if (userAgent) page.setUserAgent(userAgent)
    await page.setRequestInterception(true)

    let status = null, redirect = null

    page.on('request', async req => {
      const resourceType = req.resourceType()
      const url = req.url()
      const headers = req.headers()
      log(resourceType, url, headers)

      if (resourceType === 'document') {
        // abort iframe request
        if (req.frame() !== page.mainFrame()) {
          log('abort', url)
          return req.abort()
        }

        try {
          delete headers['x-devtools-emulate-network-conditions-client-id']
          const res = await fetchDocument(url, headers, timeout - 1000)
          log(res.status, res.headers)

          if (res.status >= 200 && res.status <= 299) {
            status = res.status
            req.respond(res)
          } else {
            status = res.status

            if ([301, 302].includes(res.status)) {
              redirect = res.headers.location
              if (followRedirect) return req.respond(res)
            }

            resolve({
              status,
              redirect,
              title: null,
              content: null,
              openGraph: null
            })

            req.abort()
          }
        } catch (e) {
          log(e)
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
        log('abort', url)
        req.abort()
      }
    })

    try {
      await page.goto(url.href, {
        waitUntil: 'networkidle0',
        timeout
      })

      const meta = await page.evaluate(() => {
        // remove <script> tag
        const scripts = document.querySelectorAll('script')
        scripts.forEach(el => el.parentNode.removeChild(el))

        const meta = {
          title: document.title,
          description: null,
          image: null,
          canonicalUrl: null,
          author: null,
          keywords: null
        }

        ;['author', 'description', 'keywords'].forEach(k => {
          const el = document.querySelector(`meta[name="${k}"]`)
          if (el) meta[k] = el.content
        })

        if (meta.keywords) {
          meta.keywords = meta.keywords.split(/\s*,\s*/)
        }

        const link = document.querySelector('link[rel="canonical"]')
        if (link) meta.canonicalUrl = link.href

        const imgs = document.querySelectorAll('img')
        for (const img of imgs) {
          if (img.width >= 200 && img.height >= 200) {
            meta.image = img.href
            break
          }
        }

        return meta
      })

      const openGraphMeta = await page.evaluate(parseMetaFromDocument)
      const openGraph = openGraphMeta.length ? parse(openGraphMeta) : null

      const content = await page.content()

      if (openGraph) {
        if (openGraph.og) {
          if (openGraph.og.title) meta.title = openGraph.og.title
          if (openGraph.og.description) meta.description = openGraph.og.description
          if (openGraph.og.image) meta.image = openGraph.og.image[0].url
          if (openGraph.og.url) meta.canonicalUrl = openGraph.og.url
        }

        if (openGraph.article) {
          if (openGraph.article.tag) meta.keywords = openGraph.article.tag
        }
      }

      resolve({ status, redirect, meta, openGraph, content })
    } catch (e) {
      reject(e)
    } finally {
      page.close()
    }
  })
}

prerender.debug = false
prerender.timeout = 30000
prerender.userAgent = ''
prerender.headless = true

module.exports = prerender
