"use client";

// Physical objects on the cutting mat: the kit box, the tool tray (manual, sandpaper, nipper)
// and the tool currently held in the hand, which follows the pointer.
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import { useEffect, useMemo, useRef, type ReactNode, type Ref } from "react";
import * as THREE from "three";
import type { Vec3 } from "../logic";
import { makeBoxArt } from "./boxArt";

export type HeldTool = "hand" | "nipper" | "sand" | "brush" | "decal";

const INK = "#14202B";
const COBALT = "#2F5FB0";
const YELLOW = "#F2C230";
const BOX_WHITE = "#F5F7F3";
const STEEL = "#9AA3AB";
const SANDPAPER = "#C8B48A";

// Outlines thickness is in screen pixels (drei default mode), not world units.
// meshes of held/decorative props must never steal clicks from gates, parts or nubs
const noRaycast = () => null;

function Block({ size, at = [0, 0, 0], color, gradient, outline = 1.6, rot }: { size: Vec3; at?: Vec3; color: string; gradient: THREE.Texture; outline?: number; rot?: Vec3 }) {
  return (
    <mesh position={at} rotation={rot} raycast={noRaycast}>
      <boxGeometry args={size} />
      <meshToonMaterial color={color} gradientMap={gradient} />
      {outline > 0 && <Outlines thickness={outline} color={INK} />}
    </mesh>
  );
}

/** Tip of the jaws sits at the local origin, handles run toward +z (toward the player). */
const JAW_OPEN = 0.18;

function NipperModel({ gradient, left, right }: { gradient: THREE.Texture; left?: Ref<THREE.Group>; right?: Ref<THREE.Group> }) {
  return (
    <group>
      <group ref={left} rotation-y={JAW_OPEN}>
        <Block size={[0.05, 0.05, 0.16]} at={[-0.03, 0, 0.08]} color={STEEL} gradient={gradient} />
        <Block size={[0.07, 0.06, 0.55]} at={[-0.05, 0, 0.45]} color={COBALT} gradient={gradient} />
      </group>
      <group ref={right} rotation-y={-JAW_OPEN}>
        <Block size={[0.05, 0.05, 0.16]} at={[0.03, 0, 0.08]} color={STEEL} gradient={gradient} />
        <Block size={[0.07, 0.06, 0.55]} at={[0.05, 0, 0.45]} color={COBALT} gradient={gradient} />
      </group>
      <Block size={[0.1, 0.07, 0.07]} at={[0, 0, 0.17]} color={STEEL} gradient={gradient} />
    </group>
  );
}

function SandpaperModel({ gradient }: { gradient: THREE.Texture }) {
  return <Block size={[0.6, 0.03, 0.8]} color={SANDPAPER} gradient={gradient} />;
}

/** Brush tip at the local origin, handle toward +z. `tip` = the loaded paint colour. */
function BrushModel({ gradient, tip }: { gradient: THREE.Texture; tip: string }) {
  return (
    <group rotation-x={Math.PI / 2}>
      <mesh position={[0, -0.06, 0]} raycast={noRaycast}>
        <coneGeometry args={[0.05, 0.14, 12]} />
        <meshToonMaterial color={tip} gradientMap={gradient} />
      </mesh>
      <Block size={[0.07, 0.08, 0.07]} at={[0, 0.04, 0]} color={STEEL} gradient={gradient} />
      <mesh position={[0, 0.4, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.035, 0.03, 0.62, 12]} />
        <meshToonMaterial color={COBALT} gradientMap={gradient} />
      </mesh>
    </group>
  );
}

/** Sheet of waterslide decals. */
function DecalSheetModel({ gradient }: { gradient: THREE.Texture }) {
  return (
    <group>
      <Block size={[0.7, 0.02, 0.5]} color={BOX_WHITE} gradient={gradient} />
      <Block size={[0.14, 0.01, 0.14]} at={[-0.2, 0.015, -0.1]} color={YELLOW} gradient={gradient} outline={0} />
      <Block size={[0.14, 0.01, 0.14]} at={[0, 0.015, -0.1]} color="#C8402F" gradient={gradient} outline={0} />
      <Block size={[0.14, 0.01, 0.14]} at={[0.2, 0.015, -0.1]} color={INK} gradient={gradient} outline={0} />
      <Block size={[0.5, 0.01, 0.08]} at={[0, 0.015, 0.12]} color={COBALT} gradient={gradient} outline={0} />
    </group>
  );
}

