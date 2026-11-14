// Background music from public/audio/music.mp3 (owner-supplied). Missing file = silence, no errors shown.
let el: HTMLAudioElement | null = null;
let checked: Promise<boolean> | null = null;
let generation = 0; // bumped by stopMusic so a pending start knows it is stale

const available = () => (checked ??= fetch("/audio/music.mp3", { method: "HEAD" }).then((r) => r.ok, () => false));

/** Call from a user gesture (autoplay rules). volume 0..100. */
export async function startMusic(volume: number) {
  const mine = ++generation;
  if (volume <= 0 || !(await available()) || mine !== generation) return;
  el ??= Object.assign(new Audio("/audio/music.mp3"), { loop: true });
  el.volume = Math.min(1, volume / 100) * 0.6;
  el.play().catch(() => {});
}

export function stopMusic() {
  generation++;
  el?.pause();
}
