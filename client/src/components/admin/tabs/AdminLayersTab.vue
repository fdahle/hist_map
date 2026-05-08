<template>
  <section class="tab-section">
    <div class="settings-card">
      <div class="section-header">
        <div>
          <h2 class="section-title">Layers</h2>
          <p class="section-desc">GeoJSON and GeoTIFF layers — upload, configure, and manage.</p>
        </div>
        <label class="btn-add" :class="{ 'btn-add-disabled': uploadPending }">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {{ uploadPending ? 'Uploading…' : 'Add Layer' }}
          <input v-if="!uploadPending" type="file" multiple
            accept=".geojson,.json,.tif,.tiff"
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

    <div v-if="isLoading && !layers.length" class="empty-state">Loading layers…</div>
    <div v-else-if="!isLoading && !layers.length && !uploadPlaceholders.length" class="empty-state">
      No 2D layers yet. Click <strong>Add Layer</strong> to upload a GeoJSON or GeoTIFF file.
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
              <span v-if="layer.processingLog?.some(s => s.startsWith('Geometry simplified'))" class="status-text status-ok">✓ Simplified</span>
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
            <button class="action-btn" title="Info" @click="infoLayer = layer">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
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
            <div class="edit-field edit-field-toggle">
              <label>Visible</label>
              <div class="toggle-switch">
                <input :id="`vis-${layer.id}`" v-model="editDraft.visible" type="checkbox" />
                <label :for="`vis-${layer.id}`" class="slider"></label>
              </div>
            </div>
          </div>

          <div class="edit-row">
            <div class="edit-field edit-field-grow">
              <label>{{ layer.fileType === 'geotiff' ? 'Projection (EPSG)' : 'Source CRS' }}
                <span v-if="layer.sourceCrs" class="edit-field-hint"> — detected: {{ layer.sourceCrs }}</span>
              </label>
              <input v-model="editDraft.crsOverride" type="text"
                :placeholder="layer.sourceCrs || 'e.g. EPSG:4326'" />
            </div>
            <div v-if="layer.targetCrs" class="edit-field">
              <label>Stored as</label>
              <input type="text" :value="layer.targetCrs" disabled style="opacity:0.6;cursor:default" />
            </div>
          </div>

          <!-- GeoJSON style -->
          <template v-if="layer.fileType === 'geojson'">
            <div class="edit-section-heading">Style</div>
            <div class="edit-row">
              <div class="edit-field">
                <label>Stroke color</label>
                <div class="color-row">
                  <input type="color" class="color-swatch"
                    :value="/^#[0-9a-f]{6}$/i.test(editDraft.stroke_color) ? editDraft.stroke_color : '#0088ff'"
                    @input="editDraft.stroke_color = $event.target.value" />
                  <input v-model="editDraft.stroke_color" type="text" placeholder="#0088ff" />
                </div>
              </div>
              <div class="edit-field">
                <label>Fill color</label>
                <div class="color-row">
                  <input type="color" class="color-swatch"
                    :value="fillSwatchColor(editDraft.fill_color, editDraft.stroke_color)"
                    :disabled="!fillIsHex(editDraft.fill_color)"
                    @input="editDraft.fill_color = $event.target.value" />
                  <input v-model="editDraft.fill_color" type="text" placeholder="auto / none / #0088ff"
                    @blur="editDraft.fill_color = normalizeFillColor(editDraft.fill_color)" />
                </div>
              </div>
            </div>
            <div v-if="layer.geometryType === 'Point'" class="edit-row">
              <div class="edit-field">
                <label>Point type</label>
                <select v-model="editDraft.pointType">
                  <option value="">— auto —</option>
                  <option value="circle">circle</option>
                  <option value="square">square</option>
                  <option value="camera">camera</option>
                  <option value="crosshair">crosshair</option>
                </select>
              </div>
            </div>
            <div class="edit-section-heading">Data</div>
            <div class="edit-row">
              <div class="edit-field edit-field-grow">
                <label>Group by field <span class="edit-field-hint">(each unique value becomes a sub-layer)</span></label>
                <select v-model="editDraft.group_by" :disabled="groupByColumnsLoading">
                  <option value="">— none —</option>
                  <option v-if="editDraft.group_by && !groupByColumns.includes(editDraft.group_by)" :value="editDraft.group_by">{{ editDraft.group_by }}</option>
                  <option v-for="col in groupByColumns" :key="col" :value="col">{{ col }}</option>
                </select>
              </div>
            </div>
            <div class="edit-row">
              <div class="edit-field edit-field-grow">
                <label>Search fields <span class="edit-field-hint">click to toggle · used in map search</span></label>
                <div class="sf-chips-wrap">
                  <template v-if="groupByColumnsLoading">
                    <span class="edit-field-hint">Loading…</span>
                  </template>
                  <template v-else-if="groupByColumns.length">
                    <button
                      v-for="col in groupByColumns" :key="col"
                      type="button"
                      class="sf-chip"
                      :class="{ 'sf-chip-active': searchFields.includes(col) }"
                      @click="toggleSearchField(col)"
                    >{{ col }}</button>
                  </template>
                  <template v-else-if="searchFields.length">
                    <button
                      v-for="col in searchFields" :key="col"
                      type="button"
                      class="sf-chip sf-chip-active"
                      @click="toggleSearchField(col)"
                    >{{ col }}</button>
                  </template>
                  <span v-else class="edit-field-hint">No fields available.</span>
                </div>
                <div class="sf-actions">
                  <button type="button" class="sf-action-btn" :disabled="!groupByColumns.length || searchFields.length === groupByColumns.length" @click="searchFields = [...groupByColumns]">Add all</button>
                  <button type="button" class="sf-action-btn" :disabled="!searchFields.length" @click="searchFields = []">Clear</button>
                </div>
              </div>
            </div>
            <div class="edit-row">
              <div class="edit-field edit-field-grow">
                <label>Thumbnail URL <span class="edit-field-hint">(use $&lt;fieldname&gt; or $&lt;fieldname:start:end&gt; for slicing, e.g. $&lt;id:0:6&gt;)</span></label>
                <input v-model="editDraft.thumbnail_url" type="text" placeholder="https://example.com/$<id>.jpg" />
              </div>
            </div>
            <div class="edit-row">
              <div class="edit-field edit-field-grow">
                <label>Download URL <span class="edit-field-hint">(use $&lt;fieldname&gt; or $&lt;fieldname:start:end&gt; for slicing, e.g. $&lt;id:0:6&gt;)</span></label>
                <input v-model="editDraft.download_url" type="text" placeholder="https://example.com/$<id>.zip" />
              </div>
            </div>

            <!-- Data preview -->
            <button class="edit-preview-toggle" @click="toggleDataPreview(layer.id)">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" :style="{ transform: dataPreviewOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }">
                <polyline points="9 18 15 12 9 6" />
              </svg>
              {{ dataPreviewOpen ? 'Hide' : 'Show' }} data preview
              <span v-if="dataPreview" class="edit-field-hint">(first {{ dataPreview.rows.length }} of {{ dataPreview.total }})</span>
            </button>
            <div v-if="dataPreviewOpen" class="data-preview-body">
              <div v-if="dataPreviewLoading" class="data-preview-empty">Loading…</div>
              <div v-else-if="dataPreviewError" class="data-preview-empty data-preview-error">{{ dataPreviewError }}</div>
              <div v-else-if="dataPreview && dataPreview.columns.length === 0" class="data-preview-empty">No attributes.</div>
              <div v-else-if="dataPreview" class="data-preview-scroll">
                <table class="data-preview-table">
                  <thead><tr><th v-for="col in dataPreview.columns" :key="col">{{ col }}</th></tr></thead>
                  <tbody>
                    <tr v-for="(row, ri) in dataPreview.rows" :key="ri">
                      <td v-for="(cell, ci) in row" :key="ci">{{ cell }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </template>

          <!-- GeoTIFF style -->
          <template v-if="layer.fileType === 'geotiff'">
            <div class="edit-section-heading">Style</div>
            <div class="edit-row">
              <div class="edit-field">
                <label>Opacity <span class="edit-field-hint">(0–1)</span></label>
                <input v-model.number="editDraft.opacity" type="number" min="0" max="1" step="0.05" placeholder="1" />
              </div>
              <div class="edit-field">
                <label>NoData value</label>
                <input v-model.number="editDraft.noDataValue" type="number" placeholder="e.g. -9999" />
              </div>
            </div>
            <div class="edit-row">
              <div class="edit-field edit-field-grow">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="editDraft.normalize" />
                  Normalize pixel values
                </label>
              </div>
            </div>
          </template>

          <div class="edit-section-heading">About</div>
          <div class="edit-row">
            <div class="edit-field edit-field-grow">
              <label>Description <span class="edit-field-hint">(visible to map users)</span></label>
              <textarea v-model="editDraft.description" rows="2" placeholder="Short description shown in Layer Info…" class="edit-textarea"></textarea>
            </div>
          </div>
          <div class="edit-row">
            <div class="edit-field edit-field-grow">
              <label>Notes <span class="edit-field-hint">(internal — never shown to users)</span></label>
              <textarea v-model="editDraft.notes" rows="2" placeholder="Internal notes, reminders, data source details…" class="edit-textarea"></textarea>
            </div>
          </div>

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

    <!-- Upload settings modal -->
    <UploadSettingsModal
      :is-open="showUploadModal"
      :files="pendingFiles"
      @confirm="doUpload"
      @cancel="cancelUpload"
      @remove="removePendingFile"
    />
    <LayerInfoModal :layer="infoLayer" @close="infoLayer = null" />
  </section>
</template>

<script setup>
import { ref, computed, inject, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { getApiUrl } from '../../../utils/config';
import UploadSettingsModal from '../../modals/admin/UploadSettingsModal.vue';
import LayerInfoModal from '../../modals/admin/LayerInfoModal.vue';

// ── Injected from AdminView ────────────────────────────────────────────────────
const authHeader  = inject('authHeader');
const draft       = inject('draft');

function authHeaders(extra = {}) {
  return { Authorization: authHeader.value, ...extra };
}

// ── State ──────────────────────────────────────────────────────────────────────
const layers           = ref([]);
const isLoading        = ref(false);
const uploadError      = ref('');
const uploadPending    = ref(false);
const uploadProgress   = ref(0);
const deletePending    = ref({});
const deleteConfirmId  = ref(null);
const infoLayer        = ref(null);
const editingId        = ref(null);
const editDraft        = ref({});
const editError        = ref('');
const editSaving       = ref(false);
const searchFields     = ref([]);
const pendingFiles     = ref([]);
const showUploadModal  = ref(false);
const uploadPlaceholders = ref([]);
const dataPreviewOpen    = ref(false);
const dataPreview        = ref(null);
const dataPreviewLoading = ref(false);
const dataPreviewError   = ref('');
const groupByColumns     = ref([]);
const groupByColumnsLoading = ref(false);
let editAutoSaveTimer  = null;
let ignoreNextEditChange = false;
let pollTimer = null;

const sortedLayers = computed(() =>
  [...layers.value].filter(l => ['geojson','geotiff'].includes(l.fileType))
    .sort((a, b) => (a.layerConfig?.order ?? 0) - (b.layerConfig?.order ?? 0))
);
const hasOptimizing = computed(() => layers.value.some(l => l.status === 'optimizing'));

onMounted(async () => { await fetchLayers(); startPolling(); });
onUnmounted(() => { stopPolling(); clearTimeout(editAutoSaveTimer); });

// ── Fetch & emit to draft ──────────────────────────────────────────────────────
async function fetchLayers() {
  if (!authHeader.value) return;
  isLoading.value = true;
  try {
    const res = await fetch(getApiUrl('/admin/layers'), { headers: authHeaders() });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    layers.value = await res.json();
    syncDraftDataLayers();
  } catch { /* non-fatal */ }
  finally { isLoading.value = false; }
}

function syncDraftDataLayers() {
  if (!draft) return;
  draft.value.data_layers = layers.value
    .filter(l => ['geojson','geotiff'].includes(l.fileType))
    .map(l => metaToEntry(l));
}

function metaToEntry(meta) {
  const lc  = meta.layerConfig || {};
  const url = getApiUrl(`data/layers/${meta.id}/${meta.id}${meta.extension}`);
  const entry = {
    name:    lc.displayName || meta.originalName,
    url,
    type:    lc.type || meta.fileType,
    visible: lc.visible ?? true,
    order:   lc.order   ?? 0,
    _layerId: meta.id,
  };
  const extras = ['color','stroke_color','fill_color','attribution','search_fields','thumbnail_url','download_url','pointType','group_by','description'];
  for (const k of extras) { if (lc[k] != null) entry[k] = lc[k]; }
  if (meta.fileType === 'geojson' && lc.sourceCrs) entry.sourceCrs = lc.sourceCrs;
  if (meta.fileType === 'geotiff') {
    for (const k of ['tiffProjection','tiffProj4','bandCount','noDataValue','opacity','normalize']) {
      if (lc[k] != null) entry[k] = lc[k];
    }
    if (!entry.tiffProjection && meta.cogOptions?.sourceCrs) entry.tiffProjection = meta.cogOptions.sourceCrs;
  }
  return entry;
}

// ── Polling ────────────────────────────────────────────────────────────────────
let mounted = true;
onUnmounted(() => { mounted = false; });

function startPolling() {
  pollTimer = setInterval(async () => {
    if (!mounted) return;
    if (!hasOptimizing.value && !uploadPlaceholders.value.length) return;
    await fetchLayers();
  }, 2000);
}
function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

// ── Upload flow ────────────────────────────────────────────────────────────────
function onFilesSelected(e) {
  const files = Array.from(e.target.files);
  e.target.value = '';
  if (!files.length) return;
  pendingFiles.value    = files;
  showUploadModal.value = true;
}
function cancelUpload() { pendingFiles.value = []; showUploadModal.value = false; }
function removePendingFile(i) { pendingFiles.value.splice(i, 1); if (!pendingFiles.value.length) showUploadModal.value = false; }

async function doUpload(settings) {
  showUploadModal.value = false;
  uploadPending.value   = true;
  uploadProgress.value  = 0;
  uploadError.value     = '';

  const companionExts = new Set(['.mtl', '.jpg', '.jpeg', '.png', '.bmp', '.tga', '.webp']);
  const primaryFiles  = pendingFiles.value.filter(f => !companionExts.has('.' + f.name.split('.').pop().toLowerCase()));
  const placeholderIds = primaryFiles.map((f, i) => {
    const id = `ph-${Date.now()}-${i}`;
    uploadPlaceholders.value.push({ id, name: f.name, ext: f.name.split('.').pop().toUpperCase(), phase: 'uploading', progress: 0 });
    return id;
  });

  const formData = new FormData();
  for (const file of pendingFiles.value) formData.append('files', file);
  formData.append('settings', JSON.stringify(settings));

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
    syncDraftDataLayers();
  } catch (err) {
    uploadError.value = err.message;
  } finally {
    const next = { ...deletePending.value }; delete next[id]; deletePending.value = next;
  }
}

// ── Inline edit ────────────────────────────────────────────────────────────────
async function fetchGroupByColumns(layerId) {
  groupByColumns.value   = [];
  groupByColumnsLoading.value = true;
  try {
    const res = await fetch(getApiUrl(`/admin/layers/${layerId}/preview`), { headers: authHeaders() });
    if (res.ok) {
      const data = await res.json();
      groupByColumns.value = data.columns ?? [];
    }
  } catch { /* non-fatal */ }
  finally { groupByColumnsLoading.value = false; }
}

function toggleEdit(layer) {
  if (editingId.value === layer.id) { cancelEdit(); return; }
  deleteConfirmId.value = null;
  dataPreviewOpen.value = false;
  dataPreview.value     = null;
  dataPreviewError.value = '';
  groupByColumns.value   = [];
  ignoreNextEditChange  = true;
  const lc = layer.layerConfig || {};
  editDraft.value = {
    displayName:  lc.displayName  ?? '',
    visible:      lc.visible      ?? true,
    order:        lc.order        ?? 0,
    stroke_color: lc.stroke_color ?? '',
    fill_color:   normalizeFillColor(lc.fill_color ?? ''),
    pointType:    lc.pointType    ?? '',
    thumbnail_url: lc.thumbnail_url ?? '',
    download_url:  lc.download_url  ?? '',
    group_by:      lc.group_by      ?? '',
    opacity:      lc.opacity      ?? null,
    noDataValue:  lc.noDataValue  ?? null,
    normalize:    lc.normalize    ?? true,
    crsOverride:  layer.fileType === 'geotiff'
      ? (lc.tiffProjection ?? layer.sourceCrs ?? '')
      : (lc.sourceCrs      ?? layer.sourceCrs ?? ''),
    description:  lc.description  ?? '',
    notes:        lc.notes        ?? '',
  };
  searchFields.value    = lc.search_fields ?? [];
  editingId.value = layer.id;
  editError.value = '';
  nextTick(() => { ignoreNextEditChange = false; });
  if (layer.fileType === 'geojson') fetchGroupByColumns(layer.id);
}

function cancelEdit() {
  if (editAutoSaveTimer !== null && editingId.value) {
    clearTimeout(editAutoSaveTimer); editAutoSaveTimer = null;
    saveEdit(editingId.value);
  }
  ignoreNextEditChange  = false;
  editingId.value       = null;
  editError.value       = '';
  searchFields.value    = [];
  dataPreviewOpen.value = false;
  dataPreview.value     = null;
}

function scheduleEditAutoSave() {
  if (ignoreNextEditChange) return;
  clearTimeout(editAutoSaveTimer);
  editAutoSaveTimer = setTimeout(() => { if (editingId.value) saveEdit(editingId.value); }, 700);
}
watch(editDraft, scheduleEditAutoSave, { deep: true });
watch(searchFields, scheduleEditAutoSave, { deep: true });

async function saveEdit(id) {
  const layer = layers.value.find(l => l.id === id);
  if (!layer) return;
  editSaving.value = true;
  editError.value  = '';

  const parsedSearchFields = searchFields.value;
  const patch = Object.fromEntries(
    Object.entries(editDraft.value).filter(([k, v]) => k !== 'crsOverride' && v !== '' && v != null)
  );
  patch.search_fields = parsedSearchFields;
  patch.thumbnail_url = editDraft.value.thumbnail_url ?? '';
  patch.download_url  = editDraft.value.download_url  ?? '';
  patch.pointType     = editDraft.value.pointType || null;
  patch.group_by      = editDraft.value.group_by?.trim() || null;
  patch.description   = editDraft.value.description?.trim() || null;
  patch.notes         = editDraft.value.notes?.trim() || null;
  const crsVal = editDraft.value.crsOverride?.trim() || null;
  if (layer.fileType === 'geotiff') patch.tiffProjection = crsVal;
  else if (crsVal) patch.sourceCrs = crsVal;

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
    if (idx !== -1) layers.value.splice(idx, 1, updated);
    syncDraftDataLayers();
  } catch (err) {
    editError.value = err.message;
  } finally {
    editSaving.value = false;
  }
}

