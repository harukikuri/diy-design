import { useState } from "react";
import type { CompiledDesign } from "../core/pipeline.ts";
import { Elevation } from "./Elevation.tsx";
import type { View } from "./Elevation.tsx";
import { VIEW_LABEL } from "./Elevation.tsx";
import { ROLE_COLOR, ROLE_LABEL } from "./partColors.ts";
import { AssemblyManual } from "./AssemblyManual.tsx";
import { CompletionImage } from "./CompletionImage.tsx";
import { PartsTable } from "./PartsTable.tsx";
import { CutPlanView } from "./CutPlanView.tsx";
import { Viewer3D } from "./Viewer3D.tsx";

type TabKey = "model" | "image" | "views" | "parts" | "cutplan" | "assembly";

const TABS: { key: TabKey; label: string }[] = [
  { key: "model", label: "3D" },
  { key: "image", label: "完成イメージ" },
  { key: "views", label: "図面" },
  { key: "parts", label: "部品表" },
  { key: "cutplan", label: "木取り" },
  { key: "assembly", label: "組立手順" },
];

interface Props {
  design: CompiledDesign;
}

export function DesignDetail({ design }: Props) {
  const [tab, setTab] = useState<TabKey>("model");
  const [exploded, setExploded] = useState(0);

  // rail_x と rail_z のように、色は違うが呼び名が同じ役割はまとめて1つ出す
  const legend = [...new Map(
    design.model.parts.map((p) => [ROLE_LABEL[p.role], ROLE_COLOR[p.role]]),
  )];

  const rank = (level: string) => (level === "error" ? 0 : 1);
  const issues = [...design.issues].sort((a, b) => rank(a.level) - rank(b.level));

  return (
    <div className="panel">
      {issues.length > 0 && (
        <div className="panel__body" style={{ paddingBottom: 0 }}>
          {issues.map((issue) => (
            <div className={`notice notice--${issue.level}`} key={issue.code}>
              <span className="notice__mark">{issue.level === "error" ? "!" : "△"}</span>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "model" && (
        <>
          <div className="viewer__controls">
            <label>
              分解表示{" "}
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={exploded}
                onChange={(e) => setExploded(Number(e.target.value))}
              />
            </label>
            <div className="legend">
              {legend.map(([label, color]) => (
                <span className="legend__item" key={label}>
                  <span className="legend__swatch" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className="viewer">
            <Viewer3D model={design.model} exploded={exploded} />
          </div>
        </>
      )}

      {tab === "image" && <CompletionImage design={design} />}

      {tab === "assembly" && <AssemblyManual design={design} />}

      {tab === "parts" && <PartsTable design={design} />}

      {tab === "cutplan" && <CutPlanView plan={design.cutPlan} />}

      {tab === "views" && (
        <div className="views">
          {(["front", "side", "top"] as View[]).map((view) => (
            <figure className="views__cell" key={view}>
              <div className="views__figure">
                <Elevation parts={design.model.parts} bounds={design.model.bounds} view={view} />
              </div>
              <figcaption className="views__caption">
                <b>{VIEW_LABEL[view]}</b>
                <span>{caption(view, design)}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

function caption(view: View, { model }: CompiledDesign): string {
  const { x, y, z } = model.bounds;
  const r = Math.round;
  if (view === "front") return `W ${r(x)} × H ${r(y)}`;
  if (view === "side") return `D ${r(z)} × H ${r(y)}`;
  return `W ${r(x)} × D ${r(z)}`;
}
