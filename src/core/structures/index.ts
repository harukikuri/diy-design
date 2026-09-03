import type { StructureType } from "../domain.ts";
import { boxShelf } from "./boxShelf.ts";
import { fourPostShelf } from "./fourPostShelf.ts";
import type { StructureCompiler } from "./types.ts";
import { wallShelf } from "./wallShelf.ts";

/** MVP で対応する Structure (§9.2) */
export const STRUCTURES: StructureCompiler[] = [fourPostShelf, boxShelf, wallShelf];

const BY_TYPE = new Map(STRUCTURES.map((s) => [s.type, s]));

export function getStructure(type: StructureType): StructureCompiler {
  const s = BY_TYPE.get(type);
  if (!s) throw new Error(`未知の Structure: ${type}`);
  return s;
}

export type { StructureCompiler } from "./types.ts";
export { shelfLevels } from "./types.ts";
