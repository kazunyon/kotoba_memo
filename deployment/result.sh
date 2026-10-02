#!/usr/bin/env bash
# Public setup receipt only. Never include OAuth credentials or session keys.
write_setup_result() {
  local result_project=$1 result_phase=$2 result_origin=$3 result_file
  [[ "$result_project" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]] || return 1
  [[ "$result_phase" =~ ^(prepare|finish)$ ]] || return 1
  [[ "$result_origin" =~ ^https://[a-zA-Z0-9.-]+\.run\.app$ ]] || return 1
  result_file="${KOTOBA_SETUP_RESULT_DIR:-$HOME}/kotoba-${result_project}-${result_phase}.kotoba-setup"
  (umask 077; printf '{"version":1,"project":"%s","phase":"%s","origin":"%s"}\n' "$result_project" "$result_phase" "$result_origin" > "$result_file")
  echo '設定結果ファイルを作りました。PCでこのファイルを開いてください。URLを探す必要はありません。'
  if command -v cloudshell >/dev/null; then
    if ! cloudshell download "$result_file"; then echo "ダウンロードできない場合はCloud Shellのファイル一覧から取得してください: $result_file"; fi
  else echo "結果ファイル: $result_file"; fi
}
