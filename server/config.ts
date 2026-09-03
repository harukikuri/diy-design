/**
 * サーバ設定。
 *
 * API キーが無い環境でもアプリが動くことを前提にする。
 * キー未設定なら Design Engine はルールベース実装にフォールバックし、
 * 画像生成は無効になる (§フォールバック)。
 */

export interface ServerConfig {
  port: number;
  /** Gemini API キー。未設定ならルールベースにフォールバックする。 */
  geminiApiKey: string | undefined;
  /** エージェントの推論に使うモデル */
  agentModel: string;
  /** 完成イメージの生成に使うモデル (Nano Banana) */
  imageModel: string;
  /** 1リクエストあたりのエージェントの最大ツール呼び出し回数 */
  maxToolCalls: number;
  /** ビルド済みフロントエンドの場所 */
  staticDir: string;
}

export function loadConfig(): ServerConfig {
  return {
    port: Number(process.env.PORT ?? 8080),
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
    agentModel: process.env.AGENT_MODEL ?? "gemini-3.8-flash",
    imageModel: process.env.IMAGE_MODEL ?? "gemini-3.1-flash-image",
    maxToolCalls: Number(process.env.MAX_TOOL_CALLS ?? 16),
    staticDir: process.env.STATIC_DIR ?? "dist",
  };
}

export const isAiEnabled = (config: ServerConfig): boolean =>
  config.geminiApiKey !== undefined;
