import { test } from "node:test";
import assert from "node:assert/strict";
import { kitStatus, achievements, emptyProgress, toProgress, type Progress } from "./progress.ts";

const order = ["a", "b", "c"];

test("kits unlock one after another", () => {
  assert.equal(kitStatus(order, emptyProgress, "a"), "new");
  assert.equal(kitStatus(order, emptyProgress, "b"), "locked");
  const p: Progress = { finished: [{ kitId: "a", finishedAt: "2026-11-14", nubsLeft: 2 }], started: ["a", "b"], gatesCut: 9, playSeconds: 0 };
  assert.equal(kitStatus(order, p, "a"), "done");
  assert.equal(kitStatus(order, p, "b"), "in-progress");
  assert.equal(kitStatus(order, p, "c"), "locked");
  assert.equal(kitStatus(order, p, "zzz"), "locked");
});

test("achievements follow tracked facts only", () => {
  assert.deepEqual(achievements(emptyProgress), { "first-cut": false, "first-kit": false, flush: false, "three-kits": false });
  const p: Progress = { finished: [{ kitId: "a", finishedAt: "x", nubsLeft: 0 }], started: ["a"], gatesCut: 1, playSeconds: 0 };
  assert.deepEqual(achievements(p), { "first-cut": true, "first-kit": true, flush: true, "three-kits": false });
});

test("database rows map to progress", () => {
  const p = toProgress([
    { kit_id: "b", gates_cut: 3, finished_at: null, nubs_left: null },
    { kit_id: "a", gates_cut: 7, finished_at: "2026-11-14T10:00:00Z", nubs_left: 0 },
  ]);
  assert.deepEqual(p, { started: ["b", "a"], gatesCut: 10, playSeconds: 0, finished: [{ kitId: "a", finishedAt: "2026-11-14T10:00:00Z", nubsLeft: 0 }] });
  assert.deepEqual(toProgress([]), emptyProgress);
});
