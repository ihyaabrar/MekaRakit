import { notFound } from "next/navigation";
import { catalog, findKit } from "@/game/kits";
import { WorkbenchScreen } from "@/ui/ClientOnly";

// the kit id comes from the URL; the workbench is client-only anyway, so a blocking navigation is fine
export const instant = false;

export const generateStaticParams = () => catalog.map((k) => ({ kitId: k.id }));

export default async function BuildPage({ params }: PageProps<"/rakit/[kitId]">) {
  const { kitId } = await params;
  if (!findKit(kitId)) notFound();
  return <WorkbenchScreen kitId={kitId} />;
}
