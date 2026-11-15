// Turns one rigged Quaternius mech (glTF, CC0) into a MekaRakit kit:
//   kits/<id>/kit.json        parts, runners, steps, targets, pose joints (format v1)
//   public/models/<id>.json   part geometry (rigid pieces, part-local, already scaled)
// Every triangle goes to the bone that moves it most, then each bone's piece is frozen in the
// first frame of the "Idle" clip, so the arms hang down instead of the T-pose.
// Usage: node scripts/build-mech-kit.mjs <model.gltf> <kit-id> <KIT-CODE> [height]
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import * as THREE from "three";

const [src, kitId, code, heightArg] = process.argv.slice(2);
if (!src || !kitId || !code) throw new Error("usage: build-mech-kit.mjs <model.gltf> <kit-id> <KIT-CODE> [height]");
const HEIGHT = Number(heightArg ?? 3.4);
const GATE = 0.3; // keep in sync with GATE_LENGTH in src/game/kitFormat.ts
const BAR_Y = 0.15; // keep in sync with RUNNER_BAR_Y

const g = JSON.parse(fs.readFileSync(src, "utf8"));
const buffers = g.buffers.map((b) => {
  if (!b.uri?.startsWith("data:")) throw new Error("only embedded buffers are supported");
  return Buffer.from(b.uri.split(",")[1], "base64");
});
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function read(i) {
  const a = g.accessors[i];
  const v = g.bufferViews[a.bufferView];
  const T = COMP[a.componentType];
  const n = SIZE[a.type];
  const buf = buffers[v.buffer];
  const stride = v.byteStride ?? n * T.BYTES_PER_ELEMENT;
  const out = new Array(a.count);
  for (let k = 0; k < a.count; k++) {
    const off = buf.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0) + k * stride;
    out[k] = Array.from(new T(buf.buffer.slice(off, off + n * T.BYTES_PER_ELEMENT)));
  }
  return out;
}

// --- pose the skeleton at the first Idle frame -------------------------------------------
const local = g.nodes.map((n) => ({
  t: new THREE.Vector3(...(n.translation ?? [0, 0, 0])),
  r: new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])),
  s: new THREE.Vector3(...(n.scale ?? [1, 1, 1])),
}));
const idle = (g.animations ?? []).find((a) => a.name === "Idle");
for (const ch of idle?.channels ?? []) {
  const v = read(idle.samplers[ch.sampler].output)[0];
  const L = local[ch.target.node];
  if (ch.target.path === "translation") L.t.set(...v);
  if (ch.target.path === "rotation") L.r.set(...v);
  if (ch.target.path === "scale") L.s.set(...v);
}
const parent = new Map();
g.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
const world = new Map();
function worldOf(i) {
  if (world.has(i)) return world.get(i);
  const m = new THREE.Matrix4().compose(local[i].t, local[i].r, local[i].s);
  if (parent.has(i)) m.premultiply(worldOf(parent.get(i)));
  world.set(i, m);
  return m;
}

const meshNode = g.nodes.findIndex((n) => n.mesh != null && n.skin != null);
const skin = g.skins[g.nodes[meshNode].skin];
const joints = skin.joints;
const jointName = joints.map((j) => g.nodes[j].name);
const invBind = read(skin.inverseBindMatrices).map((m) => new THREE.Matrix4().fromArray(m));
const skinMat = joints.map((j, k) => worldOf(j).clone().multiply(invBind[k]));

// bone -> part: fingers and palm pieces become one hand; IK helpers never own geometry
const groupOf = (name) => {
  const hand = name.match(/^(Palm|Pinky|Ring|Index|Thumb|Middle)\w*\.(L|R)$/);
  return hand ? `Hand.${hand[2]}` : name;
};

// --- split triangles ----------------------------------------------------------------------
const lin2srgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const hex = (rgb) => "#" + rgb.map((c) => Math.round(Math.min(1, lin2srgb(c)) * 255).toString(16).padStart(2, "0")).join("");
const mats = g.materials.map((m) => ({ name: m.name, rgb: (m.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1]).slice(0, 3) }));
const mainMat = Math.max(0, mats.findIndex((m) => m.name === "Main"));

