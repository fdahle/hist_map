<template>
  <Transition name="fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
      <div class="link-modal">

        <!-- ── Header ─── -->
        <header class="modal-header">
          <h3>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"
                 stroke-linecap="round" stroke-linejoin="round" class="header-icon">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
            </svg>
            Link 3D Assets &mdash; {{ layerDisplayName || layerId.slice(0, 8) + '…' }}
          </h3>
          <button class="close-btn" @click="$emit('close')" title="Close">✕</button>
        </header>

        <!-- ── Loading / Error ─── -->
        <div v-if="loading" class="modal-status">Loading…</div>
        <div v-else-if="loadError" class="modal-status modal-error">{{ loadError }}</div>

        <!-- ── Body ─── -->
        <div v-else class="link-modal-body">

          <!-- Left: asset palette -->
          <aside class="assets-panel">
            <div class="panel-section">
              <div class="panel-section-title">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"
                     stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                </svg>
                3D Models
              </div>
              <div v-if="!models.length" class="panel-empty">None uploaded</div>
              <div
                v-for="m in models"
                :key="m.dataPath"
                class="asset-item asset-item--model"
                draggable="true"
                @dragstart="onDragStart($event, 'model', m.dataPath)"
                @dragend="dragging = null"
              >
                <span class="asset-name" :title="m.filename">{{ shortName(m.filename) }}</span>
                <button class="asset-rm" title="Delete this asset" @click.stop="deleteAsset(m)">×</button>
              </div>
            </div>

            <div class="panel-section">
              <div class="panel-section-title">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"
                     stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="5"  r="1.2"/><circle cx="19" cy="8"  r="1.2"/><circle cx="5"  cy="8"  r="1.2"/>
                  <circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="16" r="1.2"/><circle cx="5"  cy="16" r="1.2"/>
                  <circle cx="12" cy="19" r="1.2"/>
                </svg>
                Point Clouds
              </div>
              <div v-if="!pointclouds.length" class="panel-empty">None uploaded</div>
              <div
                v-for="pc in pointclouds"
                :key="pc.dataPath"
                class="asset-item asset-item--pc"
                draggable="true"
                @dragstart="onDragStart($event, 'pointcloud', pc.dataPath)"
                @dragend="dragging = null"
              >
                <span class="asset-name" :title="pc.filename">{{ shortName(pc.filename) }}</span>
                <button class="asset-rm" title="Delete this asset" @click.stop="deleteAsset(pc)">×</button>
              </div>
            </div>

            <!-- ── Upload new sub-files ─── -->
            <div class="panel-section panel-upload">
              <div class="panel-section-title">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"
                     stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                Add Files
              </div>
              <button class="btn-upload-asset" :disabled="uploading" @click="assetFileInputRef.click()">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"
                     stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;flex-shrink:0">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                {{ uploading ? 'Uploading…' : 'Upload model / companion files' }}
              </button>
              <p class="panel-upload-hint">.obj .ply .stl .las .laz — include .mtl &amp; textures in the same batch</p>
              <div v-if="uploadError" class="panel-upload-error">{{ uploadError }}</div>
              <input
                ref="assetFileInputRef"
                type="file"
                multiple
                accept=".obj,.ply,.stl,.las,.laz,.mtl,.jpg,.jpeg,.png,.bmp,.tga,.webp"
                style="display:none"
                @change="onAssetFilesSelected"
              />
            </div>
        <!-- ── Asset upload settings modal ─── -->
        <Asset3DUploadModal
          :is-open="showAssetModal"
          :files="pendingAssets"
          @confirm="doAssetUpload"
          @cancel="showAssetModal = false; pendingAssets = []"
        />
            <p class="drag-hint">Drag assets onto features →</p>
          </aside>

          <!-- Right: feature drop targets -->
          <div class="features-panel">
            <div class="features-header">
              <span class="features-count">{{ features.length }} feature{{ features.length !== 1 ? 's' : '' }}</span>
              <input v-model="filterQuery" class="features-search" placeholder="Filter features…" />
              <button v-if="hasAnyAssignment" class="btn-clear-all" @click="clearAll" title="Remove all assignments">
                Clear all
              </button>
            </div>

            <div class="features-list">
              <div
                v-for="f in filteredFeatures"
                :key="f.featureId"
                class="feature-row"
                :class="{ 'drag-over': dragOverId === f.featureId }"
                @dragover.prevent="dragOverId = f.featureId"
                @dragleave.prevent="dragOverId === f.featureId && (dragOverId = null)"
                @drop.prevent="onDrop(f.featureId)"
              >
                <div class="feature-name-col">
                  <span class="feature-primary">{{ f.displayName }}</span>
                  <span v-if="f.secondary" class="feature-secondary">{{ f.secondary }}</span>
                </div>
                <div class="feature-chips">
                  <span
                    v-for="url in getAssign(f.featureId).models"
                    :key="url"
                    class="chip chip-model"
                    :title="url"
                  >
                    <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5"
                         stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                    </svg>
                    {{ urlToName(url) }}
                    <button class="chip-rm" @click.stop="removeAsset(f.featureId, 'model', url)">×</button>
                  </span>
                  <span
                    v-for="url in getAssign(f.featureId).pointclouds"
                    :key="url"
                    class="chip chip-pc"
                    :title="url"
                  >
                    <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.5"
                         stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="1.2"/>
                      <circle cx="19" cy="8" r="1.2"/><circle cx="5" cy="8" r="1.2"/>
                      <circle cx="19" cy="16" r="1.2"/><circle cx="5" cy="16" r="1.2"/>
                    </svg>
                    {{ urlToName(url) }}
                    <button class="chip-rm" @click.stop="removeAsset(f.featureId, 'pointcloud', url)">×</button>
                  </span>
                  <span
                    v-if="!getAssign(f.featureId).models.length && !getAssign(f.featureId).pointclouds.length"
                    class="no-assign-hint"
                  >drop here</span>
                </div>
              </div>

              <div v-if="filteredFeatures.length === 0 && features.length > 0" class="features-empty">
                No features match "{{ filterQuery }}".
              </div>
              <div v-if="features.length === 0" class="features-empty">
                This GeoJSON has no features with a <code>_featureId</code>.
              </div>
            </div>
          </div>
        </div>

        <!-- ── Footer ─── -->
        <footer class="modal-footer">
          <div class="footer-status">
            <span v-if="hasAnyAssignment" class="footer-msg footer-msg-pending">Pending — click "Save configuration" to apply</span>
          </div>
          <div class="footer-actions">
            <button class="btn-close" @click="$emit('close')">Close</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { getApiUrl } from '../../../utils/config.js';
