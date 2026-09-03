import type { Part, Vec3 } from "../core/domain.ts";
import { ROLE_COLOR } from "./partColors.ts";

/**
 * 三面図の1枚。Physical Model をそのまま平行投影して描く。
 * 候補の見分けは文章ではなくこの図で付ける (§6.2, Principle 5)。
 */

export type View = "front" | "side" | "top";

const VIEW_AXES = {
  front: { h: "x", v: "y", depth: "z" },
  side: { h: "z", v: "y", depth: "x" },
  top: { h: "x", v: "z", depth: "y" },
} as const;

export const VIEW_LABEL: Record<View, string> = {
  front: "正面図",
  side: "側面図",
  top: "上面図",
};

interface Props {
  parts: Part[];
  bounds: Vec3;
  view?: View;
  /** 強調する部材。指定すると、それ以外は淡く描く。 */
  highlight?: readonly string[];
  /** 描画する部材を絞り込む (組立途中の状態を描くときに使う) */
  visible?: readonly string[];
}

export function Elevation({ parts, bounds, view = "front", highlight, visible }: Props) {
  const { h, v, depth } = VIEW_AXES[view];
  const W = Math.max(bounds[h], 1);
  const H = Math.max(bounds[v], 1);
  const pad = Math.max(W, H) * 0.06;

  const shown = visible ? parts.filter((p) => visible.includes(p.id)) : parts;
  // 奥のものから描いて手前で上書きする
  const ordered = [...shown].sort((a, b) => b.position[depth] - a.position[depth]);

  return (
    <svg
      className="elevation"
      viewBox={`${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={VIEW_LABEL[view]}
    >
      {ordered.map((part) => {
        const w = part.size[h];
        const ht = part.size[v];
        const x = part.position[h] - w / 2;
        // SVG は下向きが Y+ なので、上下を反転して立面にする
        const y = H - (part.position[v] + ht / 2);
        const faded = highlight !== undefined && !highlight.includes(part.id);
        return (
          <rect
            key={part.id}
            x={x}
            y={y}
            width={w}
            height={ht}
            fill={ROLE_COLOR[part.role]}
            fillOpacity={faded ? 0.16 : 0.92}
            stroke="#16191c"
            strokeOpacity={faded ? 0.15 : 0.55}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          >
            <title>{part.label}</title>
          </rect>
        );
      })}
    </svg>
  );
}
