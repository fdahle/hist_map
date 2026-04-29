<template>
  <section class="tab-section">
    <div class="settings-card">
      <div class="section-header">
        <div>
          <h2 class="section-title">3D Layers</h2>
          <p class="section-desc">OBJ, PLY, STL models and LAS/LAZ point clouds — upload and manage standalone 3D assets.</p>
        </div>
        <label class="btn-add" :class="{ 'btn-add-disabled': uploadPending }">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {{ uploadPending ? 'Uploading…' : 'Add 3D Layer' }}
          <input v-if="!uploadPending" type="file" multiple
            accept=".obj,.ply,.stl,.las,.laz"
            style="display:none" @change="onFilesSelected" />
        </label>
      </div>

      <!-- Upload progress -->
    <div v-if="uploadPending" class="upload-progress-wrap">
      <div class="upload-progress-label"><span>Uploading…</span><span>{{ uploadProgress }}%</span></div>
      <div class="upload-progress-track"><div class="upload-progress-fill" :style="{ width: uploadProgress + '%' }"></div></div>
    </div>

    <div v-if="uploadError" class="upload-error-banner">
      <span>{{ uploadError }}</span>
      <button class="banner-close" @click="uploadError = ''">✕</button>
    </div>

    <div v-if="isLoading && !layers.length" class="empty-state">Loading 3D layers…</div>
    <div v-else-if="!isLoading && !layers.length && !uploadPlaceholders.length" class="empty-state">
      No 3D layers yet. Click <strong>Add 3D Layer</strong> to upload an OBJ, PLY, STL, LAS, or LAZ file.
    </div>

    <!-- Upload placeholder cards -->
    <div v-if="uploadPlaceholders.length" class="layer-list" style="margin-bottom: 0.5rem;">
      <div v-for="ph in uploadPlaceholders" :key="ph.id" class="layer-card layer-card-uploading">
        <div class="lc-header">
          <span class="type-badge">{{ ph.ext }}</span>
          <div class="lc-names"><span class="lc-display-name">{{ ph.name }}</span></div>
          <div class="lc-status">
            <svg class="spin" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M12 2a10 10 0 0110 10" opacity="0.3"/><path d="M12 2a10 10 0 000 20a10 10 0 0010-10"/>
            </svg>
            <span class="status-text status-uploading">
              {{ ph.phase === 'uploading' ? `Uploading ${ph.progress}%` : 'Processing…' }}
            </span>
          </div>
        </div>
        <div class="lc-upload-bar-track">
          <div class="lc-upload-bar-fill" :class="ph.phase === 'processing' ? 'lc-upload-bar-processing' : ''"
            :style="ph.phase === 'uploading' ? { width: ph.progress + '%' } : { width: '100%' }" />
        </div>
      </div>
    </div>

    <!-- Layer cards -->
    <div v-if="layers.length" class="layer-list">
      <div v-for="layer in sortedLayers" :key="layer.id" class="layer-card"
        :class="{ 'layer-card-optimizing': layer.status === 'optimizing', 'layer-card-error': layer.status === 'error', 'layer-card-editing': editingId === layer.id }">

        <div class="lc-header">
          <span class="type-badge" :class="`type-${layer.fileType}`">{{ layer.fileType }}</span>
          <div class="lc-names">
            <span class="lc-display-name">{{ layer.layerConfig?.displayName || layer.originalName }}</span>
            <span v-if="layer.layerConfig?.displayName && layer.layerConfig.displayName !== layer.originalName" class="lc-original-name">{{ layer.originalName }}</span>
          </div>
          <div class="lc-status">
            <template v-if="layer.status === 'optimizing'">
              <svg class="spin" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M12 2a10 10 0 0110 10" opacity="0.3"/><path d="M12 2a10 10 0 000 20a10 10 0 0010-10"/>
              </svg>
              <span class="status-text status-optimizing">Optimizing…</span>
            </template>
            <template v-else-if="layer.status === 'error'">
              <span class="status-text status-error" :title="layer.processingLog?.at(-1) ?? 'Error'">⚠ Error</span>
            </template>
            <template v-else>
              <span v-if="layer.optimized" class="status-text status-ok">✓ Optimized</span>
            </template>
          </div>
          <div class="lc-actions">
            <button class="action-btn" :class="{ 'action-btn-active': editingId === layer.id }"
              :disabled="layer.status === 'optimizing'" :title="editingId === layer.id ? 'Close' : 'Edit'"
              @click="toggleEdit(layer)">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button class="action-btn action-btn-danger" :disabled="layer.status === 'optimizing' || deletePending[layer.id]"
              title="Delete" @click="confirmDelete(layer)">
              <svg v-if="!deletePending[layer.id]" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
              <span v-else style="font-size:11px">…</span>
            </button>
          </div>
        </div>

        <!-- Delete confirmation -->
        <div v-if="deleteConfirmId === layer.id" class="lc-confirm-bar">
          <span class="confirm-text">Delete <strong>{{ layer.layerConfig?.displayName || layer.originalName }}</strong> permanently?</span>
          <button class="btn-danger-sm" :disabled="deletePending[layer.id]" @click="doDelete(layer.id)">
            {{ deletePending[layer.id] ? 'Deleting…' : 'Yes, delete' }}
          </button>
          <button class="btn-secondary-sm" @click="deleteConfirmId = null">Cancel</button>
        </div>

        <!-- Inline edit panel -->
        <div v-if="editingId === layer.id" class="lc-edit-panel">
          <div class="edit-section-heading">General</div>
          <div class="edit-row">
            <div class="edit-field edit-field-grow">
              <label>Display name</label>
              <input v-model="editDraft.displayName" type="text" :placeholder="layer.originalName" />
            </div>
            <div class="edit-field edit-field-sm">
              <label>Order</label>
              <input v-model.number="editDraft.order" type="number" min="0" />
            </div>
          </div>

          <div class="edit-row">
            <div class="edit-field edit-field-grow">
              <label>Source CRS
                <span v-if="layer.sourceCrs" class="edit-field-hint"> — detected: {{ layer.sourceCrs }}</span>
              </label>
              <input v-model="editDraft.sourceCrs" type="text"
                :placeholder="layer.sourceCrs || 'e.g. EPSG:25832'" />
            </div>
          </div>

          <!-- Point cloud options -->
          <template v-if="layer.fileType === 'pointcloud'">
            <div class="edit-section-heading">Point Cloud</div>
            <div class="edit-row">
              <div class="edit-field edit-field-grow">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="editDraft.copcConverted" disabled />
                  COPC converted
                  <span class="edit-field-hint">(set at upload time)</span>
                </label>
              </div>
            </div>
            <div v-if="layer.featureCount != null" class="edit-row">
              <div class="edit-field">
                <label>Point count</label>
                <input type="text" :value="layer.featureCount.toLocaleString()" disabled style="opacity:0.6;cursor:default" />
              </div>
            </div>
          </template>

          <!-- Companion files (OBJ) -->
          <template v-if="layer.fileType === 'model' && layer.subFiles?.length">
            <div class="edit-section-heading">Companion Files</div>
            <div class="companion-list">
              <div v-for="sub in layer.subFiles" :key="sub.id" class="companion-item">
                <span class="companion-role">{{ sub.role }}</span>
                <span class="companion-name">{{ sub.originalName }}</span>
              </div>
            </div>
          </template>

          <div class="edit-footer">
            <button v-if="layer.keepOriginal" class="btn-secondary-sm" @click="onDownloadOriginal(layer)">↓ Original</button>
            <span class="edit-footer-spacer" />
            <span v-if="editError" class="edit-error">{{ editError }}</span>
            <span v-if="editSaving" class="edit-saving">Saving…</span>
            <button class="btn-secondary-sm" @click="cancelEdit">Done</button>
          </div>
        </div>
      </div>
    </div>

    </div>

    <Asset3DUploadModal
      :is-open="showUploadModal"
      :files="pendingFiles"
      :pdal-available="pdalAvailable"
      @confirm="doUpload"
      @cancel="cancelUpload"
    />
  </section>
