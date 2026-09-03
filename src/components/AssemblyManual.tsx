import { useEffect, useState } from "react";
import type { Part } from "../core/domain.ts";
import type { CompiledDesign } from "../core/pipeline.ts";
import { getMaterial } from "../core/materials.ts";
import { FastenerIcon } from "./FastenerIcon.tsx";
import { ROLE_COLOR } from "./partColors.ts";
import { Viewer3D } from "./Viewer3D.tsx";

/**
 * Visual Manual (§15)。
 *
 * 各ステップで「いま何を、何個、どの金物で付けるか」を、
 * 3D の状態変化と部材・金物の記号で見せる。文章は補助に留める。
 */

function summarizeParts(parts: Part[]) {
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

function dims(part: Part): string {
  const material = getMaterial(part.materialId);
  return part.cut.kind === "linear"
    ? `${material.thickness}×${material.width}×${Math.round(part.cut.length)}`
    : `${Math.round(part.cut.width)}×${Math.round(part.cut.length)}×${part.cut.thickness}`;
}

interface Props {
  design: CompiledDesign;
}

export function AssemblyManual({ design }: Props) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [design.candidate.id]);

  if (design.assembly.length === 0) {
    return <p className="empty">組立手順がありません。</p>;
  }

  const step = design.assembly[Math.min(index, design.assembly.length - 1)];
  const partsById = new Map(design.model.parts.map((p) => [p.id, p]));
  const newParts = step.partIds.map((id) => partsById.get(id)!).filter(Boolean);

  return (
    <>
      <nav className="steps" aria-label="組立ステップ">
        {design.assembly.map((s, i) => (
          <button
            key={s.index}
            type="button"
            className="step-btn"
            aria-current={i === index}
            onClick={() => setIndex(i)}
          >
            <span className="step-btn__no">{s.index}</span>
            {s.title}
          </button>
        ))}
      </nav>

      <div className="manual">
        <div className="manual__stage">
          <Viewer3D
            model={design.model}
            visible={step.cumulativePartIds}
            highlight={step.partIds}
            showWall={step.touchesWall || undefined}
          />
        </div>

        <div className="manual__aside">
          <h3 className="manual__title">
            <span>{String(step.index).padStart(2, "0")}</span>
            {step.title}
          </h3>
          <p className="manual__note">{step.instruction}</p>

          {newParts.length > 0 && (
            <div className="kit">
              <span className="kit__label">使う部材</span>
              {summarizeParts(newParts).map(({ part, count }) => (
                <div className="kit__row" key={part.id}>
                  <span
                    className="legend__swatch"
                    style={{ background: ROLE_COLOR[part.role] }}
                  />
                  <span>
                    {part.label.replace(/\s*[(（][^)）]*[)）]\s*$/, "")}
                    <br />
                    <span className="kit__dims">{dims(part)}</span>
                  </span>
                  <span className="kit__count">×{count}</span>
                </div>
              ))}
            </div>
          )}

          {step.fasteners.length > 0 && (
            <div className="kit">
              <span className="kit__label">使う金物</span>
              {step.fasteners.map((f) => (
                <div className="fastener" key={f.spec}>
                  <FastenerIcon type={f.fastener} />
                  <span className="fastener__spec">{f.spec}</span>
                  <span className="fastener__count">×{f.count}</span>
                </div>
              ))}
            </div>
          )}

          <div className="manual__nav">
            <button
              type="button"
              className="btn"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
            >
              前へ
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setIndex((i) => Math.min(design.assembly.length - 1, i + 1))}
              disabled={index >= design.assembly.length - 1}
            >
              次へ
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
