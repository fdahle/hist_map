<template>
  <!-- ── Password Gate ──────────────────────────────────────────── -->
  <div v-if="!isAuthenticated" class="admin-gate">
    <div class="gate-card">
      <div v-if="isFirstRun" class="setup-welcome-banner">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <span>First-run setup — choose a password to protect this admin panel.</span>
      </div>
      <div class="gate-icon">
        <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
      </div>

      <template v-if="isFirstRun">
        <h2 class="gate-title">Create Admin Password</h2>
        <p class="gate-subtitle">Choose a password to protect this panel.</p>
        <form class="gate-form" @submit.prevent="createPassword">
          <div class="field-group" :class="{ 'field-error': loginError }">
            <label for="admin-password">Password</label>
            <input id="admin-password" ref="passwordFieldRef" v-model="password" type="password"
              placeholder="Choose a password" autocomplete="new-password" :disabled="isLoading" />
          </div>
          <div class="field-group" :class="{ 'field-error': loginError }">
            <label for="admin-password-confirm">Confirm Password</label>
            <input id="admin-password-confirm" v-model="passwordConfirm" type="password"
              placeholder="Repeat your password" autocomplete="new-password" :disabled="isLoading" />
            <p v-if="loginError" class="error-hint">{{ loginError }}</p>
          </div>
          <button type="submit" class="btn-primary btn-full" :disabled="isLoading || !password || !passwordConfirm">
            <span v-if="isLoading">Creating…</span>
            <span v-else>Create Password</span>
          </button>
        </form>
      </template>

      <template v-else>
        <h2 class="gate-title">Admin Access</h2>
        <p class="gate-subtitle">Stratum3D Configuration</p>
        <form class="gate-form" @submit.prevent="attemptLogin">
          <div class="field-group" :class="{ 'field-error': loginError }">
            <label for="admin-password">Password</label>
            <input id="admin-password" ref="passwordFieldRef" v-model="password" type="password"
              placeholder="Enter admin password" autocomplete="current-password" :disabled="isLoading" />
            <p v-if="loginError" class="error-hint">{{ loginError }}</p>
          </div>
          <label class="keep-signed-in-label">
            <input type="checkbox" v-model="keepSignedIn" />
            Keep me signed in
          </label>
          <button type="submit" class="btn-primary btn-full" :disabled="isLoading || !password">
            <span v-if="isLoading">Verifying…</span>
            <span v-else>Sign In</span>
          </button>
        </form>
        <a class="gate-back" href="/">← Back to map</a>
      </template>
    </div>
  </div>

  <!-- ── Admin Layout (authenticated) ──────────────────────────── -->
  <div v-else class="admin-layout">
    <header class="admin-header">
      <div class="admin-header-inner">
        <span class="admin-brand">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
          Admin
        </span>

        <!-- Tab navigation -->
        <nav class="admin-tabs" role="tablist">
          <button
            v-for="tab in TABS"
            :key="tab.id"
            role="tab"
            :aria-selected="activeTab === tab.id"
            :class="['tab-btn', { 'tab-btn-active': activeTab === tab.id }]"
            @click="activeTab = tab.id"
          >
            <TabIcon :id="tab.id" />
            {{ tab.label }}
          </button>
        </nav>

        <div class="header-end">
          <span v-if="saveState === 'saving'" class="save-indicator saving">Saving…</span>
          <span v-else-if="saveState === 'error'" class="save-indicator error" :title="saveError">Save failed</span>
          <a href="/" class="btn-map">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/><path d="M8 2v16"/><path d="M16 6v16"/></svg>
            Map
          </a>
        </div>
      </div>
    </header>

    <main class="admin-main">
      <div v-if="loadError" class="banner banner-error">{{ loadError }}</div>

      <Suspense>
        <component :is="activeTabComponent" />
        <template #fallback>
          <div class="tab-loading">Loading…</div>
        </template>
      </Suspense>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, provide, defineAsyncComponent, h } from 'vue';
import yaml from 'js-yaml';
import { useRouter } from 'vue-router';
import { getApiUrl } from '../utils/config';
import { validateConfig } from '../constants/configValidation';

