/**
 * ドメインモデル。
 *
 * 要件定義書 §7 の中心モデルに対応する:
 *   Stock → Cut → Part → Connection → Assembly
 *
 * 長さの単位はすべて mm に統一する (§5.1)。
 */

export type Mm = number;

export interface Vec3 {
  x: Mm;
  y: Mm;
  z: Mm;
}

export const vec3 = (x: Mm, y: Mm, z: Mm): Vec3 => ({ x, y, z });

/** 座標系: X = 幅(width) / Y = 高さ(height) / Z = 奥行(depth)。原点は最小角、Y+ が上。 */

// ---------------------------------------------------------------------------
// Material / Stock (§8)
// ---------------------------------------------------------------------------

export type MaterialKind = "lumber" | "board";

/** 材料の種類。「2×4材」「合板」といったカタログ上の区分。 */
export interface Material {
  id: string;
  name: string;
  kind: MaterialKind;
  /** 角材: 断面の厚み / 板材: 板厚 */
  thickness: Mm;
  /** 角材: 断面の幅 / 板材: シート幅 */
  width: Mm;
  /** 購入可能な定尺。角材は長さ、板材はシート長。 */
  standardLengths: Mm[];
  /** 参考価格 (定尺1本/1枚あたり、円)。定尺と同じ順に並べる。 */
  standardPrices: number[];
}

/** ユーザーが実際に持っている / これから買う物理的な材料の1本・1枚。 */
export interface Stock {
  id: string;
  materialId: string;
  length: Mm;
  quantity: number;
  /** true = ユーザーが既に持っている材料 (§5.3) */
  owned: boolean;
}

// ---------------------------------------------------------------------------
// Part (§11)
// ---------------------------------------------------------------------------

export type StructuralRole =
  | "post"
  | "rail_x"
  | "rail_z"
  | "shelf_panel"
  | "side_panel"
  | "top_panel"
  | "bottom_panel"
  | "ledger"
  | "cleat";

export interface Part {
  id: string;
  label: string;
  role: StructuralRole;
  materialId: string;
  /** ワールド軸に沿った外形寸法。すべての部材は軸平行に配置する。 */
  size: Vec3;
  /** 部材の中心座標 */
  position: Vec3;
  /** 木取りで必要になる切断寸法 */
  cut: CutSpec;
  /** 組立グループのキー (§14) */
  group: string;
}

/** 角材は 1D (長さのみ)、板材は 2D (幅 × 長さ) として木取りする。 */
export type CutSpec =
  | { kind: "linear"; length: Mm }
  | { kind: "panel"; width: Mm; length: Mm; thickness: Mm };

// ---------------------------------------------------------------------------
// Connection (§12)
// ---------------------------------------------------------------------------

export type FastenerType = "screw" | "bolt" | "bracket" | "glue";

export interface Connection {
  id: string;
  fromPartId: string;
  toPartId: string;
  fastener: FastenerType;
  /** 「65mm 木ねじ」のような具体的な仕様 */
  spec: string;
  count: number;
  /** 接続位置の代表点 */
  at: Vec3;
  group: string;
}

// ---------------------------------------------------------------------------
// Structure / Design (§9)
// ---------------------------------------------------------------------------

export type StructureType = "four_post_shelf" | "box_shelf" | "wall_shelf";

export interface Dimensions {
  width: Mm;
  height: Mm;
  depth: Mm;
}

export interface Structure {
  type: StructureType;
  params: Record<string, number>;
  /** 骨格に使う材料 ID (角材)。板材のみの構造では未使用。 */
  frameMaterialId: string;
  /** 面材に使う材料 ID (板材) */
  panelMaterialId: string;
}

export interface DesignScore {
  stability: number;
  materialEfficiency: number;
  simplicity: number;
}

export interface DesignCandidate {
  id: string;
  title: string;
  summary: string;
  structure: Structure;
  score: DesignScore;
}

// ---------------------------------------------------------------------------
// Compiled model
// ---------------------------------------------------------------------------

export interface PhysicalModel {
  parts: Part[];
  connections: Connection[];
  /** 完成品の外形 */
  bounds: Vec3;
}
