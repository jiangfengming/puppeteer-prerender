/* eslint no-console: "off" */

const prerender = require('../')

prerender.timeout = 20000
prerender.debug = true
prerender.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36'
prerender.puppeteerLaunchOptions = {
  headless: false
}

async function main() {
  try {
    const { status, redirect, meta, openGraph, content } = await prerender('https://developers.google.com/search/mobile-sites/mobile-seo/separate-urls')
    console.log(JSON.stringify({ content, status, redirect, meta, openGraph }, null, 2))
  } catch (e) {
    console.error(e)
  }

  prerender.close()
}

main()
