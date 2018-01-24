const prerender = require('../')

prerender.timeout = 20000
prerender.debug = true
prerender.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36'

async function main() {
  try {
    const { status, redirect, title, content } = await prerender('https://example.com/')
    console.log({ status, redirect, title, content }) // eslint-disable-line
  } catch (e) {
    console.log(e) // eslint-disable-line
  }
}

main()