</template>

<script setup>
import { ref, computed, inject, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { getApiUrl } from '../../../utils/config';
import Asset3DUploadModal from '../../modals/admin/Asset3DUploadModal.vue';

// ── Injected from AdminView ────────────────────────────────────────────────────
const authHeader = inject('authHeader');

function authHeaders(extra = {}) {
  return { Authorization: authHeader.value, ...extra };
}

// ── State ──────────────────────────────────────────────────────────────────────
const layers             = ref([]);
const isLoading          = ref(false);
const uploadError        = ref('');
const uploadPending      = ref(false);
const uploadProgress     = ref(0);
const deletePending      = ref({});
const deleteConfirmId    = ref(null);
const editingId          = ref(null);
const editDraft          = ref({});
const editError          = ref('');
const editSaving         = ref(false);
const pendingFiles       = ref([]);
const showUploadModal    = ref(false);
const pdalAvailable      = ref(true);
const uploadPlaceholders = ref([]);
let editAutoSaveTimer    = null;
let ignoreNextEditChange = false;
let pollTimer            = null;

const sortedLayers = computed(() =>
  [...layers.value].filter(l => ['model','pointcloud'].includes(l.fileType))
    .sort((a, b) => (a.layerConfig?.order ?? 0) - (b.layerConfig?.order ?? 0))
);
const hasOptimizing = computed(() => layers.value.some(l => l.status === 'optimizing'));

onMounted(async () => { await fetchLayers(); startPolling(); fetchPdalAvailability(); });
onUnmounted(() => { stopPolling(); clearTimeout(editAutoSaveTimer); });

// ── Fetch ──────────────────────────────────────────────────────────────────────
async function fetchLayers() {
  if (!authHeader.value) return;
  isLoading.value = true;
  try {
    const res = await fetch(getApiUrl('/admin/layers'), { headers: authHeaders() });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    layers.value = await res.json();
  } catch { /* non-fatal */ }
  finally { isLoading.value = false; }
}

async function fetchPdalAvailability() {
  try {
    const res = await fetch(getApiUrl('/admin/system-libraries'), { headers: authHeaders() });
    if (!res.ok) return;
    const libs = await res.json();
    const pdal = libs.find(l => l.name === 'PDAL');
    if (pdal) pdalAvailable.value = pdal.available;
  } catch { /* non-fatal */ }
}

// ── Polling ────────────────────────────────────────────────────────────────────
function startPolling() {
  pollTimer = setInterval(async () => {
    if (!hasOptimizing.value && !uploadPlaceholders.value.length) return;
    await fetchLayers();
  }, 2000);
}
function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

// ── Upload flow ────────────────────────────────────────────────────────────────
const pointcloudExts = new Set(['.las', '.laz']);
const companionExts  = new Set(['.mtl', '.jpg', '.jpeg', '.png', '.bmp', '.tga', '.webp']);

function isPointcloud(filename) {
  return pointcloudExts.has('.' + filename.split('.').pop().toLowerCase());
}

function onFilesSelected(e) {
  const files = Array.from(e.target.files);
  e.target.value = '';
  if (!files.length) return;
  pendingFiles.value = files;
  showUploadModal.value = true;
}
function cancelUpload() { pendingFiles.value = []; showUploadModal.value = false; }

async function doUpload(settings) {
  showUploadModal.value = false;
  uploadPending.value   = true;
  uploadProgress.value  = 0;
  uploadError.value     = '';

  const primaryFiles = pendingFiles.value.filter(f => !companionExts.has('.' + f.name.split('.').pop().toLowerCase()));
  const placeholderIds = primaryFiles.map((f, i) => {
    const id = `ph-${Date.now()}-${i}`;
    uploadPlaceholders.value.push({ id, name: f.name, ext: f.name.split('.').pop().toUpperCase(), phase: 'uploading', progress: 0 });
    return id;
  });

  const formData = new FormData();
  for (const file of pendingFiles.value) formData.append('files', file);
  formData.append('settings', JSON.stringify(settings ?? {}));

  try {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', getApiUrl('/admin/upload'));
      xhr.setRequestHeader('Authorization', authHeader.value);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          uploadProgress.value = pct;
          for (const ph of uploadPlaceholders.value) { if (placeholderIds.includes(ph.id)) ph.progress = pct; }
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          for (const ph of uploadPlaceholders.value) { if (placeholderIds.includes(ph.id)) ph.phase = 'processing'; }
          resolve();
        } else {
          let msg = `Upload failed (${xhr.status})`;
          try { msg = JSON.parse(xhr.responseText).error || msg; } catch { /* ignore */ }
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error('Network error during upload.'));
      xhr.send(formData);
    });
    pendingFiles.value = [];
    const clearWhenReady = async () => {
      await fetchLayers();
      const names = new Set(layers.value.map(l => l.originalName));
      uploadPlaceholders.value = uploadPlaceholders.value.filter(ph => !names.has(ph.name));
      if (uploadPlaceholders.value.length > 0) setTimeout(clearWhenReady, 1500);
    };
    await clearWhenReady();
  } catch (err) {
    uploadError.value = err.message;
    uploadPlaceholders.value = uploadPlaceholders.value.filter(ph => !placeholderIds.includes(ph.id));
  } finally {
    uploadPending.value  = false;
    uploadProgress.value = 0;
  }
}

