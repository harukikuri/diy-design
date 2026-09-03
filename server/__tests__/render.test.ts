import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.ts";
import { renderCompletionImage } from "../render.ts";

describe("完成イメージの生成", () => {
  it("接続先が無ければ、通信を試みずに理由を添えて失敗する", async () => {
    const config = { ...loadConfig(), backend: "none" as const };

    // ネットワークに出ないので即座に返る。出ていれば 5 秒のタイムアウトに掛かる。
    await expect(
      renderCompletionImage(config, { description: "4本支柱型シェルフ" }),
    ).rejects.toThrow(/GOOGLE_CLOUD_PROJECT|GEMINI_API_KEY/);
  });
});
