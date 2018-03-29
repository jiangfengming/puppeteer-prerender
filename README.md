# puppeteer-prerender
puppeteer-prerender is a library that uses [Puppeteer](https://github.com/GoogleChrome/puppeteer) to fetch the
pre-rendered content, meta, links, and [Open Graph](http://ogp.me/) of a webpage, especially Single-Page Application (SPA).

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
  debug: false, // Whether to print debug logs.
  puppeteerLaunchOptions: null, // Options for puppeteer.launch(). see https://github.com/GoogleChrome/puppeteer/blob/master/docs/api.md#puppeteerlaunchoptions
  timeout: 30000, // Maximum navigation time in milliseconds.
  userAgent: null, // Specific user agent to use in this page. The default value is set by the underlying Chromium.
  followRedirect: false, // Whether to follow 301/302 redirect.
  removeScript: true // Whether to remove the <script> tags.
}
```

### prerenderer.render(url, options)
Prerender the page of the given `url`.

These options can be overrided:
```js
{
  timeout,
  userAgent,
  followRedirect,
  removeScript
}
```

Returns:
```js
{
  status, // HTTP status code
  redirect, // the redirect location if status is 301/302

  meta: {
    title,
    description, // <meta property="og:description"> || <meta name="description">
    image, // <meta property="og:image">
    canonicalURL, // <meta property="og:url"> || <link rel="canonical">

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

    // <meta property="article:tag"> || <meta name="keywords">
    keywords: [
      'keyword1',
      // ...
    ]
  },

  openGraph, // Open Graph object

  // The absolute URLs of <a> tags. The url's hash has been stripped. And each item is unique and doesn't contain the page itself.
  // Useful for crawling the next pages.
  links: [
    'https://www.example.com/foo?bar=1',
    // ...
  ],

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

### prerenderer.removeScript
Sets the default value of removeScript.

## License
MIT
