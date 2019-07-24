/* eslint no-console: "off" */

const Prerenderer = require('../')

async function main() {
  const prerender = new Prerenderer({
    extraMeta: {
      status: { selector: 'meta[http-equiv="Status" i]', property: 'content' },
      lastModified: { selector: 'meta[http-equiv="Last-Modified" i]', property: 'content' }
    },

    parseOpenGraphOptions: {
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

  const result = await prerender.render('http://localhost:8080/static/parse-meta-and-static-html.html')
  console.log(JSON.stringify(result, null, 2))
  await prerender.close()
}

main()
