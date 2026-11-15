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
  const rows = await sql()`select kit_id, gates_cut, finished_at, nubs_left, play_seconds from kit_runs where user_id = ${uid}`;
  return toProgress(
    rows.map((r) => ({
      kit_id: r.kit_id,
      gates_cut: r.gates_cut,
      finished_at: r.finished_at ? new Date(r.finished_at).toISOString() : null,
      nubs_left: r.nubs_left,
      play_seconds: r.play_seconds,
    })) as KitRun[],
  );
}

/** The saved bench for one kit, or null when the player has not started it (or it no longer fits the kit). */
export async function fetchRun(kitId: string): Promise<RunSnapshot | null> {
  const kit = findKit(kitId)?.kit?.def;
  if (!kit) return null;
  const uid = await requireUserId();
  const rows = await sql()`select snapshot, play_seconds from kit_runs where user_id = ${uid} and kit_id = ${kitId}`;
  const run = rows[0] ? restoreRun(kit, rows[0].snapshot) : null;
  // the row keeps the highest play time ever saved; a later, staler snapshot must not lower it
  return run ? { ...run, playSeconds: Math.max(run.playSeconds ?? 0, Number(rows[0].play_seconds) || 0) } : null;
}

/**
 * Stores the whole bench. Idempotent (same snapshot = same row), so the client can retry freely.
 * Totals are derived here from the snapshot, never sent as increments, so a lost save cannot skew them.
 */
export async function saveRun(kitId: string, snapshot: RunSnapshot): Promise<{ ok: true } | { ok: false; code: "stale" }> {
  const kit = findKit(kitId)?.kit?.def;
  if (!kit) throw new Error("unknown kit");
  // the bench names the layout it was built for; a tab opened before a kit update must not save old progress
  if (kit.rev && snapshot?.kit !== kit.rev) return { ok: false, code: "stale" };
  const run = restoreRun(kit, snapshot);
  if (!run) throw new Error("snapshot does not fit kit");
  const { gatesCut, nubsLeft, complete } = runSummary(kit, run.state);
  const uid = await requireUserId();
  await sql()`insert into kit_runs (user_id, kit_id, gates_cut, snapshot, finished_at, nubs_left, play_seconds)
              values (${uid}, ${kitId}, ${gatesCut}, ${JSON.stringify(run)}::jsonb, ${complete ? new Date().toISOString() : null}, ${complete ? nubsLeft : null}, ${run.playSeconds ?? 0})
              on conflict (user_id, kit_id) do update set
                gates_cut = excluded.gates_cut,
                play_seconds = greatest(kit_runs.play_seconds, excluded.play_seconds),
                snapshot = excluded.snapshot,
                finished_at = coalesce(kit_runs.finished_at, excluded.finished_at),
                nubs_left = coalesce(excluded.nubs_left, kit_runs.nubs_left)`;
  return { ok: true };
}

export async function clearProgress() {
  const uid = await requireUserId();
  const db = sql();
  await db.transaction([db`delete from kit_runs where user_id = ${uid}`, db`delete from photos where user_id = ${uid}`]);
}

const MAX_PHOTOS = 30;
const MAX_PHOTO_CHARS = 700_000;

/** Stores a JPEG of a finished model; keeps the newest MAX_PHOTOS per player. */
export async function savePhoto(kitId: string, dataUrl: string) {
  if (!findKit(kitId)?.kit) throw new Error("unknown kit");
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/jpeg;base64,") || dataUrl.length > MAX_PHOTO_CHARS) throw new Error("bad photo");
  const uid = await requireUserId();
  const db = sql();
  await db`insert into photos (user_id, kit_id, image) values (${uid}, ${kitId}, ${dataUrl})`;
  await db`delete from photos where user_id = ${uid} and id not in (select id from photos where user_id = ${uid} order by created_at desc limit ${MAX_PHOTOS})`;
}

/** Newest photo per kit, for the display shelf. */
export async function fetchShelfPhotos(): Promise<Record<string, string>> {
  const uid = await requireUserId();
  const rows = await sql()`select distinct on (kit_id) kit_id, image from photos where user_id = ${uid} order by kit_id, created_at desc`;
  return Object.fromEntries(rows.map((r) => [r.kit_id, r.image]));
}
