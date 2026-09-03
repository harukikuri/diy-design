import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { isAiEnabled, loadConfig } from "./config.ts";
import { registerRoutes } from "./routes.ts";

const config = loadConfig();
const app = express();

app.use(express.json({ limit: "4mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    ai: isAiEnabled(config),
    agentModel: config.agentModel,
    imageModel: config.imageModel,
  });
});

registerRoutes(app, config);

// ビルド済みのフロントエンドを同じサービスから配る (Cloud Run 1サービス構成)
const staticDir = resolve(process.cwd(), config.staticDir);
if (existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(resolve(staticDir, "index.html"));
  });
}

app.listen(config.port, () => {
  console.log(
    `DIY Design Compiler listening on :${config.port} (AI ${isAiEnabled(config) ? "有効" : "無効 — ルールベースにフォールバック"})`,
  );
});
