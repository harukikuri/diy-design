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
 * 留める位置と向きの印。
 *
 * 位置だけの点にすると、板と板の隙間に何かが浮いているようにしか見えず、
 * どちらの面から打つのかが伝わらない。頭を面の上に置き、打ち込む向きへ軸を
 * 伸ばすことで「この面から、この向きに入れる」を図で示す。
 * 実寸のねじは小さすぎて見えないため、視認できる大きさに誇張している。
 */
function FastenerMark({
  at,
  drive,
  scale,
}: {
  at: [number, number, number];
  drive: [number, number, number];
  scale: number;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const dir = new Vector3(...drive).normalize();
    const len = scale * 7;
    return {
      // 円柱は中心基準なので、頭から半分ぶん進めた位置に置く
      position: new Vector3(...at).addScaledVector(dir, len / 2),
      quaternion: new Quaternion().setFromUnitVectors(UP, dir),
      length: len,
    };
  }, [at, drive, scale]);

  return (
    <group>
      {/* 軸: 打ち込む向き */}
      <mesh position={position} quaternion={quaternion}>
        <cylinderGeometry args={[scale * 0.45, scale * 0.3, length, 10]} />
        <meshBasicMaterial color={FASTENER} />
      </mesh>
      {/* 頭: 作業する面の側 */}
      <mesh position={at}>
        <sphereGeometry args={[scale, 14, 14]} />
        <meshBasicMaterial color={FASTENER} />
      </mesh>
      {/* 材の裏に回っても位置が分かるよう、薄い輪を手前に重ねる */}
      <mesh position={at} renderOrder={2}>
        <sphereGeometry args={[scale * 1.7, 14, 14]} />
        <meshBasicMaterial color={FASTENER} transparent opacity={0.2} depthTest={false} />
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
  // 完成品の大きさに対して見える程度の印にする
  const markScale = Math.max(0.008, span * 0.012);

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
              scale={markScale}
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
