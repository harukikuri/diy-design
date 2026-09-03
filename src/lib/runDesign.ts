import { streamDesign } from "../api/client.ts";
import type { AgentTraceEntry, DesignRequestBody } from "../api/types.ts";
import { createStock } from "../core/materials.ts";
import type { CompiledDesign } from "../core/pipeline.ts";
import { compileDesign, overallScore } from "../core/pipeline.ts";

/**
 * サーバは「エージェントが下した判断」だけを返す。
 * 部材・木取り・組立手順は、ここで同じ決定論エンジンに通して展開する。
 * AI と決定論の境界を、通信の境界とも一致させている。
 */

export interface DesignRun {
  engine: "agent" | "rule-based";
  model?: string;
  designs: CompiledDesign[];
  notes: string[];
  trace: AgentTraceEntry[];
  evaluated: number;
}

export async function runDesign(
  body: DesignRequestBody,
  onTrace: (entry: AgentTraceEntry) => void = () => {},
): Promise<DesignRun> {
  const response = await streamDesign(body, onTrace);
  const ownedStock = body.stock.map((s) =>
    createStock(s.materialId, s.length, s.quantity, true),
  );

  const designs = response.candidates
    .map((candidate) =>
      compileDesign(candidate, body.dimensions, ownedStock, { kerf: body.kerf }),
    )
    .sort((a, b) => overallScore(b.candidate) - overallScore(a.candidate));

  return {
    engine: response.engine,
    model: response.model,
    designs,
    notes: response.notes,
    trace: response.trace,
    evaluated: response.evaluated,
  };
}
