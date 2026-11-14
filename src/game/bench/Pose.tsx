"use client";

// Posing (joints turn their parts around a pivot) and the photo rig (frame the model, grab a JPEG).
import { useThree } from "@react-three/fiber";
import { useEffect, type ReactNode } from "react";
import type { PoseJoint } from "../kitFormat";
import type { Vec3 } from "../logic";

const neg = ([x, y, z]: Vec3): Vec3 => [-x, -y, -z];

/** Wraps a part in every joint that moves it, outermost first, so nested joints compose (waist then arm). */
export function Posed({ chain, angles, children }: { chain: PoseJoint[]; angles: Record<string, number>; children: ReactNode }) {
  if (!chain.length) return <>{children}</>;
  const [j, ...rest] = chain;
  const a = angles[j.id] ?? 0;
  const rot: Vec3 = j.axis === "x" ? [a, 0, 0] : j.axis === "y" ? [0, a, 0] : [0, 0, a];
  return (
    <group position={j.pivot} rotation={rot}>
      <group position={neg(j.pivot)}>
        <Posed chain={rest} angles={angles}>
          {children}
        </Posed>
      </group>
    </group>
  );
}

export type PhotoApi = { frame: (center: Vec3) => void; restore: () => void; capture: () => string | null };

const MAX_PHOTO_W = 960;

/** Gives the page a handle to move the camera onto the model and to snapshot the canvas as a JPEG data URL. */
export function PhotoRig({ onReady }: { onReady: (api: PhotoApi) => void }) {
  const { gl, camera, scene, get } = useThree();
  useEffect(() => {
    const controls = () => get().controls as unknown as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
    let saved: { pos: Vec3; target: Vec3 } | null = null;
    onReady({
      frame(center) {
        const c = controls();
        saved = { pos: camera.position.toArray() as Vec3, target: [-1.7, 0.6, -0.3] };
        camera.position.set(center[0] + 2.2, center[1] + 1.2, center[2] + 6.2);
        c?.target.set(...center);
        c?.update();
      },
      restore() {
        if (!saved) return;
        camera.position.set(...saved.pos);
        controls()?.target.set(...saved.target);
        controls()?.update();
      },
      capture() {
        gl.render(scene, camera); // fresh frame (the canvas keeps its buffer for this read)
        const src = gl.domElement;
        const k = Math.min(1, MAX_PHOTO_W / src.width);
        const out = document.createElement("canvas");
        out.width = Math.round(src.width * k);
        out.height = Math.round(src.height * k);
        const g = out.getContext("2d");
        if (!g) return null;
        g.drawImage(src, 0, 0, out.width, out.height);
        return out.toDataURL("image/jpeg", 0.82);
      },
    });
  }, [gl, camera, scene, get, onReady]);
  return null;
}