function BookModel({ gradient }: { gradient: THREE.Texture }) {
  return (
    <group>
      <Block size={[0.95, 0.08, 1.25]} color={BOX_WHITE} gradient={gradient} />
      <Block size={[0.95, 0.01, 0.3]} at={[0, 0.045, -0.4]} color={COBALT} gradient={gradient} outline={0} />
      <Block size={[0.5, 0.01, 0.08]} at={[0, 0.045, 0.1]} color={YELLOW} gradient={gradient} outline={0} />
    </group>
  );
}

const TRAY: Record<"book" | "sand" | "nipper" | "brush" | "decal", Vec3> = { book: [-5.6, 0.04, 3.55], sand: [-4.2, 0.02, 3.6], nipper: [-2.9, 0.05, 3.5], brush: [-1.9, 0.05, 3.5], decal: [-0.8, 0.02, 3.6] };

/** Rises out of the box when the kit is opened; `delay` staggers each item. */
function Rise({ children, delay, at }: { children: ReactNode; delay: number; at: Vec3 }) {
  const g = useRef<THREE.Group>(null);
  const t0 = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    t0.current ??= clock.elapsedTime;
    const k = Math.min(1, Math.max(0, (clock.elapsedTime - t0.current - delay) / 0.45));
    const ease = 1 - Math.pow(1 - k, 3);
    g.current.position.set(at[0], at[1] - 0.6 * (1 - ease), at[2]);
    g.current.scale.setScalar(0.6 + 0.4 * ease);
    g.current.visible = k > 0;
  });
  return (
    <group ref={g} visible={false}>
      {children}
    </group>
  );
}

type TrayProps = {
  gradient: THREE.Texture;
  held: HeldTool;
  animateIn: boolean;
  paint: string;
  onPick: (tool: HeldTool) => void;
  onOpenBook: () => void;
};

/** The manual, sandpaper and nipper lying on the mat. A held tool leaves its spot empty. */
export function ToolTray({ gradient, held, animateIn, paint, onPick, onOpenBook }: TrayProps) {
  const hit = (size: Vec3, onClick: () => void, label: string) => (
    <mesh
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "")}
      name={label}
    >
      <boxGeometry args={size} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
  const items: [keyof typeof TRAY, ReactNode][] = [
    [
      "book",
      <>
        <BookModel gradient={gradient} />
        {hit([1.05, 0.3, 1.35], onOpenBook, "manual")}
      </>,
    ],
    [
      "sand",
      held === "sand" ? null : (
        <>
          <SandpaperModel gradient={gradient} />
          {hit([0.7, 0.3, 0.9], () => onPick("sand"), "sandpaper")}
        </>
      ),
    ],
    [
      "nipper",
      held === "nipper" ? null : (
        <group rotation-y={Math.PI * 0.85}>
          <NipperModel gradient={gradient} />
          {hit([0.4, 0.3, 1.0], () => onPick("nipper"), "nipper")}
        </group>
      ),
    ],
    [
      "brush",
      held === "brush" ? null : (
        <group rotation-y={Math.PI * 0.8} position={[0, 0, 0]}>
          <group rotation-x={-Math.PI / 2}>
            <BrushModel gradient={gradient} tip={paint} />
          </group>
          {hit([0.3, 0.3, 0.9], () => onPick("brush"), "brush")}
        </group>
      ),
    ],
    [
      "decal",
      held === "decal" ? null : (
        <>
          <DecalSheetModel gradient={gradient} />
          {hit([0.8, 0.3, 0.6], () => onPick("decal"), "decal sheet")}
        </>
      ),
    ],
  ];
  return (
    <>
      {items.map(([k, node], i) =>
        animateIn ? (
          <Rise key={k} delay={0.35 + i * 0.12} at={TRAY[k]}>
            {node}
          </Rise>
        ) : (
          <group key={k} position={TRAY[k]}>
            {node}
          </group>
        ),
      )}
    </>
  );
}

