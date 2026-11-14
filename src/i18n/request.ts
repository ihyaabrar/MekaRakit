import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

export const locales = ["id", "en"] as const;
export type Locale = (typeof locales)[number];

// Locale comes from a cookie (set from settings later), not the URL.
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get("locale")?.value;
  const locale: Locale = locales.includes(fromCookie as Locale) ? (fromCookie as Locale) : "id";
  return { locale, messages: (await import(`../../messages/${locale}.json`)).default };
});
