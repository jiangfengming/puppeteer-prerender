const request = require('request')
const puppeteer = require('puppeteer')
const { URL } = require('url')

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
              content: null
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

      await page.evaluate(() => {
        const scripts = document.querySelectorAll('script') // eslint-disable-line
        scripts.forEach(el => el.parentNode.removeChild(el))
      })

      const title = await page.title()
      const content = await page.content()

      resolve({ status, redirect, title, content })
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

module.exports = prerender
