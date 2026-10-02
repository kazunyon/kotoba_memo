import { useEffect, useState } from 'react'
import App from './App'
import { confirmGoogleAccount, getAccount, getPendingAccount, getRuntimeConfig, initializeGoogle, loginGoogle, logoutGoogle } from './google-auth'
import { clearCloudCache, getCloudSyncStatus } from './cloud-sync'

export default function AccountGate() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [, update] = useState(0)
  async function initialize() {
    setError(''); setReady(false)
    try { await initializeGoogle(); setReady(true) } catch (e) { setError(e instanceof Error ? e.message : '接続できません。') }
  }
  useEffect(() => {
    void initialize()
    const changed = () => update(value => value + 1)
    const failed = (event: Event) => setError((event as CustomEvent<string>).detail)
    window.addEventListener('kotoba-google-account', changed)
    window.addEventListener('kotoba-auth-error', failed)
    return () => { window.removeEventListener('kotoba-google-account', changed); window.removeEventListener('kotoba-auth-error', failed) }
  }, [])
  async function login() {
    setBusy(true); setError('')
    try { await loginGoogle() } catch (e) { setError(e instanceof Error ? e.message : 'ログインできません。') } finally { setBusy(false) }
  }
  async function otherAccount() {
    setBusy(true); setError('')
    try {
      const id = getPendingAccount()?.id
      if (getCloudSyncStatus().pending && !confirm('未送信データを削除します。必要な場合は現在のアカウントで開始し、先にバックアップしてください。続けますか？')) return
      await logoutGoogle(id ? () => clearCloudCache(id) : undefined)
      await loginGoogle()
    } catch (e) { setError(e instanceof Error ? e.message : 'ログアウトできません。') } finally { setBusy(false) }
  }
  if (ready && getAccount()) return <App />
  const account = getPendingAccount()
  return <main className="account-gate"><h1>ことばメモ</h1><p>ご自身のGoogle CloudとGoogle Driveで利用します。</p>
    {error && <p role="alert">{error}</p>}
    {!ready ? <><p>{error ? '接続先の設定を確認してください。' : '接続先を確認しています…'}</p>{error && <button onClick={() => void initialize()}>再確認</button>}</> : <>
      <p>接続先：<span className="connection-url">{getRuntimeConfig()?.origin}</span></p>
      {account ? <><h2>このGoogleアカウントで利用します</h2><p className="account-email">{account.email}</p><p>メモは、このアカウントのGoogle Driveに保存されます。</p><button disabled={busy} onClick={confirmGoogleAccount}>このアカウントで開始</button><button disabled={busy} onClick={() => void otherAccount()}>別のアカウントを選ぶ</button></> : <><p>PCとスマホで同じGoogleアカウントを選んでください。</p><button disabled={busy} onClick={() => void login()}>{busy ? '接続中…' : 'Googleでログイン'}</button></>}
    </>}
    {window.kotobaDesktop && <button disabled={busy} onClick={() => void window.kotobaDesktop?.changeConnection().catch(e => setError(String(e)))}>接続先を変更</button>}
  </main>
}