const pieces = new Map(); // group -> { main: [...xyz nxnynz], detail: [...xyz nxnynz rgb] , joint }
const p = new THREE.Vector3();
const nv = new THREE.Vector3();
for (const prim of g.meshes[g.nodes[meshNode].mesh].primitives) {
  const P = read(prim.attributes.POSITION);
  const N = read(prim.attributes.NORMAL);
  const J = read(prim.attributes.JOINTS_0);
  const W = read(prim.attributes.WEIGHTS_0);
  const I = read(prim.indices).map((x) => x[0]);
  for (let t = 0; t < I.length; t += 3) {
    const tri = [I[t], I[t + 1], I[t + 2]];
    const score = new Map();
    for (const v of tri) for (let k = 0; k < 4; k++) if (W[v][k] > 0) score.set(J[v][k], (score.get(J[v][k]) ?? 0) + W[v][k]);
    const jk = [...score].sort((a, b) => b[1] - a[1])[0][0];
    const grp = groupOf(jointName[jk]);
    if (!pieces.has(grp)) pieces.set(grp, { main: [], detail: [], joint: jk });
    const piece = pieces.get(grp);
    const m = skinMat[jk];
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (const v of tri) {
      p.set(...P[v]).applyMatrix4(m);
      nv.set(...N[v]).applyMatrix3(nm).normalize();
      if (prim.material === mainMat) piece.main.push(p.x, p.y, p.z, nv.x, nv.y, nv.z);
      else piece.detail.push(p.x, p.y, p.z, nv.x, nv.y, nv.z, ...mats[prim.material].rgb);
    }
  }
}

// tiny scraps (a few stray triangles) fold into the parent bone's piece
const groupParent = (grp) => {
  const j = joints.findIndex((_, k) => groupOf(jointName[k]) === grp);
  let n = parent.get(joints[j]);
  while (n != null && !joints.includes(n)) n = parent.get(n);
  return n == null ? null : groupOf(g.nodes[n].name);
};
const tris = (pc) => pc.main.length / 18 + pc.detail.length / 27;
for (const [grp, pc] of [...pieces]) {
  if (tris(pc) >= 16) continue;
  let up = groupParent(grp);
  while (up && !pieces.has(up)) up = groupParent(up);
  if (!up) continue;
  pieces.get(up).main.push(...pc.main);
  pieces.get(up).detail.push(...pc.detail);
  pieces.delete(grp);
}

// --- scale and place ----------------------------------------------------------------------
const all = new THREE.Box3();
for (const pc of pieces.values()) {
  for (let i = 0; i < pc.main.length; i += 6) all.expandByPoint(p.set(pc.main[i], pc.main[i + 1], pc.main[i + 2]));
  for (let i = 0; i < pc.detail.length; i += 9) all.expandByPoint(p.set(pc.detail[i], pc.detail[i + 1], pc.detail[i + 2]));
}
const S = HEIGHT / (all.max.y - all.min.y);
const cx = (all.min.x + all.max.x) / 2;
const cz = (all.min.z + all.max.z) / 2;
const toKit = (x, y, z) => [(x - cx) * S, (y - all.min.y) * S, (z - cz) * S];
const r3 = (n) => Math.round(n * 1000) / 1000;
const r2 = (n) => Math.round(n * 100) / 100;

const NAMES = {
  Body: ["Pinggul", "Hip"],
  Torso: ["Perut", "Abdomen"],
  Chest: ["Dada", "Chest"],
  Neck: ["Leher", "Neck"],
  Head: ["Kepala", "Head"],
  Shoulder: ["Bahu", "shoulder"],
  UpperArm: ["Lengan atas", "upper arm"],
  LowerArm: ["Lengan bawah", "forearm"],
  Hand: ["Tangan", "hand"],
  UpperLeg: ["Paha", "thigh"],
  MidLeg: ["Lutut", "knee"],
  LowerLeg: ["Betis", "shin"],
  FootBack: ["Tumit", "heel"],
  Foot: ["Telapak", "foot"],
};
const STEP_OF = { Foot: 1, FootBack: 1, LowerLeg: 1, MidLeg: 1, UpperLeg: 2, Body: 2, Torso: 3, Chest: 3, Neck: 4, Head: 4, Shoulder: 5, UpperArm: 5, LowerArm: 5, Hand: 6 };
const STEP_TITLES = {
  1: ["Kaki bawah", "Feet and shins"],
  2: ["Paha dan pinggul", "Thighs and hip"],
  3: ["Badan", "Torso"],
  4: ["Kepala", "Head"],
  5: ["Lengan", "Arms"],
  6: ["Tangan", "Hands"],
};
const nameOf = (grp) => {
  const [base, side] = grp.split(".");
  const [id, en] = NAMES[base] ?? [base, base];
  if (!side) return { id, en };
  return side === "L" ? { id: `${id} kiri`, en: `Left ${en}` } : { id: `${id} kanan`, en: `Right ${en}` };
};