import Asset3DUploadModal from './Asset3DUploadModal.vue';

const props = defineProps({
  isOpen:             { type: Boolean, required: true },
  layerId:            { type: String,  required: true },
  authHeader:         { type: String,  required: true },
  initialAssignments: { type: Object,  default: undefined }, // pending assignments held by parent
});

const emit = defineEmits(['close', 'assignments-changed']);

// ── State ──────────────────────────────────────────────────────────────────────

const loading        = ref(false);
const loadError      = ref('');
let _isInitialLoad   = false;

const models      = ref([]);  // { filename, dataPath }
const pointclouds = ref([]);  // { filename, dataPath }

// features: [{ featureId, displayName, secondary }]
const features = ref([]);

// assignments: { [featureId]: { models: string[], pointclouds: string[] } }
const assignments = ref({});

const filterQuery = ref('');
const dragging    = ref(null);  // { type, url }
const dragOverId  = ref(null);

const layerDisplayName = ref('');
const uploading        = ref(false);
const uploadError      = ref('');
const assetFileInputRef = ref(null);
const showAssetModal   = ref(false);
const pendingAssets    = ref([]);

// ── Computed ───────────────────────────────────────────────────────────────────

const filteredFeatures = computed(() => {
  const q = filterQuery.value.trim().toLowerCase();
  if (!q) return features.value;
  return features.value.filter(f =>
    f.displayName.toLowerCase().includes(q) ||
    (f.secondary && f.secondary.toLowerCase().includes(q))
  );
});

