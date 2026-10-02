#!/usr/bin/env bash
set -euo pipefail
# Usage: bash deployment/deploy.sh PROJECT_ID REGION [SERVICE]
# Credentials must belong to the person who owns this deployment.
task_project=${1:?Specify your own Google Cloud project ID}
task_region=${2:-asia-northeast1}
task_service=${3:-kotoba-memo}
if [[ ! "$task_project" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ || ! "$task_region" =~ ^[a-z]+-[a-z]+[0-9]$ || ! "$task_service" =~ ^[a-z][a-z0-9-]{0,48}$ ]]; then
  echo 'Invalid project, region or service name.' >&2; exit 1
fi
task_root=$(cd "$(dirname "$0")/.." && pwd)
cd "$task_root"
task_sa="${task_service}@${task_project}.iam.gserviceaccount.com"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com drive.googleapis.com --project="$task_project"
if ! gcloud iam service-accounts describe "$task_sa" --project="$task_project" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$task_service" --display-name='Kotoba Memo runtime' --project="$task_project"
fi
# OAuth setup needs the real Cloud Run URL first. A private bootstrap service has
# no secret bindings; make it public only after all settings have been registered.
if ! gcloud run services describe "$task_service" --region="$task_region" --project="$task_project" >/dev/null 2>&1; then
  gcloud run deploy "$task_service" --source=. --region="$task_region" --project="$task_project" --service-account="$task_sa" --no-allow-unauthenticated --max-instances=2 --min-instances=0 --memory=512Mi --cpu=1 --set-env-vars='BOOTSTRAP_ONLY=1'
fi
task_origin=$(gcloud run services describe "$task_service" --region="$task_region" --project="$task_project" --format='value(status.url)')
echo "Application URL: $task_origin"
echo "Register OAuth Web redirect URI: $task_origin/auth/callback"
echo "Secrets: ${task_service}-client-id, ${task_service}-client-secret, ${task_service}-session-key"
echo 'Create those three secrets in Secret Manager, then rerun this script.'
for task_suffix in client-id client-secret session-key; do
  task_secret="${task_service}-${task_suffix}"
  if ! gcloud secrets versions describe latest --secret="$task_secret" --project="$task_project" >/dev/null 2>&1; then
    echo "Missing secret version: $task_secret. Bootstrap complete; follow doc/distributor_setup.md."; exit 0
  fi
  gcloud secrets add-iam-policy-binding "$task_secret" --project="$task_project" --member="serviceAccount:$task_sa" --role=roles/secretmanager.secretAccessor >/dev/null
done
gcloud run deploy "$task_service" --source=. --region="$task_region" --project="$task_project" --service-account="$task_sa" --no-allow-unauthenticated --max-instances=2 --min-instances=0 --memory=512Mi --cpu=1 --set-env-vars="APP_ORIGIN=$task_origin" --set-secrets="GOOGLE_CLIENT_ID=${task_service}-client-id:latest,GOOGLE_CLIENT_SECRET=${task_service}-client-secret:latest,SESSION_KEY=${task_service}-session-key:latest"
gcloud run services add-iam-policy-binding "$task_service" --region="$task_region" --project="$task_project" --member=allUsers --role=roles/run.invoker
echo "Ready: $task_origin"
echo 'Check /api/config, then sign in with your own Google account on PC and phone.'