const parts = [];
const geometry = {};
for (const [grp, pc] of pieces) {
  const box = new THREE.Box3();
  const pts = (arr, stride) => {
    for (let i = 0; i < arr.length; i += stride) box.expandByPoint(p.set(...toKit(arr[i], arr[i + 1], arr[i + 2])));
  };
  pts(pc.main, 6);
  pts(pc.detail, 9);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  // geometry is part-local: centered on its own bounding box, in kit units
  const localize = (arr, stride) => {
    const out = [];
    for (let i = 0; i < arr.length; i += stride) {
      const [x, y, z] = toKit(arr[i], arr[i + 1], arr[i + 2]);
      out.push(r3(x - c.x), r3(y - c.y), r3(z - c.z), r2(arr[i + 3]), r2(arr[i + 4]), r2(arr[i + 5]));
      if (stride === 9) out.push(r2(arr[i + 6]), r2(arr[i + 7]), r2(arr[i + 8]));
    }
    return out;
  };
  const key = grp.replace(".", "-");
  geometry[key] = { main: localize(pc.main, 6), detail: localize(pc.detail, 9) };
  const base = grp.split(".")[0];
  parts.push({
    key,
    grp,
    name: nameOf(grp),
    color: hex(mats[mainMat].rgb),
    size: [r3(Math.max(size.x, 0.12)), r3(Math.max(size.y, 0.12)), r3(Math.max(size.z, 0.12))],
    target: [r3(c.x), r3(c.y), r3(c.z)],
    step: STEP_OF[base] ?? 3,
    joint: pc.joint,
  });
}

// renumber steps so none is empty
const usedSteps = [...new Set(parts.map((q) => q.step))].sort((a, b) => a - b);
const stepMap = new Map(usedSteps.map((s, i) => [s, i + 1]));
parts.forEach((q) => (q.step = stepMap.get(q.step)));
parts.sort((a, b) => a.step - b.step || a.target[1] - b.target[1] || a.target[0] - b.target[0]);

// --- runners: pack parts left to right, two rows per runner ------------------------------
const RUNNER_W = 6.4;
const GAP = 0.16;
const runners = [];
let cur = null;
let row = -1;
let x = 0;
const open = () => {
  cur = { id: String.fromCharCode(65 + runners.length), parts: [] };
  runners.push(cur);
  row = -1;
  x = -RUNNER_W / 2 + GAP;
};
open();
for (const q of parts) {
  const w = q.size[0];
  if (x + w > RUNNER_W / 2 - GAP) {
    if (row === -1) {
      row = 1;
      x = -RUNNER_W / 2 + GAP;
    } else open();
  }
  q.runner = cur.id;
  q.row = row;
  q.x = r3(x + w / 2);
  x += w + GAP;
  cur.parts.push(q);
}
// runners stack front to back on the left half of the mat
let z = -4.4;
const runnerDefs = runners.map((r) => {
  const maxH = Math.max(...r.parts.map((q) => q.size[1]));
  const depth = r3(2 * (GATE + maxH) + 0.2);
  const center = [-3.6, r3(z + depth / 2)];
  z += depth + 0.25;
  return { id: r.id, color: r.parts[0].color, center, size: [RUNNER_W, depth] };
});
runners.forEach((r) => r.parts.forEach((q, i) => (q.id = `${r.id}${i + 1}`)));

