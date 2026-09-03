import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import type { RenderResponseBody } from "../src/api/types.ts";
import type { ServerConfig } from "./config.ts";
import { genAiOptions } from "./config.ts";

/**
 * 完成イメージの生成 (Nano Banana)。
 *
 * 要件定義書 §6.2 は候補の視覚化として「生成画像または3Dモデル」を挙げている。
 * ここでは 3D ビューのスナップショットを参照画像として渡し、部材構成の説明と
 * 合わせて完成写真を作らせる。文章だけから描かせると段数や比率が設計と
 * ずれるため、必ず実際の形状を下敷きにする。
 */

const MAX_REFERENCE_BYTES = 2_000_000;

const PROMPT_HEAD = `次の DIY 家具の完成写真を1枚作ってください。`;

const PROMPT_RULES = `

要件:
- 生活感のある明るい室内に置かれた様子。自然光。斜め前からの視点。
- 木材は無塗装〜自然な木目の仕上げ。合板の小口が見えてよい。
- 段数・比率・接合部の位置は指定どおりに保つこと。段を増減しないこと。
- 寸法線・注釈・文字・ロゴは描かないこと。写真であって図面ではない。`;

const REFERENCE_RULE = `
- 添付した3Dビューが正確な形状です。段数と全体の比率はこれに厳密に合わせ、質感と背景だけを現実的にしてください。`;

interface RenderInput {
  description: string;
  referencePng?: string;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mime_type: "image/png" };

/** data URL から base64 部分だけを取り出す。png 以外と大きすぎるものは捨てる。 */
function readReference(dataUrl: string | undefined): string | null {
  if (!dataUrl) return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const data = match[1];
  if (data.length > MAX_REFERENCE_BYTES) return null;
  return data;
}

// 同じ設計を何度も開いても課金しないよう、直近の生成結果を持っておく
const cache = new Map<string, RenderResponseBody>();
const CACHE_LIMIT = 32;

function cacheKey(model: string, input: RenderInput): string {
  return createHash("sha256")
    .update(model)
    .update(input.description)
    .update(input.referencePng ?? "")
    .digest("hex");
}

export async function renderCompletionImage(
  config: ServerConfig,
  input: RenderInput,
): Promise<RenderResponseBody> {
  // 接続先が無いと分かっているなら、通信を試みずにここで失敗させる。
  // (ルート側でも 503 を返すが、他の呼び出し元から来ても同じ挙動になるようにする)
  if (config.backend === "none") {
    throw new Error(
      "完成イメージの生成には Vertex AI (GOOGLE_CLOUD_PROJECT) か API キー (GEMINI_API_KEY) の設定が必要です。",
    );
  }

  const key = cacheKey(config.imageModel, input);
  const hit = cache.get(key);
  if (hit) return hit;

  const reference = readReference(input.referencePng);
  const prompt =
    PROMPT_HEAD +
    "\n\n" +
    input.description.trim() +
    PROMPT_RULES +
    (reference ? REFERENCE_RULE : "");

  const blocks: ContentBlock[] = [];
  if (reference) {
    blocks.push({ type: "image", data: reference, mime_type: "image/png" });
  }
  blocks.push({ type: "text", text: prompt });

  const ai = new GoogleGenAI(genAiOptions(config));
  const interaction = await ai.interactions.create({
    model: config.imageModel,
    input: blocks,
  });

  const image = interaction.output_image;
  if (!image?.data) {
    throw new Error("画像が返りませんでした。プロンプトが安全フィルタに触れた可能性があります。");
  }

  const result: RenderResponseBody = {
    image: `data:${image.mime_type ?? "image/png"};base64,${image.data}`,
    model: config.imageModel,
  };

  if (cache.size >= CACHE_LIMIT) {
    cache.delete(cache.keys().next().value!);
  }
  cache.set(key, result);
  return result;
}
