import type { StructuralRole } from "../core/domain.ts";

/**
 * 部材の色。2D 正面図と 3D ビューで同じ色を使い、
 * 「図面で見た部材」と「3Dで見た部材」が同じものだと分かるようにする。
 *
 * 図面と 3D は暗い面に描くので、そこで沈まない明度に取ってある。
 */
export const ROLE_COLOR: Record<StructuralRole, string> = {
  post: "#12a79d",
  rail_x: "#5cc0b8",
  rail_z: "#49b3aa",
  ledger: "#12a79d",
  cleat: "#5cc0b8",
  shelf_panel: "#d8c6a2",
  side_panel: "#c6b189",
  top_panel: "#cfba93",
  bottom_panel: "#cfba93",
};

export const ROLE_LABEL: Record<StructuralRole, string> = {
  post: "支柱",
  rail_x: "横架材",
  rail_z: "横架材",
  ledger: "受け桟",
  cleat: "受け材",
  shelf_panel: "棚板",
  side_panel: "側板",
  top_panel: "天板",
  bottom_panel: "地板",
};