// --- pose joints: waist, head, arms, legs --------------------------------------------------
const jointAt = (name) => {
  const k = jointName.indexOf(name);
  if (k < 0) return null;
  const w = new THREE.Vector3().setFromMatrixPosition(worldOf(joints[k]));
  return toKit(w.x, w.y, w.z).map(r3);
};
const below = (name) => {
  // every group whose bone sits under `name` in the skeleton (itself included)
  const root = joints[jointName.indexOf(name)];
  const under = (n) => n === root || (parent.has(n) && under(parent.get(n)));
  return parts.filter((q) => under(joints[q.joint])).map((q) => q.id);
};
const POSES = [
  ["waist", "Torso", ["Pinggang", "Waist"], "y", -45, 45],
  ["head", "Neck", ["Kepala", "Head"], "y", -70, 70],
  ["arm-l", "Shoulder.L", ["Lengan kiri", "Left arm"], "x", -150, 40],
  ["arm-r", "Shoulder.R", ["Lengan kanan", "Right arm"], "x", -150, 40],
  ["leg-l", "UpperLeg.L", ["Kaki kiri", "Left leg"], "x", -60, 45],
  ["leg-r", "UpperLeg.R", ["Kaki kanan", "Right leg"], "x", -60, 45],
];
const poses = POSES.flatMap(([id, bone, [nid, nen], axis, min, max]) => {
  const at = jointAt(bone) ?? (bone === "Neck" ? jointAt("Head") : null);
  const ids = jointAt(bone) ? below(bone) : bone === "Neck" ? below("Head") : [];
  if (!at || !ids.length) return [];
  return [{ id, name: { id: nid, en: nen }, parts: ids, pivot: at, axis, min, max }];
});

// Gates go where the plastic really reaches the runner end, as close to bar height as the shape allows,
// so the nubs left after cutting sit on the part instead of floating at a bounding-box corner.
function gatesFor(q) {
  const [w, h, d] = q.size;
  const g = geometry[q.key];
  const endY = q.row * (h / 2);
  const barZ = BAR_Y - d / 2;
  const near = [];
  for (const [arr, stride] of [[g.main, 6], [g.detail, 9]])
    for (let i = 0; i < arr.length; i += stride) if (Math.abs(arr[i + 1] - endY) < Math.max(0.06, h * 0.12)) near.push([arr[i], Math.abs(arr[i + 2] - barZ)]);
  const best = (pred) => near.filter(([x]) => pred(x)).sort((a, b) => a[1] - b[1])[0]?.[0];
  const clamp = (x) => r3(Math.max(-w / 2, Math.min(w / 2, x)));
  if (w >= 0.5) {
    const l = best((x) => x < -w / 8);
    const r = best((x) => x > w / 8);
    if (l != null && r != null) return [clamp(l), clamp(r)];
  }
  const one = best(() => true);
  return [clamp(one ?? 0)];
}

const kit = {
  format: 1,
  id: kitId,
  code,
  assemblyAt: [3, 0],
  runners: runnerDefs,
  steps: usedSteps.map((s) => ({ n: stepMap.get(s), title: { id: STEP_TITLES[s][0], en: STEP_TITLES[s][1] } })),
  parts: parts.map((q) => ({
    id: q.id,
    name: q.name,
    model: q.key,
    runner: q.runner,
    row: q.row,
    x: q.x,
    gates: gatesFor(q),
    color: q.color,
    size: q.size,
    target: q.target,
    step: q.step,
  })),
  model: `/models/${kitId}.json`,
  poses,
};

fs.mkdirSync(path.join("kits", kitId), { recursive: true });
fs.writeFileSync(path.join("kits", kitId, "kit.json"), JSON.stringify(kit, null, 2) + "\n");
fs.mkdirSync(path.join("public", "models"), { recursive: true });
fs.writeFileSync(path.join("public", "models", `${kitId}.json`), JSON.stringify(geometry));
console.log(`${kitId}: ${parts.length} parts, ${runnerDefs.length} runners, ${kit.steps.length} steps, ${poses.length} joints, height ${HEIGHT}`);
console.log(runnerDefs.map((r) => `${r.id} ${r.center} ${r.size}`).join("\n"));

