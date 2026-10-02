function normalizeOrigin(value) {
  const url = new URL(String(value).trim())
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('HTTPSの設置先URLを入力してください（例：https://kotoba-xxxxx.a.run.app）。')
  return url.origin
}
module.exports = { normalizeOrigin }
