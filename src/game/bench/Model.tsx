"use client";

// Mech part geometry made by scripts/build-mech-kit.mjs: per piece, a paintable "main" shell
// (x y z nx ny nz) and fixed-color details (x y z nx ny nz r g b, linear color).
import { type ThreeEvent } from "@react-three/fiber";
import { use } from "react";
import * as THREE from "three";

type Piece = { main: THREE.BufferGeometry | null; detail: THREE.BufferGeometry | null };
type Model = Record<string, Piece>;

function build(flat: number[], stride: 6 | 9): THREE.BufferGeometry | null {
  if (!flat.length) return null;
  const n = flat.length / stride;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const col = stride === 9 ? new Float32Array(n * 3) : null;
  for (let i = 0; i < n; i++) {
    const o = i * stride;
    pos.set(flat.slice(o, o + 3), i * 3);
    nrm.set(flat.slice(o + 3, o + 6), i * 3);
    col?.set(flat.slice(o + 6, o + 9), i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  if (col) g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

const files = new Map<string, Promise<Model>>();

/** Fetches and builds a model file once per page; later calls share the same promise. */
export function loadModel(url: string): Promise<Model> {
  let p = files.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`model ${url}: HTTP ${r.status}`);
        return r.json() as Promise<Record<string, { main: number[]; detail: number[] }>>;
      })
      .then((raw) => Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, { main: build(v.main, 6), detail: build(v.detail, 9) }])));
    p.catch(() => files.delete(url)); // let a remount retry after a failed fetch
    files.set(url, p);
  }
  return p;
}

export function MechPiece({ url, piece, color, ghosted, onPointerDown }: { url: string; piece: string; color: string; ghosted: boolean; onPointerDown?: (e: ThreeEvent<PointerEvent>) => void }) {
  const geo = use(loadModel(url))[piece];
  if (!geo) return null;
  return (
    <>
      {geo.main && (
        <mesh geometry={geo.main} onPointerDown={onPointerDown}>
          <meshStandardMaterial color={color} roughness={0.42} metalness={0.05} transparent={ghosted} opacity={ghosted ? 0.85 : 1} />
        </mesh>
      )}
      {geo.detail && (
        <mesh geometry={geo.detail} onPointerDown={onPointerDown}>
          <meshStandardMaterial vertexColors roughness={0.5} metalness={0.1} transparent={ghosted} opacity={ghosted ? 0.85 : 1} />
        </mesh>
      )}
    </>
  );
}
