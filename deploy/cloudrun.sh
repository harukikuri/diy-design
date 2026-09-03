#!/usr/bin/env bash
# Cloud Run へデプロイする。
#
#   PROJECT_ID=your-project ./deploy/cloudrun.sh
#
# 事前に一度だけ:
#   gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
#     artifactregistry.googleapis.com secretmanager.googleapis.com
#   printf 'YOUR_KEY' | gcloud secrets create gemini-api-key --data-file=-
#   gcloud secrets add-iam-policy-binding gemini-api-key \
#     --member="serviceAccount:$(gcloud projects describe "$PROJECT_ID" \
#       --format='value(projectNumber)')-compute@developer.gserviceaccount.com" \
#     --role=roles/secretmanager.secretAccessor
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-diy-design-compiler}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "PROJECT_ID を指定してください" >&2
  exit 1
fi

gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --source . \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --concurrency 20 \
  --timeout 300 \
  --max-instances 5 \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest"

echo
echo "URL: $(gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
