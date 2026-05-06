<template>
  <div id="app" :class="'theme-' + theme">
    <!-- User access password gate (skipped for admin route) -->
    <div v-if="needsUserAuth && !isAdminRoute" class="user-gate-overlay">
      <div class="user-gate-modal">
        <h2 class="user-gate-title">Enter Password</h2>
        <form class="user-gate-form" @submit.prevent="submitUserAuth">
          <input
            ref="userGateInputRef"
            v-model="userGatePassword"
            type="password"
            class="user-gate-input"
            placeholder="Password"
            autocomplete="current-password"
            :disabled="userGateLoading"
          />
          <p v-if="userGateError" class="user-gate-error">{{ userGateError }}</p>
          <button type="submit" class="user-gate-btn" :disabled="userGateLoading || !userGatePassword">
            {{ userGateLoading ? 'Checking…' : 'Continue' }}
          </button>
        </form>
      </div>
    </div>

    <!-- Config loaded normally, or admin route (works without config) -->
    <div v-else-if="isConfigLoaded || isAdminRoute">
      <router-view />
    </div>

    <!-- Other load errors -->
    <div v-else-if="configError" class="error-screen">
      <div class="error-modal">
        <div class="error-icon">{{ STRINGS.errors.warning || '⚠️' }}</div>
        <h2>{{ STRINGS.config.error }}</h2>
        <div class="error-details">{{ configError }}</div>
        <button class="retry-btn" @click="reloadApp">{{ STRINGS.config.reloadApp }}</button>
      </div>
    </div>

    <div v-else class="loading">{{ STRINGS.config.loading }}</div>
  </div>
</template>

<script setup>
import { ref, onMounted, provide, watch, computed, nextTick } from "vue";
import { storeToRefs } from "pinia";
import yaml from "js-yaml";
import { useRoute } from "vue-router";
import { validateConfig } from "./constants/configValidation";
import { STRINGS } from "./constants/strings";
import { useSettingsStore } from "./stores/settingsStore";
import { logger } from "./utils/logger";
import { enableDevMode } from "./utils/devTools";
import { getApiUrl } from "./utils/config";

const appConfig = ref(null);
const isConfigLoaded = ref(false);
const configError = ref(null);

// ── User access password gate ─────────────────────────────────────────────────
const needsUserAuth    = ref(false);
const userGatePassword = ref('');
const userGateLoading  = ref(false);
const userGateError    = ref('');
const userGateInputRef = ref(null);

async function submitUserAuth() {
  userGateError.value = '';
  userGateLoading.value = true;
  try {
    const res = await fetch(getApiUrl('/user/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: userGatePassword.value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      userGateError.value = body.error || 'Incorrect password.';
      userGatePassword.value = '';
      return;
    }
    sessionStorage.setItem('user_authenticated', '1');
    needsUserAuth.value = false;
    // Continue with config loading now that auth is confirmed
    await loadAppConfig();
  } catch {
    userGateError.value = 'Could not connect to server.';
  } finally {
    userGateLoading.value = false;
  }
}

// Allow the admin route to render even when config isn't loaded yet
const isAdminRoute = computed(() => route.path.startsWith('/admin'));

// Theme management
const settingsStore = useSettingsStore();
const { theme, adminEnabled } = storeToRefs(settingsStore);

// Apply theme to document body
watch(theme, (newTheme) => {
  document.body.className = `theme-${newTheme}`;
}, { immediate: true });

const layerManagerRef = ref(null);
provide("layerManager", layerManagerRef);

provide("config", appConfig);

const route = useRoute();

// Build page title from config base + current route
function applyRouteTitle(baseTitle) {
  const routePageTitle = route.meta?.title
    ? (route.query?.n || route.meta.title)
    : null;
  document.title = routePageTitle ? `${baseTitle} — ${routePageTitle}` : baseTitle;
}

onMounted(async () => {
  // Enable development tools in dev mode
  if (import.meta.env.DEV) {
    enableDevMode();
  }

  // Apply title and favicon from build-time env vars
  const siteTitle = import.meta.env.VITE_SITE_TITLE;
  const siteFavicon = import.meta.env.VITE_SITE_FAVICON;
  if (siteTitle) applyRouteTitle(siteTitle);
  if (siteFavicon) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = siteFavicon;
  }

  // Fetch admin status first so the router guard and UI are ready before config loads
  try {
    const statusRes = await fetch(getApiUrl('/admin/setup-status'));
    if (statusRes.ok) {
      const s = await statusRes.json();
      settingsStore.setAdminEnabled(s.adminEnabled !== false);
      if (s.adminEnabled !== false && !s.hasPassword && !route.path.startsWith('/admin')) {
        window.location.replace('/admin');
        return;
      }
    }
  } catch { /* server unreachable — leave adminEnabled as true (safe default) */ }

  // Check user access password gate (skip for admin routes)
  if (!route.path.startsWith('/admin')) {
    try {
      const userAuthRes = await fetch(getApiUrl('/user/auth-status'));
      if (userAuthRes.ok) {
        const u = await userAuthRes.json();
        if (u.hasUserPassword && !sessionStorage.getItem('user_authenticated')) {
          needsUserAuth.value = true;
          await nextTick();
          userGateInputRef.value?.focus();
          return; // loadAppConfig() will be called after successful auth
        }
      }
    } catch { /* server unreachable — allow through */ }
  }

  await loadAppConfig();
});

