"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { GATE_LENGTH, RUNNER_BAR_Y, lyingOffset, type LoadedKit, type PartVisual, type RunnerVisual } from "./kitFormat";
import { initState, cutGate, rubNub, checkDrop, placePart, isComplete, magnetPull, pageForDrop, PAINTS, DECAL_KINDS, MAX_DECALS, type Decal, type DecalKind, type KitState, type PartDef, type RunSnapshot, type Vec3 } from "./logic";
import { catalog, findKit, type KitEntry } from "./kits";
import { kitStatus } from "./progress";
import { fetchProfile, fetchProgress, fetchRun, savePhoto, saveRun } from "./store";
import { useLoad } from "@/ui/useLoad";
import { useRouter } from "next/navigation";
import ui from "@/ui/ui.module.css";
import * as sfx from "./sfx";
import { startMusic, stopMusic } from "./music";
import { HeldToolFollower, KitBox, RiseOnOpen, ToolTray, type HeldTool } from "./bench/Props";
import LiftedPart from "./bench/LiftedPart";
import ManualBook from "./bench/ManualBook";
import { Ghost, PopCue, type Pop } from "./bench/Feel";
import { DecalMesh } from "./bench/Finish";
import { PhotoRig, Posed, type PhotoApi } from "./bench/Pose";
import { Studio } from "./bench/Studio";
import styles from "./Workbench.module.css";
import hud from "./bench/Hud.module.css";
import { ToolIcon } from "./bench/ToolIcons";
import { MechPiece, forgetModel, loadModel } from "./bench/Model";
import Catch from "./bench/Catch";

type Tool = HeldTool;
type Burst = { id: number; at: Vec3 };
type Hint = ({ key: "wrongStep"; n: number } | { key: "wrongSpot"; part: string }) & { page: number | null };

const SPRUE = "#9AA3AB";
const YELLOW = "#F2C230";

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export default function Workbench({ kitId }: { kitId: string }) {
  const t = useTranslations("workbench");
  const td = useTranslations("dashboard");
  const [load, retry] = useLoad(() => Promise.all([fetchProfile(), fetchProgress(), fetchRun(kitId)]));
  const entry = findKit(kitId);
  if (load.status === "loading")
    return (
      <main className={styles.unavailable}>
        <p role="status">{t("loading")}</p>
      </main>
    );
  if (load.status === "error")
    return (
      <main className={styles.unavailable}>
        <section className={ui.sheet} role="alert">
          <p>{td("loadError")}</p>
          <button className={ui.btn} type="button" onClick={retry}>
            {td("retry")}
          </button>
        </section>
      </main>
    );
  const [profile, progress, saved] = load.data;
  const status = kitStatus(
    catalog.map((k) => k.id),
    progress,
    kitId,
  );
  if (entry?.kit && status !== "locked") return <Bench entry={entry} lk={entry.kit} sfxVolume={profile.sfx} musicVolume={profile.music} saved={saved} />;
  return (
    <main className={styles.unavailable}>
      <section className={ui.sheet}>
        <h1>{t("unavailable")}</h1>
        <p>{status === "locked" ? t("lockedBody") : t("notDesignedBody")}</p>
        <Link className={ui.btn} href="/dashboard">
          {t("back")}
        </Link>
      </section>
    </main>
  );
}

const SAVE_DELAY_MS = 600;
const RETRY_MS = 5000;