const hasAnyAssignment = computed(() =>
  Object.values(assignments.value).some(a => a.models.length || a.pointclouds.length)
);

// Total linked features (features that have at least one 3D asset assigned)
const linkedFeatureCount = computed(() =>
  Object.values(assignments.value).filter(a => a.models.length || a.pointclouds.length).length
);

// ── Helpers ────────────────────────────────────────────────────────────────────

function getAssign(featureId) {
  if (!assignments.value[featureId]) {
    assignments.value[featureId] = { models: [], pointclouds: [] };
  }
  return assignments.value[featureId];
}

/** Strip UUID prefix and truncate for display */
function shortName(filename) {
  const noUuid = filename
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, '')
    .replace(/^[0-9a-f]{8}_/i, '');
  return noUuid.length > 30 ? noUuid.slice(0, 27) + '…' : noUuid;
}

/** Resolve a stored dataPath URL to the original human-readable filename */
function urlToName(url) {
  const all = [...models.value, ...pointclouds.value];
  const found = all.find(a => a.dataPath === url);
  return found ? shortName(found.filename) : shortName(url.split('/').pop());
}

const SYSTEM_KEYS = new Set(['_featureId', '_model3dUrls', '_pointcloudUrls', '_layerId']);

function buildFeatureMeta(feature) {
  const props  = feature.properties ?? {};
  const fid    = props._featureId ?? null;
  const values = [];
  let displayName = null;

  for (const [k, v] of Object.entries(props)) {
    if (SYSTEM_KEYS.has(k) || v === null || v === undefined || v === '') continue;
    const s = String(v);
    if (s.length > 0 && s.length < 100) {
      if (!displayName) displayName = s;
      else values.push(`${k}: ${s}`);
      if (values.length >= 2) break;
    }
  }

  if (!displayName) displayName = fid ? fid.slice(0, 12) + '…' : 'Feature';
  const secondary = values.length ? values.join(' · ') : null;
  return { featureId: fid, displayName, secondary };
}

// ── Drag & Drop ────────────────────────────────────────────────────────────────

function onDragStart(event, type, url) {
  dragging.value = { type, url };
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('text/plain', url);
}

function onDrop(featureId) {
  dragOverId.value = null;
  if (!dragging.value) return;
  const { type, url } = dragging.value;
  const assign = getAssign(featureId);
  if (type === 'model') {
    if (!assign.models.includes(url)) assign.models = [...assign.models, url];
  } else {
    if (!assign.pointclouds.includes(url)) assign.pointclouds = [...assign.pointclouds, url];
  }
  dragging.value = null;
}

function removeAsset(featureId, type, url) {
  const assign = getAssign(featureId);
  if (type === 'model') {
    assign.models = assign.models.filter(u => u !== url);
  } else {
    assign.pointclouds = assign.pointclouds.filter(u => u !== url);
  }
}

function clearAll() {
  for (const fid of Object.keys(assignments.value)) {
    assignments.value[fid] = { models: [], pointclouds: [] };
  }
}

// ── Data loading ───────────────────────────────────────────────────────────────

watch(() => props.isOpen, async (open) => {
  if (!open) {
    uploadError.value = '';
    return;
  }
  await loadData();
});

