import { useState } from "react";
import type { CompiledDesign } from "../core/pipeline.ts";
import { Elevation } from "./Elevation.tsx";
import type { View } from "./Elevation.tsx";
import { VIEW_LABEL } from "./Elevation.tsx";
import { ROLE_COLOR, ROLE_LABEL } from "./partColors.ts";
import { Viewer3D } from "./Viewer3D.tsx";

type TabKey = "model" | "views";

const TABS: { key: TabKey; label: string }[] = [
  { key: "model", label: "3D" },
  { key: "views", label: "図面" },
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

  return (
    <div className="panel">
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
