const request = require('request')
const puppeteer = require('puppeteer')
const { URL } = require('url')

request.debug = true

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

async function loadPage(url, { userAgent } = {}) {
  url = new URL(url)

  await launch()

  const page = await browser.newPage()

  if (userAgent) page.setUserAgent(userAgent)

  await page.setRequestInterception(true)
  page.on('request', req => {
    if (req.resourceType === 'document') {
      const r = request({
        url: req.url,
        headers: req.headers,
        gzip: true,
        timeout: 10000
      }, (e, res, body) => {
        if (e) {
          console.log(22222)
          console.log(e.code, e)
          switch (e.code) {
            case 'ETIMEDOUT':
              req.abort('timedout')
              break
            default:
              req.abort()
          }
        } else {
          req.respond({
            status: res.statusCode,
            headers: res.headers,
            body
          })
        }
      })
      .on('response', res => {
        if (!res.headers['content-type'].includes('text/html')) {
          console.log(11111)
          r.abort()
          req.abort()
        }
      })
    } else if (['stylesheet', 'image', 'media', 'font', 'texttrack', 'manifest', 'other'].includes(req.resourceType)) {
      req.abort()
    } else {
      req.continue()
    }
  })

  try {
    await page.goto(url.href, { waitUntil: 'networkidle0' })
    return page
  } catch (e) {
    page.close()
    throw e
  }
}

async function fetchPage(url, opts) {
  const page = await loadPage(url, opts)
  const title = await page.title()
  const content = await page.content()
  page.close()
  return { title, content }
}

module.exports = { fetchPage }
