import { Canvas, useThree } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import { Quaternion, Vector3 } from "three";
import type { Connection, Part, PhysicalModel } from "../core/domain.ts";
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
const ASSEMBLED = "#55666a";

/** 留める位置の印。部材のどの色とも被らない橙にする。 */
const FASTENER = "#f0a04b";

/** 現在のフレームを PNG として取り出せるようにする。 */
function CaptureBridge({ onReady }: { onReady: (capture: () => string) => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    onReady(() => {
      // toDataURL の直前に描き直さないと、クリア済みのバッファを読むことがある
      gl.render(scene, camera);
      return gl.domElement.toDataURL("image/png");
    });
  }, [gl, scene, camera, onReady]);
  return null;
}

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
  /**
   * 描画済みキャンバスを PNG data URL で取り出す関数を受け取る。
   * 完成イメージ生成の参照画像に使う。
   */
  onCaptureReady?: (capture: () => string) => void;
  /** 留める位置を光らせる接続の ID。組立手順で「どこにねじを打つか」を示す。 */
  fastenings?: readonly string[];
}

const UP = new Vector3(0, 1, 0);

/**
 * ねじの入る位置と向き。
 *
 * 材の中へ向かう部分は木に隠れて見えないので、ねじ自体は材の外に浮かせて描き、
 * 先端を入り口へ向ける。IKEA の説明書と同じ考え方で、木を透かさずに
 * 「この向きに、ここへ入れる」が読める。表面には入り口を小さな円で示す。
 * 実寸のねじは 1800mm の棚に対して小さすぎるため、寸法は誇張してある。
 */
function FastenerMark({
  at,
  drive,
  size,
}: {
  at: [number, number, number];
  drive: [number, number, number];
  size: number;
}) {
  const g = useMemo(() => {
    const dir = new Vector3(...drive).normalize();
    const entry = new Vector3(...at);
    const back = (d: number) => entry.clone().addScaledVector(dir, -d);

    const tip = size * 0.45;
    const shank = size;
    const headH = size * 0.16;
    const r = size * 0.075;

    return {
      quaternion: new Quaternion().setFromUnitVectors(UP, dir),
      tipPos: back(tip / 2),
      tipArgs: [r, tip, 12] as [number, number, number],
      shankPos: back(tip + shank / 2),
      shankArgs: [r, r, shank, 12] as [number, number, number, number],
      headPos: back(tip + shank + headH / 2),
      headArgs: [size * 0.19, size * 0.1, headH, 14] as [number, number, number, number],
      entry,
      entryArgs: [size * 0.17, size * 0.17, size * 0.012, 16] as [number, number, number, number],
    };
  }, [at, drive, size]);

  return (
    <group>
      {/* 先端。頂点が入り口を向く */}
      <mesh position={g.tipPos} quaternion={g.quaternion}>
        <coneGeometry args={g.tipArgs} />
        <meshLambertMaterial color={FASTENER} />
      </mesh>
      <mesh position={g.shankPos} quaternion={g.quaternion}>
        <cylinderGeometry args={g.shankArgs} />
        <meshLambertMaterial color={FASTENER} />
      </mesh>
      {/* 頭は皿状に広げて、ねじだと分かるようにする */}
      <mesh position={g.headPos} quaternion={g.quaternion}>
        <cylinderGeometry args={g.headArgs} />
        <meshLambertMaterial color={FASTENER} />
      </mesh>
      {/* 入り口。材に埋もれても位置が分かるよう手前に描く */}
      <mesh position={g.entry} quaternion={g.quaternion} renderOrder={2}>
        <cylinderGeometry args={g.entryArgs} />
        <meshBasicMaterial color={FASTENER} transparent opacity={0.85} depthTest={false} />
      </mesh>
    </group>
  );
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

export function Viewer3D({
  model,
  visible,
  highlight,
  exploded = 0,
  showWall,
  onCaptureReady,
  fastenings,
}: Props) {
  const { bounds, parts } = model;
  const center: [number, number, number] = [
    (bounds.x * MM) / 2,
    (bounds.y * MM) / 2,
    (bounds.z * MM) / 2,
  ];
  const span = Math.max(bounds.x, bounds.y, bounds.z) * MM;
  const shown = visible ? parts.filter((p) => visible.includes(p.id)) : parts;
  // 触るまではゆっくり回す。操作したら止めて、以降はユーザーに預ける。
  const [autoRotate, setAutoRotate] = useState(true);
  const wall = showWall ?? model.connections.some((c) => c.toPartId === WALL_ANCHOR);
  const marks: Connection[] = fastenings
    ? model.connections.filter((c) => fastenings.includes(c.id))
    : [];
  // 完成品の大きさに対して、ねじと分かる程度の大きさにする
  const markSize = Math.max(0.05, span * 0.055);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ preserveDrawingBuffer: true }}
      camera={{ position: [span * 0.85, span * 0.7, span * 1.15], fov: 38 }}
      key={`${bounds.x}x${bounds.y}x${bounds.z}`}
    >
      <color attach="background" args={["#151b1d"]} />
      <FitCamera size={[bounds.x * MM, bounds.y * MM, bounds.z * MM]} />
      {onCaptureReady && <CaptureBridge onReady={onCaptureReady} />}
      {/* 暗い面では回り込みの光が無いので、環境光を厚めにして陰を潰しすぎない */}
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 6, 4]} intensity={2.4} castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={0.9} />
      <directionalLight position={[0, -3, 2]} intensity={0.3} />

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

        {marks.flatMap((c) =>
          c.points.map((at, i) => (
            <FastenerMark
              key={`${c.id}_${i}`}
              size={markSize}
              at={[at.x * MM - center[0], at.y * MM, at.z * MM - center[2]]}
              drive={[c.drive.x, c.drive.y, c.drive.z]}
            />
          )),
        )}

        {wall && (
          <mesh
            position={[0, center[1], bounds.z * MM - center[2] + 0.005]}
            receiveShadow
          >
            <boxGeometry args={[bounds.x * MM * 1.6, bounds.y * MM * 1.3, 0.01]} />
            <meshLambertMaterial color="#2b3639" transparent opacity={0.7} />
          </mesh>
        )}
      </group>

      <Grid
        args={[8, 8]}
        cellSize={0.1}
        cellColor="#232d30"
        sectionSize={0.5}
        sectionColor="#33413f"
        fadeDistance={span * 5}
        fadeStrength={1.5}
        infiniteGrid
        position={[0, 0, 0]}
      />

      <OrbitControls
        makeDefault
        autoRotate={autoRotate}
        autoRotateSpeed={0.6}
        onStart={() => setAutoRotate(false)}
        target={[0, center[1], 0]}
        minDistance={span * 0.5}
        maxDistance={span * 6}
        maxPolarAngle={Math.PI / 2 - 0.02}
      />
    </Canvas>
  );
}