// ── Tab registry ───────────────────────────────────────────────────────────────
const TABS = [
  { id: 'map',      label: 'Map'       },
  { id: 'layers',   label: 'Layers'    },
  { id: '3d',       label: '3D Layers' },
  { id: 'data',     label: 'Data Layers' },
  { id: 'linking',  label: 'Linking'   },
  { id: 'security', label: 'Security' },
  { id: 'debug',    label: 'Debug'    },
];

const TAB_ICON_DEFS = {
  map:      () => [h('path', { d: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z' }), h('path', { d: 'M8 2v16' }), h('path', { d: 'M16 6v16' })],
  layers:   () => [h('path', { d: 'M12 2L2 7l10 5 10-5-10-5z' }), h('path', { d: 'M2 17l10 5 10-5' }), h('path', { d: 'M2 12l10 5 10-5' })],
  '3d':     () => [h('path', { d: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z' }), h('polyline', { points: '3.27 6.96 12 12.01 20.73 6.96' }), h('line', { x1: '12', y1: '22.08', x2: '12', y2: '12' })],
  data:     () => [h('ellipse', { cx: '12', cy: '5', rx: '9', ry: '3' }), h('path', { d: 'M21 12c0 1.66-4 3-9 3s-9-1.34-9-3' }), h('path', { d: 'M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5' })],
  linking:  () => [h('path', { d: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71' }), h('path', { d: 'M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71' })],
  security: () => [h('path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' })],
  debug:    () => [h('polyline', { points: '4 17 10 11 4 5' }), h('line', { x1: '12', y1: '19', x2: '20', y2: '19' })],
};

const TabIcon = (props) => h('svg', {
  class: 'tab-icon',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.8',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true',
}, TAB_ICON_DEFS[props.id]?.() ?? []);

const TAB_COMPONENTS = {
  map:      defineAsyncComponent(() => import('../components/admin/tabs/AdminMapTab.vue')),
  layers:   defineAsyncComponent(() => import('../components/admin/tabs/AdminLayersTab.vue')),
  '3d':     defineAsyncComponent(() => import('../components/admin/tabs/Admin3DLayersTab.vue')),
  data:     defineAsyncComponent(() => import('../components/admin/tabs/AdminDataTab.vue')),
  linking:  defineAsyncComponent(() => import('../components/admin/tabs/AdminLinkingTab.vue')),
  security: defineAsyncComponent(() => import('../components/admin/tabs/AdminSecurityTab.vue')),
  debug:    defineAsyncComponent(() => import('../components/admin/tabs/AdminDebugTab.vue')),
};

// Restore active tab from URL hash
const activeTab = ref(window.location.hash.slice(1) || 'map');
watch(activeTab, (t) => { history.replaceState(null, '', '#' + t); });
const activeTabComponent = computed(() => TAB_COMPONENTS[activeTab.value] ?? TAB_COMPONENTS.map);

// ── Auth state ─────────────────────────────────────────────────────────────────
const router          = useRouter();
const isFirstRun      = ref(false);
const hasExistingConfig = ref(false);
const isAuthenticated = ref(false);
const isLoading       = ref(false);
const password        = ref('');
const passwordConfirm = ref('');
const loginError      = ref('');
const loadError       = ref('');
const passwordFieldRef = ref(null);

const keepSignedIn = ref(true);

const _storedPassword = ref('');
const storePassword      = (pwd) => { _storedPassword.value = pwd; };
const getStoredPassword  = ()    => _storedPassword.value;
const clearStoredPassword = ()   => { _storedPassword.value = ''; };

function buildAuthHeader(pwd) {
  return 'Basic ' + btoa('admin:' + pwd);
}
const currentAuthHeader = computed(() => buildAuthHeader(getStoredPassword() || ''));

// ── Config draft ───────────────────────────────────────────────────────────────
function blankDraft() {
  return {
    view: { center: [0, 0], zoom: 7, minZoom: 0, maxZoom: 28, extent: null },
    crs: 'EPSG:3857',
    projection_params: { proj_string: '', extent: null },
    basemaps:              [],
    osm_background_order:  0,
    data_layers:           [],
    ui: { map_access: true, map_download: true, map_upload: true, viewer_access: true, viewer_download: true, viewer_upload: true },
  };
}

const draft         = ref(blankDraft());
const osmBackground = ref(true);
const loadedCrs     = ref(null);

function loadConfigIntoDraft(config) {
  const d = blankDraft();
  if (config.view) {
    d.view.center  = config.view.center  ?? d.view.center;
    d.view.zoom    = config.view.zoom    ?? d.view.zoom;
    d.view.minZoom = config.view.minZoom ?? d.view.minZoom;
    d.view.maxZoom = config.view.maxZoom ?? d.view.maxZoom;
    d.view.extent  = config.view.extent  ?? null;
  }
  d.crs = config.crs ?? d.crs;
  if (config.projection_params) {
    d.projection_params.proj_string = config.projection_params.proj_string ?? '';
    d.projection_params.extent      = config.projection_params.extent      ?? null;
  }
  osmBackground.value = config.osm_background ?? (config.basemaps?.length > 0 || config.base_layers?.length > 0 ? false : true);
  // Sort basemaps by their saved order so the first entry is always the default
  const basemaps = config.basemaps ?? config.base_layers ?? [];
  if (basemaps.length) basemaps.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  d.basemaps = basemaps;
  d.osm_background_order = config.osm_background_order ?? 0;
  d.data_layers = config.data_layers ?? config.overlay_layers ?? d.data_layers;
  if (config.ui) {
    d.ui.map_access      = config.ui.map_access      ?? true;
    d.ui.map_download    = config.ui.map_download    ?? true;
    d.ui.map_upload      = config.ui.map_upload      ?? true;
    d.ui.viewer_access   = config.ui.viewer_access   ?? true;
    d.ui.viewer_download = config.ui.viewer_download ?? true;
    d.ui.viewer_upload   = config.ui.viewer_upload   ?? true;
  }
  draft.value = d;
}

function buildConfig() {
  const d = draft.value;
  const out = {};
  out.view = { center: d.view.center, zoom: d.view.zoom };
  if (d.view.extent)                out.view.extent   = d.view.extent;
  if (d.view.minZoom !== undefined) out.view.minZoom  = d.view.minZoom;
  if (d.view.maxZoom !== undefined) out.view.maxZoom  = d.view.maxZoom;
  out.crs = d.crs;
  if (d.projection_params.proj_string?.trim()) {
    out.projection_params = { proj_string: d.projection_params.proj_string };
    if (d.projection_params.extent) out.projection_params.extent = d.projection_params.extent;
  }
  out.osm_background       = osmBackground.value;
  out.osm_background_order = d.osm_background_order ?? 0;
  out.basemaps = d.basemaps.map((l, i) => ({ ...l, order: i, visible: i === 0 }));
  out.data_layers = d.data_layers;
  out.ui = { ...d.ui };
  return out;
}

// ── Autosave ───────────────────────────────────────────────────────────────────
const saveState = ref('idle'); // idle | saving | saved | error
const saveError = ref('');
let _autosaveTimer = null;

function scheduleSave() {
  clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(performSave, 1200);
}

async function performSave() {
  if (!isAuthenticated.value) return;
  saveState.value = 'saving';
  saveError.value = '';
  try {
    const config = buildConfig();
    validateConfig(config);
    const yamlText = yaml.dump(config, { lineWidth: 120, noRefs: true });
    const res = await fetch(getApiUrl('/config'), {
      method: 'PUT',
      headers: { 'Content-Type': 'text/yaml', Authorization: buildAuthHeader(getStoredPassword()) },
      body: yamlText,
    });
    if (res.status === 401 || res.status === 403) throw new Error('Session expired.');
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server error: ${res.status}`);
    }
    saveState.value     = 'saved';
    hasExistingConfig.value = true;
    loadedCrs.value     = draft.value.crs;
    setTimeout(() => { if (saveState.value === 'saved') saveState.value = 'idle'; }, 3000);
  } catch (err) {
    saveState.value = 'error';
    saveError.value = err.message;
  }
}

watch(draft, scheduleSave, { deep: true });
watch(osmBackground, scheduleSave);

// ── Network helpers ────────────────────────────────────────────────────────────
async function verifyPassword(pwd) {
  const res = await fetch(getApiUrl('/admin/verify'), {
    headers: { Authorization: buildAuthHeader(pwd) },
  });
  if (res.status === 401 || res.status === 403) throw new Error('Invalid password');
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
}

async function fetchConfig(pwd) {
  const res = await fetch(getApiUrl('/config'), {
    headers: { Authorization: buildAuthHeader(pwd) },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Server error: ${res.status}`);
  return yaml.load(await res.text());
}

// ── Auth actions ───────────────────────────────────────────────────────────────
async function createPassword() {
  loginError.value = '';
  if (password.value.length < 6) { loginError.value = 'Password must be at least 6 characters.'; return; }
  if (password.value !== passwordConfirm.value) { loginError.value = 'Passwords do not match.'; return; }
  isLoading.value = true;
  try {
    const res = await fetch(getApiUrl('/admin/set-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server error: ${res.status}`);
    }
    const pwd = password.value;
    password.value = ''; passwordConfirm.value = '';
    isFirstRun.value = false;
    storePassword(pwd);
    const config = await fetchConfig(pwd);
    loadConfigIntoDraft(config ?? {});
    loadedCrs.value         = config ? (config.crs ?? null) : null;
    hasExistingConfig.value = config !== null;
    isAuthenticated.value   = true;
    resetSessionTimer();
  } catch (err) {
    loginError.value = err.message;
  } finally {
    isLoading.value = false;
  }
}

async function attemptLogin() {
  if (!password.value) return;
  isLoading.value = true; loginError.value = '';
  try {
    await verifyPassword(password.value);
    const config = await fetchConfig(password.value);
    loadConfigIntoDraft(config ?? {});
    loadedCrs.value         = config ? (config.crs ?? null) : null;
    hasExistingConfig.value = config !== null;
    storePassword(password.value);
    if (keepSignedIn.value) localStorage.setItem('admin_pwd', password.value);
    else localStorage.removeItem('admin_pwd');
    isAuthenticated.value   = true;
    resetSessionTimer();
  } catch (err) {
    loginError.value = err.message;
    password.value   = '';
    await new Promise(r => setTimeout(r, 0));
    passwordFieldRef.value?.focus();
  } finally {
    isLoading.value = false;
  }
}

function logout() {
  clearStoredPassword();
  localStorage.removeItem('admin_pwd');
  clearTimeout(_sessionTimeoutId);
  isAuthenticated.value = false;
  osmBackground.value = true;
  draft.value         = blankDraft();
  password.value        = '';
  passwordConfirm.value = '';
  loginError.value      = '';
}

// ── Session timeout (30 min inactivity) ───────────────────────────────────────
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
let _sessionTimeoutId = null;
function resetSessionTimer() {
  if (!isAuthenticated.value) return;
  clearTimeout(_sessionTimeoutId);
  _sessionTimeoutId = setTimeout(() => {
    logout();
    loginError.value = 'Signed out automatically after 30 minutes of inactivity.';
  }, SESSION_TIMEOUT_MS);
}
const _activityEvents = ['mousemove', 'keydown', 'click', 'touchstart'];

function handleBeforeUnload(e) {
  if (window._adminDownloading) return;
  if (isAuthenticated.value && !hasExistingConfig.value) {
    e.preventDefault(); e.returnValue = '';
  }
}

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload);
  _activityEvents.forEach(ev => window.addEventListener(ev, resetSessionTimer, { passive: true }));
  try {
    const res = await fetch(getApiUrl('/admin/setup-status'));
    if (res.ok) {
      const s = await res.json();
      if (s.adminEnabled === false) { router.replace('/'); return; }
      isFirstRun.value = !s.hasPassword;
    }
  } catch { /* fall through to login form */ }

  if (!isFirstRun.value && !isAuthenticated.value) {
    const saved = localStorage.getItem('admin_pwd');
    if (saved) {
      try {
        await verifyPassword(saved);
        const config = await fetchConfig(saved);
        loadConfigIntoDraft(config ?? {});
        loadedCrs.value         = config ? (config.crs ?? null) : null;
        hasExistingConfig.value = config !== null;
        storePassword(saved);
        isAuthenticated.value   = true;
        resetSessionTimer();
      } catch {
        localStorage.removeItem('admin_pwd');
      }
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
  _activityEvents.forEach(ev => window.removeEventListener(ev, resetSessionTimer));
  clearTimeout(_sessionTimeoutId);
  clearTimeout(_autosaveTimer);
});

// ── Provide to tab components ──────────────────────────────────────────────────
provide('authHeader',        currentAuthHeader);
provide('getStoredPassword', getStoredPassword);
provide('buildAuthHeader',   buildAuthHeader);
provide('draft',             draft);
provide('osmBackground',     osmBackground);
provide('loadedCrs',         loadedCrs);
provide('hasExistingConfig', hasExistingConfig);
provide('scheduleSave',      scheduleSave);
provide('logout',            logout);
provide('storePassword',     storePassword);
</script>

<style scoped>
.admin-gate,
.admin-layout {
  font-family: "Segoe UI", sans-serif;
  background: var(--admin-bg, #f3f4f6);
  color: var(--admin-text, #1a1a1a);
}
.admin-gate { min-height: 100vh; }

:global(body.theme-dark) .admin-gate,
:global(body.theme-dark) .admin-layout {
  --admin-bg: #1a1a1a; --admin-text: #e0e0e0; --admin-surface: #2a2a2a;
  --admin-border: #444; --admin-muted: #999; --admin-input-bg: #333;
  --admin-input-border: #555; --admin-header-bg: #222; --admin-shadow: rgba(0,0,0,0.5);
}
:global(body.theme-light) .admin-gate,
:global(body.theme-light) .admin-layout {
  --admin-bg: #f3f4f6; --admin-text: #1a1a1a; --admin-surface: #ffffff;
  --admin-border: #e0e0e0; --admin-muted: #777; --admin-input-bg: #ffffff;
  --admin-input-border: #ccc; --admin-header-bg: #ffffff; --admin-shadow: rgba(0,0,0,0.1);
}

/* ── Gate ────────────────────────────────────────────────────────────── */
.admin-gate {
  display: flex; align-items: center; justify-content: center; padding: 2rem;
}
.gate-card {
  background: var(--admin-surface, #fff); border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 12px; box-shadow: 0 4px 24px var(--admin-shadow, rgba(0,0,0,0.1));
  padding: 2.5rem 2rem; width: 100%; max-width: 380px; text-align: center;
}
.gate-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 64px; height: 64px; border-radius: 50%; background: rgba(59,130,246,0.12);
  color: #3b82f6; margin-bottom: 1.25rem;
}
.gate-title { margin: 0 0 0.25rem; font-size: 1.4rem; font-weight: 600; }
.gate-subtitle { margin: 0 0 1.5rem; color: var(--admin-muted, #777); font-size: 0.9rem; }
.gate-form { display: flex; flex-direction: column; gap: 0.75rem; text-align: left; }
.gate-back { display: block; margin-top: 1rem; font-size: 0.85rem; color: var(--admin-muted, #777); text-decoration: none; }
.gate-back:hover { text-decoration: underline; }
.keep-signed-in-label {
  display: flex; align-items: center; gap: 0.45rem;
  font-size: 0.82rem; color: var(--admin-muted, #777); cursor: pointer; user-select: none;
}
.setup-welcome-banner {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.85rem;
  background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.25);
  border-radius: 8px; font-size: 0.82rem; color: #3b82f6; margin-bottom: 1rem;
}

/* ── Layout ──────────────────────────────────────────────────────────── */
.admin-layout {
  display: flex; flex-direction: column; height: 100vh; overflow: hidden;
}
.admin-header {
  background: var(--admin-header-bg, #fff); border-bottom: 1px solid var(--admin-border, #e0e0e0);
  flex-shrink: 0; z-index: 10;
}
.admin-header-inner {
  display: flex; align-items: center; gap: 0; height: 48px; padding: 0 1rem;
}
.admin-brand {
  display: flex; align-items: center; gap: 0.4rem;
  font-weight: 600; font-size: 0.9rem; color: var(--admin-text, #1a1a1a);
  white-space: nowrap; padding-right: 1rem; border-right: 1px solid var(--admin-border, #e0e0e0);
  margin-right: 0.5rem;
}

/* ── Tabs ────────────────────────────────────────────────────────────── */
.admin-tabs {
  display: flex; align-items: stretch; gap: 0; flex: 1; height: 100%;
  overflow-x: auto; scrollbar-width: none;
}
.admin-tabs::-webkit-scrollbar { display: none; }
.tab-btn {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0 0.95rem; height: 100%; border: none; background: transparent;
  color: var(--admin-muted, #777); font-size: 0.82rem; font-weight: 500;
  cursor: pointer; white-space: nowrap; border-bottom: 2px solid transparent;
  transition: color 0.12s, border-color 0.12s;
}
.tab-btn:hover { color: var(--admin-text, #1a1a1a); }
.tab-btn-active { color: #3b82f6; border-bottom-color: #3b82f6; }
.tab-icon { flex-shrink: 0; width: 13px; height: 13px; }

/* ── Header end ──────────────────────────────────────────────────────── */
.header-end {
  display: flex; align-items: center; gap: 0.75rem;
  padding-left: 0.75rem; border-left: 1px solid var(--admin-border, #e0e0e0);
  margin-left: 0.5rem; flex-shrink: 0;
}
.save-indicator {
  font-size: 0.78rem; padding: 0.2rem 0.5rem; border-radius: 4px; white-space: nowrap;
}
.saving { color: var(--admin-muted, #777); }
.error  { color: #ef4444; background: rgba(239,68,68,0.08); cursor: default; }
.btn-map {
  display: inline-flex; align-items: center; gap: 0.35rem;
  font-size: 0.8rem; padding: 0.25rem 0.65rem; border-radius: 5px;
  border: 1px solid var(--admin-border, #e0e0e0); background: transparent;
  color: var(--admin-muted, #777); text-decoration: none; white-space: nowrap; cursor: pointer;
  transition: color 0.12s, border-color 0.12s;
}
.btn-map:hover { color: var(--admin-text, #1a1a1a); border-color: var(--admin-muted, #999); }

/* ── Main content ────────────────────────────────────────────────────── */
.admin-main {
  flex: 1; overflow-y: auto; padding: 1.5rem;
}
.tab-loading {
  display: flex; align-items: center; justify-content: center;
  height: 200px; color: var(--admin-muted, #777); font-size: 0.9rem;
}

/* ── Banners ─────────────────────────────────────────────────────────── */
.banner {
  padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1rem;
  font-size: 0.85rem;
}
.banner-error { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); color: #ef4444; }

/* ── Shared form styles (used in gate + tabs) ────────────────────────── */
.field-group { display: flex; flex-direction: column; gap: 0.35rem; }
.field-group label { font-size: 0.82rem; font-weight: 500; color: var(--admin-text, #1a1a1a); }
.field-group input, .field-group select, .field-group textarea {
  padding: 0.45rem 0.65rem; border: 1px solid var(--admin-input-border, #ccc);
  border-radius: 6px; background: var(--admin-input-bg, #fff); color: var(--admin-text, #1a1a1a);
  font-size: 0.85rem;
}
.field-group input:focus, .field-group select:focus { outline: 2px solid #3b82f6; border-color: #3b82f6; }
.field-error input, .field-error select { border-color: #ef4444; }
.error-hint { margin: 0; font-size: 0.78rem; color: #ef4444; }

.btn-primary {
  padding: 0.6rem 1.2rem; border: none; border-radius: 7px;
  background: #3b82f6; color: #fff; font-size: 0.85rem; font-weight: 500;
  cursor: pointer;
}
.btn-primary:hover:not(:disabled) { background: #2563eb; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-full { width: 100%; }
</style>