function Bench({ entry, lk, sfxVolume, musicVolume, saved }: { entry: KitEntry; lk: LoadedKit; sfxVolume: number; musicVolume: number; saved: RunSnapshot | null }) {
  const kit = lk.def;
  const lang = useLocale() === "en" ? "en" : "id";
  const t = useTranslations("workbench");
  const tk = useTranslations("kits");
  const router = useRouter();
  const [saveError, setSaveError] = useState(false);
  const [modelFailed, setModelFailed] = useState(false);
  const [modelTry, setModelTry] = useState(0); // remounts the scene so a failed model file is fetched again
  const [shelving, setShelving] = useState(false);
  useEffect(() => {
    sfx.setSfxVolume(sfxVolume / 100);
  }, [sfxVolume]);
  // start fetching the part geometry while the box is still closed
  useEffect(() => {
    if (lk.model) loadModel(lk.model).catch(() => {});
  }, [lk.model]);
  // music starts on the first interaction (browsers block autoplay) and stops when leaving the bench
  useEffect(() => {
    const begin = () => startMusic(musicVolume);
    window.addEventListener("pointerdown", begin, { once: true });
    return () => {
      window.removeEventListener("pointerdown", begin);
      stopMusic();
    };
  }, [musicVolume]);
  const [tool, setTool] = useState<Tool>("hand");
  // a resumed build skips the unboxing; a fresh one starts with the closed box
  const [opened, setOpened] = useState(saved !== null);
  const [justOpened, setJustOpened] = useState(false);
  const [lifted, setLifted] = useState<string | null>(null);
  const [liftRot, setLiftRot] = useState<[number, number]>([0, 0]);
  const [bookOpen, setBookOpen] = useState(false);
  const [bookPage, setBookPage] = useState<number | null>(null);
  const [pops, setPops] = useState<Record<string, Pop>>({});
  const [paint, setPaint] = useState<Record<string, string>>(() => saved?.paint ?? {});
  const [decals, setDecals] = useState<Decal[]>(() => saved?.decals ?? []);
  const [paintColor, setPaintColor] = useState<string>(PAINTS[2]);
  const [decalKind, setDecalKind] = useState<DecalKind>("code");
  const [selectedDecal, setSelectedDecal] = useState<string | null>(null);
  const [pose, setPose] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const j of lk.poses) {
      const a = saved?.pose?.[j.id];
      if (typeof a === "number") out[j.id] = Math.min(j.max, Math.max(j.min, a));
    }
    return out;
  });
  const [playSeconds, setPlaySeconds] = useState(() => saved?.playSeconds ?? 0);
  const [photoMode, setPhotoMode] = useState(false);
  const [photo, setPhoto] = useState<{ url: string; saved: "saving" | "saved" | "error" } | null>(null);
  const photoApi = useRef<PhotoApi | null>(null);
  const onPhotoReady = useCallback((api: PhotoApi) => (photoApi.current = api), []);

  // play time: counted in 30 s ticks while the tab is visible, so autosave is not triggered every second
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) setPlaySeconds((n) => n + 30);
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  function enterPhoto() {
    setLifted(null);
    setTool("hand");
    setPhotoMode(true);
    photoApi.current?.frame([lk.assembly[0], 1.9, lk.assembly[2]]);
  }

  function leavePhoto() {
    setPhotoMode(false);
    setPhoto(null);
    photoApi.current?.restore();
  }

  async function snapPhoto() {
    const url = photoApi.current?.capture();
    if (!url) return;
    sfx.snip();
    setPhoto({ url, saved: "saving" });
    try {
      await savePhoto(entry.id, url);
      setPhoto({ url, saved: "saved" });
    } catch {
      setPhoto({ url, saved: "error" });
    }
  }

  function paintPart(id: string) {
    sfx.brush();
    setPaint((p) => ({ ...p, [id]: paintColor }));
  }

  function placeDecal(part: string, at: Vec3, normal: Vec3) {
    if (decals.length >= MAX_DECALS) return;
    sfx.snap();
    const d: Decal = { id: `d${Date.now().toString(36)}`, part, kind: decalKind, at, normal, rot: 0, size: 0.22 };
    setDecals((all) => [...all, d]);
    setSelectedDecal(d.id);
  }

  const editDecal = (patch: Partial<Decal>) => setDecals((all) => all.map((d) => (d.id === selectedDecal ? { ...d, ...patch } : d)));
  const kitName = tk(`${entry.id}.name`);
  const boxLabel = useMemo(() => ({ code: entry.code, name: kitName, body: entry.colors.body, trim: entry.colors.trim, art: `/art/${entry.id}.png` }), [entry, kitName]);
  const [snips, setSnips] = useState(0);

  useEffect(() => {
    if (bookOpen) return; // the book handles its own Escape
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (lifted) setLifted(null);
      else setTool("hand");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bookOpen, lifted]);

  function openBox() {
    sfx.snap();
    setOpened(true);
    setJustOpened(true);
  }

  function lift(id: string) {
    setLiftRot([0, 0]);
    setLifted(id);
  }
  const [state, setState] = useState<KitState>(() => saved?.state ?? initState(kit));
  const [pos, setPos] = useState<Record<string, Vec3>>(() => saved?.pos ?? Object.fromEntries(kit.parts.map((p) => [p.id, p.runnerPos])));
  const [dragging, setDragging] = useState<string | null>(null);

  // Autosave: the whole bench, debounced, retried until it lands. Snapshots are idempotent, so retries are safe.
  // `kit` names the part layout this page was built with, so the server can refuse saves from an outdated tab
  const rev = kit.rev;
  const snapshot = useMemo(() => JSON.stringify({ kit: rev, state, pos, paint, decals, pose, playSeconds }), [rev, state, pos, paint, decals, pose, playSeconds]);
  const lastSaved = useRef(
    saved
      ? JSON.stringify({ kit: rev, state: saved.state, pos: saved.pos, paint: saved.paint ?? {}, decals: saved.decals ?? [], pose: saved.pose ?? {}, playSeconds: saved.playSeconds ?? 0 })
      : JSON.stringify({ kit: rev, state, pos, paint, decals, pose, playSeconds }),
  );
  const [stale, setStale] = useState(false);
  const save = (snap: string) =>
    saveRun(entry.id, JSON.parse(snap)).then(
      (res) => {
        if (!res.ok) {
          setStale(true); // retrying cannot help: only a reload brings the new layout
          return;
        }
        lastSaved.current = snap;
        setSaveError(false);
      },
      (e) => {
        setSaveError(true);
        throw e;
      },
    );
  useEffect(() => {
    if (dragging || stale || snapshot === lastSaved.current) return;
    let timer = setTimeout(function attempt() {
      save(snapshot).catch(() => (timer = setTimeout(attempt, RETRY_MS)));
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // save only depends on entry.id, which is fixed for this bench
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, dragging, stale]);

  /** Leaving the bench: write the latest state first so nothing done in the last moments is lost. */
  async function leave() {
    setShelving(true);
    try {
      if (!stale && snapshot !== lastSaved.current) await save(snapshot);
      router.push("/dashboard");
    } catch {
      setShelving(false);
    }
  }
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [hint, setHint] = useState<Hint | null>(null);

  // first uncut gate gets a soft highlight: the non-punishing "what next" cue from the PRD
  const nextGate = useMemo(() => {
    for (const p of kit.parts) for (const g of p.gates) if (!state.parts[p.id].cut.includes(g.id)) return `${p.id}/${g.id}`;
    return null;
  }, [kit, state]);

  const nubsLeft = kit.parts.reduce((n, p) => n + Object.values(state.parts[p.id].nubs).filter((h) => h > 0).length, 0);
  const done = isComplete(kit, state);
  const currentStep = lk.steps.find((st) => st.n === state.step);

  // keyboard: 1-5 pick tools, B opens the manual (not while typing or reading the book)
  useEffect(() => {
    if (!opened || bookOpen) return;
    const order = ["hand", "nipper", "sand", "brush", "decal"] as const;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const i = Number(e.key) - 1;
      if (i >= 0 && i < order.length) setTool(order[i]);
      if (e.key.toLowerCase() === "b") {
        setBookPage(null);
        setBookOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opened, bookOpen]);

  function onCut(part: PartDef, gateId: string) {
    sfx.snip();
    setSnips((n) => n + 1);
    setBursts((b) => [...b.slice(-6), { id: Date.now() + Math.random(), at: add(part.runnerPos, lyingOffset(part.gates.find((g) => g.id === gateId)!.offset)) }]);
    setState((s) => cutGate(kit, s, part.id, gateId));
  }

  function onDrop(partId: string, at: Vec3) {
    setDragging(null);
    const part = kit.parts.find((p) => p.id === partId)!;
    const held = magnetPull(kit, state, partId, at); // where the player saw it when letting go
    const rest: Vec3 = [held[0], part.size[2] / 2, 0]; // lies face-up on the mat if it does not snap
    const res = checkDrop(kit, state, partId, held);
    if (res.kind === "snap" || checkDrop(kit, state, partId, rest).kind === "snap") {
      sfx.snap();
      setHint(null);
      setPops((p) => ({ ...p, [partId]: { kind: "snap", at: performance.now() } }));
      setPos((p) => ({ ...p, [partId]: part.target }));
      setState(placePart(kit, state, partId));
      return;
    }
    if (res.kind !== "none") {
      sfx.bump();
      setPops((p) => ({ ...p, [partId]: { kind: "bump", at: performance.now() } }));
    }
    const page = pageForDrop(kit, state, res);
    setHint(res.kind === "wrong-step" ? { key: "wrongStep", n: state.step, page } : res.kind === "wrong-spot" ? { key: "wrongSpot", part: res.spotOf, page } : null);
    setPos((p) => ({ ...p, [partId]: rest }));
  }

  return (
    <div className={styles.shell}>
      <Canvas
        onContextMenu={(e) => {
          e.preventDefault();
          setTool("hand");
        }}
        camera={{ position: [-1.2, 11.2, 9.4], fov: 46 }}
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true }}
        shadows="soft"
      >
        <PhotoRig onReady={onPhotoReady} />
        <Studio lampTarget={[lk.assembly[0] - 2, 0, lk.assembly[2]]} />
        <OrbitControls makeDefault target={[-1.2, 0.2, 0.9]} maxPolarAngle={Math.PI / 2.1} minDistance={4} maxDistance={16} />
        {/* the mech model file streams in; the desk and box render meanwhile */}
        <Catch key={modelTry} onError={() => setModelFailed(true)}>
        <Suspense fallback={null}>
        <Scene
          lk={lk}
          tool={tool}
          state={state}
          pos={pos}
          nextGate={nextGate}
          dragging={dragging}
          onCut={onCut}
          opened={opened}
          justOpened={justOpened}
          onOpenBox={openBox}
          onPickTool={setTool}
          onOpenBook={() => setBookOpen(true)}
          snips={snips}
          lifted={lifted}
          liftRot={liftRot}
          onLift={lift}
          onTurn={(dx, dy) => setLiftRot(([pitch, yaw]) => [Math.max(-1.4, Math.min(1.4, pitch + dy * 0.01)), yaw + dx * 0.012])}
          canDrag={(id) => tool === "hand" && state.parts[id].status === "free"}
          onDragStart={setDragging}
          onDragMove={(id, at) => setPos((p) => ({ ...p, [id]: magnetPull(kit, state, id, at) }))}
          pops={pops}
          boxLabel={boxLabel}
          paint={paint}
          paintColor={paintColor}
          decals={decals}
          selectedDecal={selectedDecal}
          onPaint={paintPart}
          onDecal={placeDecal}
          onSelectDecal={setSelectedDecal}
          pose={pose}
          photoMode={photoMode}
          onDrop={onDrop}
          onRub={(part, gate, px) => {
            sfx.sand();
            setState((s) => rubNub(s, part, gate, px));
          }}
        />
        </Suspense>
        </Catch>
        {bursts.map((b) => (
          <Sparks key={b.id} seed={b.id} at={b.at} />
        ))}
      </Canvas>

      {/* ---- HUD: everything floats over the bench ---- */}
      <div className={hud.topLeft}>
        <button className={hud.chipBtn} type="button" onClick={leave} disabled={shelving}>
          {t("back")}
        </button>
        <div className={hud.chip}>
          <span className={hud.code}>{entry.code}</span>
          <h1 className={hud.kitName}>{tk(`${entry.id}.name`)}</h1>
        </div>
        {opened && !done && currentStep && (
          <div className={hud.stepCard}>
            <p className={hud.stepLabel}>{t("stepOf", { n: currentStep.n, total: lk.steps.length })}</p>
            <p className={hud.stepTitle}>{currentStep.title[lang]}</p>
            <p className={hud.stepParts}>
              {kit.parts
                .filter((p) => p.step === currentStep.n && state.parts[p.id].status !== "placed")
                .map((p) => lk.parts[p.id].name[lang])
                .join(" · ")}
            </p>
          </div>
        )}
      </div>

      {opened && (
        <div className={hud.topRight}>
          <span className={hud.chip} title={t("nubsLeft", { n: nubsLeft })}>
            {t("nubsShort", { n: nubsLeft })}
          </span>
          <button
            className={hud.chipBtn}
            type="button"
            onClick={() => {
              setBookPage(null);
              setBookOpen(true);
            }}
          >
            {t("book.open")} <kbd>B</kbd>
          </button>
        </div>
      )}

      {/* notices: the current tool hint, save problems, drop nudges */}
      <div className={hud.notices} aria-live="polite">
        {opened && <p className={hud.hint}>{lifted ? t(tool === "sand" ? "lift.sand" : "lift.turn") : photoMode ? t("photo.hint") : t(`hint.${tool}`)}</p>}
        {saveError && (
          <p className={hud.warn} role="status">
            {t("saveError")}
          </p>
        )}
        {stale && (
          <div className={hud.warn} role="alert">
            <p>{t("staleKit")}</p>
            <button className={hud.chipBtn} type="button" onClick={() => window.location.reload()}>
              {t("reload")}
            </button>
          </div>
        )}
        {modelFailed && (
          <div className={hud.warn} role="alert">
            <p>{t("modelError")}</p>
            <button
              className={hud.chipBtn}
              type="button"
              onClick={() => {
                if (lk.model) forgetModel(lk.model);
                setModelFailed(false);
                setModelTry((n) => n + 1);
              }}
            >
              {t("modelRetry")}
            </button>
          </div>
        )}
        {hint && (
          <div className={hud.warn}>
            <p>{hint.key === "wrongStep" ? t("drop.wrongStep", { n: hint.n }) : t("drop.wrongSpot", { part: lk.parts[hint.part].name[lang] })}</p>
            {hint.page !== null && (
              <button
                className={hud.link}
                type="button"
                onClick={() => {
                  setBookPage(hint.page);
                  setBookOpen(true);
                }}
              >
                {t("drop.seePage", { n: hint.page })}
              </button>
            )}
          </div>
        )}
      </div>

      {!opened ? (
        <div className={hud.boxPrompt}>
          <p>{t("box.hint", { code: entry.code })}</p>
          <button className={hud.primary} type="button" onClick={openBox}>
            {t("box.open")}
          </button>
        </div>
      ) : (
        !photoMode && (
          <div className={hud.bottom}>
            {(tool === "brush" || tool === "decal" || lifted) && (
              <div className={hud.options}>
                {tool === "brush" && (
                  <div className={hud.swatches} role="radiogroup" aria-label={t("paint.label")}>
                    {PAINTS.map((c) => (
                      <button key={c} type="button" role="radio" aria-checked={paintColor === c} aria-label={t(`paint.colors.${c.slice(1)}`)} title={t(`paint.colors.${c.slice(1)}`)} style={{ background: c }} onClick={() => setPaintColor(c)} />
                    ))}
                  </div>
                )}
                {tool === "decal" && (
                  <>
                    <div className={hud.segmented} role="radiogroup" aria-label={t("decal.label")}>
                      {DECAL_KINDS.map((k) => (
                        <button key={k} type="button" role="radio" aria-checked={decalKind === k} onClick={() => setDecalKind(k)}>
                          {t(`decal.kinds.${k}`)}
                        </button>
                      ))}
                    </div>
                    {selectedDecal && decals.some((d) => d.id === selectedDecal) && (
                      <div className={hud.sliders}>
                        <label>
                          {t("decal.rotate")}
                          <input
                            type="range"
                            min={-180}
                            max={180}
                            step={5}
                            value={Math.round((decals.find((d) => d.id === selectedDecal)!.rot * 180) / Math.PI)}
                            onChange={(e) => editDecal({ rot: (Number(e.target.value) * Math.PI) / 180 })}
                          />
                        </label>
                        <label>
                          {t("decal.size")}
                          <input
                            type="range"
                            min={6}
                            max={60}
                            step={1}
                            value={Math.round(decals.find((d) => d.id === selectedDecal)!.size * 100)}
                            onChange={(e) => editDecal({ size: Number(e.target.value) / 100 })}
                          />
                        </label>
                        <button
                          className={hud.link}
                          type="button"
                          onClick={() => {
                            setDecals((all) => all.filter((d) => d.id !== selectedDecal));
                            setSelectedDecal(null);
                          }}
                        >
                          {t("decal.remove")}
                        </button>
                      </div>
                    )}
                  </>
                )}
                {lifted && (
                  <button className={hud.chipBtn} type="button" onClick={() => setLifted(null)}>
                    {t("lift.putDown", { part: lk.parts[lifted].name[lang] })} <kbd>Esc</kbd>
                  </button>
                )}
              </div>
            )}
            <div className={hud.hotbar} role="toolbar" aria-label={t("toolsLabel")}>
              {(["hand", "nipper", "sand", "brush", "decal"] as const).map((k, i) => (
                <button key={k} className={hud.slot} aria-pressed={tool === k} aria-label={t(`tools.${k}`)} onClick={() => setTool(k)}>
                  <kbd>{i + 1}</kbd>
                  <ToolIcon tool={k} />
                  <span>{t(`tools.${k}`)}</span>
                </button>
              ))}
            </div>
          </div>
        )
      )}

      {done && (
        <aside className={hud.finish} aria-labelledby="finish-title">
          <h2 id="finish-title">{t("done")}</h2>
          {lk.poses.length > 0 && !photoMode && (
            <fieldset className={hud.sliders}>
              <legend>{t("pose.title")}</legend>
              {lk.poses.map((j) => (
                <label key={j.id}>
                  {j.name[lang]}
                  <input
                    type="range"
                    min={Math.round((j.min * 180) / Math.PI)}
                    max={Math.round((j.max * 180) / Math.PI)}
                    step={5}
                    value={Math.round(((pose[j.id] ?? 0) * 180) / Math.PI)}
                    onChange={(e) => setPose((p) => ({ ...p, [j.id]: (Number(e.target.value) * Math.PI) / 180 }))}
                  />
                </label>
              ))}
              <button className={hud.link} type="button" onClick={() => setPose({})}>
                {t("pose.reset")}
              </button>
            </fieldset>
          )}
          {!photoMode ? (
            <button className={hud.chipBtn} type="button" onClick={enterPhoto}>
              {t("photo.enter")}
            </button>
          ) : (
            <div className={hud.photo}>
              <button className={hud.primary} type="button" onClick={snapPhoto} disabled={photo?.saved === "saving"}>
                {t("photo.snap")}
              </button>
              {photo && (
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL just captured */}
                  <img src={photo.url} alt={t("photo.alt", { name: tk(`${entry.id}.name`) })} />
                  <figcaption>
                    {t(`photo.${photo.saved}`)}{" "}
                    <a href={photo.url} download={`${entry.code}.jpg`}>
                      {t("photo.download")}
                    </a>
                  </figcaption>
                </figure>
              )}
              <button className={hud.link} type="button" onClick={leavePhoto}>
                {t("photo.leave")}
              </button>
            </div>
          )}
          <button className={hud.primary} type="button" onClick={leave} disabled={shelving}>
            {t("toShelf")}
          </button>
        </aside>
      )}
      {bookOpen && <ManualBook initialPage={bookPage ?? undefined} lk={lk} state={state} lang={lang} code={entry.code} name={tk(`${entry.id}.name`)} onClose={() => setBookOpen(false)} />}
    </div>
  );
}

