// Box art for a kit: the same blocky, outlined mecha the 3D workbench renders, so the box shows what you build.
// Variants differ by silhouette (head crest, shoulder shape) so each kit is recognizable at small sizes.

type Props = { body: string; trim: string; variant: number; label: string; size?: number };

const INK = "#14202B";

export default function KitArt({ body, trim, variant, label, size = 160 }: Props) {
  const s = { stroke: INK, strokeWidth: 3, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 120 150" width={size} height={(size * 150) / 120} role="img" aria-label={label}>
      {/* legs */}
      <rect x="40" y="92" width="17" height="46" fill={trim} {...s} />
      <rect x="63" y="92" width="17" height="46" fill={trim} {...s} />
      <rect x="36" y="132" width="23" height="9" fill={body} {...s} />
      <rect x="61" y="132" width="23" height="9" fill={body} {...s} />
      {/* arms */}
      <rect x="18" y="52" width="14" height="40" fill={body} {...s} />
      <rect x="88" y="52" width="14" height="40" fill={body} {...s} />
      {/* shoulders: square, round, or angled by variant */}
      {variant === 1 && (
        <>
          <rect x="14" y="44" width="22" height="16" fill={trim} {...s} />
          <rect x="84" y="44" width="22" height="16" fill={trim} {...s} />
        </>
      )}
      {variant === 2 && (
        <>
          <circle cx="25" cy="50" r="11" fill={trim} {...s} />
          <circle cx="95" cy="50" r="11" fill={trim} {...s} />
        </>
      )}
      {variant === 3 && (
        <>
          <polygon points="10,58 22,40 38,46 36,60" fill={trim} {...s} />
          <polygon points="110,58 98,40 82,46 84,60" fill={trim} {...s} />
        </>
      )}
      {/* torso */}
      <rect x="34" y="44" width="52" height="50" fill={body} {...s} />
      <rect x="48" y="56" width="24" height="14" fill="#F2C230" {...s} />
      {/* head */}
      <rect x="47" y="18" width="26" height="26" fill={trim} {...s} />
      <rect x="51" y="27" width="18" height="6" fill={INK} />
      {variant === 2 && <polygon points="60,4 54,18 66,18" fill="#F2C230" {...s} />}
      {variant === 3 && <rect x="56" y="6" width="8" height="12" fill={body} {...s} />}
    </svg>
  );
}
