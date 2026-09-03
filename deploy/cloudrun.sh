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
# 既定では Vertex AI を使う。API キーは持たず、Cloud Run のサービスアカウントで認証する。
# AI Studio の API キーを使いたい場合は AI_BACKEND=api-key を指定する
# (その場合は gemini-api-key という Secret を先に作っておくこと)。
#
# 事前に一度だけ:
#   gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
#     artifactregistry.googleapis.com aiplatform.googleapis.com
#   SA="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
#   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
#     --member="serviceAccount:$SA" --role=roles/aiplatform.user
set -euo pipefail

REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-diy-design-compiler}"
AI_BACKEND="${AI_BACKEND:-vertex}"
GOOGLE_CLOUD_LOCATION="${GOOGLE_CLOUD_LOCATION:-global}"

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

cat <<MSG

  プロジェクト : $PROJECT_ID
  アカウント   : ${ACCOUNT:-(不明)}
  リージョン   : $REGION
  サービス     : $SERVICE
  AI 接続先    : $AI_BACKEND

MSG

if [[ "${CONFIRM:-}" != "yes" ]]; then
  read -r -p "この内容でデプロイします。よろしいですか? [y/N] " reply
  [[ "$reply" == "y" || "$reply" == "Y" ]] || { echo "中止しました。"; exit 1; }
fi

args=(
  --project "$PROJECT_ID"
  --region "$REGION"
  --source .
  --allow-unauthenticated
  --memory 1Gi
  --cpu 1
  --concurrency 20
  --timeout 300
  --max-instances 5
)

if [[ "$AI_BACKEND" == "vertex" ]]; then
  # 鍵は使わない。サービスアカウントの資格情報で Vertex AI を叩く。
  args+=(--set-env-vars "AI_BACKEND=vertex,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,GOOGLE_CLOUD_LOCATION=$GOOGLE_CLOUD_LOCATION")
else
  args+=(--set-env-vars "AI_BACKEND=api-key")
  args+=(--set-secrets "GEMINI_API_KEY=gemini-api-key:latest")
fi

gcloud run deploy "$SERVICE" "${args[@]}"

echo
echo "URL: $(gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
