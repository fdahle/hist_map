import { defineStore } from "pinia";
import { ref, watch } from "vue";

/**
 * Create a persisted ref that auto-syncs with localStorage
 * @param {string} key - localStorage key
 * @param {any} defaultValue - Default value if nothing stored
 * @returns {import('vue').Ref} Reactive ref that persists to localStorage
 */
function persistedRef(key, defaultValue) {
  const stored = localStorage.getItem(key);
  let initial = defaultValue;
  if (stored !== null) {
    try {
      initial = JSON.parse(stored);
    } catch {
      initial = stored;
    }
  }
  const state = ref(initial);
  watch(state, (val) => localStorage.setItem(key, JSON.stringify(val)));
  return state;
}

export const useSettingsStore = defineStore("settings", () => {
  // 1. STATE (auto-persisted to localStorage)
  const showInfoBar = persistedRef("settings_showInfoBar", true);

  // Runtime flag — fetched from /admin/setup-status on app start.
  // true until the server explicitly says otherwise.
  const adminEnabled = ref(true);
  const setAdminEnabled = (val) => { adminEnabled.value = val; };

  // Runtime flag — fetched from /viewer/access-status on app start.
  // true until the server explicitly says otherwise.
  const viewerEnabled = ref(true);
  const setViewerEnabled = (val) => { viewerEnabled.value = val; };
  const selectionColor = persistedRef("settings_selectionColor", "#FFFF00");
  const envTheme = import.meta.env.VITE_DEFAULT_THEME || "auto";
  const resolvedDefault =
    envTheme === "auto"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : (["dark", "light"].includes(envTheme) ? envTheme : "dark");
  const theme = persistedRef("settings_theme", resolvedDefault);
  const showArrowButtons = persistedRef("settings_showArrowButtons", false);
  const showMapRibbon = persistedRef("settings_showMapRibbon", true);
  const showBugReportButton = persistedRef("settings_showBugReportButton", true);

  // 2. ACTIONS
  const toggleInfoBar = () => { showInfoBar.value = !showInfoBar.value; };
  const setSelectionColor = (color) => { selectionColor.value = color; };
  const toggleTheme = () => { theme.value = theme.value === "dark" ? "light" : "dark"; };
  const setTheme = (newTheme) => { theme.value = newTheme; };
  const toggleArrowButtons = () => { showArrowButtons.value = !showArrowButtons.value; };
  const toggleMapRibbon = () => { showMapRibbon.value = !showMapRibbon.value; };
  const toggleBugReportButton = () => { showBugReportButton.value = !showBugReportButton.value; };

  return {
    showInfoBar,
    toggleInfoBar,
    selectionColor,
    setSelectionColor,
    theme,
    toggleTheme,
    setTheme,
    showArrowButtons,
    toggleArrowButtons,
    showMapRibbon,
    toggleMapRibbon,
    showBugReportButton,
    toggleBugReportButton,
    adminEnabled,
    setAdminEnabled,
    viewerEnabled,
    setViewerEnabled,
  };
});