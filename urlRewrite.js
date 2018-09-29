module.exports = function(url, rules) {
  for (const [regexp, replacement] of rules) {
    const result = url.replace(regexp, replacement)
    if (result !== url) return result
  }

  return url
}