// ── Delete ─────────────────────────────────────────────────────────────────────
function confirmDelete(layer) { deleteConfirmId.value = layer.id; editingId.value = null; }

async function doDelete(id) {
  deletePending.value = { ...deletePending.value, [id]: true };
  try {
    const res = await fetch(getApiUrl(`/admin/layers/${id}`), { method: 'DELETE', headers: authHeaders() });
    if (!res.ok) throw new Error(`Delete failed (${res.status})`);
    layers.value = layers.value.filter(l => l.id !== id);
    deleteConfirmId.value = null;
  } catch (err) {
    uploadError.value = err.message;
  } finally {
    const next = { ...deletePending.value }; delete next[id]; deletePending.value = next;
  }
}

// ── Inline edit ────────────────────────────────────────────────────────────────
function toggleEdit(layer) {
  if (editingId.value === layer.id) { cancelEdit(); return; }
  deleteConfirmId.value   = null;
  ignoreNextEditChange    = true;
  const lc = layer.layerConfig || {};
  editDraft.value = {
    displayName:    lc.displayName    ?? '',
    order:          lc.order          ?? 0,
    sourceCrs:      lc.sourceCrs      ?? layer.sourceCrs ?? '',
    copcConverted:  layer.optimized   ?? false,
  };
  editingId.value = layer.id;
  editError.value = '';
  nextTick(() => { ignoreNextEditChange = false; });
}

