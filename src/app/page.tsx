import Link from "next/link";
import { useTranslations } from "next-intl";
import Wordmark from "@/ui/Wordmark";
import KitArt from "@/ui/KitArt";
import ui from "@/ui/ui.module.css";
import { catalog } from "@/game/kits";
import s from "./landing.module.css";

const STEPS = ["1", "2", "3", "4", "5", "6"] as const;
const PLAYABLE = new Set(["1", "2", "3", "4"]); // paint and pose are not built yet

export default function Landing() {
  const t = useTranslations("landing");
  const tc = useTranslations("common");
  const tk = useTranslations("kits");
  const first = catalog[0];
  return (
    <div className={s.page}>
      <header className={ui.header}>
        <Wordmark />
        <nav className={ui.nav} aria-label={tc("nav.main")}>
          <Link href="/masuk">{t("login")}</Link>
        </nav>
      </header>

      <main className={s.main}>
        <section className={s.hero}>
          <div className={s.copy}>
            <h1>{t("title")}</h1>
            <p className={s.lead}>{t("lead")}</p>
            <div className={s.actions}>
              <Link className={ui.btn} href="/masuk?mode=daftar">
                {t("cta")}
              </Link>
              <p>
                {t("haveAccount")} <Link href="/masuk">{t("login")}</Link>
              </p>
            </div>
          </div>

          {/* the kit box: the one focal object on the page */}
          <figure className={s.box}>
            <div className={s.boxLid}>
              <span className={ui.code}>{first.code}</span>
              <span className={s.boxName}>{tk(`${first.id}.name`)}</span>
            </div>
            <KitArt body={first.colors.body} trim={first.colors.trim} variant={1} label={t("boxLabel", { code: first.code })} size={200} />
            <figcaption className={s.boxSide}>{tc("levels.beginner")}</figcaption>
          </figure>
        </section>

        <section className={`${ui.sheet} ${s.manual}`} aria-labelledby="manual-title">
          <h2 id="manual-title">{t("manualTitle")}</h2>
          <ol className={s.steps}>
            {STEPS.map((n) => (
              <li key={n} data-soon={!PLAYABLE.has(n) || undefined}>
                <span className={ui.stepNo}>{n}</span>
                <div>
                  <h3>
                    {t(`steps.${n}.t`)}
                    {!PLAYABLE.has(n) && <span className={s.soon}> ({tc("soon")})</span>}
                  </h3>
                  <p>{t(`steps.${n}.d`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className={s.footer}>{t("footer")}</footer>
    </div>
  );
}