type SceneProps = {
  lk: LoadedKit;
  tool: Tool;
  state: KitState;
  pos: Record<string, Vec3>;
  nextGate: string | null;
  dragging: string | null;
  onCut: (part: PartDef, gateId: string) => void;
  opened: boolean;
  justOpened: boolean;
  onOpenBox: () => void;
  onPickTool: (tool: Tool) => void;
  onOpenBook: () => void;
  snips: number;
  lifted: string | null;
  liftRot: [number, number];
  onLift: (partId: string) => void;
  onTurn: (dx: number, dy: number) => void;
  pops: Record<string, Pop>;
  boxLabel: { code: string; name: string; body: string; trim: string; art: string };
  paint: Record<string, string>;
  paintColor: string;
  decals: Decal[];
  selectedDecal: string | null;
  onPaint: (partId: string) => void;
  onDecal: (partId: string, at: Vec3, normal: Vec3) => void;
  onSelectDecal: (id: string) => void;
  pose: Record<string, number>;
  photoMode: boolean;
  canDrag: (partId: string) => boolean;
  onDragStart: (partId: string) => void;
  onDragMove: (partId: string, at: Vec3) => void;
  onDrop: (partId: string, at: Vec3) => void;
  onRub: (partId: string, gateId: string, pixels: number) => void;
};

