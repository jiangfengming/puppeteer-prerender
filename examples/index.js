const spider = require('../')

spider.debug = true
spider.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36'

async function main() {
  try {
    const result = await spider.fetchPage('https://www.example.com/')
    console.log(result) // eslint-disable-line
  } catch (e) {
    console.log(e.message) // eslint-disable-line
  }
}

main()
