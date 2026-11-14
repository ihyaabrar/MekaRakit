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
