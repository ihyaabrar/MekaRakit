"use server";

import { auth } from "@/lib/auth/server";

export type AuthResult = { ok: true; verifyEmail: boolean } | { ok: false; code: "invalid" | "unconfirmed" | "exists" | "weak" | "server" };

// Auth error codes -> the few messages the form knows how to explain.
// The Neon server SDK returns snake_case codes (invalid_credentials); the raw API returns Better Auth codes.
function classify(code: string | undefined): Exclude<AuthResult, { ok: true }>["code"] {
  const c = (code ?? "").toUpperCase();
  if (["INVALID_CREDENTIALS", "INVALID_EMAIL_OR_PASSWORD", "INVALID_PASSWORD", "USER_NOT_FOUND"].some((k) => c.includes(k))) return "invalid";
  if (c.includes("EMAIL_NOT_VERIFIED") || c.includes("EMAIL_NOT_CONFIRMED")) return "unconfirmed";
  if (c.includes("ALREADY_EXISTS")) return "exists";
  if (c.includes("PASSWORD_TOO_SHORT") || c.includes("PASSWORD_TOO_LONG") || c.includes("WEAK_PASSWORD")) return "weak";
  return "server";
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const { error } = await auth.signIn.email({ email, password });
    if (error) return { ok: false, code: classify(error.code) };
    return { ok: true, verifyEmail: false };
  } catch (e) {
    console.error(e);
    return { ok: false, code: "server" };
  }
}

export async function signUp(name: string, email: string, password: string): Promise<AuthResult> {
  try {
    const { data, error } = await auth.signUp.email({ name: name.trim().slice(0, 40), email, password });
    if (error) return { ok: false, code: classify(error.code) };
    // no session token back = the project requires email verification first
    const token = (data as { token?: string | null } | null)?.token;
    return { ok: true, verifyEmail: !token };
  } catch (e) {
    console.error(e);
    return { ok: false, code: "server" };
  }
}

export async function signOut() {
  await auth.signOut();
}
