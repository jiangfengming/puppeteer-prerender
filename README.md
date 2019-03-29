# puppeteer-prerender
puppeteer-prerender is a library that uses [Puppeteer](https://github.com/GoogleChrome/puppeteer) to fetch the
pre-rendered html, meta, links, and [Open Graph](http://ogp.me/) of a webpage, especially Single-Page Application (SPA).

## Usage
```js
const Prerenderer = require('puppeteer-prerender')

async function main() {
  const prerender = new Prerenderer()

  try {
    const {
      status,
      redirect,
      meta,
      openGraph,
      links,
      html,
      staticHTML
    } = await prerender.render('https://www.example.com/')
  } catch (e) {
    console.error(e)
  }

  await prerender.close()
}

main()
```

## APIs

### new Prerenderer(options)
Creates a prerenderer instance.

Default options:
```js
{
  // Boolean | Function. Whether to print debug logs.
  // You can provide your custom log function, it should accept same arguments as console.log()
  debug: false,

  // Object. Options for puppeteer.launch().
  // see https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#puppeteerlaunchoptions
  puppeteerLaunchOptions: undefined,

  // Number. Maximum navigation time in milliseconds.
  timeout: 30000,

  // String. Specific user agent to use in this page. The default value is set by the underlying Chromium.
  userAgent: undefined,

  // Boolean. Whether to follow 301/302 redirect.
  followRedirect: false,

  // Object. Extra meta tags to parse.
  extraMeta: undefined,
  
  // Object. Options for parse-open-graph.
  // see https://github.com/kasha-io/parse-open-graph#parsemeta-options
  parseOpenGraphOptions: undefined,
  
  // Array. Rewrite URL to another location.
  rewrites: undefined
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

#### rewrites
```js
const result = await prerender.render('http://127.0.0.1/foo', {
  rewrites: [
    [/^http:\/\/127\.0\.0\.1\//, 'https://www.example.com/'], // host rewrite
    [/^https:\/\/www\.googletagmanager\.com\/.*/, ''] // block analytic scripts
  ]
})
```
The page will load from `https://www.example.com/foo` instead of `http://127.0.0.1/foo`.
And requests to `https://www.googletagmanager.com/*` will be blocked.

It uses [url-rewrite](https://github.com/kasha-io/url-rewrite) module underlying.

### prerenderer.render(url, options)
Prerenders the page of the given `url`.

Returns: Promise.

These options can be overrided:
```js
{
  timeout,
  userAgent,
  followRedirect,
  extraMeta,
  parseOpenGraphOptions,
  rewrites
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

  // The absolute URLs of <a> tags.
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

See [parse-open-graph](https://github.com/kasha-io/parse-open-graph#parsemeta-options) for details.

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

## License
[MIT](LICENSE)
