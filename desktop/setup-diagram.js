/* Schematic diagrams, clearly marked as diagrams rather than captured Google UI. */
;(function (root) {
  const labels = {
    project: ['Google Cloud', 'プロジェクト名 ▼', 'プロジェクトID', 'ここを押して選ぶ'],
    billing: ['課金', '請求先アカウント', 'kotoba-memo → 登録済み', 'このプロジェクトを確認'],
    shell: ['Google Cloud', '＞_ Cloud Shell', '黒い画面へ貼り付け → Enter', '右上のこのボタン'],
    address: ['Cloud Shellの結果', '準備できました', 'アプリURL: https://…run.app', 'このURLをコピー'],
    branding: ['Google認証：ブランディング', 'アプリ名：ことばメモ', '連絡先：自分のメール', '入力して保存'],
    audience: ['Google認証：対象', 'テストユーザー', '＋ Add users', '自分のアカウントを追加'],
    scope: ['Google認証：データアクセス', 'スコープを追加または削除', 'openid・email・drive.appdata', 'この3つを選ぶ'],
    client: ['Google認証：クライアント', '＋ クライアントを作成', '種類：ウェブ アプリケーション', 'この種類を選ぶ'],
    callback: ['Google認証：クライアント', '承認済みのリダイレクト URI', '＋ URIを追加 → URLを貼り付け', '下側の欄に追加'],
    credentials: ['Cloud Shell', 'クライアントID：貼り付け', '秘密の値：表示せず受け取ります', '命令 → 2つの値を入力'],
    finish: ['Cloud Shellの結果', '設置できました', 'アプリURL: https://…run.app', 'この表示を確認'],
    connect: ['ことばメモ', '接続を確認して開始', 'Googleでログイン → アカウント確認', '最後に保存とスマホを確認']
  }
  function diagram(kind) {
    const items = labels[kind] || labels.project
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 245" role="img" aria-label="${items[3]}の操作場所を示す図"><rect x="1" y="1" width="638" height="243" rx="12" fill="#f7f9fb" stroke="#b8c5d1"/><rect x="1" y="1" width="638" height="45" rx="12" fill="#e7edf4"/><g font-family="sans-serif" fill="#23374b"><text x="22" y="30" font-size="19">${items[0]}</text><text x="24" y="233" font-size="13">操作場所の図解（実際の画面とは表示が異なる場合があります）</text><rect x="24" y="65" width="590" height="48" rx="6" fill="white" stroke="#d53142" stroke-width="3"/><text x="40" y="96" font-size="19">${items[1]}</text><text x="40" y="150" font-size="18">${items[2]}</text><text x="40" y="194" fill="#bd2434" font-size="18">① ${items[3]}</text></g></svg>`
  }
  if (typeof module !== 'undefined') module.exports = { diagram }
  else root.KotobaDiagram = { diagram }
})(typeof globalThis !== 'undefined' ? globalThis : this)