async function loadData() {
  loading.value   = true;
  loadError.value = '';
  saveError.value = '';
  saveSuccess.value = '';
  _isInitialLoad = true;
  try {
    const [assetsRes, geojsonRes] = await Promise.all([
      fetch(getApiUrl(`/admin/layers/${props.layerId}`), { headers: { Authorization: props.authHeader } }),
      fetch(getApiUrl(`data/layers/${props.layerId}/${props.layerId}.geojson`)),
    ]);
    if (!assetsRes.ok) throw new Error(`Failed to load assets (${assetsRes.status})`);
    if (!geojsonRes.ok) throw new Error(`Failed to load GeoJSON (${geojsonRes.status})`);

    const layerMeta = await assetsRes.json();
    const geojson   = await geojsonRes.json();

    layerDisplayName.value = layerMeta.layerConfig?.displayName || layerMeta.originalName || '';
    const subFiles = layerMeta.subFiles ?? [];
    models.value = subFiles
      .filter(sf => sf.role === 'model')
      .map(sf => ({
        subId:    sf.id,
        filename: sf.originalName,
        dataPath: `data/layers/${props.layerId}/${sf.id}${sf.extension}`,
      }));
    pointclouds.value = subFiles
      .filter(sf => sf.role === 'pointcloud')
      .map(sf => ({
        subId:    sf.id,
        filename: sf.originalName,
        dataPath: `data/layers/${props.layerId}/${sf.id}${sf.extension}`,
      }));

    const initial = {};
    features.value = (geojson.features ?? [])
      .map(f => {
        const meta = buildFeatureMeta(f);
        if (meta.featureId) {
          initial[meta.featureId] = {
            models:      Array.isArray(f.properties?._model3dUrls)    ? [...f.properties._model3dUrls]    : [],
            pointclouds: Array.isArray(f.properties?._pointcloudUrls) ? [...f.properties._pointcloudUrls] : [],
          };
        }
        return meta;
      })
      .filter(f => f.featureId);

    // Use pending assignments from parent if available, otherwise use GeoJSON state
    assignments.value = props.initialAssignments !== undefined
      ? { ...props.initialAssignments }
      : initial;
    filterQuery.value = '';
  } catch (err) {
    loadError.value = err.message ?? 'Failed to load data.';
  } finally {
    loading.value = false;
    // Allow the assignment watcher to fire after the current tick without triggering a save
    setTimeout(() => { _isInitialLoad = false; }, 0);
  }
}

// ── Sub-file upload ─────────────────────────────────────────────────────────────

function onAssetFilesSelected(e) {
  const files = Array.from(e.target.files);
  e.target.value = '';
  if (!files.length) return;
  pendingAssets.value = files;
  showAssetModal.value = true;
}

async function doAssetUpload(settingsMap) {
  showAssetModal.value = false;
  uploading.value   = true;
  uploadError.value = '';

  try {
    const fd = new FormData();
    for (const file of pendingAssets.value) {
      fd.append('files', file);
    }
    fd.append('settings', JSON.stringify(settingsMap));

    const res = await fetch(getApiUrl(`/admin/layers/${props.layerId}/subfiles/batch`), {
      method: 'POST',
      headers: { Authorization: props.authHeader },
      body: fd,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Upload failed (${res.status})`);
    }
    await reloadAssets();
  } catch (err) {
    uploadError.value = err.message ?? 'Upload failed.';
  } finally {
    uploading.value = false;
    pendingAssets.value = [];
  }
}

async function reloadAssets() {
  if (!props.layerId) return;
  const res = await fetch(getApiUrl(`/admin/layers/${props.layerId}`), { headers: { Authorization: props.authHeader } });
  if (!res.ok) return;
  const layerMeta = await res.json();
  const subFiles = layerMeta.subFiles ?? [];
  models.value = subFiles
    .filter(sf => sf.role === 'model')
    .map(sf => ({ subId: sf.id, filename: sf.originalName, dataPath: `data/layers/${props.layerId}/${sf.id}${sf.extension}` }));
  pointclouds.value = subFiles
    .filter(sf => sf.role === 'pointcloud')
    .map(sf => ({ subId: sf.id, filename: sf.originalName, dataPath: `data/layers/${props.layerId}/${sf.id}${sf.extension}` }));
}

async function deleteAsset(asset) {
  try {
    const res = await fetch(getApiUrl(`/admin/layers/${props.layerId}/subfiles/${asset.subId}`), {
      method: 'DELETE',
      headers: { Authorization: props.authHeader },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Delete failed (${res.status})`);
    }
    // Remove from local lists
    models.value      = models.value.filter(m => m.dataPath !== asset.dataPath);
    pointclouds.value = pointclouds.value.filter(p => p.dataPath !== asset.dataPath);
    // Remove any feature assignments that reference the deleted asset
    for (const a of Object.values(assignments.value)) {
      a.models      = a.models.filter(u => u !== asset.dataPath);
      a.pointclouds = a.pointclouds.filter(u => u !== asset.dataPath);
    }
  } catch (err) {
    uploadError.value = err.message ?? 'Delete failed.';
  }
}

