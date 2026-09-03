/**
 * サーバ設定。
 *
 * Gemini へのつなぎ方は 2 通りある。
 *
 * - vertex   : Vertex AI。認証は実行環境の資格情報 (Cloud Run のサービスアカウント、
 *              ローカルでは application-default login)。鍵を持ち回らずに済み、
 *              レート上限もプロジェクト単位で広い。本番はこちら。
 * - api-key  : AI Studio の API キー。手軽だが無料枠は 20 リクエスト/分/モデルで、
 *              1 回の設計に 4〜8 リクエスト使うためデモには足りない。
 *
 * どちらも用意できないときはルールベースの設計エンジンにフォールバックする。
 */

export type AiBackend = "vertex" | "api-key" | "none";

export interface ServerConfig {
  port: number;
  backend: AiBackend;
  /** api-key モードのときだけ使う */
  geminiApiKey: string | undefined;
  /** vertex モードのときだけ使う */
  gcpProject: string | undefined;
  gcpLocation: string;
  /** エージェントの推論に使うモデル */
  agentModel: string;
  /** agentModel が使えないときに順に試すモデル */
  fallbackModels: string[];
  /** 一時エラー時に同じモデルで試す回数 */
  retries: number;
  /** 完成イメージの生成に使うモデル (Nano Banana) */
  imageModel: string;
  /** 1リクエストあたりのエージェントの最大ツール呼び出し回数 */
  maxToolCalls: number;
  /** 1リクエストあたり evaluate_design を呼べる回数 */
  maxEvaluations: number;
  /** ビルド済みフロントエンドの場所 */
  staticDir: string;
}

function resolveBackend(apiKey?: string, project?: string): AiBackend {
  // 明示指定が最優先。指定が無ければ、使えるものを選ぶ (Vertex を優先)。
  const explicit = process.env.AI_BACKEND?.trim();
  if (explicit === "vertex") return project ? "vertex" : "none";
  if (explicit === "api-key") return apiKey ? "api-key" : "none";
  if (project) return "vertex";
  if (apiKey) return "api-key";
  return "none";
}

export function loadConfig(): ServerConfig {
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || undefined;
  const gcpProject = process.env.GOOGLE_CLOUD_PROJECT?.trim() || undefined;

  return {
    port: Number(process.env.PORT ?? 8080),
    backend: resolveBackend(geminiApiKey, gcpProject),
    geminiApiKey,
    gcpProject,
    // 新しいモデルはリージョン限定のことがあるため、既定は global エンドポイント
    gcpLocation: process.env.GOOGLE_CLOUD_LOCATION?.trim() || "global",
    agentModel: process.env.AGENT_MODEL ?? "gemini-3.5-flash",
    fallbackModels: (process.env.FALLBACK_MODELS ?? "gemini-3.7-flash,gemini-3.6-flash")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    retries: Number(process.env.AGENT_RETRIES ?? 1),
    imageModel: process.env.IMAGE_MODEL ?? "gemini-3.1-flash-image",
    maxToolCalls: Number(process.env.MAX_TOOL_CALLS ?? 16),
    maxEvaluations: Number(process.env.MAX_EVALUATIONS ?? 6),
    staticDir: process.env.STATIC_DIR ?? "dist",
  };
}

export const isAiEnabled = (config: ServerConfig): boolean => config.backend !== "none";

/**
 * ADK はモデル呼び出しの直前に環境変数を読む。Vertex を使う場合はここで立てておく。
 * (ADK 2.x は GOOGLE_GENAI_USE_ENTERPRISE を見る。GOOGLE_GENAI_USE_VERTEXAI は非推奨。)
 */
export function applyBackendEnv(config: ServerConfig): void {
  if (config.backend !== "vertex") return;
  process.env.GOOGLE_GENAI_USE_ENTERPRISE = "true";
  process.env.GOOGLE_CLOUD_PROJECT = config.gcpProject!;
  process.env.GOOGLE_CLOUD_LOCATION = config.gcpLocation;
}

/** 画像生成クライアントに渡す接続設定。 */
export function genAiOptions(config: ServerConfig) {
  return config.backend === "vertex"
    ? { vertexai: true, project: config.gcpProject, location: config.gcpLocation }
    : { apiKey: config.geminiApiKey };
}
