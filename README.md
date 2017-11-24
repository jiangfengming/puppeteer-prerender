# puppeteer-spider
A web crawler powered by puppeteer

## APIs

### spider.fetchPage(url, options)
Fetch the title and content of the page.

```js
const spider = require('puppeteer-spider')

async main() {
  const result = await spider.fetchPage('https://www.example.com/')
  console.log(result.title, result.content)
}
```

#### Options:
timeout: Maximum navigation time in milliseconds, defaults to 30 seconds  
userAgent: Specific user agent to use in this page


### spider.debug
Open or disable debug mode. Defaults to disabled.

```js
spider.debug = true
```

### spider.timeout
Set the default timeout value.

```js
spider.timeout = 20000
```

### spider.userAgent
Set the default user agent.

```js
spider.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36'
```
