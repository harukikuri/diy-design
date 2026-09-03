import type { SavedRun } from "../lib/history.ts";
import { relativeTime } from "../lib/history.ts";

/**
 * 保存した設計の一覧。
 * 作るたびに増え、選ぶと当時の条件と判断から同じ結果を組み直して表示する。
 */

interface Props {
  runs: SavedRun[];
  activeId: string | null;
  /** 入力中 (まだ保存されていない新規) かどうか */
  drafting: boolean;
  busy: boolean;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function Sidebar({
  runs,
  activeId,
  drafting,
  busy,
  onCreate,
  onSelect,
  onDelete,
}: Props) {
  return (
    <aside className="side">
      <div className="side__head">
        <span className="side__brand">
          DIY <span>Design</span> Compiler
        </span>
      </div>

      <button
        type="button"
        className="side__create"
        onClick={onCreate}
        disabled={busy}
        aria-current={drafting}
      >
        <span className="side__create-mark" aria-hidden="true">
          +
        </span>
        新しく設計する
      </button>

      <nav className="side__list" aria-label="保存した設計">
        {runs.length === 0 ? (
          <p className="side__empty">
            設計するとここに残ります。
            <br />
            この端末にだけ保存されます。
          </p>
        ) : (
          runs.map((run) => (
            <div
              className={`side__item${run.id === activeId ? " side__item--active" : ""}`}
              key={run.id}
            >
              <button type="button" className="side__open" onClick={() => onSelect(run.id)}>
                <span className="side__title">{run.title}</span>
                <span className="side__meta">
                  <span className="num">
                    {run.request.dimensions.width}×{run.request.dimensions.height}×
                    {run.request.dimensions.depth}
                  </span>
                  <span>{relativeTime(run.createdAt)}</span>
                </span>
              </button>
              <button
                type="button"
                className="side__delete"
                onClick={() => onDelete(run.id)}
                aria-label={`${run.title} を削除`}
                title="削除"
              >
                ×
              </button>
            </div>
          ))
        )}
      </nav>
    </aside>
  );
}
