/* eslint no-console: "off" */

const Prerenderer = require('../')

async function main() {
  const prerender = new Prerenderer({
    debug: true,

    puppeteerLaunchOptions: {
      headless: false
    }
  })

  const result = await prerender.render('https://www.google.com/', {
    rewrites: [
      ['https://www.google.com/:path(.*)', 'https://www.example.com/:path']
    ]
  })

  console.log(result)
  await prerender.close()
}

main()
