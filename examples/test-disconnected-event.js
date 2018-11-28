/* eslint-disable no-console */
const Prerenderer = require('..')

async function main() {
  try {
    const prerender = new Prerenderer({
      debug: true,
      puppeteerLaunchOptions: {
        headless: false
      }
    })

    prerender.on('disconnected', () => {
      console.log('disconnected event')
    })

    await prerender.launch()
    console.log('chromium launched')
    await prerender.browser.disconnect()
    console.log('chromium disconnected')

    // chromium is disconnected, close() will do nothing
    // and process won't exit until you kill the chromium process manually
    await prerender.close()
    console.log('chromium closed')
  } catch (e) {
    console.error(e)
  }
}

main()
