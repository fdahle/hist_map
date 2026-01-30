import { defineStore } from "pinia";
import { ref, watch } from "vue";

export const useSettingsStore = defineStore("settings", () => {
  // 1. STATE (Initialize from localStorage if available)
  const storedInfoBar = localStorage.getItem("settings_showInfoBar");
  
  // Default to true if nothing is stored
  const showInfoBar = ref(storedInfoBar !== null ? JSON.parse(storedInfoBar) : true);

  // 2. ACTIONS
  const toggleInfoBar = () => {
    showInfoBar.value = !showInfoBar.value;
  };

  // 3. PERSISTENCE (Automatically save changes)
  watch(showInfoBar, (newValue) => {
    localStorage.setItem("settings_showInfoBar", JSON.stringify(newValue));
  });

  return {
    showInfoBar,
    toggleInfoBar,
  };
});