// ── Auto-save ──────────────────────────────────────────────────────────────────

// ── Emit assignment changes to parent (deferred save) ──────────

watch(assignments, () => {
  if (!_isInitialLoad) emit('assignments-changed', { ...assignments.value });
}, { deep: true });
</script>

<style scoped>
/* ── Overlay & shell ─────────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 1rem;
}

.link-modal {
  background: var(--admin-surface, #fff);
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 10px;
  width: 100%;
  max-width: 960px;
  height: 82vh;
  display: flex;
  flex-direction: column;
  font-family: "Segoe UI", sans-serif;
  overflow: hidden;
}

/* ── Header ─────────────────────────────────────────────────────────────────── */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid var(--admin-border, #e0e0e0);
  flex-shrink: 0;
  gap: 1rem;
}

.modal-header h3 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}

.header-icon { flex-shrink: 0; }

.close-btn {
  background: transparent;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  color: var(--admin-muted, #777);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  line-height: 1;
  flex-shrink: 0;
}
.close-btn:hover { background: var(--admin-bg, #f3f4f6); }

/* ── Loading / error placeholders ────────────────────────────────────────────── */
.modal-status {
  padding: 2rem;
  text-align: center;
  font-size: 0.85rem;
  color: var(--admin-muted, #777);
}
.modal-error { color: #ef4444; }

/* ── Two-column body ─────────────────────────────────────────────────────────── */
.link-modal-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Left: asset palette ─────────────────────────────────────────────────────── */
.assets-panel {
  width: 230px;
  flex-shrink: 0;
  border-right: 1px solid var(--admin-border, #e0e0e0);
  overflow-y: auto;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: var(--admin-bg, #f9fafb);
}

.panel-section { display: flex; flex-direction: column; gap: 0.3rem; }

.panel-section-title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--admin-muted, #777);
  padding: 0.3rem 0 0.2rem;
}

.panel-empty {
  font-size: 0.75rem;
  color: var(--admin-muted, #999);
  padding: 0.25rem 0.5rem;
  font-style: italic;
}

.asset-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  border-radius: 5px;
  font-size: 0.75rem;
  cursor: grab;
  border: 1px solid transparent;
  user-select: none;
}
.asset-item:hover {
  border-color: var(--admin-border, #ddd);
  background: var(--admin-surface, #fff);
}
.asset-item:active { cursor: grabbing; }

.asset-item--model {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
}
.asset-item--model:hover { background: #dbeafe; }

.asset-item--pc {
  background: #f0fdf4;
  border-color: #bbf7d0;
  color: #15803d;
}
.asset-item--pc:hover { background: #dcfce7; }

.asset-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.asset-rm {
  flex-shrink: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
  padding: 0 0.15rem;
  color: inherit;
  opacity: 0.45;
  border-radius: 3px;
  transition: opacity 0.1s, background 0.1s;
}
.asset-rm:hover { opacity: 1; background: rgba(0,0,0,0.08); }

.drag-hint {
  padding-top: 0.5rem;
  font-size: 0.7rem;
  color: var(--admin-muted, #aaa);
  text-align: center;
}

/* ── Upload new assets section ──────────────────────────────────────────── */
.panel-upload {
  margin-top: auto;
  border-top: 1px solid var(--admin-border, #e0e0e0);
  padding-top: 0.65rem;
}

.btn-upload-asset {
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.35rem 0.5rem;
  border-radius: 5px;
  border: 1px dashed var(--admin-border, #ccc);
  background: transparent;
  color: var(--admin-muted, #666);
  font-size: 0.75rem;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s, color 0.12s;
}
.btn-upload-asset:hover:not(:disabled) {
  border-color: #3b82f6;
  background: rgba(59,130,246,0.06);
  color: #3b82f6;
}
.btn-upload-asset:disabled { opacity: 0.5; cursor: default; }

.panel-upload-hint {
  font-size: 0.68rem;
  color: var(--admin-muted, #aaa);
  text-align: center;
  margin: 0.2rem 0 0;
}

.panel-upload-error {
  font-size: 0.72rem;
  color: #dc2626;
  margin-top: 0.25rem;
  word-break: break-word;
}

/* ── Right: feature list ─────────────────────────────────────────────────────── */
.features-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.features-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid var(--admin-border, #e5e7eb);
  flex-shrink: 0;
}

.features-count {
  font-size: 0.75rem;
  color: var(--admin-muted, #777);
  white-space: nowrap;
}

.features-search {
  flex: 1;
  border: 1px solid var(--admin-border, #d1d5db);
  border-radius: 5px;
  padding: 0.3rem 0.6rem;
  font-size: 0.78rem;
  background: transparent;
  color: inherit;
  outline: none;
  min-width: 0;
}
.features-search:focus { border-color: var(--admin-accent, #3b82f6); }

.btn-clear-all {
  background: transparent;
  border: 1px solid var(--admin-border, #d1d5db);
  border-radius: 4px;
  padding: 0.25rem 0.55rem;
  font-size: 0.73rem;
  cursor: pointer;
  color: var(--admin-muted, #777);
  white-space: nowrap;
}
.btn-clear-all:hover { border-color: #ef4444; color: #ef4444; }

.features-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.4rem 0;
}

.feature-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.5rem 0.85rem;
  border-bottom: 1px solid var(--admin-border, #f0f0f0);
  transition: background 0.1s;
  min-height: 42px;
}
.feature-row:hover { background: var(--admin-bg, #f9fafb); }
.feature-row.drag-over {
  background: #eff6ff;
  border-color: #93c5fd;
  outline: 2px dashed #93c5fd;
  outline-offset: -2px;
}

.feature-name-col {
  display: flex;
  flex-direction: column;
  min-width: 140px;
  max-width: 200px;
  flex-shrink: 0;
}

.feature-primary {
  font-size: 0.8rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feature-secondary {
  font-size: 0.7rem;
  color: var(--admin-muted, #888);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feature-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  flex: 1;
  align-items: center;
  min-height: 26px;
}

.no-assign-hint {
  font-size: 0.7rem;
  color: var(--admin-muted, #bbb);
  font-style: italic;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.3rem 0.15rem 0.45rem;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 500;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-model {
  background: #dbeafe;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}
.chip-pc {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #bbf7d0;
}

.chip-rm {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  line-height: 1;
  padding: 0 0.1rem;
  color: inherit;
  opacity: 0.6;
  flex-shrink: 0;
}
.chip-rm:hover { opacity: 1; }

.features-empty {
  padding: 1.5rem;
  text-align: center;
  font-size: 0.82rem;
  color: var(--admin-muted, #aaa);
}

/* ── Footer ─────────────────────────────────────────────────────────────────────────────── */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.7rem 1.25rem;
  border-top: 1px solid var(--admin-border, #e0e0e0);
  flex-shrink: 0;
  background: var(--admin-surface, #fff);
}

.footer-status {
  flex: 1;
  min-width: 0;
}

.footer-msg {
  font-size: 0.8rem;
  display: inline-flex;
  align-items: center;
}
.footer-msg-pending { color: #d97706; font-style: italic; }

.footer-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.btn-close {
  background: transparent;
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 5px;
  padding: 0.4rem 1.1rem;
  font-size: 0.82rem;
  cursor: pointer;
  color: var(--admin-text, #1a1a1a);
  height: 32px;
  font-weight: 500;
}
.btn-close:hover { background: var(--admin-bg, #f3f4f6); }

/* ── Transition ──────────────────────────────────────────────────────────────── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to       { opacity: 0; }

.spin { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
