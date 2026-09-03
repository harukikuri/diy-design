#!/usr/bin/env bash
# Cloud Run へデプロイする。
#
#   PROJECT_ID=my-personal-project ./deploy/cloudrun.sh
#
# gcloud の構成を分けている場合は、グローバルの active を切り替えずに:
#   CLOUDSDK_ACTIVE_CONFIG_NAME=diy-personal PROJECT_ID=my-personal-project ./deploy/cloudrun.sh
#
# PROJECT_ID は必ず明示する。gcloud のアクティブなプロジェクトへは
# 意図せず落ちないようにしている (別用途のプロジェクトへ誤ってデプロイしないため)。
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

REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-diy-design-compiler}"

if [[ -z "${PROJECT_ID:-}" ]]; then
  cat >&2 <<'MSG'
PROJECT_ID を明示してください。

  PROJECT_ID=my-personal-project ./deploy/cloudrun.sh

gcloud のアクティブなプロジェクトには意図的にフォールバックしません。
別用途のプロジェクトへ誤ってデプロイするのを防ぐためです。
MSG
  exit 1
fi

ACCOUNT="$(gcloud config get-value account 2>/dev/null || true)"

# 何に対してデプロイしようとしているかを必ず目視させる
cat <<MSG

  プロジェクト : $PROJECT_ID
  アカウント   : ${ACCOUNT:-(不明)}
  リージョン   : $REGION
  サービス     : $SERVICE

MSG

if [[ "${CONFIRM:-}" != "yes" ]]; then
  read -r -p "この内容でデプロイします。よろしいですか? [y/N] " reply
  [[ "$reply" == "y" || "$reply" == "Y" ]] || { echo "中止しました。"; exit 1; }
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
