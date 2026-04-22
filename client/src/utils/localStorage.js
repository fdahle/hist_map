import { ref, watch } from 'vue';

export function loadFromStorage(key, defaultValue) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

export function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore quota/security errors */ }
}

/**
 * Create a Vue ref that automatically persists to localStorage on change.
 * Initial value is read from storage; falls back to defaultValue.
 */
export function createPersistedRef(key, defaultValue) {
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
