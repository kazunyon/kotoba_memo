# 配布者のGoogle連携・公開準備

## 最初に必要なもの

- 配布を管理するGoogleアカウント
- Google Cloudプロジェクト（利用者一人ずつではなく、アプリ用に一つ）
- アプリを公開するHTTPSのURL
- 開発用PCとNode.js 20以上
- Windowsインストーラーを作る場合はNSIS、または付属のWindows用GitHub Actions

利用者のDriveデータは各自のGoogleアカウントへ保存します。配布者のCloudプロジェクトはアプリの識別と利用許可に使います。クライアントIDは公開識別子です。クライアントシークレット・サービスアカウントキーは使いません。

## 一度だけ行う準備

1. Google Cloud Consoleでアプリ用プロジェクトを作成します。
2. 「APIとサービス」のライブラリでGoogle Drive APIを有効にします。
3. Google Auth Platformでアプリ名、サポートメール、公開対象、連絡先を設定します。個人のGoogleアカウントへ配布する場合は外部向けを選びます。
4. データアクセスに `openid`、`email`、`https://www.googleapis.com/auth/drive.appdata` を設定します。Drive全体へのアクセス権限は不要です。
5. OAuthクライアントを「ウェブアプリケーション」として作成します。
6. 承認済みJavaScript生成元に、公開URLの生成元を設定します。このリポジトリのPagesなら `https://kazunyon.github.io` です。`/kotoba_memo/` のパスは生成元に入れません。
7. ローカル検証には `http://localhost:5173` と、使う場合は `http://127.0.0.1:5173` も追加します。ポート番号も合わせます。
8. テスト段階では、利用するGoogleアカウントをテストユーザーへ登録します。
9. クライアントIDを `.env.local` の `VITE_GOOGLE_CLIENT_ID` に入れます。配布する前に正式な公開設定、アプリのホームページ・プライバシーポリシー、必要な確認手続きを整えます。Google側の表示は変わることがあるため公式案内も確認してください。

一般の利用者にこの操作を依頼しないでください。

## GitHub Pagesを公開先として使う場合

1. リポジトリのSettings → Secrets and variables → Actions → Variablesへ進みます。
2. Repository variable `VITE_GOOGLE_CLIENT_ID` を追加します。
3. Settings → PagesのSourceをGitHub Actionsにします。
4. mainに反映し、Deploy to GitHub Pagesが成功することを確認します。
5. `https://kazunyon.github.io/kotoba_memo/` を開き、Googleでログインします。

利用者はGitHubの画面を開かず、上のアプリURLを使います。他のHTTPSホスティングでも利用できます。

## setup.exeを作る

1. Actions → Build Windows setup.exe → Run workflowを実行します。
2. 成功した実行のArtifactsにある `kotoba-memo-windows-setup` をダウンロードします。
3. ZIPから `kotoba-memo-setup.exe` を取り出します。
4. Windowsで導入・起動・アンインストールを確認します。
5. 一般配布の前にコード署名を検討します。未署名の配布物はWindowsの確認画面が出る場合があります。

別の公開先を使う場合は `installer/windows/setup.nsi` の `APP_URL` を変更します。このインストーラーは公開URLを開くショートカット方式です。署名済みexeやネイティブ同梱版が完成しているという意味ではありません。

## 最終確認

[利用者向け手順](user_guide.md)の双方向同期を、別々のPC・スマホで試します。第三者の新しいアカウントでもログインできることを確認します。Google側の公開設定と実機確認が終わるまでは、一般向けの完成版として配布しないでください。

公式資料：
- https://developers.google.com/workspace/drive/api/guides/appdata
- https://developers.google.com/workspace/drive/api/guides/api-specific-auth
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
