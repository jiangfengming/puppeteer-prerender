const { fetchPage } = require('../')

async function main() {
  try {
    const result = await fetchPage('http://localhost:8080/1.html')
    console.log(result)
  } catch (e) {
    console.log(33333)
    console.log(e.code, e.message, e)
  }
}

main()
