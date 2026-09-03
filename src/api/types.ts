/**
 * フロントエンドとサーバで共有する API の型。
 *
 * サーバが返すのは「エージェントが下した判断」= 構造・段数・材料までで、
 * 部材や木取りは返さない。クライアント側で同じ決定論エンジンに通して
 * 展開する。AI と決定論の境界を、通信の境界とも一致させている。
 */

import type { DesignCandidate, Dimensions } from "../core/domain.ts";

export interface StockInputDto {
  materialId: string;
  length: number;
  quantity: number;
}

export interface DesignRequestBody {
  intent: string;
  dimensions: Dimensions;
  stock: StockInputDto[];
  kerf: number;
}

/** エージェントの判断の足跡。UI にそのまま出して自律性を見せるためのもの。 */
export interface AgentTraceEntry {
  step: number;
  tool: string;
  /** 何をしたかの一行 */
  label: string;
  /** その手が採用に足りたか */
  outcome: "ok" | "rejected" | "info";
  facts?: { label: string; value: string }[];
  issues?: { level: string; message: string }[];
}

export interface DesignResponseBody {
  engine: "agent" | "rule-based";
  model?: string;
  candidates: DesignCandidate[];
  notes: string[];
  trace: AgentTraceEntry[];
  /** エージェントが評価した案の総数 (採用されなかったものを含む) */
  evaluated: number;
}

export interface RenderRequestBody {
  /** 完成イメージの言葉での説明 (部材構成から組み立てる) */
  description: string;
  /** 3Dビューのスナップショット (data URL)。あれば形状の参照に使う。 */
  referencePng?: string;
}

export interface RenderResponseBody {
  /** data URL 形式の生成画像 */
  image: string;
  model: string;
}
