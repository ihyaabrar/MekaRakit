import { loadKit, type KitFileV1, type LoadedKit } from "./kitFormat";
import kr01 from "../../kits/kr-01/kit.json";

export type KitLevel = "beginner" | "easy" | "medium";

export type KitEntry = {
  id: string;
  code: string; // printed on the box, like a real kit number
  level: KitLevel;
  colors: { body: string; trim: string }; // box-art colors
  kit: LoadedKit | null; // null = parts not designed yet
};

// MVP catalog: 3 kits, unlocked in order. Names live in messages (kits.<id>.name).
export const catalog: KitEntry[] = [
  { id: "kr-01", code: "KR-01", level: "beginner", colors: { body: "#2F5FB0", trim: "#F5F7F3" }, kit: loadKit(kr01 as KitFileV1) },
  { id: "kr-02", code: "KR-02", level: "easy", colors: { body: "#F5F7F3", trim: "#2F5FB0" }, kit: null },
  { id: "kr-03", code: "KR-03", level: "medium", colors: { body: "#9AA3AB", trim: "#F2C230" }, kit: null },
];

export const findKit = (id: string) => catalog.find((k) => k.id === id);