/** The held nipper or sandpaper floats just above whatever the pointer is over. `snips` counts cuts to animate the jaws. */
export function HeldToolFollower({ gradient, held, snips, paint }: { gradient: THREE.Texture; held: HeldTool; snips: number; paint: string }) {
  const g = useRef<THREE.Group>(null);
  const snapAt = useRef(-1);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  // floats a little above the parts; the tip still sits on the pointer ray, so it reads as "on" the gate
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.7));
  const hit = useRef(new THREE.Vector3());
  useEffect(() => {
    snapAt.current = performance.now();
  }, [snips]);
  useFrame(({ raycaster, pointer, camera }) => {
    if (!g.current) return;
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(plane.current, hit.current)) g.current.position.copy(hit.current);
    // jaws close fast on a cut and spring back open
    const dt = (performance.now() - snapAt.current) / 1000;
    const close = dt < 0.25 ? Math.sin((dt / 0.25) * Math.PI) : 0;
    if (left.current) left.current.rotation.y = JAW_OPEN * (1 - close * 0.9);
    if (right.current) right.current.rotation.y = -JAW_OPEN * (1 - close * 0.9);
  });
  if (held === "hand") return null;
  return (
    <group ref={g} scale={1.7}>
      {held === "nipper" ? (
        <group rotation-y={Math.PI * 0.15} rotation-x={-0.35}>
          <NipperModel gradient={gradient} left={left} right={right} />
        </group>
      ) : held === "brush" ? (
        <group rotation-x={-0.5}>
          <BrushModel gradient={gradient} tip={paint} />
        </group>
      ) : held === "decal" ? (
        <group rotation-x={-0.3} scale={0.6}>
          <DecalSheetModel gradient={gradient} />
        </group>
      ) : (
        <group rotation-x={-0.25}>
          <SandpaperModel gradient={gradient} />
        </group>
      )}
    </group>
  );
}

/** Closed kit box covering the runners. Clicking it opens the lid; the lid then rests at the back of the mat. */
type BoxLabel = { code: string; name: string; body: string; trim: string };

export function KitBox({ gradient, opened, onOpen, center, label }: { gradient: THREE.Texture; opened: boolean; onOpen: () => void; center: Vec3; label: BoxLabel }) {
  const art = useMemo(() => makeBoxArt(label), [label]);
  const lid = useRef<THREE.Group>(null);
  const base = useRef<THREE.Group>(null);
  const t0 = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (!lid.current || !base.current) return;
    if (!opened) {
      t0.current = null;
      return;
    }
    t0.current ??= clock.elapsedTime;
    const k = Math.min(1, (clock.elapsedTime - t0.current) / 0.7);
    const e = 1 - Math.pow(1 - k, 3);
    // lid lifts, tilts and slides to the back-right corner; the empty tray sinks away
    lid.current.position.set(center[0] + (4.4 - center[0]) * e, 1.0 + Math.sin(e * Math.PI) * 1.6 - 0.75 * e, center[2] + (-3.7 - center[2]) * e);
    lid.current.rotation.set(0, -0.35 * e, 0);
    lid.current.scale.setScalar(1 - 0.55 * e);
    base.current.position.y = -1.2 * e;
    base.current.visible = k < 1;
  });
  const [w, d] = [6.6, 5.6];
  return (
    <>
      <group ref={base} position={[center[0], 0, center[2]]}>
        <Block size={[w, 0.9, d]} at={[0, 0.45, 0]} color={BOX_WHITE} gradient={gradient} outline={2.4} />
      </group>
      <group ref={lid} position={[center[0], 1.0, center[2]]}>
        <Block size={[w + 0.08, 0.22, d + 0.08]} color={COBALT} gradient={gradient} outline={2.4} />
        <Block size={[w + 0.09, 0.05, 0.6]} at={[0, 0.09, -1.6]} color={YELLOW} gradient={gradient} outline={0} />
        {/* box art printed on the lid */}
        <mesh position={[0.4, 0.115, 0.35]} rotation-x={-Math.PI / 2} raycast={noRaycast}>
          <planeGeometry args={[4.4, 3.6]} />
          {art ? <meshBasicMaterial map={art} toneMapped={false} /> : <meshBasicMaterial color={BOX_WHITE} />}
        </mesh>
        {!opened && (
          <mesh
            position={[0, 0, 0]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onOpen();
            }}
            onPointerOver={() => (document.body.style.cursor = "pointer")}
            onPointerOut={() => (document.body.style.cursor = "")}
          >
            <boxGeometry args={[w, 1.4, d]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
      </group>
    </>
  );
}

/** Wraps the runners: they rise out of the box once, right after it opens. */
export function RiseOnOpen({ animate, children }: { animate: boolean; children: ReactNode }) {
  if (!animate) return <>{children}</>;
  return (
    <Rise delay={0.15} at={[0, 0, 0]}>
      {children}
    </Rise>
  );
}
