import { auth } from "@/lib/auth/server";

// Neon Auth API proxy: sign in/up, session, email verification, password reset.
export const { GET, POST, PUT, PATCH, DELETE } = auth.handler();
