import type { ThemeMode } from "./types";

export function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = theme;
}
