module.exports = function(url, rules) {
  url = new URL(url)
  const path = url.origin + url.pathname

  for (const [regexp, replacement] of rules) {
    const result = path.replace(regexp, replacement)
    if (!result) {
      return ''
    } else if (result !== path) {
      return result + url.search
    }
  }

  return url.href
}