function Scene({ lk, tool, state, pos, nextGate, dragging, onCut, opened, justOpened, onOpenBox, onPickTool, onOpenBook, snips, lifted, liftRot, onLift, onTurn, pops, boxLabel, paint, paintColor, decals, selectedDecal, onPaint, onDecal, onSelectDecal, pose, photoMode, canDrag, onDragStart, onDragMove, onDrop, onRub }: SceneProps) {
  const kit = lk.def;
  const { camera, gl } = useThree();
  const get = useThree((s) => s.get);

  // Listeners go on in the pointerdown handler itself (not an effect) so a fast drag never loses its pointerup,
  // and the orbit camera is switched off before it sees the same pointerdown.
  function session(move: (e: PointerEvent) => void, end: (e: PointerEvent) => void) {
    const orbit = get().controls as unknown as { enabled: boolean } | null;
    if (orbit) orbit.enabled = false;
    const up = (e: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      if (orbit) orbit.enabled = true;
      end(e);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }

  // drag happens on a vertical plane through the carried part's assembly target
  function toWorld(e: PointerEvent, depth: number): Vec3 | null {
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -depth);
    const r = gl.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    return hit ? [hit.x, Math.max(0.1, hit.y), hit.z] : null;
  }

  function startGrab(id: string, e0: PointerEvent) {
    const [x0, y0] = [e0.clientX, e0.clientY];
    let moving = false;
    let last: Vec3 = pos[id];
    const depth = kit.parts.find((q) => q.id === id)?.target[2] ?? 0;
    session(
      (e) => {
        if (!moving && Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return; // still a click
        if (!moving) {
          moving = true;
          onDragStart(id);
        }
        const at = toWorld(e, depth);
        if (at) onDragMove(id, (last = at));
      },
      (e) => (moving ? onDrop(id, toWorld(e, depth) ?? last) : onLift(id)),
    );
  }

  /** Brush or decal sheet in hand: act on the part under the pointer. True if the click was used. */
  function finishClick(partId: string, e: ThreeEvent<PointerEvent>) {
    if (tool === "brush") {
      e.stopPropagation();
      onPaint(partId);
      return true;
    }
    if (tool === "decal" && e.face) {
      e.stopPropagation();
      const local = e.object.worldToLocal(e.point.clone());
      const n = e.face.normal;
      onDecal(partId, [local.x, local.y, local.z], [n.x, n.y, n.z]);
      return true;
    }
    return false;
  }

  function startTurn() {
    session(
      (e) => onTurn(e.movementX, e.movementY),
      () => {},
    );
  }

  function startRub(partId: string, gateId: string) {
    session(
      (e) => onRub(partId, gateId, Math.hypot(e.movementX, e.movementY)),
      () => {},
    );
  }

  return (
    <group>

      <mesh position={[lk.assembly[0], 0.01, lk.assembly[2]]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.1, 40]} />
        <meshStandardMaterial roughness={0.35} metalness={0.2} color="#2b3a36" />
      </mesh>
      <KitBox opened={opened} onOpen={onOpenBox} center={[-3.5, 0, -0.45]} label={boxLabel} />
      {opened && !photoMode && (
        <>
          <ToolTray held={tool} animateIn={justOpened} paint={paintColor} onPick={onPickTool} onOpenBook={onOpenBook} />
          <HeldToolFollower held={tool} snips={snips} paint={paintColor} />
        </>
      )}
      {lifted && (
        <LiftedPart rotation={liftRot} size={kit.parts.find((p) => p.id === lifted)!.size}>
          <PartBody visual={lk.parts[lifted]} ghosted={false} paint={paint[lifted]} model={lk.model} onSurface={(e) => finishClick(lifted, e)} />
          {decals
            .filter((d) => d.part === lifted)
            .map((d) => (
              <DecalMesh key={d.id} decal={d} code={boxLabel.code} selected={d.id === selectedDecal} onSelect={tool === "decal" ? () => onSelectDecal(d.id) : undefined} />
            ))}
          <mesh
            raycast={tool === "hand" ? THREE.Mesh.prototype.raycast : () => null}
            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
              if (finishClick(lifted, e)) return;
              if (tool !== "hand") return;
              e.stopPropagation();
              startTurn();
            }}
          >
            <boxGeometry args={kit.parts.find((p) => p.id === lifted)!.size} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
          {kit.parts
            .find((p) => p.id === lifted)!
            .gates.map((g) => (
              <Nub key={g.id} offset={g.offset} height={state.parts[lifted].nubs[g.id] ?? 0} active={tool === "sand"} onStart={() => startRub(lifted, g.id)} color={lk.parts[lifted].color} />
            ))}
        </LiftedPart>
      )}
      <RiseOnOpen animate={justOpened}>
      {opened && !photoMode && lk.runners.map((r) => (
        <Runner key={r.id} runner={r} />
      ))}
      {opened && kit.parts.map((p) => {
        if (p.id === lifted) return null;
        const ps = state.parts[p.id];
        const ghost = ps.status !== "placed" && p.step === state.step;
        return (
          <group key={p.id}>
            {ghost && <Ghost size={p.size} at={p.target} hot={dragging === p.id} dim={dragging !== null && dragging !== p.id} />}
            {/* on the runner or loose on the mat a part lies face-up; held or assembled it stands upright */}
            <Posed chain={ps.status === "placed" ? lk.poses.filter((j) => j.parts.includes(p.id)) : []} angles={pose}>
            <group position={pos[p.id]}>
            <PopCue pop={pops[p.id]}>
            <group rotation-x={ps.status !== "placed" && dragging !== p.id ? -Math.PI / 2 : 0}>
              <PartBody visual={lk.parts[p.id]} ghosted={dragging === p.id} paint={paint[p.id]} model={lk.model} onSurface={(e) => finishClick(p.id, e)} />
              {decals
                .filter((d) => d.part === p.id)
                .map((d) => (
                  <DecalMesh key={d.id} decal={d} code={boxLabel.code} selected={d.id === selectedDecal} onSelect={tool === "decal" ? () => onSelectDecal(d.id) : undefined} />
                ))}
              {/* one invisible box over the whole part: the grab target */}
              <mesh
                raycast={tool === "hand" ? THREE.Mesh.prototype.raycast : () => null}
                onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                  if (finishClick(p.id, e)) return;
                  if (!canDrag(p.id)) return;
                  e.stopPropagation();
                  startGrab(p.id, e.nativeEvent);
                }}
              >
                <boxGeometry args={p.size} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
              {p.gates.map((g) => {
                const cut = ps.cut.includes(g.id);
                if (!cut) return <Gate key={g.id} offset={g.offset} hot={nextGate === `${p.id}/${g.id}` && tool === "nipper"} onCut={() => tool === "nipper" && onCut(p, g.id)} />;
                return <Nub key={g.id} offset={g.offset} height={ps.nubs[g.id] ?? 0} active={false} onStart={() => {}} color={lk.parts[p.id].color} />;
              })}
            </group>
            </PopCue>
            </group>
            </Posed>
          </group>
        );
      })}
      </RiseOnOpen>
    </group>
  );
}

