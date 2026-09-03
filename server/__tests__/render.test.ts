import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.ts";
import { renderCompletionImage } from "../render.ts";

const config = { ...loadConfig(), geminiApiKey: undefined };

describe("完成イメージの生成", () => {
  it("API キーが無ければ呼び出しに失敗する", async () => {
    // キー無しでも落ちずにエラーとして扱えること (ルート側で 502 に変換する)
    await expect(
      renderCompletionImage(config, { description: "4本支柱型シェルフ" }),
    ).rejects.toBeInstanceOf(Error);
  });
});
