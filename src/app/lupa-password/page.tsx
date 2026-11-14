"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import Wordmark from "@/ui/Wordmark";
import ui from "@/ui/ui.module.css";
import s from "../masuk/auth.module.css";
import { requestReset } from "../akun/actions";

export default function ForgotPasswordPage() {
  const t = useTranslations("account");
  const [state, setState] = useState<"idle" | "busy" | "sent" | "error">("idle");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    setState("busy");
    try {
      await requestReset(email);
      setState("sent");
    } catch {
      setState("error");
    }
  }

  return (
    <div className={s.page}>
      <header className={ui.header}>
        <Wordmark />
      </header>
      <main className={s.main}>
        <section className={`${ui.sheet} ${s.card}`} aria-labelledby="forgot-title">
          <h1 id="forgot-title">{t("forgotTitle")}</h1>
          <p>{t("forgotLead")}</p>
          <form onSubmit={submit}>
            <div className={s.field}>
              <label htmlFor="email">{t("email")}</label>
              <input id="email" name="email" type="email" autoComplete="email" placeholder="email@contoh.com" required />
            </div>
            <button className={`${ui.btn} ${s.submit}`} type="submit" disabled={state === "busy"}>
              {state === "busy" ? t("sending") : t("sendLink")}
            </button>
            <p className={state === "error" ? s.formErr : s.formInfo} role={state === "error" ? "alert" : "status"}>
              {state === "sent" ? t("sent") : state === "error" ? t("error") : ""}
            </p>
          </form>
          <p className={s.forgot}>
            <Link href="/masuk">{t("backToLogin")}</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
