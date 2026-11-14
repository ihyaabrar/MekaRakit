"use server";

import { headers } from "next/headers";
import { auth, requireUser } from "@/lib/auth/server";
import { sql } from "@/lib/db";

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Always answers the same way, so the form never reveals whether an email is registered. */
export async function requestReset(email: string): Promise<{ ok: true }> {
  const clean = String(email ?? "").trim().slice(0, 200);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    try {
      await auth.requestPasswordReset({ email: clean, redirectTo: `${await origin()}/atur-password` });
    } catch (e) {
      console.error(e);
    }
  }
  return { ok: true };
}

export async function resetPassword(token: string, newPassword: string): Promise<{ ok: boolean; code?: "weak" | "expired" }> {
  if (String(newPassword ?? "").length < 8) return { ok: false, code: "weak" };
  try {
    const { error } = await auth.resetPassword({ token: String(token ?? ""), newPassword });
    return error ? { ok: false, code: "expired" } : { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, code: "expired" };
  }
}

/** Deletes the signed-in player: game data first, then the login. The current password confirms it is really them. */
export async function deleteAccount(password: string): Promise<{ ok: boolean; code?: "password" | "server" }> {
  const me = await requireUser();
  const { data: session } = await auth.getSession();
  const email = session?.user?.email;
  if (!email) return { ok: false, code: "server" };
  const check = await auth.signIn.email({ email, password: String(password ?? "") });
  if (check.error) return { ok: false, code: "password" };
  try {
    // one transaction: either the game data and the login all go, or nothing does (so the player can retry)
    const db = sql();
    await db.transaction([
      db`delete from photos where user_id = ${me.id}`,
      db`delete from kit_runs where user_id = ${me.id}`,
      db`delete from profiles where user_id = ${me.id}`,
      db`delete from neon_auth.session where "userId"::text = ${me.id}`,
      db`delete from neon_auth.account where "userId"::text = ${me.id}`,
      db`delete from neon_auth."user" where id::text = ${me.id}`,
    ]);
    await auth.signOut().catch(() => {});
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, code: "server" };
  }
}
