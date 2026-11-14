"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { signOut } from "@/app/masuk/actions";
import Wordmark from "./Wordmark";
import ui from "./ui.module.css";

export default function AppHeader({ name }: { name: string }) {
  const t = useTranslations("common");
  const path = usePathname();
  const router = useRouter();
  const link = (href: string, label: string) => (
    <Link href={href} aria-current={path === href ? "page" : undefined}>
      {label}
    </Link>
  );

  async function logout() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className={ui.header}>
      <Wordmark href="/dashboard" />
      <nav className={ui.nav} aria-label={t("nav.main")}>
        {link("/dashboard", t("nav.dashboard"))}
        {link("/pengaturan", t("nav.settings"))}
        <button type="button" onClick={logout}>
          {t("nav.logout")}
        </button>
        <span className={ui.avatar} aria-hidden="true">
          {(name.trim()[0] ?? "?").toUpperCase()}
        </span>
      </nav>
    </header>
  );
}
