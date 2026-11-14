"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

function Loading() {
  const t = useTranslations("dashboard");
  return (
    <p role="status" style={{ padding: "64px 16px", textAlign: "center", fontSize: 18 }}>
      {t("loading")}
    </p>
  );
}

// These screens read progress from this browser's storage, so they render client-side only.
// next/dynamic needs literal import paths, hence one entry per screen.
export const DashboardScreen = dynamic(() => import("@/app/dashboard/Dashboard"), { ssr: false, loading: Loading });
export const SettingsScreen = dynamic(() => import("@/app/pengaturan/Settings"), { ssr: false, loading: Loading });
export const WorkbenchScreen = dynamic(() => import("@/game/Workbench"), { ssr: false, loading: Loading });
