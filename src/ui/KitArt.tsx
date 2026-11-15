// Box art for a kit: a render of the mech the kit builds (public/art, made by scripts/build-mech-kit.mjs),
// the same picture printed on the 3D box lid.
import Image from "next/image";

type Props = { kitId: string; label: string; size?: number };

export default function KitArt({ kitId, label, size = 160 }: Props) {
  return <Image src={`/art/${kitId}.png`} alt={label} width={size} height={Math.round(size * 1.25)} />;
}
