import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { readdirSync, readFileSync } from "node:fs";

// box-art URLs carry a ?v= content hash (scripts/build-mech-kit.mjs); next/image only optimizes local images whose
// query string is listed exactly, so allow each kit's current one and nothing else
const artPatterns = readdirSync("kits").flatMap((id) => {
  const art: string | undefined = JSON.parse(readFileSync(`kits/${id}/kit.json`, "utf8")).art;
  if (!art) return [];
  const [pathname, query] = art.split("?");
  return [{ pathname, search: `?${query}` }];
});

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // dev logs print server action arguments; sign-in actions carry passwords
  logging: { serverFunctions: false },
  images: { localPatterns: artPatterns },
  // kit geometry, box art and desk props: let browsers reuse them between visits instead of revalidating every
  // load; an hour fresh plus a day of background refresh keeps a rebuilt kit from lingering long
  async headers() {
    const cache = [{ key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }];
    return [
      { source: "/models/:path*", headers: cache },
      { source: "/art/:path*", headers: cache },
    ];
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
