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
    extraMeta: {
      status: { selector: 'meta[http-equiv="Status" i]', property: 'content' },
      lastModified: { selector: 'meta[http-equiv="Last-Modified" i]', property: 'content' }
    },
    parseOpenGraphOptions: {
      // these tag has attributes
      alias: {
        'sitemap:video:player_loc': 'sitemap:video:player_loc:_',
        'sitemap:video:restriction': 'sitemap:video:restriction:_',
        'sitemap:video:platform': 'sitemap:video:platform:_',
        'sitemap:video:price': 'sitemap:video:price:_',
        'sitemap:video:uploader': 'sitemap:video:uploader:_'
      },

      arrays: [
        'sitemap:image',
        'sitemap:video',
        'sitemap:video:tag'
      ]
    }
  })

  try {
    const { status, redirect, meta, openGraph, links, html, staticHTML } = await prerender.render('http://127.0.0.1/foo', {
      rewrites: [
        [/^http:\/\/127\.0\.0\.1\//, 'https://www.example.com/'], // host rewrite
        [/^https:\/\/www\.googletagmanager\.com\/.*/, ''] // block analytic scripts
      ]
    })
    console.log(html)
    console.log(staticHTML)
    console.log(JSON.stringify({ status, redirect, meta, openGraph, links }, null, 2))
  } catch (e) {
    console.error(e)
  }

  await prerender.close()
}

main()
