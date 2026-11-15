"use client";

// A part held up close in front of the camera: drag to turn it, sand its nubs with the sandpaper.
import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import * as THREE from "three";

const DISTANCE = 4.2; // world units in front of the camera
const SCALE = 2.4; // small parts; bigger ones shrink so the whole part and its nubs stay on screen
const FIT = 2.0; // world units the part (with its gate stubs) may span at most

export default function LiftedPart({ rotation, size, children }: { rotation: [number, number]; size: [number, number, number]; children: ReactNode }) {
  const [w, h, d] = size;
  const scale = Math.min(SCALE, FIT / Math.max(w, h + 0.6, d));
  const g = useRef<THREE.Group>(null);
  const dir = useRef(new THREE.Vector3());
  const turn = useRef(new THREE.Quaternion());
  const euler = useRef(new THREE.Euler());
  useFrame(({ camera }) => {
    if (!g.current) return;
    camera.getWorldDirection(dir.current);
    g.current.position.copy(camera.position).addScaledVector(dir.current, DISTANCE);
    // face the camera, then apply the player's turn (yaw around screen-up, pitch around screen-right)
    euler.current.set(rotation[0], rotation[1], 0, "YXZ");
    turn.current.setFromEuler(euler.current);
    g.current.quaternion.copy(camera.quaternion).multiply(turn.current);
  });
  return (
    <group ref={g} scale={scale}>
      {children}
    </group>
  );
}
