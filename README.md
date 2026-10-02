# ことばメモ（利用者自身のGoogle Cloud・Google Drive版）

既存のメモ編集・画像付き手順・カテゴリ・読み上げ・JSONバックアップを維持し、利用者自身のGoogle Cloudにアプリを設置する構成へ変更しました。作者の公開URL・Googleプロジェクト・Supabaseに依存しません。

- **PC**：専用のWindowsアプリをインストールし、自分の設置先URLを入力します。Googleログインは外部ブラウザで行います。
- **スマホ**：同じURLを開き、同じGoogleアカウントでログインします。PWAのホーム画面追加に対応します。
- **保存**：本人のGoogle Driveのアプリ専用領域。端末キャッシュは接続先・OAuthクライアント・アカウントごとに分離します。
- **Google認証**：Cloud側の認可コードフロー＋PKCE。秘密情報は自分のSecret Managerへ登録します。Googleの生のトークンはWeb画面へ返しません。
- **アカウント確認**：起動時にメールアドレス・接続先・保存先を表示し、「このアカウントで開始」を押すまでメモを読み込みません。
- **ログアウト**：端末のそのアカウントのキャッシュを削除します。未送信データは先にバックアップしてください。

## 手順

1. [自分のGoogle Cloudへ設置](doc/distributor_setup.md)
2. [PC・スマホで利用](doc/user_guide.md)
3. [同期の仕様と制限](doc/sync_design.md)
4. [検証結果・未確認事項](doc/verification.md)

**旧版から移行する前にJSONバックアップを保存してください。** OAuthプロジェクトが変わると、旧アプリのDrive専用領域をそのまま読むことはできません。新しい設置先でバックアップを復元します。

## 開発・ビルド

Node.js 22以上を使います。

```sh
npm ci
npm test
npm run build
# .env.server.example を .env.server へコピーし、自分の設定を入力
npm start
# http://localhost:8080
```

OAuthのリダイレクトURIは開発時 `http://localhost:8080/auth/callback` です。SESSION_KEYは `.env.server.example` の生成コマンドで作成します。秘密情報をVITE_変数へ入れないでください。

Viteで編集する場合は、サーバーを8080で動かし、APP_ORIGINとOAuthリダイレクトURIを `http://localhost:5173` に変更して `npm run dev` を実行します。APIと認証は8080へ転送されます。

Windowsアプリの依存はWeb版と分けています。

```sh
npm install --prefix desktop
npm run desktop
# Windows上で実行
npm run dist:windows
# release/kotoba-memo-setup.exe
```

GitHub Actionsの「Build Windows setup.exe」でも生成できます。セットアップはElectronアプリを同梱し、専用の保存領域と接続設定を持ちます。固定URLを開く旧NSISスクリプトとGitHub Pagesへの自動公開は削除しました。

Cloud用の[Dockerfile](Dockerfile)と[設置スクリプト](deployment/deploy.sh)を収録しています。設置には本人のGoogle Cloud設定・課金設定が必要です。コード署名、実際のGoogle OAuth、Windowsでのインストール、PC・スマホ間の実機同期は[検証記録](doc/verification.md)を確認してください。
