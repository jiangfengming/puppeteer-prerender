const { fetchPage } = require('../')

async function main() {
  try {
    const result = await fetchPage('https://www.jianshiapp.com/')
    console.log(result)
  } catch (e) {
    console.log(33333)
    console.log(e)
  }
}

main()
