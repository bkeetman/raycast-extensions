import { Color, Icon, Image } from "@raycast/api";

export const BRAND_NAME = "PodPilot";

export type PodpilotThemeName = "nebula" | "classic";

export const BRAND_COLORS = {
  deepSpace: "#090E2E",
  navy: "#0C1D66",
  blue: "#1E6CFF",
  sky: "#28A9FF",
  gold: "#F8BE20",
  orange: "#F18805",
  success: "#32D74B",
  warning: "#FF9F0A",
  danger: "#FF453A",
  neutral: "#8E8E93",
} as const;

type PodpilotTheme = {
  label: string;
  accent: string;
  badge: string;
  subtitlePrefix: string;
};

export const PODPILOT_THEMES: Record<PodpilotThemeName, PodpilotTheme> = {
  nebula: {
    label: "Nebula",
    accent: "✨",
    badge: "🚀",
    subtitlePrefix: "Mission",
  },
  classic: {
    label: "Classic",
    accent: "",
    badge: "",
    subtitlePrefix: "",
  },
} as const;

export const PODPILOT_ACTIVE_THEME: PodpilotThemeName = "nebula";
export const PODPILOT_FALLBACK_THEME: PodpilotThemeName = "classic";

export function podpilotTitle(view: string): string {
  return `${BRAND_NAME} · ${view}`;
}

function podpilotClassicHeader(title: string, subtitle?: string): string {
  const subtitleBlock = subtitle ? ` · \`${subtitle}\`` : "";
  return `# ${title}

**${BRAND_NAME}**${subtitleBlock}
`;
}

function podpilotNebulaHeader(title: string, subtitle?: string): string {
  const theme = PODPILOT_THEMES.nebula;
  const subtitleLine = subtitle
    ? `\`${theme.subtitlePrefix}: ${subtitle}\``
    : `\`${theme.subtitlePrefix}: Cluster Ops\``;
  return `# ${theme.accent} ${title}

**${BRAND_NAME}** ${theme.badge} ${subtitleLine}

---
`;
}

export function podpilotHeader(
  title: string,
  subtitle?: string,
  themeName: PodpilotThemeName = PODPILOT_ACTIVE_THEME,
): string {
  if (themeName === "classic") {
    return podpilotClassicHeader(title, subtitle);
  }
  return podpilotNebulaHeader(title, subtitle);
}

export function podpilotStatus(ok: boolean, okText = "Operational", failText = "Needs Attention"): string {
  return ok ? `🟢 ${okText}` : `🔴 ${failText}`;
}

export function podpilotTwoColumnTable(
  rows: Array<[string, string]>,
  leftHeader = "Item",
  rightHeader = "Value",
): string {
  const lines = rows.map(([left, right]) => `| ${left} | ${right} |`);
  return [`| ${leftHeader} | ${rightHeader} |`, "| --- | --- |", ...lines].join("\n");
}

export function tintedIcon(source: Icon, tintColor: Color.ColorLike): Image.ImageLike {
  return { source, tintColor };
}

export function readyColor(readyValue: string): Color.ColorLike {
  const [ready, total] = readyValue.split("/").map((value) => Number.parseInt(value, 10));
  if (Number.isNaN(ready) || Number.isNaN(total) || total <= 0) {
    return BRAND_COLORS.neutral;
  }

  const ratio = ready / total;
  if (ratio >= 1) {
    return BRAND_COLORS.success;
  }
  if (ratio >= 0.5) {
    return BRAND_COLORS.warning;
  }
  return BRAND_COLORS.danger;
}

export function podPhaseColor(status: string): Color.ColorLike {
  const normalized = status.toLowerCase();
  if (normalized.includes("running") || normalized.includes("completed")) {
    return BRAND_COLORS.success;
  }
  if (normalized.includes("pending") || normalized.includes("terminating")) {
    return BRAND_COLORS.warning;
  }
  if (normalized.includes("crashloop") || normalized.includes("error") || normalized.includes("failed")) {
    return BRAND_COLORS.danger;
  }
  return BRAND_COLORS.sky;
}
