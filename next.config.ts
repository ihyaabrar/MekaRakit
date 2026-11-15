import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // dev logs print server action arguments; sign-in actions carry passwords
  logging: { serverFunctions: false },
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
