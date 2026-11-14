"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Wordmark from "@/ui/Wordmark";
import ui from "@/ui/ui.module.css";
import { signIn, signUp, type AuthResult } from "./actions";
import s from "./auth.module.css";

type Mode = "login" | "register";
type Field = "name" | "email" | "password";
type Errors = Partial<Record<Field, string>>;

export default function AuthForm() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get("mode") === "daftar" ? "register" : "login");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  // one message line under the form: server errors and the "check your email" notice
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    const next: Errors = {};
    if (mode === "register" && !name) next.name = t("errors.name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = t("errors.email");
    if (password.length < 8) next.password = t("errors.password");
    setErrors(next);
    setMessage(null);
    if (Object.keys(next).length) return;

    setBusy(true);
    let res: AuthResult;
    try {
      res = mode === "login" ? await signIn(email, password) : await signUp(name, email, password);
    } catch {
      // the server action itself could not be reached (offline, deploy in progress): keep the form usable
      setBusy(false);
      setMessage({ kind: "error", text: t("errors.server") });
      return;
    }
    if (!res.ok) {
      setBusy(false);
      setMessage({ kind: "error", text: t(`errors.${res.code}`) });
      return;
    }
    if (res.verifyEmail) {
      setBusy(false);
      setMessage({ kind: "info", text: t("checkEmail", { email }) });
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  const field = (id: Field, type: string, auto: string, extra?: { ph?: string; hint?: string }) => (
    <div className={s.field}>
      <label htmlFor={id}>{t(id)}</label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={auto}
        placeholder={extra?.ph}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={errors[id] ? `${id}-err` : extra?.hint ? `${id}-hint` : undefined}
      />
      {errors[id] ? (
        <p id={`${id}-err`} className={s.err}>
          {errors[id]}
        </p>
      ) : (
        extra?.hint && (
          <p id={`${id}-hint`} className={s.hint}>
            {extra.hint}
          </p>
        )
      )}
    </div>
  );

  return (
    <div className={s.page}>
      <header className={ui.header}>
        <Wordmark />
      </header>
      <main className={s.main}>
        <section className={`${ui.sheet} ${s.card}`} aria-labelledby="auth-title">
          <h1 id="auth-title">{t("title")}</h1>

          <div className={s.tabs} role="group" aria-label={t("title")}>
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setErrors({});
                  setMessage(null);
                }}
              >
                {t(`tabs.${m}`)}
              </button>
            ))}
          </div>

          <form onSubmit={submit} noValidate>
            {mode === "register" && field("name", "text", "nickname", { ph: t("namePh") })}
            {field("email", "email", "email", { ph: t("emailPh") })}
            {field("password", "password", mode === "login" ? "current-password" : "new-password", { hint: t("passwordHint") })}
            <button className={`${ui.btn} ${s.submit}`} type="submit" disabled={busy}>
              {busy ? t("opening") : mode === "login" ? t("submitLogin") : t("submitRegister")}
            </button>
            <p className={message?.kind === "error" ? s.formErr : s.formInfo} role={message?.kind === "error" ? "alert" : "status"}>
              {message?.text}
            </p>
          </form>

          {/* TODO: password reset needs its own "set new password" page; labelled until built */}
          {mode === "login" && (
            <p className={s.forgot}>
              {t("forgot")} ({tc("soon")})
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
