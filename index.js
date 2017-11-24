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
  if (spider.debug) {
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
      if (res.statusCode >= 200 && res.statusCode < 300 && !res.headers['content-type'].includes('text/html')) {
        req.abort()
        reject(new Error('PARSE::ERR_INVALID_FILE_TYPE'))
      }
    })
  })
}

function loadPage(url, { userAgent = spider.userAgent, timeout = spider.timeout } = {}) {
  return new Promise(async(resolve, reject) => {
    await launch()
    url = new URL(url)

    const page = await browser.newPage()

    if (userAgent) page.setUserAgent(userAgent)

    await page.setRequestInterception(true)
    page.on('request', async req => {
      if (req.resourceType === 'document') {
        try {
          delete req.headers['x-devtools-emulate-network-conditions-client-id']
          log(req.resourceType, req.url, req.headers)
          const res = await fetchDocument(req.url, req.headers, timeout - 1000)
          if (res.status >= 200 && res.status < 400) {
            req.respond(res)
          } else {
            reject(new Error('HTTP::' + res.status))
            req.abort()
          }
        } catch (e) {
          if (e.message === 'PARSE::ERR_INVALID_FILE_TYPE') {
            reject(e)
            req.abort()
          } else {
            req.abort(e.message)
          }
        }
      } else if (['script', 'xhr', 'fetch', 'eventsource', 'websocket'].includes(req.resourceType)) {
        const headers = { ...req.headers }
        delete headers['x-devtools-emulate-network-conditions-client-id']
        log(req.resourceType, req.url, headers)
        req.continue()
      } else {
        req.abort()
      }
    })

    try {
      await page.goto(url.href, {
        waitUntil: 'networkidle0',
        timeout
      })
      resolve(page)
    } catch (e) {
      page.close()
      reject(e)
    }
  })
}

async function fetchPage(url, opts) {
  const page = await loadPage(url, opts)
  const title = await page.title()
  const content = await page.content()
  page.close()
  return { title, content }
}

const spider = {
  debug: false,
  timeout: 30000,
  userAgent: '',
  fetchPage
}

module.exports = spider
