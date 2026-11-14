// Language choice lives in a cookie the server reads (src/i18n/request.ts).
export function setLocaleCookie(locale: "id" | "en") {
  document.cookie = `locale=${locale}; path=/; max-age=31536000; samesite=lax`;
}
