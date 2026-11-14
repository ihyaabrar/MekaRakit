// Box-art for the 3D kit lid, drawn on a canvas with the same blocky mecha as the dashboard's KitArt (variant 1),
// so the box on the bench and the box in the dashboard are the same product.
import * as THREE from "three";

const INK = "#14202B";
const YELLOW = "#F2C230";
const WHITE = "#F5F7F3";

export function makeBoxArt({ code, name, body, trim }: { code: string; name: string; body: string; trim: string }): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const W = 640;
  const H = 520;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) return null;
  const display = getComputedStyle(document.documentElement).getPropertyValue("--font-big-shoulders").trim() || "sans-serif";

  // lid face: white panel with an ink border, yellow title band
  g.fillStyle = WHITE;
  g.fillRect(0, 0, W, H);
  g.fillStyle = YELLOW;
  g.fillRect(0, 0, W, 96);
  g.strokeStyle = INK;
  g.lineWidth = 10;
  g.strokeRect(5, 5, W - 10, H - 10);
  g.beginPath();
  g.moveTo(0, 96);
  g.lineTo(W, 96);
  g.stroke();

  g.fillStyle = INK;
  g.font = `900 64px ${display}`;
  g.textBaseline = "middle";
  g.fillText(name, 32, 50);
  g.font = `800 34px ${display}`;
  const cw = g.measureText(code).width;
  g.lineWidth = 5;
  g.strokeRect(W - cw - 56, 28, cw + 24, 44);
  g.fillText(code, W - cw - 44, 51);

  // the mecha (KitArt geometry, viewBox 120x150), centered under the band
  const s = 2.6;
  const ox = W / 2 - 60 * s;
  const oy = 112;
  const rect = (x: number, y: number, w: number, h: number, fill: string) => {
    g.fillStyle = fill;
    g.fillRect(ox + x * s, oy + y * s, w * s, h * s);
    g.lineWidth = 3 * s;
    g.strokeStyle = INK;
    g.strokeRect(ox + x * s, oy + y * s, w * s, h * s);
  };
  rect(40, 92, 17, 46, trim);
  rect(63, 92, 17, 46, trim);
  rect(36, 132, 23, 9, body);
  rect(61, 132, 23, 9, body);
  rect(18, 52, 14, 40, body);
  rect(88, 52, 14, 40, body);
  rect(14, 44, 22, 16, trim);
  rect(84, 44, 22, 16, trim);
  rect(34, 44, 52, 50, body);
  rect(48, 56, 24, 14, YELLOW);
  rect(47, 18, 26, 26, trim);
  g.fillStyle = INK;
  g.fillRect(ox + 51 * s, oy + 27 * s, 18 * s, 6 * s);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
