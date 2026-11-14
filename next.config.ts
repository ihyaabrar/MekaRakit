import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // dev logs print server action arguments; sign-in actions carry passwords
  logging: { serverFunctions: false },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
