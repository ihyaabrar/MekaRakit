"use server";

// Everything the game stores, as server actions on Neon Postgres. Tables: profiles, kit_runs.
// Every query is scoped to the signed-in player's id from the session; the browser never sees DATABASE_URL.
import { requireUser, requireUserId } from "@/lib/auth/server";
import { sql } from "@/lib/db";
import { toProgress, type KitRun, type Progress } from "./progress";
import { restoreRun, runSummary, type RunSnapshot } from "./logic";
import { findKit } from "./kits";

export type Profile = { name: string; music: number; sfx: number }; // volumes 0..100

const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(Number(n) || 0)));

export async function fetchProfile(): Promise<Profile> {
  const { id: uid, name } = await requireUser();
  const db = sql();
  // first visit creates the row with the name given at sign-up
  await db`insert into profiles (user_id, display_name) values (${uid}, ${name.slice(0, 40)}) on conflict (user_id) do nothing`;
  const rows = await db`select display_name, music, sfx from profiles where user_id = ${uid}`;
  const r = rows[0];
  return r ? { name: r.display_name, music: r.music, sfx: r.sfx } : { name: "", music: 50, sfx: 70 };
}

export async function saveProfile(p: Profile) {
  const uid = await requireUserId();
  const name = String(p.name ?? "").trim().slice(0, 40);
  await sql()`insert into profiles (user_id, display_name, music, sfx) values (${uid}, ${name}, ${clamp(p.music)}, ${clamp(p.sfx)})
              on conflict (user_id) do update set display_name = excluded.display_name, music = excluded.music, sfx = excluded.sfx`;
}

export async function fetchProgress(): Promise<Progress> {
  const uid = await requireUserId();
  const rows = await sql()`select kit_id, gates_cut, finished_at, nubs_left from kit_runs where user_id = ${uid}`;
  return toProgress(
    rows.map((r) => ({
      kit_id: r.kit_id,
      gates_cut: r.gates_cut,
      finished_at: r.finished_at ? new Date(r.finished_at).toISOString() : null,
      nubs_left: r.nubs_left,
    })) as KitRun[],
  );
}

/** The saved bench for one kit, or null when the player has not started it (or it no longer fits the kit). */
export async function fetchRun(kitId: string): Promise<RunSnapshot | null> {
  const kit = findKit(kitId)?.kit;
  if (!kit) return null;
  const uid = await requireUserId();
  const rows = await sql()`select snapshot from kit_runs where user_id = ${uid} and kit_id = ${kitId}`;
  return rows[0] ? restoreRun(kit, rows[0].snapshot) : null;
}

/**
 * Stores the whole bench. Idempotent (same snapshot = same row), so the client can retry freely.
 * Totals are derived here from the snapshot, never sent as increments, so a lost save cannot skew them.
 */
export async function saveRun(kitId: string, snapshot: RunSnapshot) {
  const kit = findKit(kitId)?.kit;
  if (!kit) throw new Error("unknown kit");
  const run = restoreRun(kit, snapshot);
  if (!run) throw new Error("snapshot does not fit kit");
  const { gatesCut, nubsLeft, complete } = runSummary(kit, run.state);
  const uid = await requireUserId();
  await sql()`insert into kit_runs (user_id, kit_id, gates_cut, snapshot, finished_at, nubs_left)
              values (${uid}, ${kitId}, ${gatesCut}, ${JSON.stringify(run)}::jsonb, ${complete ? new Date().toISOString() : null}, ${complete ? nubsLeft : null})
              on conflict (user_id, kit_id) do update set
                gates_cut = excluded.gates_cut,
                snapshot = excluded.snapshot,
                finished_at = coalesce(kit_runs.finished_at, excluded.finished_at),
                nubs_left = coalesce(excluded.nubs_left, kit_runs.nubs_left)`;
}

export async function clearProgress() {
  const uid = await requireUserId();
  await sql()`delete from kit_runs where user_id = ${uid}`;
}
