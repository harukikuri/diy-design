import type { CSSProperties } from "react";
import type { CompiledDesign } from "../core/pipeline.ts";
import { Elevation } from "./Elevation.tsx";

/**
 * Design Candidate の一覧 (§6.2)。
 * 候補は色違いではなく構造そのものが異なるため、見分けは正面図で付ける。
 */

const METERS = [
  { key: "stability", label: "安定性" },
  { key: "materialEfficiency", label: "材料効率" },
  { key: "simplicity", label: "作りやすさ" },
] as const;

interface Props {
  designs: CompiledDesign[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function CandidateGrid({ designs, selectedId, onSelect }: Props) {
  return (
    <div className="cards">
      {designs.map((design, i) => {
        const { candidate, model, cutPlan, issues } = design;
        const errors = issues.filter((issue) => issue.level === "error");
        const warnings = issues.filter((issue) => issue.level === "warning");
        const stockCount = cutPlan.linear.length + cutPlan.sheets.length;

        return (
          <button
            key={candidate.id}
            type="button"
            className={[
              "card",
              candidate.id === selectedId ? "card--selected" : "",
              design.buildable ? "" : "card--blocked",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelect(candidate.id)}
            aria-pressed={candidate.id === selectedId}
            style={{ "--i": i } as CSSProperties}
          >
            <div className="card__thumb">
              {model.parts.length > 0 ? (
                <Elevation parts={model.parts} bounds={model.bounds} view="front" />
              ) : (
                <span className="field__hint">この寸法では作れません</span>
              )}
            </div>

            <div className="card__body">
              <div className="card__title">
                <span>{candidate.title}</span>
                <span className="card__rank">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <p className="card__summary">{candidate.summary}</p>

              {(errors.length > 0 || warnings.length > 0) && (
                <div className="badges">
                  {errors.length > 0 && (
                    <span className="badge badge--error">作れません</span>
                  )}
                  {warnings.map((w) => (
                    <span className="badge badge--warning" key={w.code}>
                      {WARNING_LABEL[w.code] ?? "注意あり"}
                    </span>
                  ))}
                </div>
              )}

              <div className="meters">
                {METERS.map((meter) => (
                  <div className="meter" key={meter.key}>
                    <span>{meter.label}</span>
                    <span className="meter__track">
                      <span
                        className="meter__fill"
                        style={{ width: `${Math.round(candidate.score[meter.key] * 100)}%` }}
                      />
                    </span>
                    <span className="meter__value">
                      {Math.round(candidate.score[meter.key] * 100)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="card__facts">
                <span>
                  部材 <b>{model.parts.length}</b> 点
                </span>
                <span>
                  材料 <b>{stockCount}</b> 本
                </span>
                <span>
                  約 <b>¥{cutPlan.estimatedCost.toLocaleString()}</b>
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

const WARNING_LABEL: Record<string, string> = {
  tipping_risk: "壁固定を推奨",
  rail_span: "スパン長め",
  shelf_sag: "たわみ注意",
  narrow_opening: "段間隔がせまい",
  wall_shelf_depth: "奥行深め",
};
