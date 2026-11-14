"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Outlines } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import styles from "./Workbench.module.css";

type Tool = HeldTool;
type Burst = { id: number; at: Vec3 };
type Hint = ({ key: "wrongStep"; n: number } | { key: "wrongSpot"; part: string }) & { page: number | null };

const INK = "#14202B";
const MAT = "#214F43";
const SPRUE = "#9AA3AB";
const YELLOW = "#F2C230";

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function useToonGradient() {
  return useMemo(() => {
    const t = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.needsUpdate = true;
    return t;
  }, []);
}

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
  const [shelving, setShelving] = useState(false);
  useEffect(() => {
    sfx.setSfxVolume(sfxVolume / 100);
  }, [sfxVolume]);
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
  const boxLabel = useMemo(() => ({ code: entry.code, name: kitName, body: entry.colors.body, trim: entry.colors.trim }), [entry, kitName]);
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
  const snapshot = useMemo(() => JSON.stringify({ state, pos, paint, decals, pose, playSeconds }), [state, pos, paint, decals, pose, playSeconds]);
  const lastSaved = useRef(
    saved
      ? JSON.stringify({ state: saved.state, pos: saved.pos, paint: saved.paint ?? {}, decals: saved.decals ?? [], pose: saved.pose ?? {}, playSeconds: saved.playSeconds ?? 0 })
      : JSON.stringify({ state, pos, paint, decals, pose, playSeconds }),
  );
  const save = (snap: string) =>
    saveRun(entry.id, JSON.parse(snap)).then(
      () => {
        lastSaved.current = snap;
        setSaveError(false);
      },
      (e) => {
        setSaveError(true);
        throw e;
      },
    );
  useEffect(() => {
    if (dragging || snapshot === lastSaved.current) return;
    let timer = setTimeout(function attempt() {
      save(snapshot).catch(() => (timer = setTimeout(attempt, RETRY_MS)));
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
    // save only depends on entry.id, which is fixed for this bench
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, dragging]);

  /** Leaving the bench: write the latest state first so nothing done in the last moments is lost. */
  async function leave() {
    setShelving(true);
    try {
      if (snapshot !== lastSaved.current) await save(snapshot);
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
        camera={{ position: [-1.7, 10, 7.2], fov: 48 }}
        dpr={[1, 2]}
        gl={{ preserveDrawingBuffer: true }}
      >
        <PhotoRig onReady={onPhotoReady} />
        <color attach="background" args={["#10261F"]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[4, 8, 5]} intensity={1.6} />
        <OrbitControls makeDefault target={[-1.7, 0.6, -0.3]} maxPolarAngle={Math.PI / 2.1} minDistance={4} maxDistance={16} />
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
        {bursts.map((b) => (
          <Sparks key={b.id} seed={b.id} at={b.at} />
        ))}
      </Canvas>

      <aside className={styles.panel}>
        <button className={styles.back} type="button" onClick={leave} disabled={shelving}>
          {t("back")}
        </button>
        <h1 className={styles.kitTitle}>
          <span className={ui.code}>{entry.code}</span> {tk(`${entry.id}.name`)}
        </h1>
        {!opened ? (
          <>
            <p className={styles.hint}>{t("box.hint")}</p>
            <button className={ui.btn} type="button" onClick={openBox}>
              {t("box.open")}
            </button>
          </>
        ) : (
          <>
            <div className={styles.tools} role="toolbar" aria-label={t("toolsLabel")}>
              {(["hand", "nipper", "sand", "brush", "decal"] as const).map((k) => (
                <button key={k} aria-pressed={tool === k} onClick={() => setTool(k)}>
                  {t(`tools.${k}`)}
                </button>
              ))}
            </div>
            <p className={styles.hint}>{lifted ? t(tool === "sand" ? "lift.sand" : "lift.turn") : t(`hint.${tool}`)}</p>
            {tool === "brush" && (
              <div className={styles.swatches} role="radiogroup" aria-label={t("paint.label")}>
                {PAINTS.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={paintColor === c} aria-label={t(`paint.colors.${c.slice(1)}`)} style={{ background: c }} onClick={() => setPaintColor(c)} />
                ))}
              </div>
            )}
            {tool === "decal" && (
              <>
                <div className={styles.decalKinds} role="radiogroup" aria-label={t("decal.label")}>
                  {DECAL_KINDS.map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={decalKind === k} onClick={() => setDecalKind(k)}>
                      {t(`decal.kinds.${k}`)}
                    </button>
                  ))}
                </div>
                {selectedDecal && decals.some((d) => d.id === selectedDecal) && (
                  <div className={styles.decalEdit}>
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
                      className={styles.linkBtn}
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
              <button className={ui.btnLine} type="button" onClick={() => setLifted(null)}>
                {t("lift.putDown", { part: lk.parts[lifted].name[lang] })}
              </button>
            )}
            <button
              className={ui.btnLine}
              type="button"
              onClick={() => {
                setBookPage(null);
                setBookOpen(true);
              }}
            >
              {t("book.open")}
            </button>
          </>
        )}
        {saveError && (
          <p className={styles.warn} role="status">
            {t("saveError")}
          </p>
        )}
        {hint && (
          <div className={styles.warn}>
            <p>{hint.key === "wrongStep" ? t("drop.wrongStep", { n: hint.n }) : t("drop.wrongSpot", { part: lk.parts[hint.part].name[lang] })}</p>
            {hint.page !== null && (
              <button
                className={styles.linkBtn}
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
        <h2>{t("manual")}</h2>
        <ol className={styles.manual}>
          {lk.steps.map(({ n, title }) => (
            <li key={n} data-state={n < state.step ? "done" : n === state.step ? "now" : "later"}>
              <span>
                {title[lang]}
                {n === state.step && (
                  <small className={styles.stepParts}>
                    {kit.parts
                      .filter((p) => p.step === n && state.parts[p.id].status !== "placed")
                      .map((p) => lk.parts[p.id].name[lang])
                      .join(", ")}
                  </small>
                )}
              </span>
            </li>
          ))}
        </ol>
        <p>{t("nubsLeft", { n: nubsLeft })}</p>
        {done && (
          <div className={styles.done} role="status">
            <p>{t("done")}</p>
            {lk.poses.length > 0 && (
              <fieldset className={styles.pose}>
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
                <button className={styles.linkBtn} type="button" onClick={() => setPose({})}>
                  {t("pose.reset")}
                </button>
              </fieldset>
            )}
            {!photoMode ? (
              <button className={ui.btnLine} type="button" onClick={enterPhoto}>
                {t("photo.enter")}
              </button>
            ) : (
              <div className={styles.photo}>
                <p className={styles.hint}>{t("photo.hint")}</p>
                <button className={ui.btn} type="button" onClick={snapPhoto} disabled={photo?.saved === "saving"}>
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
                <button className={styles.linkBtn} type="button" onClick={leavePhoto}>
                  {t("photo.leave")}
                </button>
              </div>
            )}
            <button className={ui.btn} type="button" onClick={leave} disabled={shelving}>
              {t("toShelf")}
            </button>
          </div>
        )}
      </aside>
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
  boxLabel: { code: string; name: string; body: string; trim: string };
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
  const gradient = useToonGradient();
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

  // drag happens on the vertical plane z = 0, where every assembly target sits
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), []);
  function toWorld(e: PointerEvent): Vec3 | null {
    const r = gl.domElement.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    return hit ? [hit.x, Math.max(0.1, hit.y), 0] : null;
  }

  function startGrab(id: string, e0: PointerEvent) {
    const [x0, y0] = [e0.clientX, e0.clientY];
    let moving = false;
    let last: Vec3 = pos[id];
    session(
      (e) => {
        if (!moving && Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return; // still a click
        if (!moving) {
          moving = true;
          onDragStart(id);
        }
        const at = toWorld(e);
        if (at) onDragMove(id, (last = at));
      },
      (e) => (moving ? onDrop(id, toWorld(e) ?? last) : onLift(id)),
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
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[14, 9]} />
        <meshToonMaterial color={MAT} gradientMap={gradient} />
      </mesh>
      <mesh position={[lk.assembly[0], 0.01, lk.assembly[2]]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.1, 40]} />
        <meshToonMaterial color="#2A6656" gradientMap={gradient} />
      </mesh>
      <KitBox gradient={gradient} opened={opened} onOpen={onOpenBox} center={[-3.5, 0, -0.45]} label={boxLabel} />
      {opened && !photoMode && (
        <>
          <ToolTray gradient={gradient} held={tool} animateIn={justOpened} paint={paintColor} onPick={onPickTool} onOpenBook={onOpenBook} />
          <HeldToolFollower gradient={gradient} held={tool} snips={snips} paint={paintColor} />
        </>
      )}
      {lifted && (
        <LiftedPart rotation={liftRot}>
          <PartBody visual={lk.parts[lifted]} gradient={gradient} ghosted={false} paint={paint[lifted]} />
          {decals
            .filter((d) => d.part === lifted)
            .map((d) => (
              <DecalMesh key={d.id} decal={d} code={boxLabel.code} selected={d.id === selectedDecal} onSelect={tool === "decal" ? () => onSelectDecal(d.id) : undefined} />
            ))}
          <mesh
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
              <Nub key={g.id} offset={g.offset} height={state.parts[lifted].nubs[g.id] ?? 0} active={tool === "sand"} onStart={() => startRub(lifted, g.id)} gradient={gradient} color={lk.parts[lifted].color} />
            ))}
        </LiftedPart>
      )}
      <RiseOnOpen animate={justOpened}>
      {opened && !photoMode && lk.runners.map((r) => (
        <Runner key={r.id} runner={r} gradient={gradient} />
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
              <PartBody visual={lk.parts[p.id]} gradient={gradient} ghosted={dragging === p.id} paint={paint[p.id]} />
              {decals
                .filter((d) => d.part === p.id)
                .map((d) => (
                  <DecalMesh key={d.id} decal={d} code={boxLabel.code} selected={d.id === selectedDecal} onSelect={tool === "decal" ? () => onSelectDecal(d.id) : undefined} />
                ))}
              {/* one invisible box over the whole part: the grab target */}
              <mesh
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
                return <Nub key={g.id} offset={g.offset} height={ps.nubs[g.id] ?? 0} active={false} onStart={() => {}} gradient={gradient} color={lk.parts[p.id].color} />;
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

function PartBody({ visual, gradient, ghosted, paint }: { visual: PartVisual; gradient: THREE.Texture; ghosted: boolean; paint?: string }) {
  return (
    <>
      {visual.shape.map((prim, i) => (
        <mesh key={i} position={prim.at ?? [0, 0, 0]}>
          <boxGeometry args={prim.box} />
          <meshToonMaterial color={prim.color ?? paint ?? visual.color} gradientMap={gradient} transparent={ghosted} opacity={ghosted ? 0.85 : 1} />
          <Outlines thickness={2} color={INK} />
        </mesh>
      ))}
    </>
  );
}

function Runner({ runner, gradient }: { runner: RunnerVisual; gradient: THREE.Texture }) {
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
          <meshToonMaterial color={runner.color} gradientMap={gradient} />
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

function Nub({ offset, height, active, onStart, gradient, color }: { offset: Vec3; height: number; active: boolean; onStart: () => void; gradient: THREE.Texture; color: string }) {
  if (height <= 0) return null;
  const dir = Math.sign(offset[1]); // the gate left the part along its local y
  const len = 0.02 + 0.1 * height;
  const faceY = offset[1] - dir * (GATE_LENGTH / 2);
  return (
    <group position={[offset[0], faceY + (dir * len) / 2, offset[2]]}>
      <mesh>
        <cylinderGeometry args={[0.035, 0.04, len, 10]} />
        <meshToonMaterial color={color} gradientMap={gradient} />
        <Outlines thickness={1.2} color={INK} />
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