function PartBody({ visual, ghosted, paint, model, onSurface }: { visual: PartVisual; ghosted: boolean; paint?: string; model?: string; onSurface?: (e: ThreeEvent<PointerEvent>) => void }) {
  if (model && visual.model) return <MechPiece url={model} piece={visual.model} color={paint ?? visual.color} ghosted={ghosted} onPointerDown={onSurface} />;
  return (
    <>
      {visual.shape.map((prim, i) => (
        <mesh key={i} position={prim.at ?? [0, 0, 0]}>
          <boxGeometry args={prim.box} />
          <meshStandardMaterial color={prim.color ?? paint ?? visual.color} roughness={0.38} metalness={0} transparent={ghosted} opacity={ghosted ? 0.85 : 1} />
        </mesh>
      ))}
    </>
  );
}

function Runner({ runner }: { runner: RunnerVisual }) {
  // frame + the middle bar every gate attaches to
  const [cx, cz] = runner.center;
  const [w, d] = runner.size;
  const r = 0.05;
  const bars: { p: Vec3; len: number; axis: "x" | "z" }[] = [
    { p: [cx, RUNNER_BAR_Y, cz], len: w, axis: "x" },
    { p: [cx, RUNNER_BAR_Y, cz - d / 2], len: w, axis: "x" },
    { p: [cx, RUNNER_BAR_Y, cz + d / 2], len: w, axis: "x" },
    { p: [cx - w / 2, RUNNER_BAR_Y, cz], len: d, axis: "z" },
    { p: [cx + w / 2, RUNNER_BAR_Y, cz], len: d, axis: "z" },
  ];
  return (
    <group>
      {bars.map((b, i) => (
        <mesh key={i} position={b.p} rotation={b.axis === "x" ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[r, r, b.len, 10]} />
          <meshStandardMaterial roughness={0.45} color={runner.color} />
        </mesh>
      ))}
    </group>
  );
}

