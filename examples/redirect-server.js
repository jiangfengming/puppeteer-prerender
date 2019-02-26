const http = require('http')

const server = http.createServer((req, res) => {
  res.writeHead(301, {
    Location: 'https://www.example.com/'
  })
  res.end()
})

server.listen(8080)
