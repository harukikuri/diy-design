import { Canvas, useThree } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { Vector3 } from "three";
import type { Part, PhysicalModel } from "../core/domain.ts";
import { WALL_ANCHOR } from "../core/domain.ts";
import { ROLE_COLOR } from "./partColors.ts";

/**
 * 3D Renderer (§16)。
 *
 * 2D の図面と同じ Physical Model をそのまま描く。完成イメージだけでなく、
 * 組立途中の状態 (visible) と分解表示 (exploded) にも同じ経路を使う。
 */

const MM = 0.001; // mm → m

/** 組み立て済みの部材の色。新しく付ける部材だけが色を持つ (§15.2)。 */
const ASSEMBLED = "#b6c0c1";

/** 完成品の外形がキャンバスに収まる位置へカメラを置く。 */
function FitCamera({ size: box }: { size: [number, number, number] }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const [w, h, d] = box;
    const radius = Math.sqrt(w * w + h * h + d * d) / 2;
    const perspective = camera as typeof camera & { fov: number; aspect: number };
    const vFov = (perspective.fov * Math.PI) / 180;
    const aspect = size.width / Math.max(size.height, 1);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const distance = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.08;
    const direction = new Vector3(0.62, 0.42, 0.86).normalize();
    camera.position.copy(direction.multiplyScalar(distance)).setY(h / 2 + distance * 0.35);
    camera.near = distance / 100;
    camera.far = distance * 12;
    camera.lookAt(0, h / 2, 0);
    perspective.aspect = aspect;
    camera.updateProjectionMatrix();
  }, [box, camera, size.width, size.height]);
  return null;
}

interface Props {
  model: PhysicalModel;
  /** 描画する部材。未指定なら全部材。 */
  visible?: readonly string[];
  /** 強調する部材。指定するとそれ以外は半透明になる。 */
  highlight?: readonly string[];
  /** 0 = 完成状態、1 = 分解表示 */
  exploded?: number;
  /** 壁面を描く */
  showWall?: boolean;
}

function PartMesh({
  part,
  center,
  exploded,
  faded,
}: {
  part: Part;
  center: [number, number, number];
  exploded: number;
  faded: boolean;
}) {
  const position = useMemo<[number, number, number]>(() => {
    const base: [number, number, number] = [
      part.position.x * MM - center[0],
      part.position.y * MM,
      part.position.z * MM - center[2],
    ];
    if (exploded === 0) return base;
    // 完成品の中心から外向きに逃がす
    const dir: [number, number, number] = [base[0], base[1] - center[1], base[2]];
    return [
      base[0] + dir[0] * exploded * 0.6,
      base[1] + dir[1] * exploded * 0.6,
      base[2] + dir[2] * exploded * 0.6,
    ];
  }, [part, center, exploded]);

  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={[part.size.x * MM, part.size.y * MM, part.size.z * MM]} />
      <meshLambertMaterial color={faded ? ASSEMBLED : ROLE_COLOR[part.role]} />
    </mesh>
  );
}

export function Viewer3D({ model, visible, highlight, exploded = 0, showWall }: Props) {
  const { bounds, parts } = model;
  const center: [number, number, number] = [
    (bounds.x * MM) / 2,
    (bounds.y * MM) / 2,
    (bounds.z * MM) / 2,
  ];
  const span = Math.max(bounds.x, bounds.y, bounds.z) * MM;
  const shown = visible ? parts.filter((p) => visible.includes(p.id)) : parts;
  const wall = showWall ?? model.connections.some((c) => c.toPartId === WALL_ANCHOR);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [span * 0.85, span * 0.7, span * 1.15], fov: 38 }}
      key={`${bounds.x}x${bounds.y}x${bounds.z}`}
    >
      <color attach="background" args={["#e7ebea"]} />
      <FitCamera size={[bounds.x * MM, bounds.y * MM, bounds.z * MM]} />
      <ambientLight intensity={1.5} />
      <directionalLight position={[3, 6, 4]} intensity={2.2} castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={0.7} />

      <group position={[0, 0, 0]}>
        {shown.map((part) => (
          <PartMesh
            key={part.id}
            part={part}
            center={center}
            exploded={exploded}
            faded={highlight !== undefined && !highlight.includes(part.id)}
          />
        ))}

        {wall && (
          <mesh
            position={[0, center[1], bounds.z * MM - center[2] + 0.005]}
            receiveShadow
          >
            <boxGeometry args={[bounds.x * MM * 1.6, bounds.y * MM * 1.3, 0.01]} />
            <meshLambertMaterial color="#c2cbcc" transparent opacity={0.55} />
          </mesh>
        )}
      </group>

      <Grid
        args={[8, 8]}
        cellSize={0.1}
        cellColor="#d8dfdf"
        sectionSize={0.5}
        sectionColor="#c2cbcc"
        fadeDistance={span * 5}
        fadeStrength={1.5}
        infiniteGrid
        position={[0, 0, 0]}
      />

      <OrbitControls
        makeDefault
        target={[0, center[1], 0]}
        minDistance={span * 0.5}
        maxDistance={span * 6}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
    </Canvas>
  );
}
