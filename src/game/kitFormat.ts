// kit.json format v1 -> the game's KitDef plus what the workbench needs to draw it.
// Authoring rules (enforced by loadKit): part coordinates are local to the part, upright, centered;
// targets are relative to the assembly spot; parts lie face-up on their runner, height along the runner depth.
import type { KitDef, PartDef, Vec3 } from "./logic";

export const GATE_LENGTH = 0.3;
export const RUNNER_BAR_Y = 0.15;

type Text = { id: string; en: string };
export type Prim = { box: Vec3; at?: Vec3; color?: string };

export type KitFileV1 = {
  format: 1;
  id: string;
  code: string;
  assemblyAt: [number, number]; // x, z of the assembly spot on the mat
  runners: { id: string; color: string; center: [number, number]; size: [number, number] }[];
  steps: { n: number; title: Text }[];
  parts: {
    id: string;
    name: Text;
    runner: string;
    row: -1 | 1; // which side of the runner's middle bar
    x: number; // along the runner, relative to its center
    gates: number[]; // x offsets (part-local) where gates join the middle bar
    color: string;
    size: Vec3; // bounding box w, h, d (upright)
    shape?: Prim[]; // defaults to one box of `size`
    target: Vec3; // relative to assemblyAt (y absolute)
    step: number;
  }[];
};

export type PartVisual = { name: Text; color: string; shape: Prim[]; runner: string };
export type RunnerVisual = KitFileV1["runners"][number];
export type LoadedKit = { def: KitDef; parts: Record<string, PartVisual>; runners: RunnerVisual[]; steps: KitFileV1["steps"]; assembly: Vec3 };

const EPS = 1e-9;

export function loadKit(file: KitFileV1): LoadedKit {
  const fail = (msg: string): never => {
    throw new Error(`kit ${file?.id ?? "?"}: ${msg}`);
  };
  if (file.format !== 1) fail("unsupported format");
  const runners = new Map(file.runners.map((r) => [r.id, r]));
  const steps = new Set(file.steps.map((s) => s.n));
  const ids = new Set<string>();
  const rows = new Map<string, [number, number, string][]>(); // runner/row -> occupied x intervals
  const [ax, az] = file.assemblyAt;

  const parts: PartDef[] = file.parts.map((p) => {
    if (ids.has(p.id)) fail(`duplicate part ${p.id}`);
    ids.add(p.id);
    const r = runners.get(p.runner) ?? fail(`${p.id}: unknown runner ${p.runner}`);
    if (!steps.has(p.step)) fail(`${p.id}: unknown step ${p.step}`);
    if (p.row !== 1 && p.row !== -1) fail(`${p.id}: row must be 1 or -1`);
    if (!p.gates.length) fail(`${p.id}: needs at least one gate`);
    const [w, h, d] = p.size;
    if (p.gates.some((g) => Math.abs(g) > w / 2 + EPS)) fail(`${p.id}: gate outside the part`);
    if (Math.abs(p.x) + w / 2 > r.size[0] / 2 + EPS) fail(`${p.id}: sticks out of runner ${r.id} sideways`);
    if (GATE_LENGTH + h > r.size[1] / 2 + EPS) fail(`${p.id}: too long for runner ${r.id}`);
    const key = `${p.runner}/${p.row}`;
    const span: [number, number, string] = [p.x - w / 2, p.x + w / 2, p.id];
    for (const [a, b, other] of rows.get(key) ?? []) if (span[0] < b - EPS && a < span[1] - EPS) fail(`${p.id} overlaps ${other} on runner ${key}`);
    rows.set(key, [...(rows.get(key) ?? []), span]);

    return {
      id: p.id,
      name: p.name.en,
      color: p.color,
      size: p.size,
      // lying face-up on the runner: center at half thickness, height runs away from the middle bar
      runnerPos: [r.center[0] + p.x, d / 2, r.center[1] + p.row * (GATE_LENGTH + h / 2)],
      // part-local gate midpoints: between the part's end (along local y) and the bar, at bar height once lying
      gates: p.gates.map((gx, i) => ({ id: `g${i + 1}`, offset: [gx, p.row * (h / 2 + GATE_LENGTH / 2), RUNNER_BAR_Y - d / 2] as Vec3 })),
      target: [ax + p.target[0], p.target[1], az + p.target[2]],
      step: p.step,
    };
  });

  for (const n of steps) if (!file.parts.some((p) => p.step === n)) fail(`step ${n} has no parts`);

  return {
    def: { id: file.id, name: file.code, parts },
    parts: Object.fromEntries(file.parts.map((p) => [p.id, { name: p.name, color: p.color, shape: p.shape ?? [{ box: p.size }], runner: p.runner }])),
    runners: file.runners,
    steps: [...file.steps].sort((a, b) => a.n - b.n),
    assembly: [ax, 0, az],
  };
}

/** Part-local point -> world offset while the part lies face-up on the mat (rotation -90 deg about X). */
export const lyingOffset = ([x, y, z]: Vec3): Vec3 => [x, z, -y];
