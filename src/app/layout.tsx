import type { Metadata } from "next";
import { Big_Shoulders, Figtree } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";

// Big Shoulders: condensed, industrial headings like kit box and manual titles. Figtree: friendly, very readable body text.
const display = Big_Shoulders({ subsets: ["latin"], variable: "--font-big-shoulders", weight: ["700", "800", "900"] });
const body = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

// locale is read from a cookie on every request, so the root layout may block
export const instant = false;

export const metadata: Metadata = {
  title: "MekaRakit",
  description: "Rakit mecha model kit di browser: potong, haluskan, rakit, pajang.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${display.variable} ${body.variable}`}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
