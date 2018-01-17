# puppeteer-prerender
Fetch the pre-rendered content of a SPA

## APIs

### prerender(url, options)
Fetch the title and content of the page.

```js
const prerender = require('puppeteer-prerender')

async main() {
  const result = await prerender('https://www.example.com/', {
    timeout: 30000,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36',
    followRedirect: false
  })
  
  console.log(result.status, result.redirect, result.title, result.content)
}
```

#### Options:
timeout: Maximum navigation time in milliseconds. Defaults to `30000`ms.  
userAgent: Specific user agent to use in this page. The default is set by the underlying Chrome or Chromium.
followRedirect: Whether to follow 301/302 redirect. Defaults to `false`.

#### Returns:
```js
{
  status, // HTTP status code
  redirect, // the redirect location if status is 301/302
  title, // page title
  content // page content
}
```

### prerender.debug
Open or disable debug mode. Defaults to `false`.

```js
prerender.debug = true
```

### prerender.timeout
Set the default timeout value.

```js
prerender.timeout = 20000
```

### prerender.userAgent
Set the default user agent.

```js
prerender.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36'
```
