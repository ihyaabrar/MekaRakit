import { createNeonAuth } from "@neon/auth/next/server";

// Neon Auth (managed Better Auth). Email + password only, per owner decision: no GitHub/Google.
export const auth = createNeonAuth({
  baseUrl: process.env.DATABASE_URL_NEON_AUTH_BASE_URL!, // set by the Vercel Neon integration
  cookies: { secret: process.env.NEON_AUTH_COOKIE_SECRET! },
});

/** The signed-in player, or throws. Every data query is scoped by this id. */
export async function requireUser(): Promise<{ id: string; name: string }> {
  const { data } = await auth.getSession();
  const id = data?.user?.id;
  if (!id) throw new Error("not signed in");
  return { id: String(id), name: data.user.name ?? "" };
}

export const requireUserId = async () => (await requireUser()).id;
