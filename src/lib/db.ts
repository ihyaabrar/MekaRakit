import { neon } from "@neondatabase/serverless";

// Server-only: DATABASE_URL never reaches the browser (no NEXT_PUBLIC_ prefix).
// Created per call so a build without the env var does not fail at import time.
// env names come from the Vercel Neon integration (prefix DATABASE_URL_)
export const sql = () => neon(process.env.DATABASE_URL_DATABASE_URL!);
