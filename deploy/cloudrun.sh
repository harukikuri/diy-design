#!/usr/bin/env bash
# Cloud Build 経由で Cloud Run へデプロイする (手動実行用)。
#
#   PROJECT_ID=my-personal-project ./deploy/cloudrun.sh
#
# デプロイ手順そのものは cloudbuild.yaml にある。このスクリプトは
# 「どのプロジェクトに出すか」を目視確認させるためだけの薄いラッパ。
# GitHub push で自動デプロイする場合はトリガーが直接 cloudbuild.yaml を読むので、
# このスクリプトは不要になる。
#
# PROJECT_ID は必ず明示する。gcloud のアクティブなプロジェクトへは
# 意図せず落ちないようにしている (別用途のプロジェクトへ誤ってデプロイしないため)。
#
# 事前に一度だけ:
#   gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
#     artifactregistry.googleapis.com aiplatform.googleapis.com
#   gcloud artifacts repositories create app \
#     --repository-format=docker --location=asia-northeast1
#   SA="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
#   gcloud projects add-iam-policy-binding "$PROJECT_ID" \
#     --member="serviceAccount:$SA" --role=roles/aiplatform.user
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

gcloud builds submit \
  --project "$PROJECT_ID" \
  --config cloudbuild.yaml \
  --substitutions "_REGION=$REGION,_SERVICE=$SERVICE"

echo
echo "URL: $(gcloud run services describe "$SERVICE" \
  --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')"
