const { fetchPage } = require('../')

async function main() {
  try {
    const result = await fetchPage('https://nodejs.org/dist/v9.2.0/node-v9.2.0.pkg')
    console.log(result)
  } catch (e) {
    console.log(33333)
    console.log(e.message, e)
  }
}

main()
