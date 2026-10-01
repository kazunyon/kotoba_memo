# ことばメモ（Google Drive版）

失語症のある方が、思い出したいことば・説明・PC/Linuxの操作手順を確認する個人用アプリです。
[kazunyon/situgosyou](https://github.com/kazunyon/situgosyou) の main（元コミットは開発記録参照）を基に、同じ画面・操作を引き継ぎ、同期先を各利用者のGoogle Driveへ変更しています。作者のSupabaseは使いません。

## そのまま使える機能

- 日常用／PC・Linux用、登録・編集・削除、検索、星マーク、タイトル色、表示番号・並べ替え
- カテゴリの追加・名称変更（最大10件）
- PC/Linuxの画像付き手順（最大10件）、画像選択・Snipping Toolから貼り付け
- Markdown表示、Wikipediaからの意味・説明取得、音声入力・読み上げ
- 元アプリと互換性のあるJSONバックアップ・復元
- PC／スマホ対応、PWAのホーム画面追加

## Google版で変わるところ

- メール確認コードの代わりに「Googleでログイン」を押します。
- 同じGoogleアカウントの端末間で、メモ・画像・カテゴリを同期します。
- Google Driveのアプリ専用領域に保存します。フォルダーの作成やファイル操作は不要です。
- ログイン後のデータと未送信の変更を端末のIndexedDBにも保存します。
- 通信復帰・画面復帰・表示中の約30秒ごとに再確認します。即時のリアルタイム同期ではありません。
- ブラウザを開き直したときやGoogleの接続期限が切れたときは「Googleに再接続」を押します。秘密キーや更新トークンをブラウザに保存する方式にはしていません。
- 同じ記録の変更競合を送信前に検出した場合は、バックアップ後に共有先／端末の内容を選びます。完全同時送信では後からDriveに作成された変更が優先されます。詳細は[同期仕様](doc/sync_design.md)。

## 最初に読むもの

- [一般の利用者のインストール・操作手順](doc/user_guide.md)
- [配布者が一度だけ行うGoogle設定・公開手順](doc/distributor_setup.md)
- [同期の仕様・制限](doc/sync_design.md)
- [確認済みの内容・未確認の内容](doc/verification.md)

Google OAuthクライアントID未設定では端末内だけで使えます。これはGoogle同期の完了状態ではありません。設定済みの版では先にGoogleでログインしてください。

## 開発環境

Node.js 20以上を準備して実行します。

```sh
npm ci
# .env.example を .env.local へコピーし、配布者のGoogleクライアントIDを設定
npm run dev -- --host 127.0.0.1
npm test
npm run build
```

GitHub Pages用のパスは `/kotoba_memo/` です。他のHTTPS公開先では `VITE_BASE_PATH=/` にします。GitHubは開発・ビルドに使う場所です。利用者には公開URLとsetup.exeだけを案内できます。

## Windowsのsetup.exe

NSISのセットアップソースとWindowsビルド用のGitHub Actionsを収録しています。Windows版は**公開されたWebアプリへのデスクトップ・スタートメニューの入口をインストール**します。アプリ本体をPCへ同梱するネイティブ版ではありません。PWAのオフライン機能は初回アクセス後にブラウザへ保存されます。スマホにはsetup.exeを使いません。

Actionsの「Build Windows setup.exe」を手動実行し、成功後のアーティファクトから取得します。署名・Windows実機での導入確認・一般配布は別途必要です。
