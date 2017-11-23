const request = require('request')
const puppeteer = require('puppeteer')
const { URL } = require('url')

request.debug = true

const ERRORS_MAPPING = {
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

function fetchDocument(url, headers) {
  return new Promise((resolve, reject) => {
    const req = request({
      url,
      headers,
      gzip: true,
      timeout: 10000
    }, (e, res, body) => {
      if (e) {
        console.log(22222)
        console.log(e.code, e.message, e)
        reject(new Error(ERRORS_MAPPING[e.message]))
      } else {
        console.log(4444)
        console.log(res.statusCode)
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body
        })
      }
    })
    .on('response', res => {
      if (!res.headers['content-type'].includes('text/html')) {
        console.log(11111)
        req.abort()
        reject(new Error('PARSE::ERR_INVALID_FILE_TYPE'))
      }
    })
  })
}

function loadPage(url, { userAgent } = {}) {
  return new Promise(async (resolve, reject) => {
    url = new URL(url)

    await launch()

    const page = await browser.newPage()
    //await page.setExtraHTTPHeaders({ 'x-devtools-emulate-network-conditions-client-id': '' })

    if (userAgent) page.setUserAgent(userAgent)

    await page.setRequestInterception(true)
    page.on('request', async req => {
      console.log(req.url)
      console.log(req.headers)
      if (req.resourceType === 'document') {
        try {
          delete req.headers['x-devtools-emulate-network-conditions-client-id']
          const res = await fetchDocument(url, req.headers)
          req.respond(res)
        } catch (e) {
          if (e.message === 'PARSE::ERR_INVALID_FILE_TYPE') {
            reject(e)
            req.abort()
          } else {
            req.abort(e.message)
          }
        }
      } else if (['script', 'xhr', 'fetch', 'eventsource', 'websocket'].includes(req.resourceType)) {
        req.continue()
      } else {
        req.abort()
      }
    })

    try {
      await page.goto(url.href, { waitUntil: 'networkidle0' })
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

module.exports = { fetchPage }
