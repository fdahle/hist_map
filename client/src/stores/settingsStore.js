import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { createPersistedRef } from "../utils/localStorage";

export const useSettingsStore = defineStore("settings", () => {
  // 1. STATE (auto-persisted to localStorage)
  const showInfoBar = createPersistedRef("settings_showInfoBar", true);

  // Runtime flag — fetched from /admin/setup-status on app start.
  // true until the server explicitly says otherwise.
  const adminEnabled = ref(true);
  const setAdminEnabled = (val) => { adminEnabled.value = val; };

  // Runtime flag — fetched from /viewer/access-status on app start.
  // true until the server explicitly says otherwise.
  const viewerEnabled = ref(true);
  const setViewerEnabled = (val) => { viewerEnabled.value = val; };
  const selectionColor = createPersistedRef("settings_selectionColor", "#FFFF00");
  const envTheme = import.meta.env.VITE_DEFAULT_THEME || "auto";
  const resolvedDefault =
    envTheme === "auto"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : (["dark", "light"].includes(envTheme) ? envTheme : "dark");
  const theme = createPersistedRef("settings_theme", resolvedDefault);
  const showArrowButtons = createPersistedRef("settings_showArrowButtons", false);
  const showMapRibbon = createPersistedRef("settings_showMapRibbon", true);
  const viewer3dBackgroundColor = createPersistedRef("settings_viewer3dBgColor", null);
  const bugReportMode = import.meta.env.VITE_BUG_REPORT || 'auto';
  const _bugReportUserPref = createPersistedRef("settings_showBugReportButton", true);
  const showBugReportButton = computed(() => {
    if (bugReportMode === 'yes') return true;
    if (bugReportMode === 'no') return false;
    return _bugReportUserPref.value;
  });

  // 2. ACTIONS
  const toggleInfoBar = () => { showInfoBar.value = !showInfoBar.value; };
  const setSelectionColor = (color) => { selectionColor.value = color; };
  const toggleTheme = () => { theme.value = theme.value === "dark" ? "light" : "dark"; };
  const setTheme = (newTheme) => { theme.value = newTheme; };
  const toggleArrowButtons = () => { showArrowButtons.value = !showArrowButtons.value; };
  const toggleMapRibbon = () => { showMapRibbon.value = !showMapRibbon.value; };
  const setViewer3dBackgroundColor = (color) => { viewer3dBackgroundColor.value = color; };
  const resetViewer3dBackgroundColor = () => { viewer3dBackgroundColor.value = null; };
  const toggleBugReportButton = () => { if (bugReportMode === 'auto') _bugReportUserPref.value = !_bugReportUserPref.value; };

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
    viewer3dBackgroundColor,
    setViewer3dBackgroundColor,
    resetViewer3dBackgroundColor,
    bugReportMode,
    showBugReportButton,
    toggleBugReportButton,
    adminEnabled,
    setAdminEnabled,
    viewerEnabled,
    setViewerEnabled,
  };
});