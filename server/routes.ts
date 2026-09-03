import type { Express, Request, Response } from "express";
import type { DesignRequestBody, DesignResponseBody } from "../src/api/types.ts";
import { createStock, getMaterial } from "../src/core/materials.ts";
import type { ServerConfig } from "./config.ts";
import { isAiEnabled } from "./config.ts";
import type { DesignContext } from "./agent/context.ts";
import { runDesignAgent, runRuleBased } from "./agent/designAgent.ts";
import { renderCompletionImage } from "./render.ts";

/** リクエストボディを検証し、設計条件へ直す。 */
export function toContext(body: unknown): DesignContext {
  const b = body as Partial<DesignRequestBody>;
  const d = b?.dimensions;
  if (!d || ![d.width, d.height, d.depth].every((v) => Number.isFinite(v) && v > 0)) {
    throw new Error("幅・高さ・奥行を正の数で指定してください。");
  }
  const stock = (b.stock ?? []).map((s) => {
    getMaterial(s.materialId); // 未知の材料 ID はここで弾く
    if (!Number.isFinite(s.length) || s.length <= 0) {
      throw new Error("手持ち材料の長さが不正です。");
    }
    return createStock(s.materialId, s.length, Math.max(1, Math.floor(s.quantity)), true);
  });
  const kerf = Number.isFinite(b.kerf) ? Number(b.kerf) : 3;
  return {
    intent: typeof b.intent === "string" ? b.intent.slice(0, 400) : "",
    dimensions: { width: d.width, height: d.height, depth: d.depth },
    ownedStock: stock,
    kerf: Math.min(Math.max(kerf, 0), 10),
  };
}

export function registerRoutes(app: Express, config: ServerConfig) {
  app.post("/api/design", async (req: Request, res: Response) => {
    let context: DesignContext;
    try {
      context = toContext(req.body);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }

    if (!isAiEnabled(config)) {
      res.json(await runRuleBased(context));
      return;
    }

    try {
      const result: DesignResponseBody = await runDesignAgent(context, config);
      res.json(result);
    } catch (error) {
      // エージェントが失敗してもアプリを止めない。理由は notes でユーザーに見せる。
      console.error("[design] エージェント失敗:", error);
      res.json(
        await runRuleBased(
          context,
          `設計エージェントが応答しなかったため、ルールベースの候補を表示しています (${(error as Error).message})`,
        ),
      );
    }
  });

  app.post("/api/render", async (req: Request, res: Response) => {
    if (!isAiEnabled(config)) {
      res.status(503).json({ error: "完成イメージの生成には GEMINI_API_KEY が必要です。" });
      return;
    }
    const description = (req.body as { description?: unknown })?.description;
    if (typeof description !== "string" || description.trim().length === 0) {
      res.status(400).json({ error: "description は必須です。" });
      return;
    }
    try {
      const result = await renderCompletionImage(config, {
        description: description.slice(0, 2000),
        referencePng: (req.body as { referencePng?: string }).referencePng,
      });
      res.json(result);
    } catch (error) {
      console.error("[render] 画像生成失敗:", error);
      res.status(502).json({ error: (error as Error).message });
    }
  });
}
