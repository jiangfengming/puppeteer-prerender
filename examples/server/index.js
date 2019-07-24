const Koa = require('koa')
const serve = require('koa-static')
const mount = require('koa-mount')

const app = new Koa()
app.use(mount('/static', serve(__dirname + '/static')))

app.use(mount('/302-redirect', ctx => {
  ctx.redirect('http://localhost:8080/static/index.html')
}))

app.listen(8080)
