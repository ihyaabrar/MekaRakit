"use client";

// Small motion cues for assembly: the target outline that glows while you carry its part,
// a pop when a part snaps in, and a hop when a part is rejected.
import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import * as THREE from "three";
import type { Vec3 } from "../logic";

const YELLOW = "#F2C230";

/** Assembly outline for a part of the current step. `hot` = its part is in your hand: it pulses. `dim` = another part is. */
export function Ghost({ size, at, hot, dim }: { size: Vec3; at: Vec3; hot: boolean; dim: boolean }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (!mat.current) return;
    mat.current.opacity = hot ? 0.35 + 0.25 * Math.sin(clock.elapsedTime * 6) : dim ? 0.08 : 0.22;
  });
  return (
    <mesh position={at} raycast={() => null}>
      <boxGeometry args={size} />
      <meshBasicMaterial ref={mat} color={YELLOW} transparent opacity={0.22} depthWrite={false} />
    </mesh>
  );
}

export type Pop = { kind: "snap" | "bump"; at: number };

/** Plays one cue when `pop` changes: snap = quick scale pulse, bump = a little hop. */
export function PopCue({ pop, children }: { pop?: Pop; children: ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!g.current) return;
    if (!pop) return;
    const t = (performance.now() - pop.at) / 1000;
    if (pop.kind === "snap") {
      const k = Math.min(1, t / 0.22);
      g.current.scale.setScalar(1 + 0.12 * Math.sin(k * Math.PI));
      g.current.position.y = 0;
    } else {
      const k = Math.min(1, t / 0.35);
      g.current.position.y = 0.35 * Math.sin(k * Math.PI);
      g.current.scale.setScalar(1);
    }
  });
  return <group ref={g}>{children}</group>;
}
