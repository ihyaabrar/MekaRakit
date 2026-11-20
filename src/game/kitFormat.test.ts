import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadKit, lyingOffset, GATE_LENGTH, RUNNER_BAR_Y, type KitFileV1 } from "./kitFormat.ts";

const read = (id: string) => JSON.parse(readFileSync(new URL(`../../kits/${id}/kit.json`, import.meta.url), "utf8")) as KitFileV1;
const files = ["kr-01", "kr-02", "kr-03", "kr-04"].map(read);
const [kr01, kr02] = files;

test("every kit loads: 10-60 parts, every step used, each part has model geometry", () => {
  for (const file of files) {
    const kit = loadKit(file);
    assert.ok(kit.def.parts.length >= 10 && kit.def.parts.length <= 60, `${file.id} parts: ${kit.def.parts.length}`);
    assert.deepEqual([...new Set(kit.def.parts.map((p) => p.step))].sort(), kit.steps.map((s) => s.n));
    const model = JSON.parse(readFileSync(new URL(`../../public${file.model!.split("?")[0]}`, import.meta.url), "utf8"));
    for (const p of Object.values(kit.parts)) assert.ok(model[p.model!]?.main.length || model[p.model!]?.detail.length, `${file.id} ${p.model} has geometry`);
  }
});

test("kits get harder in unlock order: each has more parts than the one before", () => {
  const counts = files.map((f) => f.parts.length);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] > counts[i - 1], `part counts ${counts.join(", ")}`);
});

test("gates sit on the runner's middle bar once the part lies on it", () => {
  for (const file of files) {
  const kit = loadKit(file);
  for (const p of kit.def.parts) {
    const runner = kit.runners.find((r) => r.id === file.parts.find((q) => q.id === p.id)!.runner)!;
    for (const g of p.gates) {
      const [ox, oy, oz] = lyingOffset(g.offset);
      const world = [p.runnerPos[0] + ox, p.runnerPos[1] + oy, p.runnerPos[2] + oz];
      assert.ok(Math.abs(world[1] - RUNNER_BAR_Y) < 1e-9, `${p.id} gate height`);
      // gate midpoint is half a gate length from the bar
      assert.ok(Math.abs(Math.abs(world[2] - runner.center[1]) - GATE_LENGTH / 2) < 1e-9, `${p.id} gate distance`);
    }
  }
  }
});

test("loader rejects broken kits", () => {
  const clone = () => JSON.parse(JSON.stringify(kr01)) as KitFileV1;
  const overlap = clone();
  // two parts in the same runner row, made to share a slot
  const [first, second] = overlap.parts.filter((p) => p.runner === overlap.parts[0].runner && p.row === overlap.parts[0].row);
  second.x = first.x;
  assert.throws(() => loadKit(overlap), /overlaps/);
  const badRunner = clone();
  badRunner.parts[0].runner = "Z";
  assert.throws(() => loadKit(badRunner), /unknown runner/);
  const tooLong = clone();
  tooLong.parts[0].size = [0.4, 3, 0.4];
  assert.throws(() => loadKit(tooLong), /too long/);
  const emptyStep = clone();
  emptyStep.steps.push({ n: 99, title: { id: "x", en: "x" } });
  assert.throws(() => loadKit(emptyStep), /no parts/);
});

test("poses load in radians around assembly-relative pivots, and bad poses are rejected", () => {
  const kit = loadKit(kr02);
  const arm = kit.poses.find((j) => j.id === "arm-l")!;
  const raw = kr02.poses!.find((j) => j.id === "arm-l")!;
  assert.ok(Math.abs(arm.min - (-150 * Math.PI) / 180) < 1e-9);
  assert.deepEqual(arm.pivot, [kr02.assemblyAt[0] + raw.pivot[0], raw.pivot[1], kr02.assemblyAt[1] + raw.pivot[2]]);
  const bad = JSON.parse(JSON.stringify(kr02)) as KitFileV1;
  bad.poses![0].parts = ["nope"];
  assert.throws(() => loadKit(bad), /unknown part/);
});
