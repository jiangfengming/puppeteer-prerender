# puppeteer-prerender
puppeteer-prerender is a library that uses [Puppeteer](https://github.com/GoogleChrome/puppeteer) to fetch the
pre-rendered content, meta and Open Graph of a Single-page Application (SPA).

## APIs

### prerender(url, options)
Prerender the page of the given `url`.

```js
const prerender = require('puppeteer-prerender')

async main() {
  const result = await prerender('https://www.example.com/', {
    timeout: 20000,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36',
    followRedirect: false
  })
  
  console.log(result)
}
```

#### Options:
`timeout`: Maximum navigation time in milliseconds. Defaults to `30000`ms.  
`userAgent`: Specific user agent to use in this page. The default value is set by the underlying Chromium.  
`followRedirect`: Whether to follow 301/302 redirect. Defaults to `false`.

#### Returns:
```js
{
  status, // HTTP status code
  redirect, // the redirect location if status is 301/302
  meta: {
    title,
    description,
    image,
    canonicalUrl,
    author,
    keywords // array
  },
  openGraph, // Open Graph object
  content // page content
}
```

The `openGraph` object format:
```js
{
  og: {
    title: 'Open Graph protocol',
    type: 'website',
    url: 'http://ogp.me/',
    image: [
      {
        url: 'http://ogp.me/logo.png',
        type: 'image/png',
        width: '300',
        height: '300',
        alt: 'The Open Graph logo'
      },
    ]
    description: 'The Open Graph protocol enables any web page to become a rich object in a social graph.'
  },
  fb: {
    app_id: '115190258555800'
  }
}
```

See [parse-open-graph](https://github.com/fenivana/parse-open-graph#parsemeta) for details.

### prerender.close()
Closes the underlying browser.

### prerender.debug
Open or disable debug mode. Defaults to `false`.

### prerender.timeout
Set the default timeout value. Defaults to `30000`ms.

### prerender.userAgent
Set the default user agent. The default value is set by the underlying Chromium.

### prerender.puppeteerLaunchOptions
Options which passed to puppeteer.launch(). It should be set before calling `prerender()`, otherwise
will have no effect.
