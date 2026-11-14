"use client";

import dynamic from "next/dynamic";

// WebGL + Web Audio only exist in the browser
const Workbench = dynamic(() => import("./Workbench"), { ssr: false });

export default function WorkbenchLoader() {
  return <Workbench />;
}
