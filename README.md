# puppeteer-prerender
puppeteer-prerender is a library that uses [Puppeteer](https://github.com/GoogleChrome/puppeteer) to fetch the
pre-rendered html, meta, links, and [Open Graph](http://ogp.me/) of a webpage, especially Single-Page Application (SPA).

## Usage
```js
const Prerenderer = require('puppeteer-prerender')

async function main() {
  const prerender = new Prerenderer()

  try {
    const { status, redirect, meta, openGraph, links, content } = await prerender.render('https://www.example.com/')
    console.log(JSON.stringify({ content, status, redirect, meta, openGraph, links }, null, 2))
  } catch (e) {
    console.error(e)
  }

  prerender.close()
}

main()
```

See [examples/index.js](examples/index.js)

## APIs

### new Prerenderer(options)
Creates a prerenderer instance.

Default options:
```js
{
  debug: false, // Boolean. Whether to print debug logs.
  puppeteerLaunchOptions: undefined, // Object. Options for puppeteer.launch(). see https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#puppeteerlaunchoptions
  timeout: 30000, // Number. Maximum navigation time in milliseconds.
  userAgent: undefined, // String. Specific user agent to use in this page. The default value is set by the underlying Chromium.
  followRedirect: false, // Boolean. Whether to follow 301/302 redirect.
  extraMeta: undefined, // Object. Extra meta tags to parse.
  parseOpenGraphOptions: undefined // Object. Options for parse-open-graph. see https://github.com/kashajs/parse-open-graph#parsemeta-options
  appendSearchParams: undefined // Object. Intercept the document request and append search params before sending.
}
```

#### extraMeta
Extra meta tags to parse. e.g.:

```js
{
  status: { selector: 'meta[http-equiv="Status" i]', property: 'content' },
  icon: { selector: 'link[rel~="icon"]', property: 'href' }
}
```

The property name is the name of property which will be set in `result.meta` object. `selector` is the parameter of `document.querySelector()`
which used to select the element. `property` is the property of the selected element which contains the value.

#### appendSearchParams
Intercept the document request and append search params before sending. e.g.:

```js
{
  _no_prerender: '1'
}
```

If the page URL is http://www.example.com/, it will be rewrited to http://www.example.com?_no_prerender=1 when fetching the document.
But the address won't change. So `location.href` still is http://www.example.com/

It is used to set a flag on the URL so your server will know this request is from puppeteer-prerender.
User-Agent alone can't pass through the CDN.


### prerenderer.render(url, options)
Prerenders the page of the given `url`.

These options can be overrided:
```js
{
  timeout,
  userAgent,
  followRedirect,
  extraMeta,
  parseOpenGraphOptions,
  appendSearchParams
}
```

Return format:
```js
{
  status, // HTTP status code
  redirect, // the redirect location if status is 301/302

  meta: {
    title,
    description, // <meta property="og:description"> || <meta name="description">
    image, // <meta property="og:image"> or first <img> which width & height >= 300
    canonicalURL, // <link rel="canonical"> || <meta property="og:url">

    // <meta rel="alternate" hreflang="de" href="https://m.example.com/?locale=de">
    locales: [
      { lang: 'de', href: 'https://m.example.com/?locale=de' },
      // ...
    ],

    // <meta rel="alternate" media="only screen and (max-width: 640px)" href="https://m.example.com/">
    media: [
      { media: 'only screen and (max-width: 640px)', href: 'https://m.example.com/' },
      // ...
    ],

    author, // <meta name="author">

    // <meta property="article:tag"> || <meta name="keywords"> (split by comma)
    keywords: [
      'keyword1',
      // ...
    ]

    /*
      extraMeta will also be set in here
    */
  },

  openGraph, // Open Graph object

  // The absolute URLs of <a> tags. The url's hash has been stripped. And each item is unique and doesn't contain the page itself.
  // Useful for crawling the next pages.
  links: [
    'https://www.example.com/foo?bar=1',
    // ...
  ],

  html // page html
  staticHTML // static html (scripts removed)
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

### prerenderer.close()
Closes the underlying browser.

### prerenderer.debug
Opens or disables debug mode.

### prerenderer.timeout
Sets the default timeout value.

### prerenderer.userAgent
Sets the default user agent.

### prerenderer.followRedirect
Sets the default value of followRedirect.

### prerender.extraMeta
Sets the default value of extraMeta.

### prerender.parseOpenGraphOptions
Sets the default value of parseOpenGraphOptions.

### prerender.appendSearchParams
Sets the default value of appendSearchParams.

## License
MIT
