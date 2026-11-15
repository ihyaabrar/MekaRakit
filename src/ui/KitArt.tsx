// Box art for a kit: a render of the mech the kit builds (public/art, made by scripts/build-mech-kit.mjs),
// the same picture printed on the 3D box lid.
import Image from "next/image";
import { findKit } from "@/game/kits";

type Props = { kitId: string; label: string; size?: number };

export default function KitArt({ kitId, label, size = 160 }: Props) {
  // the versioned URL from the kit file, so a rebuilt render is never served from an old cache
  const src = findKit(kitId)?.kit?.art ?? `/art/${kitId}.png`;
  return <Image src={src} alt={label} width={size} height={Math.round(size * 1.25)} />;
}
