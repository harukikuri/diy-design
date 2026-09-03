import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAiEnabled, loadConfig } from "../config.ts";

const KEYS = ["GEMINI_API_KEY", "GOOGLE_CLOUD_PROJECT", "AI_BACKEND", "GOOGLE_CLOUD_LOCATION"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("接続先の決定", () => {
  it("何も無ければ AI 無効 (ルールベースにフォールバック)", () => {
    const config = loadConfig();
    expect(config.backend).toBe("none");
    expect(isAiEnabled(config)).toBe(false);
  });

  it("API キーだけあれば api-key", () => {
    process.env.GEMINI_API_KEY = "x";
    expect(loadConfig().backend).toBe("api-key");
  });

  it("プロジェクトがあれば Vertex を優先する", () => {
    process.env.GEMINI_API_KEY = "x";
    process.env.GOOGLE_CLOUD_PROJECT = "p";
    expect(loadConfig().backend).toBe("vertex");
  });

  it("AI_BACKEND の明示指定が優先される", () => {
    process.env.GEMINI_API_KEY = "x";
    process.env.GOOGLE_CLOUD_PROJECT = "p";
    process.env.AI_BACKEND = "api-key";
    expect(loadConfig().backend).toBe("api-key");
  });

  it("指定した接続先の資格情報が無ければ AI 無効にする", () => {
    process.env.AI_BACKEND = "vertex";
    expect(loadConfig().backend).toBe("none");
  });

  it("リージョンの既定は global (新しいモデルがリージョン限定のことがあるため)", () => {
    expect(loadConfig().gcpLocation).toBe("global");
  });
});
