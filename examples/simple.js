const Prerenderer = require('..')

async function main() {
  const prerender = new Prerenderer()
  const result = await prerender.render('https://www.example.com/')
  console.log(result)
}

main()
