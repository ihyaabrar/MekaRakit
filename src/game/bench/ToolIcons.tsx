// Line icons for the hotbar, drawn for MekaRakit's own tools (not a stock icon set).
import type { HeldTool } from "./Props";

const common = { width: 28, height: 28, viewBox: "0 0 32 32", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export function ToolIcon({ tool }: { tool: HeldTool }) {
  switch (tool) {
    case "hand":
      return (
        <svg {...common}>
          <path d="M11 16V7.5a1.8 1.8 0 0 1 3.6 0V15" />
          <path d="M14.6 14V5.8a1.8 1.8 0 0 1 3.6 0V15" />
          <path d="M18.2 14.5V7.5a1.8 1.8 0 0 1 3.6 0V17" />
          <path d="M21.8 13.5a1.8 1.8 0 0 1 3.6 0V19c0 5-3.4 8.5-8.4 8.5h-1.5c-3 0-4.8-1.4-6.5-3.8L6 19.8a1.9 1.9 0 0 1 3-2.3L11 20" />
        </svg>
      );
    case "nipper":
      return (
        <svg {...common}>
          <path d="M14 4l2 9 2-9" />
          <circle cx="16" cy="14.5" r="1.8" />
          <path d="M15 16l-6 12M17 16l6 12" />
        </svg>
      );
    case "sand":
      return (
        <svg {...common}>
          <rect x="6" y="8" width="20" height="16" rx="1.5" />
          <path d="M10 13h1M15 12h1M20 14h1M12 18h1M18 19h1M22 18h1" />
        </svg>
      );
    case "brush":
      return (
        <svg {...common}>
          <path d="M20 4l8 8-9 9-3-5-5-3z" />
          <path d="M11 13c-3 0-5 2-5 5 0 2-1 4-3 5 4 2 10 1 12-3 1-2 1-4 0-5" />
        </svg>
      );
    case "decal":
      return (
        <svg {...common}>
          <path d="M7 5h14l5 5v17H7z" />
          <path d="M21 5v5h5" />
          <circle cx="15" cy="18" r="4.5" />
        </svg>
      );
  }
}