function Gate({ offset, hot, onCut }: { offset: Vec3; hot: boolean; onCut: () => void }) {
  const [hover, setHover] = useState(false);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (!mat.current) return;
    const pulse = hot && !hover ? 0.5 + 0.5 * Math.sin(clock.elapsedTime * 4) : 0;
    mat.current.color.set(hover ? YELLOW : SPRUE).lerp(new THREE.Color(YELLOW), pulse * 0.6);
  });
  return (
    <group position={offset}>
      <mesh>
        <cylinderGeometry args={[0.045, 0.04, GATE_LENGTH, 10]} />
        <meshBasicMaterial ref={mat} color={SPRUE} />
      </mesh>
      {/* fat invisible hit area so a thin gate is easy to click */}
      <mesh
        onPointerOver={(e) => (e.stopPropagation(), setHover(true))}
        onPointerOut={() => setHover(false)}
        onClick={(e) => (e.stopPropagation(), onCut())}
      >
        <cylinderGeometry args={[0.12, 0.12, GATE_LENGTH, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Nub({ offset, height, active, onStart, color }: { offset: Vec3; height: number; active: boolean; onStart: () => void; color: string }) {
  if (height <= 0) return null;
  const dir = Math.sign(offset[1]); // the gate left the part along its local y
  const len = 0.02 + 0.1 * height;
  const faceY = offset[1] - dir * (GATE_LENGTH / 2);
  return (
    <group position={[offset[0], faceY + (dir * len) / 2, offset[2]]}>
      <mesh>
        <cylinderGeometry args={[0.035, 0.04, len, 10]} />
        <meshStandardMaterial roughness={0.45} color={color} />
      </mesh>
      <mesh
        visible={active}
        onPointerDown={(e) => {
          if (!active) return;
          e.stopPropagation();
          onStart();
        }}
      >
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshBasicMaterial color={YELLOW} transparent opacity={0.18} depthWrite={false} />
      </mesh>
    </group>
  );
}

// deterministic hash noise, so render stays pure
const rnd = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

function Sparks({ seed, at }: { seed: number; at: Vec3 }) {
  const group = useRef<THREE.Group>(null);
  const seeds = useMemo(() => Array.from({ length: 10 }, (_, i) => new THREE.Vector3((rnd(seed + i) - 0.5) * 2, rnd(seed + i + 0.3) * 1.5 + 0.5, (rnd(seed + i + 0.7) - 0.5) * 2)), [seed]);
  const age = useRef(0);
  useFrame((_, dt) => {
    age.current += dt;
    const g = group.current;
    if (!g) return;
    g.visible = age.current < 0.45;
    g.children.forEach((c, i) => {
      const v = seeds[i];
      c.position.set(v.x * age.current, v.y * age.current - 4 * age.current * age.current, v.z * age.current);
    });
  });
  return (
    <group ref={group} position={at}>
      {seeds.map((_, i) => (
        <mesh key={i}>
          <sphereGeometry args={[0.018, 6, 6]} />
          <meshBasicMaterial color={YELLOW} />
        </mesh>
      ))}
    </group>
  );
}
