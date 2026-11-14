// Player progress rules. Pure: no React, no network (storage lives in store.ts).

export type Finished = { kitId: string; finishedAt: string; nubsLeft: number };
export type Progress = { finished: Finished[]; started: string[]; gatesCut: number; playSeconds: number };
export type KitStatus = "locked" | "new" | "in-progress" | "done";

export const emptyProgress: Progress = { finished: [], started: [], gatesCut: 0, playSeconds: 0 };

/** Kits unlock in catalog order: the next one opens once the previous one is finished. */
export function kitStatus(order: string[], p: Progress, kitId: string): KitStatus {
  const i = order.indexOf(kitId);
  if (i < 0) return "locked";
  const done = (id: string) => p.finished.some((f) => f.kitId === id);
  if (done(kitId)) return "done";
  if (i > 0 && !done(order[i - 1])) return "locked";
  return p.started.includes(kitId) ? "in-progress" : "new";
}

export type AchievementId = "first-cut" | "first-kit" | "flush" | "three-kits";

/** Proposed MVP achievements (pending owner approval). Only facts the game already tracks. */
export function achievements(p: Progress): Record<AchievementId, boolean> {
  return {
    "first-cut": p.gatesCut > 0,
    "first-kit": p.finished.length > 0,
    flush: p.finished.some((f) => f.nubsLeft === 0),
    "three-kits": new Set(p.finished.map((f) => f.kitId)).size >= 3,
  };
}

export type KitRun = { kit_id: string; gates_cut: number; finished_at: string | null; nubs_left: number | null; play_seconds?: number };

export function toProgress(runs: KitRun[]): Progress {
  return {
    started: runs.map((r) => r.kit_id),
    gatesCut: runs.reduce((n, r) => n + r.gates_cut, 0),
    playSeconds: runs.reduce((n, r) => n + (r.play_seconds ?? 0), 0),
    finished: runs
      .filter((r) => r.finished_at)
      .map((r) => ({ kitId: r.kit_id, finishedAt: r.finished_at!, nubsLeft: r.nubs_left ?? 0 }))
      .sort((a, b) => a.finishedAt.localeCompare(b.finishedAt)),
  };
}
