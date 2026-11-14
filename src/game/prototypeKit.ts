import type { KitDef, PartDef, Vec3 } from "./logic";

// shortcut: hand-made dummy kit to test cut/smooth/snap feel; replace with kits/<kit>/kit.json once ChatGPT's schema arrives.

const GATE_LEN = 0.3;
export const RUNNER_BAR_Y = 0.15;
export const ASSEMBLY_X = 3;

type Seed = Omit<PartDef, "runnerPos" | "gates"> & { row: -1 | 1; x: number; gateXs: number[] };

// Parts stand on the mat in two rows either side of the runner's middle bar (z = 0); every gate bridges to that bar.
function onRunner({ row, x, gateXs, ...p }: Seed): PartDef {
  const [, h, d] = p.size;
  const z = row * (GATE_LEN + d / 2);
  const gz = -row * (d / 2 + GATE_LEN / 2);
  const runnerPos: Vec3 = [x, h / 2, z];
  return { ...p, runnerPos, gates: gateXs.map((gx, i) => ({ id: `g${i + 1}`, offset: [gx, RUNNER_BAR_Y - h / 2, gz] })) };
}

export const GATE_LENGTH = GATE_LEN;

export const prototypeKit: KitDef = {
  id: "prototype",
  name: "Prototype",
  parts: [
    onRunner({ id: "legs", name: "legs", color: "#F5F7F3", size: [0.9, 1.0, 0.5], row: -1, x: -4.6, gateXs: [-0.25, 0.25], target: [ASSEMBLY_X, 0.5, 0], step: 1 }),
    onRunner({ id: "torso", name: "torso", color: "#2F5FB0", size: [1.0, 1.1, 0.6], row: -1, x: -3.0, gateXs: [-0.3, 0.3], target: [ASSEMBLY_X, 1.55, 0], step: 2 }),
    onRunner({ id: "head", name: "head", color: "#F5F7F3", size: [0.5, 0.5, 0.5], row: 1, x: -4.7, gateXs: [0], target: [ASSEMBLY_X, 2.35, 0], step: 3 }),
    onRunner({ id: "armL", name: "armL", color: "#2F5FB0", size: [0.35, 1.0, 0.35], row: 1, x: -3.8, gateXs: [0], target: [ASSEMBLY_X - 0.7, 1.6, 0], step: 4 }),
    onRunner({ id: "armR", name: "armR", color: "#2F5FB0", size: [0.35, 1.0, 0.35], row: 1, x: -3.0, gateXs: [0], target: [ASSEMBLY_X + 0.7, 1.6, 0], step: 4 }),
  ],
};
