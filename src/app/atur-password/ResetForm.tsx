"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Wordmark from "@/ui/Wordmark";
import ui from "@/ui/ui.module.css";
import s from "../masuk/auth.module.css";
import { resetPassword } from "../akun/actions";

export default function ResetForm() {
  const t = useTranslations("account");
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"idle" | "busy" | "done" | "weak" | "expired">(token ? "idle" : "expired");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pw = String(new FormData(e.currentTarget).get("password") ?? "");
    if (pw.length < 8) return setState("weak");
    setState("busy");
    const res = await resetPassword(token, pw).catch(() => ({ ok: false as const, code: "expired" as const }));
    setState(res.ok ? "done" : (res.code ?? "expired"));
  }

  return (
    <div className={s.page}>
      <header className={ui.header}>
        <Wordmark />
      </header>
      <main className={s.main}>
        <section className={`${ui.sheet} ${s.card}`} aria-labelledby="reset-title">
          <h1 id="reset-title">{t("resetTitle")}</h1>
          {state === "done" ? (
            <>
              <p role="status">{t("resetDone")}</p>
              <Link className={`${ui.btn} ${s.submit}`} href="/masuk">
                {t("backToLogin")}
              </Link>
            </>
          ) : (
            <form onSubmit={submit} noValidate>
              <div className={s.field}>
                <label htmlFor="password">{t("newPassword")}</label>
                <input id="password" name="password" type="password" autoComplete="new-password" aria-describedby="pw-hint" />
                <p id="pw-hint" className={state === "weak" ? s.err : s.hint}>
                  {t("passwordHint")}
                </p>
              </div>
              <button className={`${ui.btn} ${s.submit}`} type="submit" disabled={state === "busy" || !token}>
                {t("savePassword")}
              </button>
              {state === "expired" && (
                <p className={s.formErr} role="alert">
                  {t("expired")} <Link href="/lupa-password">{t("askAgain")}</Link>
                </p>
              )}
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
