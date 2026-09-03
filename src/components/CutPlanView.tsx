import type { CutPlan } from "../core/cutplan.ts";
import { getMaterial } from "../core/materials.ts";
import { Scale } from "./Scale.tsx";

/**
 * 木取り図 (§13)。
 *
 * 入力の寸法スケールと同じ目盛りで、材料1本ずつをそのまま描く。
 * 斜線が残材、塗りが切り出す部材。数字を読まなくても、
 * 「この材からどこを取るか」と「どれだけ余るか」が見えるようにする。
 */

interface Props {
  plan: CutPlan;
}

export function CutPlanView({ plan }: Props) {
  const maxLength = Math.max(1, ...plan.linear.map((b) => b.stockLength));

  return (
    <div className="panel__body">
      <div className="cutplan">
        <div className="cutplan__meta">
          <span>
            歩留まり <b>{Math.round(plan.utilization * 100)}%</b>
          </span>
          <span>
            切り代 <b>{plan.kerf}mm</b>
          </span>
          <span>
            アルゴリズム <b>{plan.algorithm === "best_fit_decreasing" ? "BFD" : "FFD"}</b>
          </span>
        </div>

        {plan.unplaced.length > 0 && (
          <div>
            {plan.unplaced.map((u) => (
              <div className="notice notice--error" key={u.partId}>
                <span className="notice__mark">!</span>
                <span>
                  {u.label}: {u.reason}
                </span>
              </div>
            ))}
          </div>
        )}

        {plan.linear.length > 0 && (
          <section>
            <div className="section-head">
              <h3 className="panel__title">角材</h3>
              <span className="eyebrow num">{plan.linear.length} pieces</span>
            </div>
            <div style={{ marginBottom: 10 }}>
              <Scale span={maxLength} minor={100} major={500} labels />
            </div>
            {plan.linear.map((bin) => (
              <div className="stick" key={bin.id}>
                <div className="stick__head">
                  <span className="stick__name">
                    <b>{getMaterial(bin.materialId).name}</b>
                    <span className="num"> {bin.stockLength}mm</span>
                    <span className={`stick__tag stick__tag--${bin.owned ? "owned" : "buy"}`}>
                      {bin.owned ? "手持ち" : "購入"}
                    </span>
                  </span>
                  <span className="stick__waste">残 {Math.round(bin.remaining)}mm</span>
                </div>
                <div
                  className="stick__bar"
                  style={{ width: `${(bin.stockLength / maxLength) * 100}%` }}
                >
                  {bin.cuts.map((cut) => (
                    <div
                      key={cut.partId}
                      className="stick__cut"
                      style={{
                        left: `${(cut.offset / bin.stockLength) * 100}%`,
                        width: `${(cut.length / bin.stockLength) * 100}%`,
                      }}
                      title={`${cut.label} / ${Math.round(cut.length)}mm`}
                    >
                      {Math.round(cut.length)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {plan.sheets.length > 0 && (
          <section>
            <div className="section-head">
              <h3 className="panel__title">板材</h3>
              <span className="eyebrow num">{plan.sheets.length} sheets</span>
            </div>
            <div className="sheets">
              {plan.sheets.map((sheet) => (
                <figure className="sheet" key={sheet.id}>
                  <div className="sheet__figure">
                    <svg
                      className="sheet__svg"
                      viewBox={`0 0 ${sheet.sheetWidth} ${sheet.sheetLength}`}
                      role="img"
                      aria-label={`${getMaterial(sheet.materialId).name} の木取り`}
                    >
                      {sheet.placements.map((p) => (
                        <g key={p.partId}>
                          <rect
                            x={p.x}
                            y={p.y}
                            width={p.w}
                            height={p.h}
                            fill="#cbb994"
                            fillOpacity={0.9}
                            stroke="#16191c"
                            strokeOpacity={0.5}
                            strokeWidth={1}
                            vectorEffect="non-scaling-stroke"
                          >
                            <title>{`${p.label} / ${Math.round(p.w)}×${Math.round(p.h)}mm`}</title>
                          </rect>
                          <text
                            x={p.x + p.w / 2}
                            y={p.y + p.h / 2}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize={Math.min(p.w, p.h) * 0.22}
                            fill="#16191c"
                            fillOpacity={0.7}
                          >
                            {Math.round(p.w)}×{Math.round(p.h)}
                          </text>
                        </g>
                      ))}
                    </svg>
                  </div>
                  <figcaption className="sheet__caption">
                    <span>{getMaterial(sheet.materialId).name}</span>
                    <span>
                      <span className="num">
                        {sheet.sheetWidth}×{sheet.sheetLength}
                      </span>
                      {" · "}
                      {sheet.owned ? "手持ち" : "購入"}
                      {" · 使用 "}
                      <span className="num">
                        {Math.round(
                          (sheet.usedArea / (sheet.sheetWidth * sheet.sheetLength)) * 100,
                        )}
                        %
                      </span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
