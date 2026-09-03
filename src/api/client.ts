import type {
  DesignRequestBody,
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

export const requestRender = (body: RenderRequestBody) =>
  post<RenderRequestBody, RenderResponseBody>("/api/render", body);
