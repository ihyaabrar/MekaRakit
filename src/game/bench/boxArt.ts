// Box-art for the 3D kit lid: title band plus the same mech render the dashboard shows,
// so the box on the bench and the box in the dashboard are the same product.
import * as THREE from "three";

const INK = "#14202B";
const YELLOW = "#F2C230";
const WHITE = "#F5F7F3";

export function makeBoxArt({ code, name, art }: { code: string; name: string; art: string }): THREE.CanvasTexture | null {
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

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // the kit's own render (public/art, made by scripts/build-mech-kit.mjs) lands once it has loaded
  const img = new Image();
  img.onload = () => {
    const h = H - 96 - 24;
    const w = (img.width / img.height) * h;
    g.drawImage(img, (W - w) / 2, 104, w, h);
    tex.needsUpdate = true;
  };
  img.src = art;
  return tex;
}