async function loadAppConfig() {
  // Fetch viewer access status so the router guard and ribbon button are ready before config loads
  try {
    const viewerRes = await fetch(getApiUrl('/viewer/access-status'));
    if (viewerRes.ok) {
      const v = await viewerRes.json();
      settingsStore.setViewerEnabled(v.viewerEnabled !== false);
    }
  } catch { /* server unreachable — leave viewerEnabled as true (safe default) */ }

  try {
    const res = await fetch(getApiUrl('/config'));
    if (res.status === 404) {
      // No config yet — send to admin to set up, but only if admin is enabled
      if (adminEnabled.value && !route.path.startsWith('/admin')) {
        window.location.replace('/admin');
      }
      return;
    }
    if (!res.ok) throw new Error(`Config not found: ${res.status}`);
    const txt = await res.text();
    const parsed = yaml.load(txt);

    // Validate configuration
    validateConfig(parsed);

    appConfig.value = parsed;
    isConfigLoaded.value = true;
  } catch (e) {
    logger.error('App', 'Failed to load config:', e);
    configError.value = e.message;
  }
}

const reloadApp = () => window.location.reload();
</script>

<style>
@import './assets/error-screen.css';

/* Global Styles */
html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
  overflow: hidden;
  transition: background-color 0.3s ease, color 0.3s ease;
}

/* Dark theme (default) */
body.theme-dark {
  background: #1a1a1a;
  color: #e0e0e0;
}

/* Light theme */
body.theme-light {
  background: #ffffff;
  color: #1a1a1a;
}

#app {
  height: 100%;
  width: 100%;
}

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: #666;
}

.theme-light .loading {
  color: #999;
}

/* User access password gate */
.user-gate-overlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.55); backdrop-filter: blur(4px);
}
.user-gate-modal {
  background: #fff; border-radius: 12px; padding: 2rem 2rem 1.75rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18); width: 100%; max-width: 340px;
}
.theme-dark .user-gate-modal {
  background: #2d2d2d; color: #e0e0e0;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55);
}
.user-gate-title {
  font-size: 1.15rem; font-weight: 600; margin: 0 0 1.1rem; text-align: center; color: inherit;
}
.user-gate-form { display: flex; flex-direction: column; gap: 0.6rem; }
.user-gate-input {
  padding: 0.6rem 0.75rem; border: 1px solid #d1d5db; border-radius: 6px;
  font-size: 0.9rem; outline: none; transition: border-color 0.15s;
  background: #fff; color: #111; width: 100%; box-sizing: border-box;
}
.theme-dark .user-gate-input { background: #3a3a3a; border-color: #555; color: #e0e0e0; }
.user-gate-input:focus { border-color: #3b82f6; }
.user-gate-error { font-size: 0.8rem; color: #ef4444; margin: 0; }
.user-gate-btn {
  padding: 0.6rem; border-radius: 6px; background: #3b82f6; border: none;
  color: #fff; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: background 0.15s;
}
.user-gate-btn:hover:not(:disabled) { background: #2563eb; }
.user-gate-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* First-run setup modal */
.setup-modal {
  background: white;
  padding: 2.5rem 2rem;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
  max-width: 440px;
  width: 90%;
  text-align: center;
}

.theme-dark .setup-modal {
  background: #2d2d2d;
  color: #e0e0e0;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.setup-icon {
  display: flex;
  justify-content: center;
  color: #3b82f6;
  margin-bottom: 1rem;
}

.setup-title {
  font-size: 1.4rem;
  font-weight: 600;
  margin: 0 0 0.6rem;
  color: inherit;
}

.setup-desc {
  font-size: 0.92rem;
  color: #666;
  line-height: 1.55;
  margin: 0 0 1.8rem;
}

.theme-dark .setup-desc {
  color: #aaa;
}

.setup-btn {
  display: inline-block;
  background: #3b82f6;
  color: white;
  text-decoration: none;
  padding: 0.75rem 1.75rem;
  border-radius: 6px;
  font-weight: 600;
  font-size: 0.95rem;
  transition: background 0.2s;
}

.setup-btn:hover {
  background: #2563eb;
}

.setup-pwd-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
}

.setup-pwd-group {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  text-align: left;
}

.setup-pwd-group label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #555;
}

.theme-dark .setup-pwd-group label {
  color: #bbb;
}

.setup-pwd-group input {
  padding: 0.6rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.9rem;
  font-family: "Segoe UI", sans-serif;
  outline: none;
  transition: border-color 0.15s;
  background: #fff;
  color: #111;
}

.theme-dark .setup-pwd-group input {
  background: #3a3a3a;
  border-color: #555;
  color: #e0e0e0;
}

.setup-pwd-group input:focus {
  border-color: #3b82f6;
}

.setup-pwd-error input {
  border-color: #ef4444;
}

.setup-pwd-err-msg {
  font-size: 0.8rem;
  color: #ef4444;
  margin: 0;
}
</style>