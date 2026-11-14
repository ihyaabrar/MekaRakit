// Run: npm test  (Node 24 strips TS types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import { initState, cutGate, rubNub, checkDrop, placePart, isComplete, type KitDef } from "./logic.ts";

const kit: KitDef = {
  id: "t",
  name: "t",
  parts: [
    { id: "a", name: "A", color: "#fff", size: [1, 1, 1], runnerPos: [0, 0, 0], gates: [{ id: "g1", offset: [0, 0, 0] }, { id: "g2", offset: [0, 0, 0] }], target: [0, 0, 0], step: 1 },
    { id: "b", name: "B", color: "#fff", size: [1, 1, 1], runnerPos: [0, 0, 0], gates: [{ id: "g1", offset: [0, 0, 0] }], target: [0, 2, 0], step: 2 },
  ],
};

test("part frees only after every gate is cut, cutting twice is a no-op", () => {
  let s = initState(kit);
  s = cutGate(kit, s, "a", "g1");
  assert.equal(s.parts.a.status, "runner");
  assert.equal(cutGate(kit, s, "a", "g1"), s);
  s = cutGate(kit, s, "a", "g2");
  assert.equal(s.parts.a.status, "free");
  assert.deepEqual(s.parts.a.nubs, { g1: 1, g2: 1 });
});

test("rubbing lowers a nub to zero and no further", () => {
  let s = cutGate(kit, initState(kit), "b", "g1");
  s = rubNub(s, "b", "g1", 100);
  assert.ok(Math.abs(s.parts.b.nubs.g1 - 0.6) < 1e-9);
  s = rubNub(s, "b", "g1", 10_000);
  assert.equal(s.parts.b.nubs.g1, 0);
  assert.equal(rubNub(s, "b", "g1", 50), s);
});

test("drop rules: snap, wrong step, wrong spot, step advance, completion", () => {
  let s = initState(kit);
  s = cutGate(kit, cutGate(kit, s, "a", "g1"), "a", "g2");
  s = cutGate(kit, s, "b", "g1");
  assert.deepEqual(checkDrop(kit, s, "b", [0, 2, 0]), { kind: "wrong-step" });
  assert.deepEqual(checkDrop(kit, s, "b", [0, 0.1, 0]), { kind: "wrong-spot", spotOf: "a" });
  assert.deepEqual(checkDrop(kit, s, "a", [5, 5, 5]), { kind: "none" });
  assert.deepEqual(checkDrop(kit, s, "a", [0.2, 0, 0]), { kind: "snap" });
  s = placePart(kit, s, "a");
  assert.equal(s.step, 2);
  assert.deepEqual(checkDrop(kit, s, "b", [0, 2, 0]), { kind: "snap" });
  s = placePart(kit, s, "b");
  assert.ok(isComplete(kit, s));
});

test("saved runs restore exactly and reject snapshots that do not fit the kit", async () => {
  const { restoreRun, runSummary } = await import("./logic.ts");
  let s = cutGate(kit, initState(kit), "a", "g1");
  s = cutGate(kit, s, "a", "g2");
  s = rubNub(s, "a", "g1", 10_000);
  const snap = { state: s, pos: { a: [9, 9, 9], b: [1, 2, 3] } };
  const back = restoreRun(kit, JSON.parse(JSON.stringify(snap)));
  assert.deepEqual(back?.state, s);
  assert.deepEqual(back?.pos.a, [9, 9, 9]); // free part keeps where it lay
  assert.deepEqual(back?.pos.b, kit.parts[1].runnerPos); // runner part snaps back to its slot
  assert.deepEqual(runSummary(kit, s), { gatesCut: 2, nubsLeft: 1, complete: false });

  assert.equal(restoreRun(kit, null), null);
  assert.equal(restoreRun(kit, { ...snap, state: { ...s, step: 0 } }), null);
  assert.equal(restoreRun(kit, { ...snap, pos: { a: [1, 2] } }), null);
  const badGate = JSON.parse(JSON.stringify(snap));
  badGate.state.parts.b.cut = ["nope"];
  assert.equal(restoreRun(kit, badGate), null);
});

test("magnet pulls a free part toward its allowed spot, harder when closer", async () => {
  const { magnetPull, pageForDrop, MAGNET_DIST } = await import("./logic.ts");
  let s = cutGate(kit, cutGate(kit, initState(kit), "a", "g1"), "a", "g2");
  // part a, target [0,0,0], step 1
  const far: [number, number, number] = [MAGNET_DIST + 0.5, 0, 0];
  assert.deepEqual(magnetPull(kit, s, "a", far), far);
  const near = magnetPull(kit, s, "a", [0.5, 0, 0]);
  assert.ok(Math.abs(near[0] - 0.25) < 1e-9, `pulled to ${near[0]}`);
  // still on the runner, or a later step: no pull
  assert.deepEqual(magnetPull(kit, initState(kit), "a", [0.5, 0, 0]), [0.5, 0, 0]);
  s = cutGate(kit, s, "b", "g1");
  assert.deepEqual(magnetPull(kit, s, "b", [0, 2.2, 0]), [0, 2.2, 0]);
  assert.equal(pageForDrop(kit, s, { kind: "wrong-step" }), 1);
  assert.equal(pageForDrop(kit, s, { kind: "wrong-spot", spotOf: "b" }), 2);
  assert.equal(pageForDrop(kit, s, { kind: "none" }), null);
});
