import { loadKit, type KitFileV1, type LoadedKit } from "./kitFormat";
import kr01 from "../../kits/kr-01/kit.json";
import kr02 from "../../kits/kr-02/kit.json";
import kr03 from "../../kits/kr-03/kit.json";
import kr04 from "../../kits/kr-04/kit.json";

export type KitLevel = "beginner" | "easy" | "medium" | "hard";

export type KitEntry = {
  id: string;
  code: string; // printed on the box, like a real kit number
  level: KitLevel;
  colors: { body: string; trim: string }; // box-art colors
  kit: LoadedKit | null; // null = parts not designed yet
};

// Kits unlock in order. Names live in messages (kits.<id>.name).
// Parts are generated from Quaternius' Animated Mech Pack (CC0) by scripts/build-mech-kit.mjs.
export const catalog: KitEntry[] = [
  { id: "kr-01", code: "KR-01", level: "beginner", colors: { body: "#353535", trim: "#F2C230" }, kit: loadKit(kr01 as KitFileV1) },
  { id: "kr-02", code: "KR-02", level: "easy", colors: { body: "#862B00", trim: "#F5F7F3" }, kit: loadKit(kr02 as KitFileV1) },
  { id: "kr-03", code: "KR-03", level: "medium", colors: { body: "#6089A0", trim: "#F5F7F3" }, kit: loadKit(kr03 as KitFileV1) },
  { id: "kr-04", code: "KR-04", level: "hard", colors: { body: "#678672", trim: "#F2C230" }, kit: loadKit(kr04 as KitFileV1) },
];

export const findKit = (id: string) => catalog.find((k) => k.id === id);
