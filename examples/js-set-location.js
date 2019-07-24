/* eslint no-console: "off" */

const Prerenderer = require('../')

async function main() {
  const prerender = new Prerenderer({
    debug: true,

    puppeteerLaunchOptions: {
      headless: false
    }
  })

  const result = await prerender.render('http://localhost:8080/static/js-set-location.html')
  console.log(result)

  const result2 = await prerender.render('http://localhost:8080/static/js-set-location.html', {
    followRedirect: true
  })

  console.log(result2)
  await prerender.close()
}

main()
