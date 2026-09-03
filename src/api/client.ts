import type {
  AgentTraceEntry,
  DesignRequestBody,
  HealthResponse,
  DesignResponseBody,
  RenderRequestBody,
  RenderResponseBody,
} from "./types.ts";

async function post<TBody, TResult>(path: string, body: TBody): Promise<TResult> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response
      .json()
      .then((body) => (body as { error?: string }).error)
      .catch(() => undefined);
    throw new Error(detail ?? `${path} が ${response.status} を返しました`);
  }
  return response.json() as Promise<TResult>;
}

export const requestDesign = (body: DesignRequestBody) =>
  post<DesignRequestBody, DesignResponseBody>("/api/design", body);

/**
 * 設計を流しながら受け取る (Server-Sent Events)。
 * エージェントは 20 秒以上動くので、終わるまで待たずに足跡を逐次渡す。
 */
export async function streamDesign(
  body: DesignRequestBody,
  onTrace: (entry: AgentTraceEntry) => void,
): Promise<DesignResponseBody> {
  const response = await fetch("/api/design/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    const detail = await response
      .json()
      .then((b) => (b as { error?: string }).error)
      .catch(() => undefined);
    throw new Error(detail ?? `設計に失敗しました (${response.status})`);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let result: DesignResponseBody | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;

    // SSE のメッセージ境界は空行
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      let event = "message";
      let data = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (!data) continue;

      const parsed = JSON.parse(data) as unknown;
      if (event === "trace") onTrace(parsed as AgentTraceEntry);
      else if (event === "done") result = parsed as DesignResponseBody;
      else if (event === "failed") {
        throw new Error((parsed as { error: string }).error);
      }
    }
  }

  if (!result) throw new Error("設計の結果を受け取れませんでした");
  return result;
}

export const requestRender = (body: RenderRequestBody) =>
  post<RenderRequestBody, RenderResponseBody>("/api/render", body);

export const requestHealth = async (): Promise<HealthResponse> => {
  const response = await fetch("/api/health");
  if (!response.ok) throw new Error("サーバに接続できません");
  return response.json() as Promise<HealthResponse>;
};
