import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadKit, lyingOffset, GATE_LENGTH, RUNNER_BAR_Y, type KitFileV1 } from "./kitFormat.ts";

const kr01 = JSON.parse(readFileSync(new URL("../../kits/kr-01/kit.json", import.meta.url), "utf8")) as KitFileV1;

test("KR-01 loads: 20-30 parts, every step used, ids unique", () => {
  const kit = loadKit(kr01);
  assert.ok(kit.def.parts.length >= 20 && kit.def.parts.length <= 30, `parts: ${kit.def.parts.length}`);
  assert.deepEqual([...new Set(kit.def.parts.map((p) => p.step))].sort(), kit.steps.map((s) => s.n));
});

test("gates sit on the runner's middle bar once the part lies on it", () => {
  const kit = loadKit(kr01);
  for (const p of kit.def.parts) {
    const runner = kit.runners.find((r) => r.id === kr01.parts.find((q) => q.id === p.id)!.runner)!;
    for (const g of p.gates) {
      const [ox, oy, oz] = lyingOffset(g.offset);
      const world = [p.runnerPos[0] + ox, p.runnerPos[1] + oy, p.runnerPos[2] + oz];
      assert.ok(Math.abs(world[1] - RUNNER_BAR_Y) < 1e-9, `${p.id} gate height`);
      // gate midpoint is half a gate length from the bar
      assert.ok(Math.abs(Math.abs(world[2] - runner.center[1]) - GATE_LENGTH / 2) < 1e-9, `${p.id} gate distance`);
    }
  }
});

test("loader rejects broken kits", () => {
  const clone = () => JSON.parse(JSON.stringify(kr01)) as KitFileV1;
  const overlap = clone();
  overlap.parts[1].x = overlap.parts[0].x;
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
