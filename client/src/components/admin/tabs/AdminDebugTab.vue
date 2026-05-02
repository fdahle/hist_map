<template>
  <section class="tab-section">
    <!-- ── System Libraries ───────────────────────────────────────────────── -->
    <div class="settings-card">
      <div class="card-header">
        <h3 class="card-title">System Libraries</h3>
        <button class="btn-refresh" :disabled="libsLoading" @click="fetchLibraries" title="Re-check">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
            :class="{ spin: libsLoading }">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          Re-check
        </button>
      </div>
      <div v-if="libsLoading && !libraries.length" class="empty-state">Checking libraries…</div>
      <div v-else-if="libsError" class="lib-error">{{ libsError }}</div>
      <div v-else class="lib-list">
        <div v-for="lib in libraries" :key="lib.name" class="lib-row">
          <span class="lib-dot" :class="lib.available ? 'dot-ok' : 'dot-missing'"></span>
          <div class="lib-info">
            <span class="lib-name">{{ lib.name }}</span>
            <span class="lib-desc">{{ lib.description }}</span>
          </div>
          <span class="lib-status" :class="lib.available ? 'status-ok' : 'status-missing'">
            {{ lib.available ? 'Available' : 'Not found' }}
          </span>
        </div>
      </div>
    </div>

    <!-- ── Layer Storage ──────────────────────────────────────────────────── -->
    <div class="settings-card">
      <div class="card-header">
        <h3 class="card-title">Layer Storage</h3>
      </div>
      <div v-if="layersLoading" class="empty-state">Loading…</div>
      <div v-else class="stat-grid">
        <div class="stat-item">
          <span class="stat-value">{{ counts.geojson + counts.geotiff }}</span>
          <span class="stat-label">2D Layers</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ counts.model + counts.pointcloud }}</span>
          <span class="stat-label">3D Layers</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ counts.csv }}</span>
          <span class="stat-label">Data Layers</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ counts.total }}</span>
          <span class="stat-label">Total</span>
        </div>
      </div>
    </div>

    <!-- ── Config YAML ────────────────────────────────────────────────────── -->
    <div class="settings-card">
      <div class="card-header">
        <h3 class="card-title">config.yaml</h3>
        <button class="btn-refresh" :disabled="configLoading" @click="fetchConfig" title="Reload">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
            :class="{ spin: configLoading }">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
          Reload
        </button>
      </div>
      <div v-if="configLoading" class="empty-state">Loading…</div>
      <div v-else-if="configError" class="lib-error">{{ configError }}</div>
      <div v-else-if="!configYaml" class="empty-state">No config.yaml yet — save settings first.</div>
      <pre v-else class="yaml-preview">{{ configYaml }}</pre>
    </div>

    <!-- ── Server Info ────────────────────────────────────────────────────── -->
    <div class="settings-card">
      <div class="card-header">
        <h3 class="card-title">Server Info</h3>
      </div>
      <div class="info-list">
        <div class="info-row">
          <span class="info-key">API base</span>
          <span class="info-val">{{ apiBase }}</span>
        </div>
        <div class="info-row">
          <span class="info-key">User agent</span>
          <span class="info-val ua">{{ userAgent }}</span>
        </div>
      </div>

      <div v-if="storageInfo" class="storage-viz">
        <div class="storage-header">
          <span class="storage-title">Storage</span>
          <span v-if="storageInfo.diskFreeBytes != null" class="storage-summary">
            {{ formatBytes(storageInfo.diskFreeBytes) }} free
            <template v-if="storageInfo.diskTotalBytes"> of {{ formatBytes(storageInfo.diskTotalBytes) }}</template>
          </span>
        </div>
        <div class="disk-bar">
          <div
            v-for="seg in diskSegments" :key="seg.key"
            class="disk-seg" :class="{ 'seg-free': seg.key === 'free' }"
            :style="{ width: seg.pct + '%', background: seg.color }"
            :title="seg.label + ': ' + formatBytes(seg.bytes)"
          ></div>
        </div>
        <div class="disk-legend">
          <span v-for="seg in diskSegments.filter(s => s.key !== 'free' && s.bytes > 0)" :key="seg.key" class="legend-item">
            <span class="legend-dot" :style="{ background: seg.color }"></span>
            <span class="legend-label">{{ seg.label }}</span>
            <span class="legend-size">{{ formatBytes(seg.bytes) }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- ── Danger Zone ────────────────────────────────────────────────────── -->
    <div class="settings-card danger-card">
      <h3 class="card-title danger-title">Danger Zone</h3>
      <p class="card-desc">Irreversible actions — use with care.</p>

      <div class="danger-list">
        <!-- Reset config -->
        <div class="danger-row">
          <div class="danger-row-text">
            <strong>Reset configuration</strong>
            <span>Deletes the config file <em>and</em> the admin password. On next visit you can set a fresh password and reconfigure from scratch.</span>
          </div>
          <div class="danger-row-action">
            <template v-if="!resetConfirming">
              <button class="btn-danger" @click="resetConfirming = true">Reset Config…</button>
            </template>
            <template v-else>
              <span class="confirm-label">Are you sure?</span>
              <button class="btn-danger" :disabled="isResetting" @click="resetConfig">
                {{ isResetting ? 'Resetting…' : 'Yes, delete it' }}
              </button>
              <button class="btn-secondary-sm" @click="resetConfirming = false">Cancel</button>
            </template>
          </div>
        </div>

        <hr class="danger-divider" />

        <!-- Delete all files -->
        <div class="danger-row">
          <div class="danger-row-text">
            <strong>Delete all uploaded files</strong>
            <span>Permanently removes all GeoTIFF, GeoJSON, 3D model, point cloud, and CSV layers from the server. Layer URLs referencing these files will break.</span>
          </div>
          <div class="danger-row-action">
            <template v-if="!deleteFilesConfirming">
              <button class="btn-danger" @click="deleteFilesConfirming = true">Delete All Files…</button>
            </template>
            <template v-else>
              <span class="confirm-label">Are you sure?</span>
              <button class="btn-danger" :disabled="isDeletingFiles" @click="deleteAllFiles">
                {{ isDeletingFiles ? 'Deleting…' : 'Yes, delete all' }}
              </button>
              <button class="btn-secondary-sm" @click="deleteFilesConfirming = false">Cancel</button>
            </template>
          </div>
        </div>

        <p v-if="dangerError" class="danger-error">{{ dangerError }}</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { inject } from 'vue';
import { getApiUrl } from '../../../utils/config';

// ── Injected ───────────────────────────────────────────────────────────────────
const authHeader        = inject('authHeader');
const getStoredPassword = inject('getStoredPassword');
const buildAuthHeader   = inject('buildAuthHeader');
const logout            = inject('logout');
function authHeaders() { return { Authorization: authHeader.value }; }

// ── Libraries ──────────────────────────────────────────────────────────────────
const libraries   = ref([]);
const libsLoading = ref(false);
const libsError   = ref('');

async function fetchLibraries() {
  libsLoading.value = true;
  libsError.value   = '';
  try {
    const res = await fetch(getApiUrl('/admin/system-libraries'), { headers: authHeaders() });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    libraries.value = await res.json();
  } catch (err) {
    libsError.value = err.message;
  } finally {
    libsLoading.value = false;
  }
}

// ── Layer counts ───────────────────────────────────────────────────────────────
const allLayers    = ref([]);
const layersLoading = ref(false);
const counts = computed(() => {
  const arr = allLayers.value;
  return {
    geojson:    arr.filter(l => l.fileType === 'geojson').length,
    geotiff:    arr.filter(l => l.fileType === 'geotiff').length,
    model:      arr.filter(l => l.fileType === 'model').length,
    pointcloud: arr.filter(l => l.fileType === 'pointcloud').length,
    csv:        arr.filter(l => l.fileType === 'csv').length,
    total:      arr.length,
  };
});

async function fetchLayers() {
  layersLoading.value = true;
  try {
    const res = await fetch(getApiUrl('/admin/layers'), { headers: authHeaders() });
    if (res.ok) allLayers.value = await res.json();
  } catch { /* non-fatal */ }
  finally { layersLoading.value = false; }
}

// ── Config YAML ────────────────────────────────────────────────────────────────
const configYaml    = ref('');
const configLoading = ref(false);
const configError   = ref('');

async function fetchConfig() {
  configLoading.value = true;
  configError.value   = '';
  try {
    const res = await fetch(getApiUrl('/config'), { headers: authHeaders() });
    if (res.status === 404) { configYaml.value = ''; return; }
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    configYaml.value = await res.text();
  } catch (err) {
    configError.value = err.message;
  } finally {
    configLoading.value = false;
  }
}

// ── Server info ────────────────────────────────────────────────────────────────
const apiBase   = getApiUrl('');
const userAgent = navigator.userAgent;

const storageInfo = ref(null);

async function fetchStorage() {
  try {
    const res = await fetch(getApiUrl('/admin/storage'), { headers: authHeaders() });
    if (res.ok) storageInfo.value = await res.json();
  } catch { /* non-fatal */ }
}

function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

const TYPE_LABELS = { geojson: 'GeoJSON', geotiff: 'GeoTIFF', model: '3D Models', pointcloud: 'Point Clouds', csv: 'CSV' };
const TYPE_COLORS = { geojson: '#22c55e', geotiff: '#3b82f6', model: '#f59e0b', pointcloud: '#8b5cf6', csv: '#06b6d4' };

const diskSegments = computed(() => {
  if (!storageInfo.value) return [];
  const info = storageInfo.value;
  const total = info.diskTotalBytes || info.usedBytes || 1;
  const tb = info.typeBytes ?? {};

  const typeSum = Object.values(tb).reduce((a, b) => a + b, 0);
  const otherUsed = Math.max(0, info.usedBytes - typeSum);

  const segs = [];
  for (const [key, label] of Object.entries(TYPE_LABELS)) {
    const bytes = tb[key] ?? 0;
    if (bytes > 0) segs.push({ key, label, bytes, color: TYPE_COLORS[key], pct: (bytes / total) * 100 });
  }
  if (otherUsed > 0) segs.push({ key: 'other', label: 'Other', bytes: otherUsed, color: '#94a3b8', pct: (otherUsed / total) * 100 });
  if (info.diskFreeBytes != null) segs.push({ key: 'free', bytes: info.diskFreeBytes, pct: (info.diskFreeBytes / total) * 100 });
  return segs;
});

// ── Danger zone ────────────────────────────────────────────────────────────────
const resetConfirming       = ref(false);
const isResetting           = ref(false);
const deleteFilesConfirming = ref(false);
const isDeletingFiles       = ref(false);
const dangerError           = ref('');

async function resetConfig() {
  isResetting.value = true;
  dangerError.value = '';
  try {
    const res = await fetch(getApiUrl('/config'), {
      method: 'DELETE',
      headers: { Authorization: buildAuthHeader(getStoredPassword()) },
    });
    if (res.status === 401 || res.status === 403) throw new Error('Session expired. Please sign out and sign back in.');
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server error: ${res.status}`);
    }
    logout();
    window.location.href = '/admin';
  } catch (err) {
    dangerError.value   = err.message;
    resetConfirming.value = false;
  } finally {
    isResetting.value = false;
  }
}

async function deleteAllFiles() {
  isDeletingFiles.value = true;
  dangerError.value     = '';
  try {
    const listRes = await fetch(getApiUrl('/admin/layers'), { headers: authHeaders() });
    if (!listRes.ok) throw new Error(`Server error: ${listRes.status}`);
    const layers = await listRes.json();
    await Promise.all(layers.map(l =>
      fetch(getApiUrl(`/admin/layers/${l.id}`), { method: 'DELETE', headers: authHeaders() })
    ));
    allLayers.value = [];
    deleteFilesConfirming.value = false;
  } catch (err) {
    dangerError.value = err.message;
    deleteFilesConfirming.value = false;
  } finally {
    isDeletingFiles.value = false;
  }
}

// ── Init ───────────────────────────────────────────────────────────────────────
onMounted(() => {
  fetchLibraries();
  fetchLayers();
  fetchConfig();
  fetchStorage();
});
</script>

<style scoped>
.tab-section { max-width: 900px; display: flex; flex-direction: column; gap: 1rem; }

.settings-card {
  border: 1px solid var(--admin-border, #e0e0e0); border-radius: 8px;
  background: var(--admin-surface, #fff); padding: 1rem 1.1rem;
}
.card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; }
.card-title { font-size: 0.9rem; font-weight: 600; margin: 0; }

.btn-refresh {
  display: inline-flex; align-items: center; gap: 0.35rem;
  padding: 0.25rem 0.6rem; border-radius: 5px; border: 1px solid var(--admin-border, #ccc);
  background: transparent; color: var(--admin-muted, #777); font-size: 0.75rem; cursor: pointer;
}
.btn-refresh:hover:not(:disabled) { color: var(--admin-text, #1a1a1a); border-color: var(--admin-muted, #999); }
.btn-refresh:disabled { opacity: 0.5; cursor: not-allowed; }

.empty-state { padding: 0.75rem; text-align: center; font-size: 0.82rem; color: var(--admin-muted, #777); background: var(--admin-bg, #f3f4f6); border-radius: 5px; }
.lib-error   { font-size: 0.82rem; color: #ef4444; padding: 0.4rem 0; }

/* Libraries */
.lib-list { display: flex; flex-direction: column; gap: 0.5rem; }
.lib-row {
  display: flex; align-items: center; gap: 0.65rem; padding: 0.55rem 0.7rem;
  border: 1px solid var(--admin-border, #e0e0e0); border-radius: 6px; background: var(--admin-bg, #f9fafb);
}
.lib-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.dot-ok      { background: #22c55e; }
.dot-missing { background: #d1d5db; }
.lib-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.lib-name { font-size: 0.85rem; font-weight: 500; }
.lib-desc { font-size: 0.75rem; color: var(--admin-muted, #777); }
.lib-status  { font-size: 0.75rem; flex-shrink: 0; font-weight: 500; }
.status-ok      { color: #16a34a; }
.status-missing { color: var(--admin-muted, #999); }

/* Stats */
.stat-grid { display: flex; gap: 1rem; flex-wrap: wrap; }
.stat-item { display: flex; flex-direction: column; align-items: center; gap: 0.15rem; min-width: 80px; padding: 0.7rem 1rem; border: 1px solid var(--admin-border, #e0e0e0); border-radius: 6px; background: var(--admin-bg, #f9fafb); }
.stat-value { font-size: 1.5rem; font-weight: 700; line-height: 1; }
.stat-label { font-size: 0.72rem; color: var(--admin-muted, #777); text-align: center; }

/* YAML preview */
.yaml-preview {
  margin: 0; padding: 0.75rem; font-size: 0.75rem; line-height: 1.5;
  background: var(--admin-bg, #f3f4f6); border-radius: 5px; overflow-x: auto;
  max-height: 400px; overflow-y: auto; white-space: pre;
  color: var(--admin-text, #1a1a1a);
}

/* Info list */
.info-list { display: flex; flex-direction: column; gap: 0.5rem; }
.info-row { display: flex; gap: 0.75rem; font-size: 0.82rem; flex-wrap: wrap; }
.info-key { font-weight: 500; color: var(--admin-muted, #777); flex-shrink: 0; min-width: 80px; }
.info-val { color: var(--admin-text, #333); word-break: break-all; }
.ua       { font-size: 0.72rem; color: var(--admin-muted, #aaa); }
/* Storage visualisation */
.storage-viz {
  margin-top: 0.85rem; padding-top: 0.75rem;
  border-top: 1px solid var(--admin-border, #e0e0e0);
}
.storage-header {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 0.55rem; gap: 0.5rem; flex-wrap: wrap;
}
.storage-title { font-size: 0.82rem; font-weight: 600; color: var(--admin-text, #1a1a1a); }
.storage-summary { font-size: 0.75rem; color: var(--admin-muted, #777); display: flex; align-items: center; flex-wrap: wrap; gap: 0.25rem; }
.disk-bar {
  height: 14px; border-radius: 7px; overflow: hidden; display: flex;
  background: var(--admin-bg, #f0f0f0); border: 1px solid var(--admin-border, #e0e0e0);
}
.disk-seg { height: 100%; transition: width 0.4s ease; min-width: 0; }
.disk-seg.seg-free { background: var(--admin-bg, #f0f0f0) !important; }
.disk-legend {
  display: flex; flex-wrap: wrap; gap: 0.4rem 1rem; margin-top: 0.6rem;
}
.legend-item { display: flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; }
.legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.legend-label { color: var(--admin-muted, #777); }
.legend-size { color: var(--admin-text, #333); font-weight: 500; }

.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Danger zone */
.danger-card { border-color: rgba(239,68,68,0.35); }
.danger-title { color: #ef4444; }
.danger-list { display: flex; flex-direction: column; }
.danger-row {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 1.5rem;
  padding: 0.75rem 0; flex-wrap: wrap;
}
.danger-row-text { display: flex; flex-direction: column; gap: 0.2rem; flex: 1; min-width: 0; font-size: 0.82rem; }
.danger-row-text strong { font-weight: 600; }
.danger-row-text span   { color: var(--admin-muted, #777); line-height: 1.4; }
.danger-row-action { display: flex; align-items: center; gap: 0.5rem; flex-shrink: 0; flex-wrap: wrap; }
.confirm-label { font-size: 0.78rem; color: var(--admin-muted, #777); white-space: nowrap; }
.danger-divider { border: none; border-top: 1px solid rgba(239,68,68,0.15); margin: 0; }
.danger-error { font-size: 0.78rem; color: #ef4444; margin: 0.5rem 0 0; }

.btn-danger {
  padding: 0.32rem 0.7rem; border-radius: 5px; font-size: 0.78rem; cursor: pointer;
  background: #fef2f2; border: 1px solid #fca5a5; color: #ef4444; white-space: nowrap;
}
.btn-danger:hover:not(:disabled) { background: #fee2e2; border-color: #f87171; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-secondary-sm {
  padding: 0.3rem 0.65rem; border-radius: 5px; font-size: 0.78rem; cursor: pointer;
  background: transparent; border: 1px solid var(--admin-border, #ccc); color: var(--admin-text, #333);
}
.btn-secondary-sm:hover { border-color: var(--admin-muted, #999); }
</style>
