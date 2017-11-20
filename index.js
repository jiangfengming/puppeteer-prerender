const http = require('http')
const puppeteer = require('puppeteer')

const browser = await puppeteer.launch({
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox'
  ]
})

async function getMeta(url) {
  const req = http.get(url, res => {
    req.abort()
    return
  })
}

async function loadPage(url, { userAgent, loadImage = true, loadMedia = true }) {
  url = new URL(url)

  const page = await browser.newPage()

  if (userAgent) page.setUserAgent(userAgent)

  await page.setRequestInterception(true)
  page.on('request', req => {

  })

  await page.goto(url.href, { waitUntil: 'networkidle0' })
  return page
}

async function getPageTitle(url, opts) {
  try {
    const page = await loadPage(url, {
      loadImage: false,
      loadMedia: false,
      ...opts
    })
  } catch (e) {

  }


}

async function getPageContent(url, opts) {

}

async function getPageScreenshot(url, opts) {

}
