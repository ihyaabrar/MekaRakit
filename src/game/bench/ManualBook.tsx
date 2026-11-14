"use client";

// The instruction booklet from the box, opened as a printed-looking dialog. One page per manual step.
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { KitState } from "../logic";
import type { LoadedKit } from "../kitFormat";
import ui from "@/ui/ui.module.css";
import styles from "./ManualBook.module.css";

type Props = { initialPage?: number; lk: LoadedKit; state: KitState; lang: "id" | "en"; code: string; name: string; onClose: () => void };

export default function ManualBook({ initialPage, lk, state, lang, code, name, onClose }: Props) {
  const t = useTranslations("workbench.book");
  // page 0 is the cover with the box contents; page n is manual step n
  const [page, setPage] = useState(Math.min(initialPage ?? state.step, lk.steps.length));
  const closeRef = useRef<HTMLButtonElement>(null);
  const last = lk.steps.length;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setPage((p) => Math.min(last, p + 1));
      if (e.key === "ArrowLeft") setPage((p) => Math.max(0, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last, onClose]);

  const step = lk.steps.find((s) => s.n === page);
  const parts = step ? lk.def.parts.filter((p) => p.step === step.n) : [];

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <section className={styles.book} role="dialog" aria-modal="true" aria-labelledby="book-title" onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <span className={ui.code}>{code}</span>
          <h2 id="book-title">{step ? step.title[lang] : t("cover", { name })}</h2>
          <button ref={closeRef} className={styles.close} type="button" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </header>

        {step ? (
          <div className={styles.page}>
            <p className={styles.stepLine}>
              <span className={ui.stepNo}>{step.n}</span>
              {step.n < state.step ? t("stepDone") : step.n === state.step ? t("stepNow") : t("stepLater")}
            </p>
            <ul className={styles.parts}>
              {parts.map((p) => {
                const ps = state.parts[p.id];
                const v = lk.parts[p.id];
                return (
                  <li key={p.id} data-placed={ps.status === "placed" || undefined}>
                    <span className={styles.swatch} style={{ background: v.color }} aria-hidden="true" />
                    <span className={ui.code}>{p.id}</span>
                    <span className={styles.partName}>{v.name[lang]}</span>
                    <span className={styles.partState}>{t(`status.${ps.status}`)}</span>
                  </li>
                );
              })}
            </ul>
            <p className={styles.tip}>{t("tip")}</p>
          </div>
        ) : (
          <div className={styles.page}>
            <p>{t("contents")}</p>
            <ul className={styles.contents}>
              {lk.runners.map((r) => (
                <li key={r.id}>
                  <span className={styles.swatch} style={{ background: r.color }} aria-hidden="true" />
                  {t("runner", { id: r.id, n: Object.values(lk.parts).filter((v) => v.runner === r.id).length })}
                </li>
              ))}
              <li>{t("nipper")}</li>
              <li>{t("sandpaper")}</li>
            </ul>
          </div>
        )}

        <footer className={styles.foot}>
          <button className={ui.btnLine} type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
            {t("prev")}
          </button>
          <span>{t("page", { n: page + 1, total: last + 1 })}</span>
          <button className={ui.btnLine} type="button" onClick={() => setPage((p) => Math.min(last, p + 1))} disabled={page === last}>
            {t("next")}
          </button>
        </footer>
      </section>
    </div>
  );
}
