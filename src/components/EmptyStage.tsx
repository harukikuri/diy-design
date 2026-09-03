import { useMemo } from "react";
import type { Dimensions } from "../core/domain.ts";
import { getMaterial } from "../core/materials.ts";
import { STRUCTURES } from "../core/structures/index.ts";
import { Elevation } from "./Elevation.tsx";

/**
 * 何も設計していないときの画面。
 *
 * 空の箱に説明文を置くのではなく、いま作れる構造を実際にコンパイルして並べる。
 * 決定論エンジンだけで描けるので API も鍵も要らない。
 * 「押したら何が出るか」が押す前に分かる。
 */

const SAMPLE: Dimensions = { width: 800, height: 1500, depth: 350 };
const frame = getMaterial("lumber_2x4");
const panel = getMaterial("board_ply18");

export function EmptyStage() {
  const previews = useMemo(
    () =>
      STRUCTURES.map((compiler) => ({
        compiler,
        model: compiler.compile({
          dimensions: SAMPLE,
          params: compiler.defaultParams(SAMPLE),
          frame,
          panel,
        }),
      })),
    [],
  );

  return (
    <div className="opening">
      <div className="opening__lede">
        <p className="opening__thesis">
          言葉と寸法を、<b>切って組める形</b>へ。
        </p>
        <p className="opening__sub">
          構造はエージェントが選び、部材の寸法・木取り・組立順序は計算で導きます。
          いま作れるのはこの3つです。
        </p>
      </div>

      <div className="opening__grid">
        {previews.map(({ compiler, model }, i) => (
          <figure
            className="opening__item"
            key={compiler.type}
            style={{ animationDelay: `${i * 90}ms` }}
          >
            <div className="opening__figure">
              <Elevation parts={model.parts} bounds={model.bounds} view="front" />
            </div>
            <figcaption>
              <b>{compiler.label}</b>
              <span>{compiler.description}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
