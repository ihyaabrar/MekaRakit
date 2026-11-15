"use client";

// The modeler's desk: wooden top, a printed cutting mat, a warm desk lamp, soft shadows and
// a procedural environment for plastic reflections (no HDR download).
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, useGLTF } from "@react-three/drei";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Vec3 } from "../logic";

const MAT_W = 14;
const MAT_D = 9;

// deterministic noise: textures look random but render stays pure and stable between renders
let seed = 1;
const rand = () => {
  const x = Math.sin(seed++ * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  draw(g);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Self-healing cutting mat: dark green, 1 cm grid, heavier 5 cm lines, ruler numbers on two edges. */
function useMatTexture() {
  return useMemo(
    () =>
      canvasTexture(2048, 1316, (g) => {
        const W = 2048;
        const H = 1316;
        const px = W / (MAT_W * 10); // 1 cm cells: the mat is 140 x 90 "cm"
        g.fillStyle = "#1e4a3d";
        g.fillRect(0, 0, W, H);
        // faint mottling so the surface does not read as flat colour
        for (let i = 0; i < 2500; i++) {
          g.fillStyle = `rgba(255,255,255,${rand() * 0.025})`;
          g.fillRect(rand() * W, rand() * H, 2 + rand() * 6, 2 + rand() * 6);
        }
        for (let i = 0, x = 0; x <= W; i++, x = i * px) {
          g.strokeStyle = i % 5 === 0 ? "rgba(235,240,230,0.30)" : "rgba(235,240,230,0.10)";
          g.lineWidth = i % 5 === 0 ? 2 : 1;
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, H);
          g.stroke();
        }
        for (let i = 0, y = 0; y <= H; i++, y = i * px) {
          g.strokeStyle = i % 5 === 0 ? "rgba(235,240,230,0.30)" : "rgba(235,240,230,0.10)";
          g.lineWidth = i % 5 === 0 ? 2 : 1;
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(W, y);
          g.stroke();
        }
        // 45 degree guide and ruler numbers
        g.strokeStyle = "rgba(235,240,230,0.16)";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(W * 0.62, H);
        g.lineTo(W * 0.62 + H, 0);
        g.stroke();
        g.fillStyle = "rgba(235,240,230,0.55)";
        g.font = "600 18px sans-serif";
        for (let i = 0; i <= MAT_W * 10; i += 10) g.fillText(String(i), i * px + 4, H - 8);
        for (let i = 10; i <= MAT_D * 10; i += 10) g.fillText(String(i), 6, H - i * px + 18);
      }),
    [],
  );
}

/** Oak desk top: warm base with long grain streaks. */
function useWoodTexture() {
  return useMemo(() => {
    const t = canvasTexture(1024, 1024, (g) => {
      g.fillStyle = "#6e4b30";
      g.fillRect(0, 0, 1024, 1024);
      for (let i = 0; i < 260; i++) {
        const y = rand() * 1024;
        g.strokeStyle = `rgba(${rand() < 0.5 ? "40,24,12" : "150,110,70"},${0.08 + rand() * 0.12})`;
        g.lineWidth = 1 + rand() * 3;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= 1024; x += 64) g.lineTo(x, y + Math.sin(x / 140 + i) * 6);
        g.stroke();
      }
    });
    if (t) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 2);
    }
    return t;
  }, []);
}

/** Turns on shadows for every mesh that does not opt out (userData.noShadow), including ones added later. */
function ShadowEverything() {
  const scene = useThree((s) => s.scene);
  const tick = useRef(0);
  useFrame(() => {
    if (tick.current++ % 30 !== 0) return;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.noShadow) return;
      const mat = m.material as THREE.Material & { transparent?: boolean; opacity?: number };
      const invisible = mat?.transparent && (mat.opacity ?? 1) < 0.05;
      m.castShadow = !invisible;
      m.receiveShadow = !invisible;
    });
  });
  return null;
}