// --- box art: a flat-shaded 3/4 render of the assembled mech, transparent background ------
const W = 480, H = 600, SS = 2; // supersampled, then averaged
const yaw = -0.45, pitch = 0.12;
const rot = new THREE.Matrix4().makeRotationX(pitch).multiply(new THREE.Matrix4().makeRotationY(yaw));
const light = new THREE.Vector3(-0.5, 0.8, 0.9).normalize();
const artTris = [];
for (const pc of pieces.values()) {
  const mainRgb = mats[mainMat].rgb;
  for (const [arr, stride] of [[pc.main, 6], [pc.detail, 9]])
    for (let i = 0; i < arr.length; i += stride * 3) {
      const v = [0, 1, 2].map((k) => new THREE.Vector3(...toKit(arr[i + k * stride], arr[i + k * stride + 1], arr[i + k * stride + 2])).applyMatrix4(rot));
      const rgb = stride === 9 ? [arr[i + 6], arr[i + 7], arr[i + 8]] : mainRgb;
      artTris.push([v, rgb]);
    }
}
const bb = new THREE.Box3();
artTris.forEach(([v]) => v.forEach((x) => bb.expandByPoint(x)));
const sc = Math.min((W * SS * 0.86) / (bb.max.x - bb.min.x), (H * SS * 0.9) / (bb.max.y - bb.min.y));
const ox = (W * SS) / 2 - ((bb.min.x + bb.max.x) / 2) * sc;
const oy = (H * SS) / 2 + ((bb.min.y + bb.max.y) / 2) * sc;
const BW = W * SS, BH = H * SS;
const zbuf = new Float32Array(BW * BH).fill(-Infinity);
const rgba = new Float32Array(BW * BH * 4);
const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
for (const [[a, b, c], rgb] of artTris) {
  fn.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a)).normalize();
  if (fn.z < 0) fn.negate(); // facing the viewer either way: the mesh has no back faces to cull reliably
  const shade = 0.42 + 0.7 * Math.max(0, fn.dot(light));
  const col = rgb.map((x) => Math.min(1, lin2srgb(Math.min(1, x * shade))));
  const P = [a, b, c].map((v) => [ox + v.x * sc, oy - v.y * sc, v.z]);
  const minX = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0])));
  const maxX = Math.min(BW - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])));
  const minY = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1])));
  const maxY = Math.min(BH - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])));
  const area = (P[1][0] - P[0][0]) * (P[2][1] - P[0][1]) - (P[2][0] - P[0][0]) * (P[1][1] - P[0][1]);
  if (Math.abs(area) < 1e-9) continue;
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((P[1][0] - px) * (P[2][1] - py) - (P[2][0] - px) * (P[1][1] - py)) / area;
      const w1 = ((P[2][0] - px) * (P[0][1] - py) - (P[0][0] - px) * (P[2][1] - py)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * P[0][2] + w1 * P[1][2] + w2 * P[2][2];
      const k = y * BW + x;
      if (z <= zbuf[k]) continue;
      zbuf[k] = z;
      rgba.set([col[0], col[1], col[2], 1], k * 4);
    }
}
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const acc = [0, 0, 0, 0];
    for (let sy = 0; sy < SS; sy++)
      for (let sx = 0; sx < SS; sx++) {
        const k = ((y * SS + sy) * BW + x * SS + sx) * 4;
        for (let ch = 0; ch < 3; ch++) acc[ch] += rgba[k + ch] * rgba[k + 3];
        acc[3] += rgba[k + 3];
      }
    const o = y * (W * 4 + 1) + 1 + x * 4;
    for (let ch = 0; ch < 3; ch++) raw[o + ch] = acc[3] ? Math.round((acc[ch] / acc[3]) * 255) : 0;
    raw[o + 3] = Math.round((acc[3] / (SS * SS)) * 255);
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr.set([8, 6, 0, 0, 0], 8);
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
fs.mkdirSync(path.join("public", "art"), { recursive: true });
fs.writeFileSync(path.join("public", "art", `${kitId}.png`), png);
console.log(`box art public/art/${kitId}.png ${png.length} bytes`);