// ── Data preview ───────────────────────────────────────────────────────────────
async function toggleDataPreview(layerId) {
  if (dataPreviewOpen.value) { dataPreviewOpen.value = false; return; }
  dataPreviewOpen.value = true;
  if (dataPreview.value) return;
  dataPreviewLoading.value = true;
  dataPreviewError.value   = '';
  try {
    const res = await fetch(getApiUrl(`/admin/layers/${layerId}/preview`), { headers: authHeaders() });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    dataPreview.value = await res.json();
  } catch (err) {
    dataPreviewError.value = err.message;
  } finally {
    dataPreviewLoading.value = false;
  }
}

// ── Download original ──────────────────────────────────────────────────────────
async function onDownloadOriginal(layer) {
  window._adminDownloading = true;
  setTimeout(() => { window._adminDownloading = false; }, 2000);
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

function toggleSearchField(col) {
  const idx = searchFields.value.indexOf(col);
  if (idx === -1) searchFields.value = [...searchFields.value, col];
  else searchFields.value = searchFields.value.filter(c => c !== col);
}

// ── Color helpers ──────────────────────────────────────────────────────────────
const HEX6 = /^#[0-9a-f]{6}$/i;
const fillIsHex   = (v) => HEX6.test(v);
const fillSwatchColor = (fill, stroke) => HEX6.test(fill) ? fill : HEX6.test(stroke) ? stroke : '#0088ff';
function normalizeFillColor(val) {
  const v = (val ?? '').trim();
  if (!v || v === 'auto') return 'auto';
  if (v === 'none') return 'none';
  if (HEX6.test(v)) return v.toLowerCase();
  return 'auto';
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
  background: #3b82f6; color: #fff; font-size: 0.82rem; font-weight: 500; cursor: pointer; white-space: nowrap; user-select: none;
}
.btn-add:hover:not(.btn-add-disabled) { background: #2563eb; }
.btn-add-disabled { opacity: 0.55; cursor: default; }

.upload-progress-wrap { margin-bottom: 0.75rem; }
.upload-progress-label { display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--admin-muted, #666); margin-bottom: 0.3rem; }
.upload-progress-track { height: 6px; background: var(--admin-border, #e0e0e0); border-radius: 3px; overflow: hidden; }
.upload-progress-fill  { height: 100%; background: #3b82f6; border-radius: 3px; transition: width 0.15s; }

.upload-error-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.35);
  border-radius: 6px; padding: 0.55rem 0.8rem; margin-bottom: 0.75rem; font-size: 0.82rem; color: #ef4444;
}
.banner-close { background: none; border: none; cursor: pointer; color: #ef4444; font-size: 1rem; padding: 0; }

.empty-state { padding: 1.25rem; text-align: center; font-size: 0.85rem; color: var(--admin-muted, #777); background: var(--admin-bg, #f3f4f6); border-radius: 6px; }
.layer-list { display: flex; flex-direction: column; gap: 0.5rem; }

.layer-card {
  border: 1px solid var(--admin-border, #e0e0e0); border-radius: 8px;
  background: var(--admin-surface, #fff); overflow: hidden; transition: border-color 0.15s;
}
.layer-card:hover { filter: brightness(0.98); }
.layer-card-editing { border-color: #3b82f6 !important; }
.layer-card-uploading { border-color: #93c5fd; background: #eff6ff; opacity: 0.9; }
:global(body.theme-dark) .layer-card-uploading { border-color: #1d4ed8; background: rgba(59,130,246,0.1); }

.lc-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.6rem 0.75rem; min-height: 42px; }
.type-badge {
  font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
  padding: 0.15rem 0.4rem; border-radius: 3px; background: var(--admin-border, #e0e0e0);
  color: var(--admin-muted, #777); white-space: nowrap; flex-shrink: 0;
}
.type-geojson    { background: #dcfce7; color: #16a34a; }
.type-geotiff    { background: #fef3c7; color: #d97706; }
:global(body.theme-dark) .type-geojson { background: rgba(22,163,74,0.2); color: #4ade80; }
:global(body.theme-dark) .type-geotiff { background: rgba(217,119,6,0.2); color: #fbbf24; }

.lc-names { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.lc-display-name { font-size: 0.85rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lc-original-name { font-size: 0.72rem; color: var(--admin-muted, #999); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.lc-status { display: flex; align-items: center; gap: 0.3rem; flex-shrink: 0; }
.status-text { font-size: 0.72rem; }
.status-ok       { color: #22c55e; }
.status-error    { color: #ef4444; }
.status-optimizing { color: #f59e0b; }
.status-uploading  { color: #2563eb; }

.lc-actions { display: flex; gap: 0.25rem; flex-shrink: 0; margin-left: auto; }
.action-btn {
  display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  border: 1px solid var(--admin-border, #e0e0e0); border-radius: 5px;
  background: transparent; color: var(--admin-muted, #777); cursor: pointer;
}
.action-btn:hover:not(:disabled) { color: var(--admin-text, #1a1a1a); border-color: var(--admin-muted, #999); }
.action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.action-btn-active { background: #eff6ff; border-color: #93c5fd; color: #2563eb; }
.action-btn-danger:hover:not(:disabled) { color: #ef4444; border-color: #fca5a5; }

.lc-upload-bar-track { height: 3px; background: #dbeafe; overflow: hidden; }
.lc-upload-bar-fill { height: 100%; background: #3b82f6; transition: width 0.2s; }
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
.edit-section-admin { color: #b45309; border-top: 1px solid var(--admin-input-border, #e5e7eb); padding-top: 0.5rem; margin-top: 0.75rem; }
.edit-textarea { padding: 0.35rem 0.5rem; border: 1px solid var(--admin-input-border, #ccc); border-radius: 5px; font-size: 0.82rem; background: var(--admin-input-bg, #fff); color: var(--admin-text, #1a1a1a); resize: vertical; font-family: inherit; width: 100%; box-sizing: border-box; }
.edit-textarea:focus { outline: 2px solid #3b82f6; }
.edit-row { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.edit-field { display: flex; flex-direction: column; gap: 0.25rem; min-width: 120px; }
.edit-field label { font-size: 0.78rem; font-weight: 500; color: var(--admin-text, #333); }
.edit-field input, .edit-field select {
  padding: 0.35rem 0.5rem; border: 1px solid var(--admin-input-border, #ccc);
  border-radius: 5px; font-size: 0.82rem; background: var(--admin-input-bg, #fff); color: var(--admin-text, #1a1a1a);
}
.edit-field input:focus, .edit-field select:focus { outline: 2px solid #3b82f6; }
.edit-field-grow { flex: 1; }
.edit-field-sm { width: 80px; min-width: 80px; }
.edit-field-toggle { width: 70px; min-width: 70px; }
.edit-field-toggle .toggle-switch { flex: 1; display: flex; align-items: center; }
.edit-field-hint { font-size: 0.72rem; color: var(--admin-muted, #999); font-weight: 400; }

.color-row { display: flex; gap: 0.4rem; align-items: center; }
.color-swatch { width: 30px; height: 30px; border-radius: 4px; padding: 2px; cursor: pointer; border: 1px solid var(--admin-border, #ccc); }

.toggle-switch { display: flex; align-items: center; }
.toggle-switch input[type=checkbox] { display: none; }
.slider {
  width: 34px; height: 18px; border-radius: 9px; background: var(--admin-border, #ccc);
  cursor: pointer; position: relative; transition: background 0.15s; display: block;
}
.slider::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform 0.15s;
}
input:checked + .slider { background: #3b82f6; }
input:checked + .slider::after { transform: translateX(16px); }

.checkbox-label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.82rem; cursor: pointer; }

.edit-preview-toggle {
  display: flex; align-items: center; gap: 0.35rem; margin-top: 0.5rem;
  background: none; border: none; cursor: pointer; font-size: 0.78rem; color: var(--admin-muted, #777); padding: 0;
}
.edit-preview-toggle:hover { color: var(--admin-text, #1a1a1a); }
.data-preview-body { margin-top: 0.5rem; }
.data-preview-empty { padding: 0.6rem; font-size: 0.8rem; color: var(--admin-muted, #777); }
.data-preview-error { color: #ef4444; }
.data-preview-scroll { overflow-x: auto; max-height: 220px; overflow-y: auto; border: 1px solid var(--admin-border, #e0e0e0); border-radius: 5px; }
.data-preview-table { border-collapse: collapse; font-size: 0.75rem; width: 100%; }
.data-preview-table th { padding: 0.3rem 0.5rem; background: var(--admin-bg, #f3f4f6); border-bottom: 1px solid var(--admin-border, #e0e0e0); text-align: left; white-space: nowrap; }
.data-preview-table td { padding: 0.25rem 0.5rem; border-bottom: 1px solid var(--admin-border, #e0e0e0); white-space: nowrap; max-width: 180px; overflow: hidden; text-overflow: ellipsis; }

.edit-footer { display: flex; align-items: center; gap: 0.5rem; padding-top: 0.6rem; margin-top: 0.25rem; border-top: 1px solid var(--admin-border, #e0e0e0); }
.edit-footer-spacer { flex: 1; }
.edit-error  { font-size: 0.78rem; color: #ef4444; }
.edit-saving { font-size: 0.78rem; color: var(--admin-muted, #777); }

.btn-secondary-sm, .btn-danger-sm {
  padding: 0.3rem 0.65rem; border-radius: 5px; font-size: 0.78rem; cursor: pointer;
}
.btn-secondary-sm { background: transparent; border: 1px solid var(--admin-border, #ccc); color: var(--admin-text, #333); }
.btn-secondary-sm:hover { border-color: var(--admin-muted, #999); }
.btn-danger-sm { background: #fef2f2; border: 1px solid #fca5a5; color: #ef4444; }
.btn-danger-sm:hover:not(:disabled) { background: #fee2e2; }
.btn-danger-sm:disabled { opacity: 0.5; cursor: not-allowed; }

.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.sf-chips-wrap {
  display: flex; flex-wrap: wrap; gap: 0.35rem;
  min-height: 28px; padding: 0.3rem 0 0.15rem;
}
.sf-chip {
  padding: 0.2rem 0.55rem; border-radius: 12px; font-size: 0.75rem; font-weight: 500;
  cursor: pointer; border: 1px solid var(--admin-border, #ccc);
  background: var(--admin-input-bg, #fff); color: var(--admin-muted, #666);
  transition: background 0.1s, color 0.1s, border-color 0.1s;
  user-select: none;
}
.sf-chip:hover { border-color: #93c5fd; color: #2563eb; }
.sf-chip-active {
  background: #eff6ff; border-color: #3b82f6; color: #2563eb;
}
.sf-chip-active:hover { background: #dbeafe; }
:global(body.theme-dark) .sf-chip { background: var(--admin-input-bg, #1e1e1e); border-color: var(--admin-border, #444); color: var(--admin-muted, #aaa); }
:global(body.theme-dark) .sf-chip-active { background: rgba(59,130,246,0.15); border-color: #3b82f6; color: #60a5fa; }
.sf-actions { display: flex; gap: 0.35rem; margin-top: 0.3rem; }
.sf-action-btn {
  padding: 0.18rem 0.55rem; border-radius: 4px; font-size: 0.72rem; cursor: pointer;
  border: 1px solid var(--admin-border, #ccc); background: transparent;
  color: var(--admin-muted, #666); transition: border-color 0.1s, color 0.1s;
}
.sf-action-btn:hover:not(:disabled) { border-color: #3b82f6; color: #2563eb; }
.sf-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
