/* eslint-disable no-console */

const Prerenderer = require('..')

async function main() {
  const prerender = new Prerenderer()

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
}

main()
