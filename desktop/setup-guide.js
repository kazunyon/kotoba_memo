/* Shared by the offline wizard and the printable manual. Never stores secrets. */
;(function (root) {
  const steps = [
    { id: 'project', title: '自分のプロジェクトを選ぶ', action: 'Google Cloudを開き、使うプロジェクトを選びます。', link: 'https://console.cloud.google.com/', diagram: 'project', lines: ['上のプロジェクト名を押します。', '新しく作る場合は「新しいプロジェクト」を押します。', '「プロジェクトID」を下の欄へ貼り付けます。'], input: 'project', confirm: '自分のプロジェクトIDを確認しました' },
    { id: 'billing', title: '請求先を確認する', action: '「課金」を開き、プロジェクトに請求先を登録します。', route: 'billing/linkedaccount', diagram: 'billing', lines: ['請求先が設定済みなら、そのまま次へ進めます。', '未設定なら、画面に沿って請求先を登録します。', '利用量に応じて費用が発生します。予算通知は課金画面で設定できます。'], confirm: 'このプロジェクトの請求先を確認しました' },
    { id: 'prepare', title: '設置を準備する', action: 'Cloud Shellに、コピーした命令を貼り付けます。', route: 'home/dashboard', shell: true, diagram: 'shell', command: 'prepare', lines: ['ページ右上の「＞_」を押して、下の黒い画面を開きます。', '「命令をコピー」を押し、黒い画面へ貼り付けてEnterを押します。', '初回の承認画面では、自分のプロジェクトへの操作を承認します。', '必要なAPI・ビルド権限・アプリの準備をまとめて行います。数分かかります。'], confirm: '「準備できました」と表示されました' },
    { id: 'address', title: '発行されたURLを受け取る', action: '黒い画面に表示された「アプリURL」を貼り付けます。', diagram: 'address', lines: ['結果全体を貼り付けても、URLだけを取り出します。', 'この段階ではGoogleログインの設定がまだ必要です。'], input: 'origin', confirm: '自分の設置先URLを確認しました' },
    { id: 'branding', title: 'アプリの名前を設定する', action: 'Google認証の「ブランディング」を開きます。', route: 'auth/branding', diagram: 'branding', lines: ['初回は「開始」を押します。', 'アプリ名は「ことばメモ」、連絡先は自分のメールアドレスにします。', '画面に沿って保存します。すでに設定済みなら次へ進めます。'], confirm: 'アプリ名と連絡先を保存しました' },
    { id: 'audience', title: '自分をテストユーザーに登録する', action: '「対象」を開き、自分のGoogleアカウントを追加します。', route: 'auth/audience', diagram: 'audience', lines: ['個人のGoogleアカウントではユーザーの種類は「外部」です。', 'テストユーザーの「Add users」を押します。', 'PCとスマホで使う自分のメールアドレスを追加して保存します。'], confirm: '使うアカウントをテストユーザーに登録しました' },
    { id: 'scope', title: 'Driveの保存権限を選ぶ', action: '「データアクセス」で、下の権限を登録します。', route: 'auth/scopes', diagram: 'scope', lines: ['「スコープを追加または削除」を押します。', 'openid、メールアドレス（userinfo.email）、drive.appdataを選びます。', 'drive.appdataはことばメモ専用の保存領域です。更新して保存します。'], snippet: 'https://www.googleapis.com/auth/drive.appdata', confirm: '3つの権限を保存しました' },
    { id: 'client', title: 'Googleログインの設定を作る', action: '「クライアントを作成」を押します。', route: 'auth/clients', diagram: 'client', lines: ['種類は「ウェブ アプリケーション」を選びます。', '名前は「ことばメモ Web」にします。', 'すでにこのプロジェクトの設定がある場合は、その名前を開きます。', '次の画面で、ログイン後の戻り先を登録します。'], confirm: 'ウェブ アプリケーションの設定画面を開きました' },
    { id: 'callback', title: 'ログイン後の戻り先を登録する', action: '「承認済みのリダイレクト URI」に下のURLを追加します。', route: 'auth/clients', diagram: 'callback', lines: ['下側の「承認済みのリダイレクト URI」の「＋ URIを追加」を押します。', '「URLをコピー」でコピーしたURLを貼り付けます。', '「作成」または「保存」を押します。'], snippet: 'callback', confirm: '戻り先URLを保存しました' },
    { id: 'credentials', title: 'ログインの値をCloudへ保存する', action: 'Cloud Shellで、2つの値を順番に貼り付けます。', route: 'home/dashboard', shell: true, extraRoute: 'auth/clients', diagram: 'credentials', command: 'credentials', lines: ['まず下の命令をコピーし、Cloud Shellへ貼り付けてEnterを押します。', '「クライアントIDを貼り付けてEnter」と出たら、Googleのクライアント画面でIDをコピーし、黒い画面へ貼り付けてEnterを押します。', '次の入力待ちになったら、Googleの画面で秘密の値をコピーします。作成直後の表示を使うか、既存の設定では「Add secret」で作ります。表示中の画面は保存が終わるまで閉じません。', '秘密の値を黒い画面へ貼り付けても文字は表示されません。そのままEnterを押します。', '秘密の値をコピーした後に「命令をコピー」を押すと、コピー内容が変わります。順番どおりに進めてください。', '保存済みの値は再入力不要です。暗号化の鍵も自動で作成します。'], confirm: '「認証設定を保存しました」と表示されました' },
    { id: 'finish', title: '設定を反映する', action: '最後の設置命令をCloud Shellで実行します。', route: 'home/dashboard', shell: true, diagram: 'finish', command: 'finish', lines: ['下の命令をコピーし、Cloud Shellへ貼り付けてEnterを押します。', '「設置できました」と表示されるまで待ちます。', '設置先の画面は公開されます。メモを読むには本人のGoogleログインが必要です。'], confirm: '「設置できました」と表示されました' },
    { id: 'connect', title: 'ことばメモへ接続する', action: '「接続を確認して開始」を押します。', diagram: 'connect', lines: ['設置先とGoogle認証の設定を自動で確認します。', '開いた画面で「Googleでログイン」を押し、自分のアカウントを選びます。', 'メールアドレスを確認して「このアカウントで開始」を押します。', 'テストメモを保存し、設定画面のQRコードからスマホで開いて確認します。'], input: 'connect' }
  ]
  function project(value) { return /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value) }
  function origin(value) {
    try { const u = new URL(value.trim()); if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.pathname !== '/') return ''; return u.origin } catch { return '' }
  }
  function extractOrigin(value) {
    // Cloud Run prints a numbered alias before the canonical APP_ORIGIN. Prefer
    // the helper's marked URL so the OAuth callback and API origin match.
    let marked = ''
    for (const match of value.matchAll(/(?:アプリURL|Application URL|Ready)\s*:\s*(https:\/\/[^\s<>"']+)/g)) { const found = origin(match[1]); if (found) marked = found }
    if (marked) return marked
    for (const match of value.matchAll(/https:\/\/[^\s<>"']+/g)) { const found = origin(match[0]); if (found) return found }
    return origin(value)
  }
  function link(step, state) {
    if (step.link) return step.link
    return `https://console.cloud.google.com/${step.route}?project=${encodeURIComponent(state.project)}${step.shell ? '&cloudshell=true' : ''}`
  }
  function command(kind, state) {
    if (!project(state.project)) return ''
    if (kind === 'prepare') return `if [ ! -d "$HOME/kotoba-memo-setup" ]; then\n  git clone --branch main https://github.com/kazunyon/kotoba_memo.git "$HOME/kotoba-memo-setup"\nfi\nif [ "$(git -C "$HOME/kotoba-memo-setup" remote get-url origin)" = "https://github.com/kazunyon/kotoba_memo.git" ]; then\n  git -C "$HOME/kotoba-memo-setup" pull --ff-only origin main &&\n  bash "$HOME/kotoba-memo-setup/deployment/setup.sh" prepare ${state.project}\nelse\n  echo "作業フォルダーを確認してください。別のリポジトリは実行しません。"\nfi`
    return `bash "$HOME/kotoba-memo-setup/deployment/setup.sh" ${kind} ${state.project}`
  }
  function snippet(step, state) { return step.snippet === 'callback' ? (origin(state.origin) ? state.origin + '/auth/callback' : '') : step.snippet || '' }
  function diagnose(log) {
    if (/429|RATE_LIMIT_EXCEEDED|Mutate requests/.test(log)) return { step: 'prepare', title: 'Googleの操作が混み合っています', detail: '2分ほど待って、同じ命令をもう一度実行してください。準備スクリプトも自動で再試行します。' }
    if (/PERMISSION_DENIED|permission denied|IAM permission/i.test(log)) return { step: 'prepare', title: 'Cloudの操作権限が不足しています', detail: '自分のプロジェクトとGoogleアカウントか確認してください。準備スクリプトはビルド権限を設定します。管理者権限がない場合はプロジェクトの管理者に依頼してください。' }
    if (/secret|認証設定|シークレット/i.test(log)) return { step: 'credentials', title: 'ログインの保存設定を確認してください', detail: '「ログインの値をCloudへ保存する」の命令を再実行してください。保存済みの鍵は作り直しません。' }
    if (/BILLING|billing|請求先/i.test(log)) return { step: 'billing', title: '請求先の設定が必要です', detail: '「請求先を確認する」へ戻り、使うプロジェクトに請求先を登録してください。' }
    return { title: 'この結果だけでは原因を特定できません', detail: '直前の操作とエラー部分を確認してください。秘密の値は貼り付けず、結果を管理者へ相談してください。' }
  }
  const api = { steps, project, origin, extractOrigin, link, command, snippet, diagnose }
  if (typeof module !== 'undefined') module.exports = api
  else root.KotobaGuide = api
})(typeof globalThis !== 'undefined' ? globalThis : this)
