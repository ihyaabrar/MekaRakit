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

// ---- saved runs: the whole bench (part states + where loose parts lie), so a build resumes exactly ----

export const PAINTS = ["#F5F7F3", "#2F5FB0", "#C8402F", "#F2C230", "#9AA3AB", "#4A5560", "#1D2B38", "#E07B2E", "#4C7A4A"] as const;
export const DECAL_KINDS = ["code", "stripes", "chevron", "ring", "number", "line"] as const;
export type DecalKind = (typeof DECAL_KINDS)[number];
/** A sticker on a part: position and surface normal in the part's own (upright) coordinates. */
export type Decal = { id: string; part: string; kind: DecalKind; at: Vec3; normal: Vec3; rot: number; size: number };

/** Everything cosmetic about a build; optional so older saves still load. */
export type Finish = { paint: Record<string, string>; decals: Decal[]; pose: Record<string, number>; playSeconds: number };

export type RunSnapshot = { state: KitState; pos: Record<string, Vec3> } & Partial<Finish>;

const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === "number" && Number.isFinite(n));
const STATUSES: PartStatus[] = ["runner", "free", "placed"];

/** Validates a stored snapshot against the kit; null if it does not fit (then the bench starts fresh). */
export function restoreRun(kit: KitDef, raw: unknown): RunSnapshot | null {
  const r = raw as Partial<RunSnapshot> | null;
  const step = r?.state?.step;
  if (!r?.state || !r.pos || typeof step !== "number" || !Number.isInteger(step) || step < 1) return null;
  const parts: Record<string, PartState> = {};
  const pos: Record<string, Vec3> = {};
  for (const p of kit.parts) {
    const ps = r.state.parts?.[p.id];
    const gateIds = p.gates.map((g) => g.id);
    if (!ps || !STATUSES.includes(ps.status) || !Array.isArray(ps.cut) || !ps.cut.every((g) => gateIds.includes(g))) return null;
    const nubs: Record<string, number> = {};
    for (const [g, h] of Object.entries(ps.nubs ?? {})) {
      if (!gateIds.includes(g) || typeof h !== "number" || !(h >= 0 && h <= 1)) return null;
      nubs[g] = h;
    }
    const at = r.pos[p.id];
    if (!isVec3(at)) return null;
    parts[p.id] = { status: ps.status, cut: [...new Set(ps.cut)], nubs };
    // a placed part always sits on its target; a part still on the runner stays in its slot
    pos[p.id] = ps.status === "placed" ? p.target : ps.status === "runner" ? p.runnerPos : at;
  }
  return { state: { parts, step }, pos, ...sanitizeFinish(kit, r) };
}

export function runSummary(kit: KitDef, s: KitState) {
  let gatesCut = 0;
  let nubsLeft = 0;
  for (const p of kit.parts) {
    gatesCut += s.parts[p.id].cut.length;
    nubsLeft += Object.values(s.parts[p.id].nubs).filter((h) => h > 0).length;
  }
  return { gatesCut, nubsLeft, complete: isComplete(kit, s) };
}

// ---- assembly feel ----

export const MAGNET_DIST = 1.0; // a carried part starts drifting toward its own spot inside this radius

/**
 * Where a carried part is shown: inside MAGNET_DIST of its own (allowed) spot it is pulled in,
 * harder the closer it gets, so the last bit of the move "clicks" into place.
 */
export function magnetPull(kit: KitDef, s: KitState, partId: string, at: Vec3): Vec3 {
  const def = kit.parts.find((p) => p.id === partId);
  if (!def || def.step > s.step || s.parts[partId]?.status !== "free") return at;
  const d = dist(at, def.target);
  if (d >= MAGNET_DIST) return at;
  const k = 1 - d / MAGNET_DIST; // 0 at the edge, 1 on the spot
  return [at[0] + (def.target[0] - at[0]) * k, at[1] + (def.target[1] - at[1]) * k, at[2] + (def.target[2] - at[2]) * k];
}

/** Manual page that explains a failed drop: the current step, or the step that owns the spot it was dropped on. */
export function pageForDrop(kit: KitDef, s: KitState, res: DropResult): number | null {
  if (res.kind === "wrong-step") return s.step;
  if (res.kind === "wrong-spot") return kit.parts.find((p) => p.id === res.spotOf)?.step ?? null;
  return null;
}

export const MAX_DECALS = 40;

/** Keeps only finish data that fits the kit; bad entries are dropped, never the whole save. */
export function sanitizeFinish(kit: KitDef, raw: Partial<Finish> | null | undefined): Finish {
  const ids = new Set(kit.parts.map((p) => p.id));
  const paint: Record<string, string> = {};
  for (const [id, c] of Object.entries(raw?.paint ?? {})) if (ids.has(id) && (PAINTS as readonly string[]).includes(c)) paint[id] = c;
  const decals: Decal[] = [];
  for (const d of Array.isArray(raw?.decals) ? raw.decals : []) {
    if (decals.length >= MAX_DECALS) break;
    if (!d || !ids.has(d.part) || !(DECAL_KINDS as readonly string[]).includes(d.kind) || !isVec3(d.at) || !isVec3(d.normal)) continue;
    if (typeof d.id !== "string" || d.id.length > 40 || !Number.isFinite(d.rot) || !Number.isFinite(d.size)) continue;
    if (d.at.some((v) => Math.abs(v) > 2) || Math.hypot(...d.normal) < 0.5) continue;
    decals.push({ id: d.id, part: d.part, kind: d.kind, at: d.at, normal: d.normal, rot: d.rot % (2 * Math.PI), size: Math.min(0.6, Math.max(0.06, d.size)) });
  }
  const pose: Record<string, number> = {};
  for (const [k, a] of Object.entries(raw?.pose ?? {})) if (/^[a-z0-9-]{1,20}$/i.test(k) && Number.isFinite(a)) pose[k] = Math.max(-Math.PI, Math.min(Math.PI, a));
  const ps = Number(raw?.playSeconds);
  return { paint, decals, pose, playSeconds: Number.isFinite(ps) ? Math.min(1e7, Math.max(0, Math.round(ps))) : 0 };
}