/** Articulated desk lamp at the back left; its shade holds the warm key light. */
function DeskLamp({ at }: { at: Vec3 }) {
  const metal = { color: "#2b2f33", roughness: 0.35, metalness: 0.8 };
  return (
    <group position={at}>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.55, 0.62, 0.12, 32]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[0.2, 1.4, 0]} rotation-z={-0.18}>
        <cylinderGeometry args={[0.05, 0.05, 2.8, 12]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[1.25, 3.05, 0.4]} rotation-z={-1.1} rotation-y={-0.35}>
        <cylinderGeometry args={[0.045, 0.045, 2.6, 12]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[2.4, 3.15, 0.9]} rotation-x={0.25} rotation-z={0.75}>
        <coneGeometry args={[0.6, 0.8, 32, 1, true]} />
        <meshStandardMaterial color="#1f4a3d" roughness={0.5} metalness={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[2.55, 2.95, 0.95]} userData={{ noShadow: true }}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshBasicMaterial color="#fff1d6" />
      </mesh>
    </group>
  );
}

/** A Quaternius Sci-Fi Essentials prop (CC0) as desk clutter: cloned, and never hit by pointer rays. */
function DeskProp({ name, at, scale, rotY = 0 }: { name: string; at: Vec3; scale: number; rotY?: number }) {
  const { scene } = useGLTF(`/models/scifi/${name}.gltf`);
  const prop = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => (o.raycast = () => {}));
    return c;
  }, [scene]);
  return <primitive object={prop} position={at} scale={scale} rotation-y={rotY} />;
}

// all off the cutting mat (|x| < 7, |z| < 4.5), clear of the kit box, runners, tool tray and lamp
function DeskProps() {
  return (
    <Suspense fallback={null}>
      <DeskProp name="Prop_Ammo_Closed" at={[-1.6, 0, -6.4]} scale={3.4} rotY={0.3} />
      <DeskProp name="Prop_Crate" at={[3.4, 0, -6.8]} scale={0.9} rotY={0.15} />
      <DeskProp name="Prop_Crate_Tarp" at={[5.7, 0, -6.4]} scale={0.75} rotY={-0.4} />
      <DeskProp name="Prop_Mug" at={[8.1, 0, -4.4]} scale={6} rotY={-2.2} />
    </Suspense>
  );
}

export function Studio({ lampTarget }: { lampTarget: Vec3 }) {
  const mat = useMatTexture();
  const wood = useWoodTexture();
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(...lampTarget);
    return o;
  }, [lampTarget]);
  return (
    <>
      <color attach="background" args={["#15110e"]} />
      <fog attach="fog" args={["#15110e", 18, 34]} />
      <ShadowEverything />

      {/* reflections for glossy plastic: a soft studio built from light panels, rendered once */}
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={1.6} color="#fff4e6" position={[0, 6, -6]} scale={[14, 4, 1]} />
        <Lightformer intensity={0.8} color="#e8f0ff" position={[-8, 3, 4]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} />
        <Lightformer intensity={0.5} color="#ffe2b8" position={[8, 2, 4]} rotation-y={-Math.PI / 2} scale={[10, 2, 1]} />
      </Environment>

      <hemisphereLight args={["#fff4e6", "#3a2c22", 0.35]} />
      {/* warm desk lamp: the key light and the shadow caster */}
      <primitive object={target} />
      <spotLight
        position={[-8.2, 7.2, -2.2]}
        target={target}
        angle={0.95}
        penumbra={0.85}
        intensity={140}
        decay={1.6}
        color="#ffe3bf"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-radius={6}
      />
      {/* cool window fill from the front right so shadows are never black */}
      <directionalLight position={[8, 9, 10]} intensity={0.55} color="#dbe6ff" />

      {/* desk */}
      <mesh position={[0, -0.16, 0]} receiveShadow>
        <boxGeometry args={[40, 0.3, 24]} />
        <meshStandardMaterial map={wood ?? undefined} color={wood ? "#ffffff" : "#6e4b30"} roughness={0.7} />
      </mesh>
      {/* cutting mat */}
      <mesh position={[0, 0.005, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[MAT_W, MAT_D]} />
        <meshStandardMaterial map={mat ?? undefined} color={mat ? "#ffffff" : "#1e4a3d"} roughness={0.92} />
      </mesh>
      <DeskLamp at={[-11.5, 0, -6.5]} />
      <DeskProps />
    </>
  );
}
