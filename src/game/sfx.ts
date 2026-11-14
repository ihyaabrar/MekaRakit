// Sound effects generated in code (Web Audio); music will come from files in public/audio/.

let ctx: AudioContext | null = null;
let volume = 0.6;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export const setSfxVolume = (v: number) => (volume = Math.min(1, Math.max(0, v)));

function noise(c: AudioContext, seconds: number) {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  return src;
}

function envelope(c: AudioContext, peak: number, attack: number, decay: number) {
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak * volume, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(c.destination);
  return g;
}

/** Nipper snip: short bright noise click. */
export function snip() {
  const c = ac();
  if (!c) return;
  const src = noise(c, 0.08);
  const hp = c.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 3500;
  src.connect(hp).connect(envelope(c, 0.9, 0.002, 0.06));
  src.start();
}

let lastSand = 0;
/** Sandpaper scratch, throttled so continuous rubbing does not stack sounds. */
export function sand() {
  const c = ac();
  if (!c || c.currentTime - lastSand < 0.07) return;
  lastSand = c.currentTime;
  const src = noise(c, 0.12);
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800 + Math.random() * 800;
  bp.Q.value = 0.8;
  src.connect(bp).connect(envelope(c, 0.35, 0.01, 0.1));
  src.start();
}

/** Plastic snap-fit: two quick low clicks. */
export function snap() {
  const c = ac();
  if (!c) return;
  for (const [delay, freq] of [[0, 220], [0.045, 330]] as const) {
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    const g = c.createGain();
    const t = c.currentTime + delay;
    g.gain.setValueAtTime(0.5 * volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.06);
  }
}

/** Gentle "nope" for a wrong drop. */
export function bump() {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(260, c.currentTime);
  o.frequency.exponentialRampToValueAtTime(180, c.currentTime + 0.12);
  o.connect(envelope(c, 0.25, 0.005, 0.12));
  o.start();
  o.stop(c.currentTime + 0.15);
}

let lastBrush = 0;
/** Soft brush stroke: low, brief, breathy. */
export function brush() {
  const c = ac();
  if (!c || c.currentTime - lastBrush < 0.08) return;
  lastBrush = c.currentTime;
  const src = noise(c, 0.25);
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  src.connect(lp).connect(envelope(c, 0.3, 0.03, 0.2));
  src.start();
}
