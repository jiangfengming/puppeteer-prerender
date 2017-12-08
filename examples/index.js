const prerender = require('../')

prerender.timeout = 20000
prerender.debug = true
prerender.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36'

async function main() {
  try {
    const { title, content } = await prerender('https://www.example.com/')
    console.log(title) // eslint-disable-line
    console.log(content) // eslint-disable-line
  } catch (e) {
    console.log(e.message) // eslint-disable-line
  }
}

main()
