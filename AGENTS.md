# Google Drive版の開発方針

- 元のsitugosyouの画面・機能・バックアップ形式を維持する。認証はGoogle連携へ変更する。
- 利用者は左手だけで操作する。クリック・タップ・貼り付けを優先する。
- Supabase、SMTP、秘密キーを配布物へ含めない。
- 利用者自身のGoogle Cloudプロジェクトへ設置し、利用者自身のOAuth設定・Googleアカウント・Google Driveで独立して使う。固定の開発者URL・OAuth IDを配布物へ含めない。
- OAuthの秘密情報は利用者のCloudのSecret Managerで管理する。PCとスマホは同じ設置先を使う。
- 実機確認前に、PC・スマホ間同期の成功を断定しない。
