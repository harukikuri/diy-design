import type { StructuralRole } from "../core/domain.ts";

/**
 * 部材の色。2D 正面図と 3D ビューで同じ色を使い、
 * 「図面で見た部材」と「3Dで見た部材」が同じものだと分かるようにする。
 */
export const ROLE_COLOR: Record<StructuralRole, string> = {
  post: "#0b8c84",
  rail_x: "#4fa9a3",
  rail_z: "#3d9b95",
  ledger: "#0b8c84",
  cleat: "#4fa9a3",
  shelf_panel: "#cbb994",
  side_panel: "#b9a47c",
  top_panel: "#c2ad86",
  bottom_panel: "#c2ad86",
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
