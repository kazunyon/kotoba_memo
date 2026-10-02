// Google tokens are kept behind the server's encrypted HttpOnly session cookie.
export const isCloudConfigured = true
export type GoogleAccount = { id: string; email: string }
export type RuntimeConfig = { configured: boolean; origin: string; clientId: string }
let account: GoogleAccount | null = null
let csrf = ''
let config: RuntimeConfig | null = null
let confirmed = false
let generation = 0
export const getRuntimeConfig = () => config
export const getProfileNamespace = () => (config?.origin || location.origin) + ':' + (config?.clientId || '')
export const getAccount = () => confirmed ? account : null
export const getPendingAccount = () => account
export const hasGoogleAccess = () => Boolean(account && confirmed && csrf)
export function authHeaders(expectedAccount: string) {
  if (!hasGoogleAccess() || account?.id !== expectedAccount) throw Error('ログインする人が変わりました。もう一度ログインしてください。')
  return { 'X-Kotoba-Account': expectedAccount, 'X-Kotoba-CSRF': csrf }
}
function announce() { window.dispatchEvent(new Event('kotoba-google-account')) }
export async function initializeGoogle() {
  const current = ++generation
  account = null; csrf = ''; confirmed = false; announce()
  const [settings, session] = await Promise.all([
    fetch('/api/config', { cache: 'no-store', signal: AbortSignal.timeout(15000) }),
    fetch('/api/session', { cache: 'no-store', signal: AbortSignal.timeout(15000) })
  ])
  if (!settings.ok || !session.ok) throw Error('設置先へ接続できません。Cloudの設定と通信を確認してください。')
  const next = await settings.json() as RuntimeConfig
  if (!next.configured || next.origin !== location.origin || !next.clientId) throw Error('Google連携設定が未完了です。ご自身のCloudの設定を確認してください。')
  const data = await session.json() as { account: GoogleAccount | null; csrf?: string }
  if (current !== generation) return
  if (data.account && (!data.account.id || !data.account.email || !data.csrf)) throw Error('Googleアカウントを確認できません。もう一度ログインしてください。')
  config = next
  account = data.account; csrf = data.csrf || ''; confirmed = false
  announce()
}
export function confirmGoogleAccount() {
  if (!account || !csrf) throw Error('先にGoogleでログインしてください。')
  confirmed = true; announce()
}
export async function prepareGoogleLogin() { /* server configuration was checked at startup */ }
export async function loginGoogle() {
  if (window.kotobaDesktop) { await window.kotobaDesktop.login(); await initializeGoogle() }
  else location.assign('/auth/login')
}
export async function logoutGoogle(cleanup?: () => Promise<void>) {
  if (account) {
    const response = await fetch('/api/logout', { method: 'POST', headers: { 'X-Kotoba-CSRF': csrf } })
    if (!response.ok) throw Error('ログアウトできません。通信を確認してください。')
  }
  ++generation; account = null; csrf = ''; confirmed = false
  try { await cleanup?.() }
  catch {
    const error = Error('ログアウトしましたが、端末の保存データを削除できませんでした。端末のサイトデータを削除してください。')
    window.dispatchEvent(new CustomEvent('kotoba-auth-error', { detail: error.message }))
    throw error
  } finally { announce(); channel?.postMessage('logout') }
}
export function expireGoogleSession() { ++generation; confirmed = false; account = null; csrf = ''; announce() }
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('kotoba-session-v2') : null
if (channel) channel.onmessage = () => expireGoogleSession()
declare global {
  interface Window {
    kotobaDesktop?: { login(): Promise<void>; changeConnection(): Promise<void> }
  }
}
