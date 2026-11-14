"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import AppHeader from "@/ui/AppHeader";
import ui from "@/ui/ui.module.css";
import { clearProgress, fetchProfile, saveProfile, type Profile } from "@/game/store";
import { setLocaleCookie } from "@/ui/locale";
import { deleteAccount } from "../akun/actions";
import { useLoad } from "@/ui/useLoad";
import s from "./settings.module.css";

export default function Settings() {
  const t = useTranslations("dashboard");
  const [load, retry] = useLoad(fetchProfile);
  if (load.status === "ready") return <SettingsForm initial={load.data} />;
  return (
    <>
      <AppHeader name="" />
      <main className={s.main}>
        {load.status === "loading" ? (
          <p role="status">{t("loading")}</p>
        ) : (
          <section className={ui.sheet} role="alert">
            <p>{t("loadError")}</p>
            <button className={ui.btn} type="button" onClick={retry}>
              {t("retry")}
            </button>
          </section>
        )}
      </main>
    </>
  );
}

function SettingsForm({ initial }: { initial: Profile }) {
  const t = useTranslations("settings");
  const ta = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const [profile, setProfile] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState(locale === "en" ? "en" : "id");
  const [notice, setNotice] = useState<"" | "saved" | "resetDone" | "saveError">("");

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      await saveProfile(profile);
      setNotice("saved");
    } catch {
      setNotice("saveError");
    } finally {
      setBusy(false);
    }
    if (lang !== locale) {
      setLocaleCookie(lang as "id" | "en");
      router.refresh();
    }
  }

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<"" | "password" | "server">("");
  const [armed, setArmed] = useState(false); // first click arms, second click deletes

  async function removeAccount(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password") ?? "");
    if (!armed) {
      setArmed(true);
      return;
    }
    setDeleting(true);
    setDeleteError("");
    const res = await deleteAccount(password).catch(() => ({ ok: false as const, code: "server" as const }));
    if (res.ok) {
      router.push("/");
      router.refresh();
      return;
    }
    setDeleting(false);
    setArmed(false);
    setDeleteError(res.code ?? "server");
  }

  async function reset() {
    if (!window.confirm(t("resetConfirm"))) return;
    try {
      await clearProgress();
      setNotice("resetDone");
    } catch {
      setNotice("saveError");
    }
  }

  return (
    <>
      <AppHeader name={profile.name} />
      <main className={s.main}>
        <h1 className={s.title}>{t("title")}</h1>
        <form className={`${ui.sheet} ${s.form}`} onSubmit={save}>
          <fieldset>
            <legend>{t("profile")}</legend>
            <div className={s.profileRow}>
              <span className={s.avatar} aria-hidden="true">
                {(profile.name.trim()[0] ?? "?").toUpperCase()}
              </span>
              <div className={s.field}>
                <label htmlFor="name">{ta("name")}</label>
                <input id="name" value={profile.name} maxLength={40} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              </div>
            </div>
            <p className={s.note}>{t("avatarNote")}</p>
          </fieldset>

          <hr className={ui.cut} />

          <fieldset>
            <legend>{t("language")}</legend>
            <div className={s.choices}>
              {(
                [
                  ["id", "Bahasa Indonesia"],
                  ["en", "English"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className={s.choice}>
                  <input type="radio" name="lang" value={value} checked={lang === value} onChange={() => setLang(value)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <hr className={ui.cut} />

          <fieldset>
            <legend>{t("audio")}</legend>
            {(["music", "sfx"] as const).map((k) => (
              <div key={k} className={s.slider}>
                <label htmlFor={k}>{t(k)}</label>
                <input id={k} type="range" min={0} max={100} step={5} value={profile[k]} onChange={(e) => setProfile({ ...profile, [k]: Number(e.target.value) })} />
                <output htmlFor={k}>{profile[k]}%</output>
              </div>
            ))}
            <p className={s.note}>{t("musicNote")}</p>
          </fieldset>

          <div className={s.saveRow}>
            <button className={ui.btn} type="submit" disabled={busy}>
              {busy ? t("saving") : t("save")}
            </button>
            <p className={s.notice} role="status">
              {notice && t(notice)}
            </p>
          </div>
        </form>

        <section className={`${ui.sheet} ${s.account}`} aria-labelledby="account-title">
          <h2 id="account-title">{t("account")}</h2>
          <button className={ui.btnLine} type="button" onClick={reset}>
            {t("resetProgress")}
          </button>
          <form className={s.danger} onSubmit={removeAccount}>
            <h3>{t("deleteAccount")}</h3>
            <p className={s.note}>{t("deleteNote")}</p>
            <label htmlFor="del-pw">{t("deletePassword")}</label>
            <input id="del-pw" name="password" type="password" autoComplete="current-password" />
            {armed && (
              <p className={s.err} role="alert">
                {t("deleteAsk")}
              </p>
            )}
            <button className={s.dangerBtn} type="submit" disabled={deleting}>
              {armed ? t("deleteReally") : t("deleteConfirm")}
            </button>
            {armed && (
              <button className={ui.btnLine} type="button" onClick={() => setArmed(false)}>
                {t("deleteCancel")}
              </button>
            )}
            {deleteError && (
              <p className={s.err} role="alert">
                {t(`deleteError.${deleteError}`)}
              </p>
            )}
          </form>
        </section>
      </main>
    </>
  );
}