function cancelEdit() {
  if (editAutoSaveTimer !== null && editingId.value) {
    clearTimeout(editAutoSaveTimer); editAutoSaveTimer = null;
    saveEdit(editingId.value);
  }
  ignoreNextEditChange = false;
  editingId.value      = null;
  editError.value      = '';
}

function scheduleEditAutoSave() {
  if (ignoreNextEditChange) return;
  clearTimeout(editAutoSaveTimer);
  editAutoSaveTimer = setTimeout(() => { if (editingId.value) saveEdit(editingId.value); }, 700);
}
watch(editDraft, scheduleEditAutoSave, { deep: true });

async function saveEdit(id) {
  const layer = layers.value.find(l => l.id === id);
  if (!layer) return;
  editSaving.value = true;
  editError.value  = '';

  const patch = {
    displayName: editDraft.value.displayName || null,
    order:       editDraft.value.order       ?? 0,
    sourceCrs:   editDraft.value.sourceCrs?.trim() || null,
  };

  try {
    const res = await fetch(getApiUrl(`/admin/layers/${id}`), {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Save failed (${res.status})`);
    }
    const updated = await res.json();
    const idx = layers.value.findIndex(l => l.id === id);
    if (idx !== -1) layers.value[idx] = updated;
  } catch (err) {
    editError.value = err.message;
  } finally {
    editSaving.value = false;
  }
}

// ── Download original ──────────────────────────────────────────────────────────
async function onDownloadOriginal(layer) {
  try {
    const res = await fetch(getApiUrl(`/admin/layers/${layer.id}/original`), { headers: authHeaders() });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = layer.originalName ?? `${layer.id}.bin`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    editError.value = err.message;
  }
}
</script>

<style scoped>
.tab-section { max-width: 900px; display: flex; flex-direction: column; gap: 1rem; }
.settings-card { border: 1px solid var(--admin-border, #e0e0e0); border-radius: 8px; background: var(--admin-surface, #fff); padding: 1rem 1.1rem; }
.section-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--admin-border, #e0e0e0); padding-bottom: 0.85rem; margin-bottom: 0.75rem; }
.section-title { font-size: 1rem; font-weight: 600; margin: 0 0 0.2rem; }
.section-desc  { font-size: 0.8rem; color: var(--admin-muted, #777); margin: 0; }

.btn-add {
  display: inline-flex; align-items: center; padding: 0.4rem 0.85rem; border-radius: 6px;
  background: #7c3aed; color: #fff; font-size: 0.82rem; font-weight: 500; cursor: pointer; white-space: nowrap; user-select: none;
}
.btn-add:hover:not(.btn-add-disabled) { background: #6d28d9; }
.btn-add-disabled { opacity: 0.55; cursor: default; }

.upload-progress-wrap { margin-bottom: 0.75rem; }
.upload-progress-label { display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--admin-muted, #666); margin-bottom: 0.3rem; }
.upload-progress-track { height: 6px; background: var(--admin-border, #e0e0e0); border-radius: 3px; overflow: hidden; }
.upload-progress-fill  { height: 100%; background: #7c3aed; border-radius: 3px; transition: width 0.15s; }

.upload-error-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.35);
  border-radius: 6px; padding: 0.55rem 0.8rem; margin-bottom: 0.75rem; font-size: 0.82rem; color: #ef4444;
}
.banner-close { background: none; border: none; cursor: pointer; color: var(--admin-muted, #777); font-size: 1rem; padding: 0; }

.empty-state { padding: 1.25rem; text-align: center; font-size: 0.85rem; color: var(--admin-muted, #777); background: var(--admin-bg, #f3f4f6); border-radius: 6px; }
.layer-list { display: flex; flex-direction: column; gap: 0.5rem; }

.layer-card {
  border: 1px solid var(--admin-border, #e0e0e0); border-radius: 8px;
  background: var(--admin-surface, #fff); overflow: hidden; transition: border-color 0.15s;
}
.layer-card:hover { filter: brightness(0.98); }
.layer-card-editing { border-color: #7c3aed !important; }
.layer-card-uploading { border-color: #c4b5fd; background: #f5f3ff; opacity: 0.9; }
:global(body.theme-dark) .layer-card-uploading { border-color: #5b21b6; background: rgba(124,58,237,0.1); }

.lc-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.75rem; min-height: 42px; }
.type-badge {
  font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
  padding: 0.15rem 0.4rem; border-radius: 3px; background: var(--admin-border, #e0e0e0);
  color: var(--admin-muted, #777); white-space: nowrap; flex-shrink: 0;
}
.type-model      { background: #ede9fe; color: #7c3aed; }
.type-pointcloud { background: #f0fdf4; color: #16a34a; }
:global(body.theme-dark) .type-model      { background: rgba(124,58,237,0.2); color: #a78bfa; }
:global(body.theme-dark) .type-pointcloud { background: rgba(22,163,74,0.2);  color: #4ade80; }

.lc-names { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.lc-display-name  { font-size: 0.85rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lc-original-name { font-size: 0.72rem; color: var(--admin-muted, #999); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.lc-status { display: flex; align-items: center; gap: 0.3rem; flex-shrink: 0; }
.status-text { font-size: 0.72rem; }
.status-ok         { color: #22c55e; }
.status-error      { color: #ef4444; }
.status-optimizing { color: #f59e0b; }
.status-uploading  { color: #7c3aed; }

.lc-actions { display: flex; gap: 0.25rem; flex-shrink: 0; margin-left: auto; }
.action-btn {
  display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  border: 1px solid var(--admin-border, #e0e0e0); border-radius: 5px;
  background: transparent; color: var(--admin-muted, #777); cursor: pointer;
}
.action-btn:hover:not(:disabled) { color: var(--admin-text, #1a1a1a); border-color: var(--admin-muted, #999); }
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.action-btn-active { background: #f5f3ff; border-color: #c4b5fd; color: #7c3aed; }
.action-btn-danger:hover:not(:disabled) { color: #ef4444; border-color: #fca5a5; }

.lc-upload-bar-track { height: 3px; background: #ede9fe; overflow: hidden; }
.lc-upload-bar-fill { height: 100%; background: #7c3aed; transition: width 0.2s; }
.lc-upload-bar-processing { width: 100% !important; animation: pulse-bar 1s infinite; }
@keyframes pulse-bar { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

.lc-confirm-bar {
  display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;
  padding: 0.5rem 0.75rem; background: rgba(239,68,68,0.06); border-top: 1px solid rgba(239,68,68,0.2);
  font-size: 0.82rem;
}
.confirm-text { flex: 1; min-width: 0; }

.lc-edit-panel { padding: 0.85rem 0.9rem; border-top: 1px solid var(--admin-border, #e0e0e0); background: var(--admin-bg, #f9fafb); }
.edit-section-heading { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--admin-muted, #777); margin: 0.75rem 0 0.4rem; }
.edit-section-heading:first-child { margin-top: 0; }
.edit-row { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.edit-field { display: flex; flex-direction: column; gap: 0.25rem; min-width: 120px; }
.edit-field label { font-size: 0.78rem; font-weight: 500; color: var(--admin-text, #333); }
.edit-field input, .edit-field select {
  padding: 0.35rem 0.5rem; border: 1px solid var(--admin-input-border, #ccc);
  border-radius: 5px; font-size: 0.82rem; background: var(--admin-input-bg, #fff); color: var(--admin-text, #1a1a1a);
}
.edit-field input:focus { outline: 2px solid #7c3aed; }
.edit-field-grow { flex: 1; }
.edit-field-sm   { width: 80px; min-width: 80px; }
.edit-field-hint { font-size: 0.72rem; color: var(--admin-muted, #999); font-weight: 400; }
.checkbox-label  { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; cursor: pointer; }

.companion-list { display: flex; flex-direction: column; gap: 0.25rem; }
.companion-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.78rem; }
.companion-role { font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
  padding: 0.1rem 0.35rem; border-radius: 3px; background: var(--admin-border, #e0e0e0); color: var(--admin-muted, #777); }
.companion-name { color: var(--admin-text, #555); }

.edit-footer { display: flex; align-items: center; gap: 0.5rem; padding-top: 0.6rem; margin-top: 0.25rem; border-top: 1px solid var(--admin-border, #e0e0e0); }
.edit-footer-spacer { flex: 1; }
.edit-error  { font-size: 0.78rem; color: #ef4444; }
.edit-saving { font-size: 0.78rem; color: var(--admin-muted, #777); }

.btn-secondary-sm, .btn-danger-sm, .btn-primary-sm {
  padding: 0.3rem 0.65rem; border-radius: 5px; font-size: 0.78rem; cursor: pointer;
}
.btn-secondary-sm { background: transparent; border: 1px solid var(--admin-border, #ccc); color: var(--admin-text, #333); }
.btn-secondary-sm:hover { border-color: var(--admin-muted, #999); }
.btn-primary-sm { background: #7c3aed; border: 1px solid #7c3aed; color: #fff; }
.btn-primary-sm:hover { background: #6d28d9; }
.btn-danger-sm { background: #fef2f2; border: 1px solid #fca5a5; color: #ef4444; }
.btn-danger-sm:hover:not(:disabled) { background: #fee2e2; }
.btn-danger-sm:disabled { opacity: 0.5; cursor: not-allowed; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
