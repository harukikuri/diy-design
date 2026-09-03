import type { AgentTraceEntry } from "../api/types.ts";

/**
 * エージェントの検討過程。
 *
 * 何を試して、どの検証で弾かれて、何を直したのかを並べる。
 * 候補の良し悪しではなく「自分で回して収束した」ことがここに出る。
 */

const VERDICT_LABEL: Record<AgentTraceEntry["outcome"], string | null> = {
  ok: "採用可",
  rejected: "却下",
  info: null,
};

interface Props {
  trace: AgentTraceEntry[];
  engine: "agent" | "rule-based";
  model?: string;
  evaluated: number;
}

export function AgentTrace({ trace, engine, model, evaluated }: Props) {
  if (trace.length === 0) return null;

  return (
    <details className="panel trace" open>
      <summary className="trace__summary">
        <span className="trace__title">
          {engine === "agent" ? "エージェントの検討過程" : "候補の生成"}
        </span>
        <span className="trace__meta">
          {model ?? "rule-based"} · {evaluated.toLocaleString("ja-JP")} 通りを検証
        </span>
      </summary>
      <div className="trace__list">
        {trace.map((entry) => {
          const verdict = VERDICT_LABEL[entry.outcome];
          return (
            <div className={`trace__row trace__row--${entry.outcome}`} key={entry.step}>
              <span className="trace__no">{entry.step}</span>
              <div>
                <div className="trace__head">
                  <span className="trace__tool">{entry.tool}</span>
                  <span className="trace__label">{entry.label}</span>
                  {verdict && (
                    <span className={`trace__verdict trace__verdict--${entry.outcome}`}>
                      {verdict}
                    </span>
                  )}
                </div>
                {entry.facts && entry.facts.length > 0 && (
                  <div className="trace__facts">
                    {entry.facts.map((f) => (
                      <span key={f.label}>
                        {f.label} <b>{f.value}</b>
                      </span>
                    ))}
                  </div>
                )}
                {entry.issues?.map((issue, i) => (
                  <p
                    className={`trace__issue${issue.level === "error" ? " trace__issue--error" : ""}`}
                    key={`${entry.step}-${i}`}
                  >
                    {issue.message}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}
