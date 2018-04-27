/* eslint no-console: "off" */

const Prerenderer = require('../')

async function main() {
  const prerender = new Prerenderer({
    debug: true,
    puppeteerLaunchOptions: {
      headless: false
    },
    timeout: 30000,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36',
    followRedirect: false,
    removeScript: true
  })

  try {
    const { status, redirect, meta, openGraph, links, content, contentNoScript } = await prerender.render('https://developers.google.com/search/mobile-sites/mobile-seo/separate-urls')
    console.log(content.slice(0, 300))
    console.log(contentNoScript.slice(0, 300))
    console.log(JSON.stringify({ status, redirect, meta, openGraph, links }, null, 2))
  } catch (e) {
    console.error(e)
  }

  prerender.close()
}

main()
