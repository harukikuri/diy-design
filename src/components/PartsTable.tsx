import type { CompiledDesign } from "../core/pipeline.ts";
import type { Part } from "../core/domain.ts";
import { getMaterial } from "../core/materials.ts";
import { ROLE_COLOR } from "./partColors.ts";

/** 同じ材料・同じ切断寸法の部材はまとめて1行にする。 */
function groupParts(parts: Part[]) {
  const groups = new Map<string, { part: Part; count: number }>();
  for (const part of parts) {
    const key =
      part.cut.kind === "linear"
        ? `${part.materialId}|L${part.cut.length}`
        : `${part.materialId}|P${part.cut.width}x${part.cut.length}`;
    const found = groups.get(key);
    if (found) found.count += 1;
    else groups.set(key, { part, count: 1 });
  }
  return [...groups.values()];
}

function cutSize(part: Part): string {
  const material = getMaterial(part.materialId);
  if (part.cut.kind === "linear") {
    return `${material.thickness} × ${material.width} × ${Math.round(part.cut.length)}`;
  }
  return `${Math.round(part.cut.width)} × ${Math.round(part.cut.length)} × ${part.cut.thickness}`;
}

/** まとめた行の代表ラベルから、段数などの個体差を落とす。 */
function genericLabel(label: string): string {
  return label.replace(/\s*[(（][^)）]*[)）]\s*$/, "");
}

interface Props {
  design: CompiledDesign;
}

export function PartsTable({ design }: Props) {
  const rows = groupParts(design.model.parts);

  return (
    <div className="panel__body" style={{ display: "grid", gap: 24 }}>
      <section>
        <div className="section-head">
          <h3 className="panel__title">部材</h3>
          <span className="eyebrow num">{design.model.parts.length} parts</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>部材</th>
                <th>材料</th>
                <th className="n">切断寸法 (mm)</th>
                <th className="n">数量</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ part, count }) => (
                <tr key={part.id}>
                  <td>
                    <span
                      className="legend__swatch"
                      style={{ background: ROLE_COLOR[part.role], marginRight: 8 }}
                    />
                    {genericLabel(part.label)}
                  </td>
                  <td>{getMaterial(part.materialId).name}</td>
                  <td className="n">{cutSize(part)}</td>
                  <td className="n">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h3 className="panel__title">金物</h3>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>種類</th>
                <th className="n">個数</th>
              </tr>
            </thead>
            <tbody>
              {design.fasteners.map((f) => (
                <tr key={f.spec}>
                  <td>{f.spec}</td>
                  <td className="n">{f.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h3 className="panel__title">買うもの</h3>
          <span className="eyebrow num">¥{design.cutPlan.estimatedCost.toLocaleString()}</span>
        </div>
        {design.cutPlan.purchase.length === 0 ? (
          <p className="field__hint">手持ちの材料だけで足ります。</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>材料</th>
                  <th className="n">長さ (mm)</th>
                  <th className="n">数量</th>
                  <th className="n">小計</th>
                </tr>
              </thead>
              <tbody>
                {design.cutPlan.purchase.map((line) => (
                  <tr key={`${line.materialId}:${line.length}`}>
                    <td>{getMaterial(line.materialId).name}</td>
                    <td className="n">{line.length}</td>
                    <td className="n">{line.count}</td>
                    <td className="n">¥{(line.unitPrice * line.count).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="field__hint" style={{ marginTop: 8 }}>
          価格は目安です。金物代は含みません。
        </p>
      </section>
    </div>
  );
}
