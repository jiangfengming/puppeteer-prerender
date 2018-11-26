/* eslint-disable no-console */
const Prerenderer = require('..')

async function main() {
  try {
    const prerender = new Prerenderer({
      debug: true,
      puppeteerLaunchOptions: {
        headless: true,

        handleSIGINT: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      }
    })

    const result = await prerender.render('https://www.example.com/')
    console.log(result)
    await prerender.close()
  } catch (e) {
    console.error(e)
  }
}

main()
