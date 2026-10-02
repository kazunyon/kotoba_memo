const guide = window.KotobaGuide
const query = new URLSearchParams(location.search)
const state = { project: guide.project(query.get('project') || '') ? query.get('project') : '', origin: guide.origin(query.get('origin') || '') }
const pages = document.getElementById('pages')
const make = (tag, text) => { const el = document.createElement(tag); if (text) el.textContent = text; return el }
const cover = make('section'); cover.className = 'page cover'
cover.append(make('p', 'ことばメモ · はじめての準備'), make('h1', '初回設定の\n図解マニュアル'), make('p', '一枚ずつ進めます。設置先・保存・接続は設定結果ファイルからアプリが確認します。'), make('p', 'Googleへのログインと請求先登録は、ご本人が行います。Cloudの利用量に応じて費用が発生します。'), make('p', '図は操作場所を説明するための再現図です。Googleの画面表示は変わる場合があります。'), make('p', 'プロジェクトID：' + (state.project || '____________________________')), make('p', 'アプリURL：' + (state.origin || '____________________________')), make('p', '秘密の値はこの紙・スクリーンショット・チャットに記録しません。Google Cloudへ直接保存します。'))
pages.append(cover)
for (const [index, step] of guide.steps.entries()) {
  const page = make('section'); page.className = 'page' + (step.id === 'credentials' ? ' compact' : '')
  page.append(make('p', `${index + 1} / ${guide.steps.length}　ことばメモ 初回設定`), make('h2', step.title), make('p', step.action))
  const image = make('div'); image.innerHTML = window.KotobaDiagram.diagram(step.diagram); page.append(image)
  const list = make('ol'); step.lines.forEach(line => list.append(make('li', line))); page.append(list)
  if (step.link || step.route) {
    const url = state.project || step.link ? guide.link(step, state) : 'PCの初回設定ガイドで「Googleの設定ページを開く」を押します。'
    page.append(make('p', url))
  }
  if (step.extraRoute && state.project) page.append(make('p', guide.link({ route: step.extraRoute }, state)))
  if (step.snippet) page.append(make('pre', guide.snippet(step, state) || 'アプリURLに /auth/callback を付けます。PCガイドの「URLをコピー」を使ってください。'))
  if (step.command) page.append(make('p', 'PCガイドの「命令をコピー」を押してください。紙から長い命令を手入力する必要はありません。'))
  page.append(make('p', step.receive ? 'PCアプリが設定結果を読み取り確認します。手動の完了チェックは不要です。' : '□ ' + (step.confirm || 'ログインし、テストメモの保存とスマホでの表示を確認しました')))
  pages.append(page)
}
const help = make('section'); help.className = 'page'
help.append(make('h2', '困ったときは、このページへ'), make('p', '英語のエラーを読む必要はありません。PCガイドの「うまくいかないとき」へ、エラー部分だけを貼り付けてください。秘密の値は貼り付けません。'))
for (const sample of ['RATE_LIMIT_EXCEEDED', 'PERMISSION_DENIED', 'Missing secret', 'BILLING']) { const result = guide.diagnose(sample); help.append(make('h3', result.title), make('p', result.detail)) }
help.append(make('h3', '「同期中」が分からないとき'), make('p', '画面に戻ると同期を確認します。表示だけで判断せず、テストメモを作り、スマホで同じURL・同じGoogleアカウントから表示できるか確認します。'), make('h3', 'あとで続けたいとき'), make('p', 'PCガイドの「ここで休む」を押します。次回は「続きから再開する」を押してください。設置済みなら「設置済みのURLがある」から始められます。'))
pages.append(help)
document.getElementById('print').onclick = () => window.kotobaManual ? window.kotobaManual.print() : window.print()
