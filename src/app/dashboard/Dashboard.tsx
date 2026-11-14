"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import AppHeader from "@/ui/AppHeader";
import KitArt from "@/ui/KitArt";
import ui from "@/ui/ui.module.css";
import { catalog, type KitEntry } from "@/game/kits";
import { achievements, kitStatus, type AchievementId } from "@/game/progress";
import { fetchProfile, fetchProgress } from "@/game/store";
import { useLoad } from "@/ui/useLoad";
import s from "./dashboard.module.css";

const order = catalog.map((k) => k.id);
const variantOf = (k: KitEntry) => order.indexOf(k.id) + 1;
const loadAll = () => Promise.all([fetchProfile(), fetchProgress()]);

export default function Dashboard() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const tk = useTranslations("kits");
  const format = useFormatter();
  const [load, retry] = useLoad(loadAll);

  if (load.status !== "ready") {
    return (
      <>
        <AppHeader name="" />
        <main className={s.main}>
          {load.status === "loading" ? (
            <p className={s.loading} role="status">
              {t("loading")}
            </p>
          ) : (
            <section className={`${ui.sheet} ${s.errorBox}`} role="alert">
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

  const [profile, progress] = load.data;
  const rows = catalog.map((k) => ({ k, status: kitStatus(order, progress, k.id) }));
  const next = rows.find((r) => r.status === "new" || r.status === "in-progress");
  const ach = achievements(progress);
  const name = profile.name || t("anon");

  return (
    <>
      <AppHeader name={profile.name} />
      <main className={s.main}>
        <h1 className={s.greeting}>{t("greeting", { name })}</h1>

        <div className={s.top}>
          {/* focal point: the box the player should open next */}
          <section className={`${ui.sheet} ${s.next}`} aria-labelledby="next-title">
            {next ? (
              <>
                <div className={s.nextArt}>
                  <KitArt body={next.k.colors.body} trim={next.k.colors.trim} variant={variantOf(next.k)} label={tk(`${next.k.id}.name`)} size={150} />
                </div>
                <div className={s.nextBody}>
                  <h2 id="next-title" className={s.kicker}>
                    {t("next")}
                  </h2>
                  <p className={s.nextName}>
                    <span className={ui.code}>{next.k.code}</span> {tk(`${next.k.id}.name`)}
                  </p>
                  <p>{tk(`${next.k.id}.blurb`)}</p>
                  <p className={s.meta}>
                    {tc(`levels.${next.k.level}`)} · <span className={ui.status} data-status={next.status}>{tc(`status.${next.status}`)}</span>
                  </p>
                  {next.k.kit ? (
                    <Link className={ui.btn} href={`/rakit/${next.k.id}`}>
                      {next.status === "in-progress" ? t("continue") : t("open")}
                    </Link>
                  ) : (
                    <p className={s.note}>{t("notDesigned")}</p>
                  )}
                </div>
              </>
            ) : (
              <h2 id="next-title" className={s.allDone}>
                {t("allDone")}
              </h2>
            )}
          </section>

          <section className={`${ui.sheet} ${s.notes}`} aria-labelledby="notes-title">
            <h2 id="notes-title">{t("notes")}</h2>
            <dl className={s.counts}>
              <div>
                <dt>{t("kitsDone")}</dt>
                <dd>{progress.finished.length}</dd>
              </div>
              <div>
                <dt>{t("gatesCut")}</dt>
                <dd>{progress.gatesCut}</dd>
              </div>
            </dl>
            <hr className={ui.cut} />
            <h3>{t("achievements")}</h3>
            <p className={s.note}>{t("achievementsNote")}</p>
            <ul className={s.ach}>
              {(Object.keys(ach) as AchievementId[]).map((id) => (
                <li key={id} data-on={ach[id] || undefined}>
                  <span className={s.achMark} aria-hidden="true">
                    {ach[id] ? "✓" : ""}
                  </span>
                  <span>
                    <strong>{t(`ach.${id}.t`)}</strong>
                    <span className="visually-hidden"> ({ach[id] ? t("unlocked") : t("lockedAch")})</span>
                    <br />
                    {t(`ach.${id}.d`)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className={s.shelfWrap} aria-labelledby="shelf-title">
          <h2 id="shelf-title">{t("shelf")}</h2>
          {progress.finished.length === 0 ? (
            <p className={s.shelfEmpty}>{t("shelfEmpty", { kit: `${catalog[0].code} ${tk(`${catalog[0].id}.name`)}` })}</p>
          ) : (
            <ul className={s.shelf}>
              {progress.finished.map((f) => {
                const k = catalog.find((c) => c.id === f.kitId);
                if (!k) return null;
                return (
                  <li key={f.kitId}>
                    <KitArt body={k.colors.body} trim={k.colors.trim} variant={variantOf(k)} label={tk(`${k.id}.name`)} size={84} />
                    <p>
                      <span className={ui.code}>{k.code}</span> {tk(`${k.id}.name`)}
                    </p>
                    <p className={s.small}>{t("finishedOn", { date: format.dateTime(new Date(f.finishedAt), { dateStyle: "medium" }) })}</p>
                    <p className={s.small}>{t("nubs", { n: f.nubsLeft })}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={`${ui.sheet} ${s.kits}`} aria-labelledby="kits-title">
          <h2 id="kits-title">{t("kits")}</h2>
          <ol className={s.kitList}>
            {rows.map(({ k, status }, i) => (
              <li key={k.id} data-status={status}>
                <span className={ui.stepNo}>{i + 1}</span>
                <div className={s.kitInfo}>
                  <p className={s.kitName}>
                    <span className={ui.code}>{k.code}</span> {tk(`${k.id}.name`)}
                  </p>
                  <p className={s.small}>
                    {tc(`levels.${k.level}`)} · {status === "locked" ? t("lockedHint", { code: catalog[i - 1]?.code ?? "" }) : k.kit ? tk(`${k.id}.blurb`) : t("notDesigned")}
                  </p>
                </div>
                <span className={ui.status} data-status={status}>
                  {tc(`status.${status}`)}
                </span>
                {status !== "locked" && k.kit && (
                  <Link className={s.rowLink} href={`/rakit/${k.id}`} aria-label={`${k.code} ${tk(`${k.id}.name`)}`}>
                    {status === "in-progress" ? t("continue") : t("open")}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
