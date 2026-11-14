// Pure game rules for one kit session: cut, smooth, assemble. No React, no three.js.

export type Vec3 = [number, number, number];

export type GateDef = { id: string; offset: Vec3 };

export type PartDef = {
  id: string;
  name: string;
  color: string;
  size: Vec3;
  runnerPos: Vec3;
  gates: GateDef[];
  target: Vec3; // where it sits on the assembled model
  step: number; // manual step that installs it (1-based)
};

export type KitDef = { id: string; name: string; parts: PartDef[] };

export type PartStatus = "runner" | "free" | "placed";

export type PartState = {
  status: PartStatus;
  cut: string[]; // gate ids already cut
  nubs: Record<string, number>; // gate id -> nub height, 1 = fresh cut, 0 = smooth
};

export type KitState = { parts: Record<string, PartState>; step: number };

export const SNAP_DIST = 0.6;
export const RUB_RATE = 0.004; // nub height removed per pixel of rubbing

export function initState(kit: KitDef): KitState {
  const parts: Record<string, PartState> = {};
  for (const p of kit.parts) parts[p.id] = { status: "runner", cut: [], nubs: {} };
  return { parts, step: 1 };
}

export function cutGate(kit: KitDef, s: KitState, partId: string, gateId: string): KitState {
  const def = kit.parts.find((p) => p.id === partId);
  const ps = s.parts[partId];
  if (!def || !ps || ps.status !== "runner" || ps.cut.includes(gateId)) return s;
  if (!def.gates.some((g) => g.id === gateId)) return s;
  const cut = [...ps.cut, gateId];
  const status: PartStatus = cut.length === def.gates.length ? "free" : "runner";
  return {
    ...s,
    parts: { ...s.parts, [partId]: { status, cut, nubs: { ...ps.nubs, [gateId]: 1 } } },
  };
}

export function rubNub(s: KitState, partId: string, gateId: string, pixels: number): KitState {
  const ps = s.parts[partId];
  const h = ps?.nubs[gateId];
  if (!ps || h === undefined || h === 0 || pixels <= 0) return s;
  const next = Math.max(0, h - pixels * RUB_RATE);
  return { ...s, parts: { ...s.parts, [partId]: { ...ps, nubs: { ...ps.nubs, [gateId]: next } } } };
}

export type DropResult =
  | { kind: "snap" }
  | { kind: "wrong-step" } // right spot, but an earlier manual step is unfinished
  | { kind: "wrong-spot"; spotOf: string } // dropped on another part's spot
  | { kind: "none" };

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function checkDrop(kit: KitDef, s: KitState, partId: string, pos: Vec3): DropResult {
  const def = kit.parts.find((p) => p.id === partId);
  if (!def || s.parts[partId]?.status !== "free") return { kind: "none" };
  if (dist(pos, def.target) <= SNAP_DIST) return def.step <= s.step ? { kind: "snap" } : { kind: "wrong-step" };
  const other = kit.parts.find((p) => p.id !== partId && s.parts[p.id]?.status !== "placed" && dist(pos, p.target) <= SNAP_DIST);
  return other ? { kind: "wrong-spot", spotOf: other.id } : { kind: "none" };
}

export function placePart(kit: KitDef, s: KitState, partId: string): KitState {
  const ps = s.parts[partId];
  if (!ps || ps.status !== "free") return s;
  const parts = { ...s.parts, [partId]: { ...ps, status: "placed" as const } };
  // advance the manual while every part of the current step is placed
  let step = s.step;
  const maxStep = Math.max(...kit.parts.map((p) => p.step));
  while (step <= maxStep && kit.parts.filter((p) => p.step === step).every((p) => parts[p.id].status === "placed")) step++;
  return { parts, step };
}

export const isComplete = (kit: KitDef, s: KitState) => kit.parts.every((p) => s.parts[p.id].status === "placed");
