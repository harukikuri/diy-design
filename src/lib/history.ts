import type { DesignRequestBody, DesignResponseBody } from "../api/types.ts";

/**
 * 設計の保存。
 *
 * 保存するのは入力条件とエージェントの判断 (構造・段数・材料) だけ。
 * 部材・木取り・組立手順は決定論なので、読み込むときに同じエンジンへ通せば
 * まったく同じ結果が出る。保存を小さく保てるうえ、エンジンを直したときに
 * 過去の設計も新しい計算で開き直せる。
 */

const KEY = "diy.runs.v1";
const LIMIT = 40;

export interface SavedRun {
  id: string;
  createdAt: number;
  title: string;
  request: DesignRequestBody;
  response: DesignResponseBody;
}

function titleFor(request: DesignRequestBody, response: DesignResponseBody): string {
  const intent = request.intent.trim().split("\n")[0];
  if (intent) return intent.slice(0, 40);
  return response.candidates[0]?.title ?? "無題の設計";
}

export function loadRuns(): SavedRun[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedRun[]) : [];
  } catch {
    // 壊れた保存で画面ごと落とさない
    return [];
  }
}

function persist(runs: SavedRun[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(runs.slice(0, LIMIT)));
  } catch {
    // 容量超過などは黙って諦める。保存は本質的な機能ではない。
  }
}

export function saveRun(
  request: DesignRequestBody,
  response: DesignResponseBody,
): SavedRun {
  const run: SavedRun = {
    id: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    title: titleFor(request, response),
    request,
    response,
  };
  persist([run, ...loadRuns()]);
  return run;
}

export function deleteRun(id: string): SavedRun[] {
  const rest = loadRuns().filter((r) => r.id !== id);
  persist(rest);
  return rest;
}

export function renameRun(id: string, title: string): SavedRun[] {
  const next = loadRuns().map((r) => (r.id === id ? { ...r, title } : r));
  persist(next);
  return next;
}

/** 一覧の見出しに使う相対時刻。 */
export function relativeTime(at: number): string {
  const diff = Date.now() - at;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}日前`;
  return new Date(at).toLocaleDateString("ja-JP");
}
