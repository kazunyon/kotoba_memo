import { authHeaders, expireGoogleSession } from './google-auth'
import { validateEvent, type DriveEvent, type RemoteEvent } from './drive-model'
const PREFIX = 'kotoba-event-v1-'
type FileInfo = { id: string; name: string; createdTime: string }
export async function driveRequest(account: string, url: string, init: RequestInit = {}): Promise<Response> {
  const target = new URL(url)
  if (target.origin !== 'https://www.googleapis.com') throw Error('不正な保存先です。')
  const result = await fetch('/api/drive' + target.pathname + target.search, { ...init, headers: { ...init.headers, ...authHeaders(account) }, signal: AbortSignal.timeout(30000) })
  if (result.status === 401) expireGoogleSession()
  if (!result.ok) throw Error(result.status === 401 ? 'Googleに再接続してください。未送信データは端末に残っています。' : result.status === 403 ? 'Google Driveへのアクセス権限・空き容量を確認してください。' : `Google Driveと通信できません（${result.status}）。未送信データは端末に残っています。`)
  return result
}
export async function listDriveFiles(account: string): Promise<FileInfo[]> {
  const files: FileInfo[] = []; let pageToken = ''
  do {
    const params = new URLSearchParams({ spaces: 'appDataFolder', q: `trashed = false and name contains '${PREFIX}'`, fields: 'nextPageToken,files(id,name,createdTime)', pageSize: '1000' })
    if (pageToken) params.set('pageToken', pageToken)
    const data = await (await driveRequest(account, 'https://www.googleapis.com/drive/v3/files?' + params)).json() as { files?: FileInfo[]; nextPageToken?: string }
    files.push(...(data.files || []).filter(file => file.name.startsWith(PREFIX))); pageToken = data.nextPageToken || ''
  } while (pageToken)
  return files
}
export async function readDriveEvents(account: string, cache: Record<string, RemoteEvent>) {
  const files = await listDriveFiles(account)
  // Limit parallel downloads for mobile connections. Cached immutable events
  // need no additional download; absence from the list is reflected on pull.
  const result: Record<string, RemoteEvent> = {}
  for (let offset = 0; offset < files.length; offset += 6) {
    await Promise.all(files.slice(offset, offset + 6).map(async file => {
      result[file.id] = cache[file.id] || { id: file.id, createdTime: file.createdTime, event: validateEvent(await (await driveRequest(account, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`)).json()) }
    }))
  }
  return result
}
export async function appendDriveEvent(account: string, event: DriveEvent, fileId: string) {
  const boundary = 'kotoba_' + crypto.randomUUID()
  const metadata = { id: fileId, name: PREFIX + event.mutationId + '.json', parents: ['appDataFolder'], mimeType: 'application/json' }
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(event)}\r\n--${boundary}--`
  // Pre-generated IDs make retry after a lost response idempotent.
  await driveRequest(account, 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body })
}
export async function generateDriveId(account: string): Promise<string> {
  const data = await (await driveRequest(account, 'https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=appDataFolder&type=files')).json() as { ids: string[] }
  if (!data.ids?.[0]) throw Error('Google Driveの保存先を作成できません。')
  return data.ids[0]
}
