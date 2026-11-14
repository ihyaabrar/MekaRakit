"use client";

// Painting and decals: the brush model, decal artwork (drawn once to canvases) and a decal stuck on a part.
import { type ThreeEvent } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { Decal, DecalKind } from "../logic";

const INK = "#14202B";
const YELLOW = "#F2C230";
const WHITE = "#F5F7F3";
const RED = "#C8402F";

const cache = new Map<string, THREE.CanvasTexture>();

/** Decal artwork as a transparent canvas texture. `code` is the kit code printed on the "code" decal. */
export function decalTexture(kind: DecalKind, code: string): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const key = `${kind}/${code}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  if (!g) return null;
  g.lineJoin = "round";
  switch (kind) {
    case "code":
      g.fillStyle = WHITE;
      g.fillRect(16, 76, 224, 104);
      g.strokeStyle = INK;
      g.lineWidth = 10;
      g.strokeRect(16, 76, 224, 104);
      g.fillStyle = INK;
      g.font = "900 72px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(code, 128, 130);
      break;
    case "stripes":
      g.fillStyle = RED;
      for (const x of [40, 120]) {
        g.beginPath();
        g.moveTo(x, 236);
        g.lineTo(x + 50, 236);
        g.lineTo(x + 130, 20);
        g.lineTo(x + 80, 20);
        g.closePath();
        g.fill();
      }
      break;
    case "chevron":
      g.fillStyle = YELLOW;
      g.fillRect(8, 64, 240, 128);
      g.fillStyle = INK;
      for (let x = -64; x < 256; x += 64) {
        g.beginPath();
        g.moveTo(x, 192);
        g.lineTo(x + 32, 192);
        g.lineTo(x + 96, 64);
        g.lineTo(x + 64, 64);
        g.closePath();
        g.fill();
      }
      g.strokeStyle = INK;
      g.lineWidth = 8;
      g.strokeRect(8, 64, 240, 128);
      break;
    case "ring":
      g.strokeStyle = WHITE;
      g.lineWidth = 26;
      g.beginPath();
      g.arc(128, 128, 90, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = RED;
      g.beginPath();
      g.arc(128, 128, 42, 0, Math.PI * 2);
      g.fill();
      break;
    case "number":
      g.fillStyle = WHITE;
      g.strokeStyle = INK;
      g.lineWidth = 12;
      g.font = "900 190px sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.strokeText("01", 128, 138);
      g.fillText("01", 128, 138);
      break;
    case "line":
      g.fillStyle = WHITE;
      g.fillRect(10, 104, 236, 22);
      g.fillStyle = RED;
      g.fillRect(10, 134, 236, 14);
      break;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

/** A decal sitting on a part's surface, just off the face so it never z-fights. */
export function DecalMesh({ decal, code, selected, onSelect }: { decal: Decal; code: string; selected: boolean; onSelect?: () => void }) {
  const tex = useMemo(() => decalTexture(decal.kind, code), [decal.kind, code]);
  const quat = useMemo(() => {
    const n = new THREE.Vector3(...decal.normal).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    return q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), decal.rot));
  }, [decal.normal, decal.rot]);
  const at = useMemo(() => new THREE.Vector3(...decal.at).addScaledVector(new THREE.Vector3(...decal.normal).normalize(), 0.004), [decal.at, decal.normal]);
  if (!tex) return null;
  return (
    <mesh
      position={at}
      quaternion={quat}
      onPointerDown={
        onSelect
          ? (e: ThreeEvent<PointerEvent>) => {
              // select here, and stop the part underneath from placing another sticker on the same press
              e.stopPropagation();
              onSelect();
            }
          : undefined
      }
      raycast={onSelect ? undefined : () => null}
    >
      <planeGeometry args={[decal.size, decal.size]} />
      <meshStandardMaterial map={tex} transparent alphaTest={0.05} polygonOffset polygonOffsetFactor={-2} roughness={0.35} />
      {selected && (
        <lineSegments>
          <edgesGeometry args={[new THREE.PlaneGeometry(decal.size * 1.08, decal.size * 1.08)]} />
          <lineBasicMaterial color={YELLOW} />
        </lineSegments>
      )}
    </mesh>
  );
}
