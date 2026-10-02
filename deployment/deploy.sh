#!/usr/bin/env bash
set -euo pipefail
# Usage: bash deployment/deploy.sh PROJECT_ID [REGION] [SERVICE] [auto|prepare|finish]
task_project=${1:?Specify your own Google Cloud project ID}
task_region=${2:-asia-northeast1}
task_service=${3:-kotoba-memo}
task_phase=${4:-auto}
if [[ ! "$task_project" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ || ! "$task_region" =~ ^[a-z]+-[a-z]+[0-9]$ || ! "$task_service" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ || ! "$task_phase" =~ ^(auto|prepare|finish)$ ]]; then
  echo 'プロジェクトID・地域・サービス名を確認してください。' >&2; exit 1
fi
task_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$task_root"
task_sa="${task_service}@${task_project}.iam.gserviceaccount.com"
task_build_sa="${task_service}-build@${task_project}.iam.gserviceaccount.com"
if ((${#task_service} > 24)); then echo 'サービス名は24文字以内にしてください。' >&2; exit 1; fi
if ! command -v gcloud >/dev/null; then echo 'Google CloudのCloud Shellで実行してください。' >&2; exit 1; fi
# Capture only command errors, never secret values. Temporary files contain no credentials.
task_error=$(mktemp)
trap 'rm -f "$task_error"' EXIT
retry_enable() {
  local task_attempt
  for task_attempt in 1 2 3 4; do
    if gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com drive.googleapis.com --project="$task_project" 2>"$task_error"; then return 0; fi
    if rg -q '429|RATE_LIMIT_EXCEEDED|RESOURCE_EXHAUSTED' "$task_error" 2>/dev/null || grep -Eq '429|RATE_LIMIT_EXCEEDED|RESOURCE_EXHAUSTED' "$task_error"; then
      if [[ "$task_attempt" != 4 ]]; then echo 'Googleが混み合っています。60秒待って再試行します。'; sleep 60; continue; fi
    fi
    cat "$task_error" >&2
    echo '準備できませんでした。請求先と、このプロジェクトへの操作権限を確認してください。' >&2; return 1
  done
}
deploy_service() {
  local task_attempt
  for task_attempt in 1 2 3; do
    if gcloud run deploy "$@" 2>"$task_error"; then return 0; fi
    if grep -Eq 'PERMISSION_DENIED|IAM permission|429|RATE_LIMIT_EXCEEDED' "$task_error" && [[ "$task_attempt" != 3 ]]; then
      echo 'Googleの権限反映または混雑を待っています。60秒後に再試行します。'
      sleep 60; continue
    fi
    cat "$task_error" >&2
    echo '設置できませんでした。PCガイドの「うまくいかないとき」で結果を確認してください。' >&2
    return 1
  done
}
ensure_account() {
  local task_name=$1
  if gcloud iam service-accounts describe "$task_name@$task_project.iam.gserviceaccount.com" --project="$task_project" >/dev/null 2>"$task_error"; then return; fi
  if ! grep -Eq 'NOT_FOUND|not found|does not exist' "$task_error"; then cat "$task_error" >&2; return 1; fi
  gcloud iam service-accounts create "$task_name" --display-name='Kotoba Memo setup' --project="$task_project"
}
if [[ "$task_phase" != finish ]]; then
  echo '必要なGoogle APIを準備しています。'
  retry_enable
  ensure_account "$task_service"
  ensure_account "$task_service-build"
  echo 'ビルド用アカウントに必要な権限を設定しています。'
  gcloud projects add-iam-policy-binding "$task_project" --member="serviceAccount:$task_build_sa" --role=roles/run.builder --condition=None --quiet >/dev/null
fi
# Explicitly use a dedicated build account rather than relying on the project's default.
task_build_resource="projects/$task_project/serviceAccounts/$task_build_sa"
if ! gcloud run services describe "$task_service" --region="$task_region" --project="$task_project" >/dev/null 2>"$task_error"; then
  if ! grep -Eq 'NOT_FOUND|not found|Cannot find|does not exist' "$task_error"; then cat "$task_error" >&2; exit 1; fi
  if [[ "$task_phase" == finish ]]; then echo '先に「設置を準備する」の命令を実行してください。' >&2; exit 1; fi
  deploy_service "$task_service" --source=. --region="$task_region" --project="$task_project" --service-account="$task_sa" --build-service-account="$task_build_resource" --no-allow-unauthenticated --max-instances=2 --min-instances=0 --memory=512Mi --cpu=1 --set-env-vars='BOOTSTRAP_ONLY=1' --quiet
fi
task_origin=$(gcloud run services describe "$task_service" --region="$task_region" --project="$task_project" --format='value(status.url)')
if [[ ! "$task_origin" =~ ^https://[a-zA-Z0-9.-]+$ ]]; then echo '設置先URLを確認できませんでした。' >&2; exit 1; fi
echo "アプリURL: $task_origin"
echo "Googleログインの戻り先: $task_origin/auth/callback"
if [[ "$task_phase" == prepare ]]; then echo '準備できました。PCのガイドへ戻り、アプリURLを貼り付けてください。'; exit 0; fi
for task_suffix in client-id client-secret session-key; do
  task_secret="${task_service}-${task_suffix}"
  if ! task_secret_state=$(gcloud secrets versions describe latest --secret="$task_secret" --project="$task_project" --format='value(state)' 2>"$task_error"); then
    cat "$task_error" >&2
    echo "認証設定を確認してください: $task_secret。PCガイドの「ログインの値をCloudへ保存する」へ戻ってください。" >&2
    if [[ "$task_phase" == auto ]] && grep -Eq 'NOT_FOUND|not found|does not exist' "$task_error"; then exit 0; fi
    exit 1
  fi
  if [[ "$task_secret_state" != ENABLED ]]; then echo "シークレットの有効なバージョンがありません: $task_secret" >&2; exit 1; fi
  gcloud secrets add-iam-policy-binding "$task_secret" --project="$task_project" --member="serviceAccount:$task_sa" --role=roles/secretmanager.secretAccessor --condition=None --quiet >/dev/null
done
deploy_service "$task_service" --source=. --region="$task_region" --project="$task_project" --service-account="$task_sa" --build-service-account="$task_build_resource" --no-allow-unauthenticated --max-instances=2 --min-instances=0 --memory=512Mi --cpu=1 --set-env-vars="APP_ORIGIN=$task_origin" --set-secrets="GOOGLE_CLIENT_ID=${task_service}-client-id:latest,GOOGLE_CLIENT_SECRET=${task_service}-client-secret:latest,SESSION_KEY=${task_service}-session-key:latest" --quiet
gcloud run services add-iam-policy-binding "$task_service" --region="$task_region" --project="$task_project" --member=allUsers --role=roles/run.invoker --condition=None --quiet >/dev/null
echo '設置できました。PCガイドの「接続を確認して開始」を押してください。'
echo "アプリURL: $task_origin"
