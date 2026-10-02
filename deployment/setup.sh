#!/usr/bin/env bash
set +x
set -euo pipefail
# Wizard entry points; credentials are read interactively, never via command arguments.
task_mode=${1:-}
task_project=${2:-}
task_service=kotoba-memo
if [[ ! "$task_project" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ || ! "$task_mode" =~ ^(prepare|credentials|finish)$ ]]; then echo '使い方: bash deployment/setup.sh prepare|credentials|finish 自分のプロジェクトID' >&2; exit 1; fi
task_root=$(cd "$(dirname "$0")/.." && pwd)
if [[ "$task_mode" != credentials ]]; then exec bash "$task_root/deployment/deploy.sh" "$task_project" asia-northeast1 "$task_service" "$task_mode"; fi
# Refuse missing tools and preserve the original working key on reruns.
command -v gcloud >/dev/null || { echo 'Cloud Shellで実行してください。' >&2; exit 1; }
command -v openssl >/dev/null || { echo '鍵を作成するopensslが必要です。' >&2; exit 1; }
task_error=$(mktemp)
trap 'rm -f "$task_error"; unset task_client_id task_client_secret' EXIT
secret_exists() {
  if gcloud secrets describe "$1" --project="$task_project" >/dev/null 2>"$task_error"; then return 0; fi
  if grep -Eq 'NOT_FOUND|not found|does not exist' "$task_error"; then return 1; fi
  cat "$task_error" >&2; echo 'シークレットの操作権限を確認してください。' >&2; exit 1
}
secret_ready() {
  if ! secret_exists "$1"; then return 1; fi
  local task_state
  if task_state=$(gcloud secrets versions describe latest --secret="$1" --project="$task_project" --format='value(state)' 2>"$task_error"); then
    [[ "$task_state" == ENABLED ]] && return 0
    echo "$1 の最新バージョンが無効です。Secret Managerで有効にしてください。" >&2; exit 1
  fi
  if grep -Eq 'NOT_FOUND|not found|does not exist' "$task_error"; then return 1; fi
  cat "$task_error" >&2; exit 1
}
store_secret() {
  local task_name=$1
  if secret_exists "$task_name"; then
    gcloud secrets versions add "$task_name" --project="$task_project" --data-file=- >/dev/null
  else
    gcloud secrets create "$task_name" --project="$task_project" --replication-policy=automatic --data-file=- >/dev/null
  fi
}
if ! secret_ready "$task_service-client-id"; then
  IFS= read -r -p 'クライアントIDを貼り付けてEnter: ' task_client_id
  if [[ ! "$task_client_id" =~ ^[0-9]+-[A-Za-z0-9]+\.apps\.googleusercontent\.com$ ]]; then echo 'クライアントIDを確認してください。' >&2; exit 1; fi
  printf '%s' "$task_client_id" | store_secret "$task_service-client-id"
fi
if ! secret_ready "$task_service-client-secret"; then
  # Hidden input stays out of terminal scrollback and shell command history.
  IFS= read -r -s -p '新しい秘密の値を貼り付けてEnter（文字は表示されません）: ' task_client_secret
  printf '\n'
  if [[ "$task_client_secret" != GOCSPX-* || "$task_client_secret" == *[[:space:]]* || ${#task_client_secret} -lt 20 ]]; then echo '秘密の値を確認してください。伏せ字やクライアントIDは使えません。' >&2; exit 1; fi
  printf '%s' "$task_client_secret" | store_secret "$task_service-client-secret"
fi
if ! secret_ready "$task_service-session-key"; then
  openssl rand -base64 32 | tr -d '\n' | store_secret "$task_service-session-key"
fi
# Check that every write is visible before displaying completion.
for task_suffix in client-id client-secret session-key; do secret_ready "$task_service-$task_suffix" || { echo '保存が完了していません。もう一度実行してください。' >&2; exit 1; }; done
echo '認証設定を保存しました。PCガイドの「設定を反映する」へ進んでください。'
