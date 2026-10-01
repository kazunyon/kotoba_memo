// Google API access tokens stay in memory. Only the account identity is retained
// for opening that account's offline cache; it never grants Drive access.
export const isCloudConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)
export type GoogleAccount = { id: string; email: string }
type TokenResponse = { access_token: string; expires_in: number; error?: string; scope: string }
type GoogleOAuth = { initTokenClient(options: { client_id: string; scope: string; callback: (response: TokenResponse) => void; error_callback: () => void }): { requestAccessToken(options: { prompt: string; hint?: string }): void } }
declare global { interface Window { google?: { accounts: { oauth2: GoogleOAuth } } } }
const ACCOUNT_KEY = 'kotoba-drive-account-v1'
const SCOPE = 'openid email https://www.googleapis.com/auth/drive.appdata'
let account: GoogleAccount | null = null
try { const value = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null'); if (value && typeof value.id === 'string' && typeof value.email === 'string') account = value } catch { /* no remembered account */ }
let token = ''
let expires = 0
let generation = 0
let scriptPromise: Promise<void> | null = null
export const getAccount = () => isCloudConfigured ? account : null
export function getAccessToken(expectedAccount: string) {
  if (expectedAccount !== account?.id) throw Error('ログインする人が変わりました。もう一度操作してください。')
  if (!token || Date.now() >= expires) throw Error('Googleの接続期限が切れています。「Googleに再接続」を押してください。未送信データは端末に残っています。')
  return token
}
export const hasGoogleAccess = () => Boolean(token && Date.now() < expires)
function announce() { window.dispatchEvent(new Event('kotoba-google-account')) }
export function prepareGoogleLogin(): Promise<void> {
  if (window.google?.accounts.oauth2) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true
    const timer = window.setTimeout(() => { script.remove(); scriptPromise = null; reject(Error('Googleのログイン画面を準備できません。通信を確認してください。')) }, 15000)
    script.onload = () => { window.clearTimeout(timer); resolve() }
    script.onerror = () => { window.clearTimeout(timer); script.remove(); scriptPromise = null; reject(Error('Googleへ接続できません。通信を確認してください。')) }
    document.head.appendChild(script)
  })
  return scriptPromise
}
// Called directly from the button click, after the script was prepared, so
// browsers do not block the OAuth popup after an asynchronous script download.
export function loginGoogle(): Promise<void> {
  if (!isCloudConfigured) return Promise.reject(Error('配布者によるGoogle連携設定が必要です。'))
  const oauth = window.google?.accounts.oauth2
  if (!oauth) return Promise.reject(Error('ログイン画面の準備中です。少し待って、もう一度押してください。'))
  const requestGeneration = ++generation
  return new Promise((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID, scope: SCOPE,
      error_callback: () => reject(Error('Googleログインが中止されました。ポップアップの許可も確認してください。')),
      callback: response => {
        void (async () => {
          if (response.error || !response.access_token) throw Error('Googleへの接続が許可されませんでした。')
          if (!response.scope.split(' ').includes('https://www.googleapis.com/auth/drive.appdata')) throw Error('同期用データへのアクセスを許可してください。')
          const result = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + response.access_token }, signal: AbortSignal.timeout(15000) })
          if (!result.ok) throw Error('Googleアカウントを確認できませんでした。')
          const identity = await result.json() as { sub: string; email: string; email_verified: boolean }
          if (!identity.sub || !identity.email || !identity.email_verified) throw Error('Googleアカウントの確認に失敗しました。')
          if (requestGeneration !== generation) throw Error('ログインが変更されました。')
          const next = { id: identity.sub, email: identity.email }
          localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next))
          account = next; token = response.access_token; expires = Date.now() + Number(response.expires_in) * 1000 - 30000
          announce(); resolve()
        })().catch(reject)
      }
    })
    client.requestAccessToken({ prompt: 'select_account', ...(account ? { hint: account.email } : {}) })
  })
}
export async function logoutGoogle() {
  ++generation; account = null; token = ''; expires = 0
  localStorage.removeItem(ACCOUNT_KEY); announce()
}
window.addEventListener('storage', event => {
  if (event.key !== ACCOUNT_KEY) return
  ++generation; token = ''; expires = 0
  try { const value = JSON.parse(event.newValue || 'null'); account = value && typeof value.id === 'string' && typeof value.email === 'string' ? value : null } catch { account = null }
  announce()
})
