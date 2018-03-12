/* eslint no-console: "off" */

const prerender = require('../')

prerender.timeout = 20000
prerender.debug = true
prerender.headless = false
prerender.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36'

async function main() {
  try {
    const { status, redirect, meta, openGraph, content } = await prerender('https://davidwalsh.name/facebook-meta-tags')
    console.log(JSON.stringify({ content, status, redirect, meta, openGraph }, null, 2))
  } catch (e) {
    console.log(e)
  }
}

main()
