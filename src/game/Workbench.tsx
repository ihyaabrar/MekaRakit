"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Outlines } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { GATE_LENGTH, RUNNER_BAR_Y, ASSEMBLY_X } from "./prototypeKit";
import { initState, cutGate, rubNub, checkDrop, placePart, isComplete, type KitDef, type KitState, type PartDef, type Vec3 } from "./logic";
import { catalog, findKit, type KitEntry } from "./kits";
import { kitStatus } from "./progress";
import { addGateCut, fetchProfile, fetchProgress, finishKit } from "./store";
import { useLoad } from "@/ui/useLoad";
import { useRouter } from "next/navigation";
import ui from "@/ui/ui.module.css";
import * as sfx from "./sfx";
import styles from "./Workbench.module.css";

type Tool = "nipper" | "sand" | "build";
type Burst = { id: number; at: Vec3 };
type Hint = { key: "wrongStep"; n: number } | { key: "wrongSpot"; part: string } | null;

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

const loadAll = () => Promise.all([fetchProfile(), fetchProgress()]);

export default function Workbench({ kitId }: { kitId: string }) {
  const t = useTranslations("workbench");
  const td = useTranslations("dashboard");
  const [load, retry] = useLoad(loadAll);
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
  const [profile, progress] = load.data;
  const status = kitStatus(
    catalog.map((k) => k.id),
    progress,
    kitId,
  );
  if (entry?.kit && status !== "locked") return <Bench entry={entry} kit={entry.kit} sfxVolume={profile.sfx} />;
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

function Bench({ entry, kit, sfxVolume }: { entry: KitEntry; kit: KitDef; sfxVolume: number }) {
  const t = useTranslations("workbench");
  const tk = useTranslations("kits");
  const router = useRouter();
  const [saveError, setSaveError] = useState(false);
  const [shelving, setShelving] = useState(false);
  useEffect(() => {
    sfx.setSfxVolume(sfxVolume / 100);
  }, [sfxVolume]);
  const [tool, setTool] = useState<Tool>("nipper");
  const [state, setState] = useState<KitState>(() => initState(kit));
  const [pos, setPos] = useState<Record<string, Vec3>>(() => Object.fromEntries(kit.parts.map((p) => [p.id, p.runnerPos])));
  const [dragging, setDragging] = useState<string | null>(null);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [hint, setHint] = useState<Hint>(null);

  // first uncut gate gets a soft highlight: the non-punishing "what next" cue from the PRD
  const nextGate = useMemo(() => {
    for (const p of kit.parts) for (const g of p.gates) if (!state.parts[p.id].cut.includes(g.id)) return `${p.id}/${g.id}`;
    return null;
  }, [kit, state]);

  const nubsLeft = kit.parts.reduce((n, p) => n + Object.values(state.parts[p.id].nubs).filter((h) => h > 0).length, 0);
  const maxStep = Math.max(...kit.parts.map((p) => p.step));
  const done = isComplete(kit, state);

  function onCut(part: PartDef, gateId: string) {
    sfx.snip();
    setBursts((b) => [...b.slice(-6), { id: Date.now() + Math.random(), at: add(part.runnerPos, part.gates.find((g) => g.id === gateId)!.offset) }]);
    if (state.parts[part.id].cut.includes(gateId)) return;
    setState((s) => cutGate(kit, s, part.id, gateId));
    // a failed save never interrupts play (PRD: losing the connection must not lose the session)
    addGateCut(entry.id).then(() => setSaveError(false), () => setSaveError(true));
  }

  // record the finished model on the shelf (re-recorded if the player keeps sanding afterwards)
  function shelve(nubs: number) {
    return finishKit(entry.id, nubs).then(
      () => setSaveError(false),
      () => {
        setSaveError(true);
        throw new Error("finish not saved");
      },
    );
  }

  async function toShelf() {
    setShelving(true);
    try {
      await shelve(nubsLeft);
      router.push("/dashboard");
    } catch {
      setShelving(false);
    }
  }

  function onDrop(partId: string, at: Vec3) {
    setDragging(null);
    const part = kit.parts.find((p) => p.id === partId)!;
    const rest: Vec3 = [at[0], part.size[1] / 2, 0]; // where it lands on the mat if it does not snap
    const res = checkDrop(kit, state, partId, at);
    if (res.kind === "snap" || checkDrop(kit, state, partId, rest).kind === "snap") {
      sfx.snap();
      setHint(null);
      setPos((p) => ({ ...p, [partId]: part.target }));
      const next = placePart(kit, state, partId);
      setState(next);
      if (isComplete(kit, next)) shelve(nubsLeft).catch(() => {});
      return;
    }
    if (res.kind !== "none") sfx.bump();
    setHint(res.kind === "wrong-step" ? { key: "wrongStep", n: state.step } : res.kind === "wrong-spot" ? { key: "wrongSpot", part: res.spotOf } : null);
    setPos((p) => ({ ...p, [partId]: rest }));
  }

  return (
    <div className={styles.shell}>
      <Canvas camera={{ position: [-1, 11, 6.5], fov: 42 }} dpr={[1, 2]}>
        <color attach="background" args={["#10261F"]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[4, 8, 5]} intensity={1.6} />
        <OrbitControls makeDefault target={[-1, 0.6, 0]} maxPolarAngle={Math.PI / 2.1} minDistance={4} maxDistance={16} />
        <Scene
          kit={kit}
          tool={tool}
          state={state}
          pos={pos}
          nextGate={nextGate}
          dragging={dragging}
          onCut={onCut}
          canDrag={(id) => tool === "build" && state.parts[id].status === "free"}
          onDragStart={setDragging}
          onDragMove={(id, at) => setPos((p) => ({ ...p, [id]: at }))}
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
        <Link className={styles.back} href="/dashboard">
          {t("back")}
        </Link>
        <h1 className={styles.kitTitle}>
          <span className={ui.code}>{entry.code}</span> {tk(`${entry.id}.name`)}
        </h1>
        <div className={styles.tools} role="toolbar" aria-label={t("toolsLabel")}>
          {(["nipper", "sand", "build"] as const).map((k) => (
            <button key={k} aria-pressed={tool === k} onClick={() => setTool(k)}>
              {t(`tools.${k}`)}
            </button>
          ))}
        </div>
        <p className={styles.hint}>{t(`hint.${tool}`)}</p>
        {saveError && (
          <p className={styles.warn} role="status">
            {t("saveError")}
          </p>
        )}
        {hint && <p className={styles.warn}>{hint.key === "wrongStep" ? t("drop.wrongStep", { n: hint.n }) : t("drop.wrongSpot", { part: t(`parts.${hint.part}`) })}</p>}
        <h2>{t("manual")}</h2>
        <ol className={styles.manual}>
          {Array.from({ length: maxStep }, (_, i) => i + 1).map((n) => (
            <li key={n} data-state={n < state.step ? "done" : n === state.step ? "now" : "later"}>
              {t("step", { n })}: {kit.parts.filter((p) => p.step === n).map((p) => t(`parts.${p.id}`)).join(", ")}
            </li>
          ))}
        </ol>
        <p>{t("nubsLeft", { n: nubsLeft })}</p>
        {done && (
          <div className={styles.done} role="status">
            <p>{t("done")}</p>
            <button className={ui.btn} type="button" onClick={toShelf} disabled={shelving}>
              {t("toShelf")}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

type SceneProps = {
  kit: KitDef;
  tool: Tool;
  state: KitState;
  pos: Record<string, Vec3>;
  nextGate: string | null;
  dragging: string | null;
  onCut: (part: PartDef, gateId: string) => void;
  canDrag: (partId: string) => boolean;
  onDragStart: (partId: string) => void;
  onDragMove: (partId: string, at: Vec3) => void;
  onDrop: (partId: string, at: Vec3) => void;
  onRub: (partId: string, gateId: string, pixels: number) => void;
};

function Scene({ kit, tool, state, pos, nextGate, dragging, onCut, canDrag, onDragStart, onDragMove, onDrop, onRub }: SceneProps) {
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

  function startDrag(id: string) {
    onDragStart(id);
    let last: Vec3 = pos[id];
    session(
      (e) => {
        const at = toWorld(e);
        if (at) onDragMove(id, (last = at));
      },
      (e) => onDrop(id, toWorld(e) ?? last),
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
      <Runner gradient={gradient} />
      <mesh position={[ASSEMBLY_X, 0.01, 0]} rotation-x={-Math.PI / 2}>
        <circleGeometry args={[1.1, 40]} />
        <meshToonMaterial color="#2A6656" gradientMap={gradient} />
      </mesh>

      {kit.parts.map((p) => {
        const ps = state.parts[p.id];
        const ghost = ps.status !== "placed" && p.step === state.step;
        return (
          <group key={p.id}>
            {ghost && (
              <mesh position={p.target}>
                <boxGeometry args={p.size} />
                <meshBasicMaterial color={YELLOW} transparent opacity={0.22} depthWrite={false} />
              </mesh>
            )}
            <group position={pos[p.id]}>
              <mesh
                onPointerDown={(e: ThreeEvent<PointerEvent>) => {
                  if (!canDrag(p.id)) return;
                  e.stopPropagation();
                  startDrag(p.id);
                }}
              >
                <boxGeometry args={p.size} />
                <meshToonMaterial color={p.color} gradientMap={gradient} transparent={dragging === p.id} opacity={dragging === p.id ? 0.85 : 1} />
                <Outlines thickness={0.04} color={INK} />
              </mesh>
              {p.gates.map((g) => {
                const cut = ps.cut.includes(g.id);
                if (!cut) return <Gate key={g.id} offset={g.offset} hot={nextGate === `${p.id}/${g.id}` && tool === "nipper"} onCut={() => tool === "nipper" && onCut(p, g.id)} />;
                return <Nub key={g.id} offset={g.offset} height={ps.nubs[g.id] ?? 0} active={tool === "sand"} onStart={() => startRub(p.id, g.id)} gradient={gradient} color={p.color} />;
              })}
            </group>
          </group>
        );
      })}
    </group>
  );
}

function Runner({ gradient }: { gradient: THREE.Texture }) {
  // frame + middle bar the gates attach to
  const x0 = -5.3, x1 = -2.2, z = 1.3, r = 0.05;
  const bars: { p: Vec3; len: number; axis: "x" | "z" }[] = [
    { p: [(x0 + x1) / 2, RUNNER_BAR_Y, 0], len: x1 - x0, axis: "x" },
    { p: [(x0 + x1) / 2, RUNNER_BAR_Y, -z], len: x1 - x0, axis: "x" },
    { p: [(x0 + x1) / 2, RUNNER_BAR_Y, z], len: x1 - x0, axis: "x" },
    { p: [x0, RUNNER_BAR_Y, 0], len: 2 * z, axis: "z" },
    { p: [x1, RUNNER_BAR_Y, 0], len: 2 * z, axis: "z" },
  ];
  return (
    <group>
      {bars.map((b, i) => (
        <mesh key={i} position={b.p} rotation={b.axis === "x" ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[r, r, b.len, 10]} />
          <meshToonMaterial color={SPRUE} gradientMap={gradient} />
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
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.035, 0.03, GATE_LENGTH, 10]} />
        <meshBasicMaterial ref={mat} color={SPRUE} />
      </mesh>
      {/* fat invisible hit area so a thin gate is easy to click */}
      <mesh
        rotation-x={Math.PI / 2}
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
  const dir = Math.sign(offset[2]); // gate points away from the part along z
  const len = 0.02 + 0.1 * height;
  const faceZ = offset[2] - dir * (GATE_LENGTH / 2);
  return (
    <group position={[offset[0], offset[1], faceZ + (dir * len) / 2]}>
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.035, 0.04, len, 10]} />
        <meshToonMaterial color={color} gradientMap={gradient} />
        <Outlines thickness={0.01} color={INK} />
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
