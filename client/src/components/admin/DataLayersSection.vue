<template>
  <section class="admin-section">
    <div class="section-header">
      <div>
        <h2 class="section-title">Data Layers</h2>
        <p class="section-desc">Uploaded layers — GeoJSON, GeoTIFF, 3D models, point clouds.</p>
      </div>
      <label class="btn-add" :class="{ 'btn-add-disabled': uploadPending }" :title="uploadPending ? 'Upload in progress…' : 'Add new layer'">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:5px;flex-shrink:0">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        {{ uploadPending ? 'Uploading…' : 'Add Layer' }}
        <input v-if="!uploadPending" type="file" multiple
          accept=".geojson,.json,.tif,.tiff,.csv,.obj,.ply,.stl,.las,.laz,.mtl,.jpg,.jpeg,.png,.bmp,.tga,.webp"
          style="display:none" @change="onFilesSelected" />
      </label>
    </div>

    <!-- Upload progress bar -->
    <div v-if="uploadPending" class="upload-progress-wrap">
      <div class="upload-progress-label">
        <span>Uploading…</span>
        <span>{{ uploadProgress }}%</span>
      </div>
      <div class="upload-progress-track">
        <div class="upload-progress-fill" :style="{ width: uploadProgress + '%' }"></div>
      </div>
    </div>

    <!-- Upload error banner -->
    <div v-if="uploadError" class="upload-error-banner">
      <span>{{ uploadError }}</span>
      <button class="banner-close" @click="uploadError = ''">✕</button>
    </div>

    <!-- Companion upload error banner -->
    <div v-if="companionUploadError" class="upload-error-banner">
      <span>{{ companionUploadError }}</span>
      <button class="banner-close" @click="companionUploadError = ''">✕</button>
    </div>

    <!-- Hidden companion file input -->
    <input
      ref="companionFileInputRef"
      type="file"
      multiple
      accept=".mtl,.obj,.stl,.ply,.jpg,.jpeg,.png,.bmp,.tga,.webp"
      style="display:none"
      @change="onCompanionFilesSelected"
    />

    <!-- Loading state -->
    <div v-if="isLoading && !layers.length" class="empty-state">Loading layers…</div>

    <!-- Empty state -->
    <div v-else-if="!isLoading && !layers.length && !uploadPlaceholders.length" class="empty-state">
      No data layers yet. Click <strong>Add Layer</strong> to upload files.
    </div>

    <!-- Upload placeholder cards (shown during transfer + server processing) -->
    <div v-if="uploadPlaceholders.length" class="layer-list" style="margin-bottom: 0.5rem;">
      <div v-for="ph in uploadPlaceholders" :key="ph.id" class="layer-card layer-card-uploading">
        <div class="lc-header">
          <span class="type-badge">{{ ph.ext }}</span>
          <div class="lc-names">
            <span class="lc-display-name">{{ ph.name }}</span>
          </div>
          <div class="lc-status">
            <svg class="spin" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M12 2a10 10 0 0110 10" opacity="0.3"/><path d="M12 2a10 10 0 000 20a10 10 0 0010-10"/>
            </svg>
            <span class="status-text status-uploading">
              {{ ph.phase === 'uploading' ? `Uploading ${ph.progress}%` : 'Processing…' }}
            </span>
          </div>
        </div>
        <!-- mini progress bar -->
        <div class="lc-upload-bar-track">
          <div
            class="lc-upload-bar-fill"
            :class="ph.phase === 'processing' ? 'lc-upload-bar-processing' : ''"
            :style="ph.phase === 'uploading' ? { width: ph.progress + '%' } : { width: '100%' }"
          />
        </div>
      </div>
    </div>

    <!-- Layer cards -->
    <div v-if="layers.length" class="layer-list">
      <div
        v-for="layer in sortedLayers"
        :key="layer.id"
        class="layer-card"
        :class="{
          'layer-card-optimizing': layer.status === 'optimizing',
          'layer-card-error':      layer.status === 'error',
          'layer-card-editing':    editingId === layer.id,
        }"
      >
        <!-- ─── Card header row ─────────────────────────────── -->
        <div class="lc-header">
          <span class="type-badge" :class="`type-${layer.fileType}`">{{ layer.fileType }}</span>

          <div class="lc-names">
            <span class="lc-display-name">{{ layer.layerConfig?.displayName || layer.originalName }}</span>
            <span v-if="layer.layerConfig?.displayName && layer.layerConfig.displayName !== layer.originalName" class="lc-original-name" :title="layer.originalName">{{ layer.originalName }}</span>
          </div>

          <!-- Status pill -->
          <div class="lc-status">
            <template v-if="layer.status === 'optimizing'">
              <svg class="spin" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M12 2a10 10 0 0110 10" opacity="0.3"/><path d="M12 2a10 10 0 000 20a10 10 0 0010-10"/>
              </svg>
              <span class="status-text status-optimizing">Optimizing…</span>
            </template>
            <template v-else-if="layer.status === 'error'">
              <span class="status-text status-error" :title="layer.processingLog?.at(-1) ?? 'Processing error'">⚠ Error</span>
            </template>
            <template v-else-if="layer.optimized">
              <span class="status-text status-ok">✓ Optimized</span>
            </template>
            <template v-else-if="layer.fileType === 'geojson' && layer.processingLog?.some(s => s.includes('Simplified'))">
              <span class="status-text status-ok">✓ Simplified</span>
            </template>
          </div>

          <!-- Card action buttons -->
          <div class="lc-actions">
            <!-- Link Data: attach a CSV to this GeoJSON layer (GeoJSON layers only) -->
            <button
              v-if="layer.fileType === 'geojson'"
              class="action-btn action-btn-linkdata"
              title="Attach a CSV and configure attribute join"
              :disabled="layer.status === 'optimizing'"
              @click="openLinkDataModal(layer)"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="3" y1="15" x2="21" y2="15"/>
                <line x1="9" y1="9" x2="9" y2="21"/>
              </svg>
            </button>
            <!-- Manage 3D: upload & link 3D models/point clouds (GeoJSON layers only) -->
            <button
              v-if="layer.fileType === 'geojson'"
              class="action-btn action-btn-link3d"
              title="Upload & link 3D models / point clouds to features"
              :disabled="layer.status === 'optimizing'"
              @click="openLinkModal(layer)"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
            </button>
            <!-- Add companion files (MTL, textures) to model/pointcloud layers -->
            <button
              v-if="['model','pointcloud'].includes(layer.fileType)"
              class="action-btn"
              title="Add companion files (MTL, textures, extra models)"
              :disabled="companionUploading"
              @click="openCompanionPicker(layer)"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <!-- Debug: open debug modal (devMode only) -->
            <button
              v-if="props.devMode"
              class="action-btn action-btn-debug"
              title="Debug — view config &amp; meta JSON"
              @click="openDebugModal(layer)"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
              </svg>
            </button>
            <button
              class="action-btn"
              :class="{ 'action-btn-active': editingId === layer.id }"
              :disabled="layer.status === 'optimizing'"
              :title="editingId === layer.id ? 'Close editor' : 'Edit layer settings'"
              @click="toggleEdit(layer)"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button
              class="action-btn action-btn-danger"
              :disabled="layer.status === 'optimizing' || deletePending[layer.id]"
              title="Delete this layer"
              @click="confirmDelete(layer)"
            >
              <svg v-if="!deletePending[layer.id]" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
              <span v-else style="font-size:11px">…</span>
            </button>
          </div>
        </div>

        <!-- Sub-files strip -->
        <div v-if="layer.subFiles?.length" class="lc-subfiles">
          <!-- For GeoJSON: show model/pointcloud counts + linked summary -->
          <template v-if="layer.fileType === 'geojson'">
            <span
              v-for="group in subfileGroups(layer)"
              :key="group.role"
              class="subfile-chip"
              :class="'subfile-chip-' + group.role"
              :title="group.names.join(', ')"
            >{{ group.count }} {{ group.label }}</span>
          </template>
          <!-- For model/pointcloud: show individual companion chips -->
          <template v-else>
            <span v-for="sf in layer.subFiles" :key="sf.id" class="subfile-chip subfile-chip-companion" :title="sf.originalName">
              {{ sf.originalName }}
              <button class="subfile-chip-rm" title="Remove this file" @click.stop="deleteSubFile(layer.id, sf.id)">×</button>
            </span>
          </template>
        </div>

        <!-- ─── Delete confirmation bar ────────────────────── -->
        <div v-if="deleteConfirmId === layer.id" class="lc-confirm-bar">
          <span class="confirm-text">Delete <strong>{{ layer.layerConfig?.displayName || layer.originalName }}</strong> permanently?</span>
          <button class="btn-danger-sm" :disabled="deletePending[layer.id]" @click="doDelete(layer.id)">
            {{ deletePending[layer.id] ? 'Deleting…' : 'Yes, delete' }}
          </button>
          <button class="btn-secondary-sm" @click="deleteConfirmId = null">Cancel</button>
        </div>

        <!-- ─── Inline edit panel ───────────────────────────── -->
        <div v-if="editingId === layer.id" class="lc-edit-panel">

          <!-- ── General ── -->
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
          <!-- CRS / EPSG -->
          <div class="edit-row">
            <div class="edit-field edit-field-grow">
              <label>
                {{ layer.fileType === 'geotiff' ? 'Projection (EPSG)' : 'Source CRS (EPSG)' }}
                <span v-if="layer.sourceCrs" class="edit-field-hint"> — detected: {{ layer.sourceCrs }}</span>
              </label>
              <input
                v-model="editDraft.crsOverride"
                type="text"
                :placeholder="layer.sourceCrs || (layer.fileType === 'geotiff' ? 'e.g. EPSG:4326' : 'e.g. EPSG:4326')"
              />
              <span class="edit-field-hint" style="display:block;margin-top:2px">
                <template v-if="layer.fileType === 'geotiff'">Overrides the projection used for rendering. Leave empty to keep the auto-detected value.</template>
                <template v-else>Coordinate reference system of the original data (informational). Leave empty to keep the detected value.</template>
              </span>
            </div>
            <div v-if="layer.targetCrs" class="edit-field">
              <label>Stored as</label>
              <input type="text" :value="layer.targetCrs" disabled style="opacity:0.6;cursor:default" />
            </div>
          </div>

          <!-- ── Style ── -->
          <!-- GeoJSON style -->
          <template v-if="layer.fileType === 'geojson'">
            <div class="edit-section-heading">Style</div>
            <div class="edit-row">
              <div class="edit-field">
                <label>Badge color</label>
                <div class="color-row">
                  <input type="color" class="color-swatch"
                    :value="/^#[0-9a-f]{6}$/i.test(editDraft.color) ? editDraft.color : '#0088ff'"
                    @input="editDraft.color = $event.target.value" />
                  <input v-model="editDraft.color" type="text" placeholder="#0088ff" />
                </div>
              </div>
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
                    :value="/^#[0-9a-f]{6}$/i.test(editDraft.fill_color) ? editDraft.fill_color : '#000000'"
                    @input="editDraft.fill_color = $event.target.value" />
                  <input v-model="editDraft.fill_color" type="text" placeholder="none" />
                </div>
              </div>
              <div class="edit-field">
                <label>Point type</label>
                <select v-model="editDraft.pointType">
                  <option value="">— auto (pin) —</option>
                  <option value="circle">circle</option>
                  <option value="square">square</option>
                  <option value="camera">camera (SfM positions)</option>
                  <option value="crosshair">crosshair (GCPs)</option>
                </select>
              </div>
            </div>
          </template>

          <!-- GeoTIFF style -->
          <template v-if="layer.fileType === 'geotiff'">
            <div class="edit-section-heading">Style</div>
            <div class="edit-row">
              <div class="edit-field">
                <label>Opacity <span class="edit-field-hint">(0 = transparent, 1 = opaque)</span></label>
                <input v-model.number="editDraft.opacity" type="number" min="0" max="1" step="0.05" placeholder="1" />
              </div>
              <div class="edit-field">
                <label>NoData value <span class="edit-field-hint">(pixel value treated as transparent)</span></label>
                <input v-model.number="editDraft.noDataValue" type="number" placeholder="e.g. -9999" />
              </div>
            </div>
            <div class="edit-row">
              <div class="edit-field edit-field-grow">
                <label class="checkbox-label">
                  <input type="checkbox" v-model="editDraft.normalize" />
                  Normalize pixel values
                  <span class="edit-field-hint"> — maps the data range to 0–1 for correct rendering of DEMs and single-band rasters</span>
                </label>
              </div>
            </div>
          </template>

          <!-- ── Data ── (GeoJSON only) -->
          <template v-if="layer.fileType === 'geojson'">
            <div class="edit-section-heading">Data</div>
            <div class="edit-row">
              <div class="edit-field edit-field-grow">
                <label>Search fields <span class="edit-field-hint">(comma-separated attribute names)</span></label>
                <input v-model="searchFieldsStr" type="text" placeholder="e.g. name, address, id" />
              </div>
            </div>

            <!-- Thumbnail -->
            <div class="edit-section-heading">Thumbnail</div>
            <div class="edit-row">
              <div class="edit-field edit-field-grow">
                <label>Thumbnail URL <span class="edit-field-hint">(use <code>$&lt;fieldname&gt;</code> or <code>$&lt;fieldname:start:end&gt;</code> for substrings)</span></label>
                <input v-model="editDraft.thumbnail_url" type="text" placeholder="https://example.com/$<id:0:6>/$<id:0:9>/$<id>_thumb.jpg" />
                <span class="edit-field-hint" style="display:block;margin-top:3px">
                  Embed feature fields with <code>$&lt;fieldname&gt;</code>. Use <code>$&lt;fieldname:start:end&gt;</code> for a substring slice — e.g. <code>$&lt;photo_id:0:6&gt;</code> gives the first 6 characters.
                  <template v-if="dataPreview && dataPreview.columns.length">
                    Available: <span
                      v-for="col in dataPreview.columns"
                      :key="col"
                      class="thumb-field-chip"
                      :title="'Insert $<' + col + '>'"
                      @click="editDraft.thumbnail_url += '$<' + col + '>'"
                    >{{ col }}</span>
                  </template>
                </span>
              </div>
            </div>

            <!-- Data head preview -->
            <div class="data-preview-section">
              <button class="edit-preview-toggle" @click="toggleDataPreview(layer.id)">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" :style="{ transform: dataPreviewOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                {{ dataPreviewOpen ? 'Hide' : 'Show' }} data preview
                <span v-if="dataPreview" class="edit-field-hint">(first {{ dataPreview.rows.length }} of {{ dataPreview.total }} features)</span>
              </button>
              <div v-if="dataPreviewOpen" class="data-preview-body">
                <div v-if="dataPreviewLoading" class="data-preview-empty">Loading…</div>
                <div v-else-if="dataPreviewError" class="data-preview-empty data-preview-error">{{ dataPreviewError }}</div>
                <div v-else-if="dataPreview && dataPreview.columns.length === 0" class="data-preview-empty">No attributes found.</div>
                <div v-else-if="dataPreview" class="data-preview-scroll">
                  <table class="data-preview-table">
                    <thead>
                      <tr>
                        <th v-for="col in dataPreview.columns" :key="col" :title="col">{{ col }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row, ri) in dataPreview.rows" :key="ri">
                        <td v-for="(cell, ci) in row" :key="ci" :title="cell">{{ cell }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </template>

          <!-- Edit panel footer -->
          <div class="edit-footer">
            <button
              v-if="layer.keepOriginal"
              class="btn-secondary-sm"
              title="Download the original unoptimized file"
              @click="onDownloadOriginal(layer)"
            >↓ Original</button>
            <span class="edit-footer-spacer" />
            <span v-if="editError" class="edit-error">{{ editError }}</span>
            <button class="btn-secondary-sm" @click="cancelEdit">Done</button>
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

    <!-- Feature-level 3D linking modal -->
    <LinkingModal
      :is-open="linkModal.open"
      :layer-id="linkModal.layerId"
      :auth-header="props.authHeader"
      :initial-assignments="pendingModelLinks.get(linkModal.layerId)"
      @close="linkModal.open = false"
      @assignments-changed="onAssignmentsChanged"
    />

    <!-- CSV data linking modal -->
    <LinkDataModal
      :is-open="linkDataModal.open"
      :layer-id="linkDataModal.layerId"
      :auth-header="props.authHeader"
      :initial-link="pendingCsvLinks.get(linkDataModal.layerId)"
      @close="linkDataModal.open = false"
      @link-changed="onLinkChanged"
    />

    <!-- Debug modal -->
    <Transition name="fade">
      <div v-if="debugModalLayer" class="dbl-overlay" @click.self="debugModalLayer = null">
        <div class="dbl-modal">
          <header class="dbl-header">
            <span class="dbl-title">Debug — {{ debugModalLayer.layerConfig?.displayName || debugModalLayer.originalName }}</span>
            <button class="dbl-close" title="Close" @click="debugModalLayer = null">
              <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="1" y1="1" x2="13" y2="13" /><line x1="13" y1="1" x2="1" y2="13" />
              </svg>
            </button>
          </header>
          <div class="dbl-tabs">
            <button :class="['dbl-tab', debugModalTab === 'config' && 'dbl-tab-active']" @click="debugModalTab = 'config'">Config Preview</button>
            <button :class="['dbl-tab', debugModalTab === 'meta' && 'dbl-tab-active']" @click="debugModalTab = 'meta'">Meta JSON</button>
          </div>
          <div class="dbl-body">
            <pre class="dbl-pre">{{ JSON.stringify(debugModalTab === 'config' ? debugModalLayer.layerConfig : debugModalLayer, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </Transition>

  </section>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { getApiUrl } from '../../utils/config';
import UploadSettingsModal from '../modals/admin/UploadSettingsModal.vue';
import LinkingModal from '../modals/admin/LinkingModal.vue';
import LinkDataModal from '../modals/admin/LinkDataModal.vue';

const props = defineProps({
  authHeader: { type: String, default: '' },
  devMode:    { type: Boolean, default: false },
});

const emit = defineEmits(['update:layers', 'pending-changes']);

// ── State ───────────────────────────────────────────────────────
const layers        = ref([]);
const isLoading     = ref(false);
const loadError     = ref('');
const uploadError   = ref('');
const uploadPending = ref(false);
const uploadProgress = ref(0);
const deletePending = ref({});
const deleteConfirmId = ref(null);
const editingId       = ref(null);
const editDraft       = ref({});
const editError       = ref('');
const searchFieldsStr = ref('');
let editAutoSaveTimer = null;
let ignoreNextEditChange = false;
const debugModalLayer = ref(null);
const debugModalTab   = ref('config');
const dataPreviewOpen    = ref(false);
const dataPreview        = ref(null);   // { columns, rows, total }
const dataPreviewLoading = ref(false);
const dataPreviewError   = ref('');
const pendingFiles  = ref([]);
const showUploadModal = ref(false);
const uploadPlaceholders = ref([]); // synthetic cards shown during upload + server processing
let pollTimer = null;

// Linking modal state
const linkModal     = ref({ open: false, layerId: '' });
const linkDataModal = ref({ open: false, layerId: '' });

// ── Pending changes (committed on "Save Configuration") ─────────
const pendingPatches     = reactive(new Map()); // layerId → PATCH payload
const pendingCsvLinks    = reactive(new Map()); // layerId → csvLink obj | null
const pendingModelLinks  = reactive(new Map()); // layerId → assignments obj

// Companion file upload (add MTL / textures to an existing model layer)
const companionFileInputRef    = ref(null);
const companionTargetLayerId   = ref(null);
const companionUploading       = ref(false);
const companionUploadError     = ref('');
const COMPANION_UPLOAD_EXTS    = new Set(['.mtl', '.obj', '.stl', '.ply', '.jpg', '.jpeg', '.png', '.bmp', '.tga', '.webp']);

// ── Computed ────────────────────────────────────────────────────
const sortedLayers = computed(() =>
  [...layers.value].sort((a, b) => (a.layerConfig?.order ?? 0) - (b.layerConfig?.order ?? 0))
);
const hasOptimizing = computed(() =>
  layers.value.some(l => l.status === 'optimizing')
);
const hasPendingChanges = computed(() =>
  pendingPatches.size > 0 || pendingCsvLinks.size > 0 || pendingModelLinks.size > 0
);
watch(hasPendingChanges, val => emit('pending-changes', val));

// ── Lifecycle ───────────────────────────────────────────────────
onMounted(async () => {
  await fetchLayers();
  startPolling();
});

onUnmounted(() => {
  stopPolling();
});

defineExpose({ fetchLayers, flushPendingChanges });

// ── API helpers ─────────────────────────────────────────────────
function authHeaders(extra = {}) {
  return { Authorization: props.authHeader, ...extra };
}

async function fetchLayers() {
  if (!props.authHeader) return;
  isLoading.value = true;
  loadError.value = '';
  try {
    const res = await fetch(getApiUrl('/admin/layers'), { headers: authHeaders() });
    if (!res.ok) throw new Error(`Server error: ${res.status}`);
    layers.value = await res.json();
    // Re-apply any pending settings patches so the UI stays consistent during polling
    for (const [layerId, patch] of pendingPatches) {
      const idx = layers.value.findIndex(l => l.id === layerId);
      if (idx !== -1) applyPatchToLayerConfig(layers.value[idx].layerConfig, patch);
    }
    emitLayers();
  } catch (err) {
    loadError.value = err.message;
  } finally {
    isLoading.value = false;
  }
}

// ── Pending-change helpers ───────────────────────────────────────

/**
 * Apply a server PATCH payload to a layerConfig object in-place.
 * Mirrors the server-side update logic so the UI stays in sync without
 * a round-trip.
 */
function applyPatchToLayerConfig(lc, patch) {
  if ('displayName'    in patch) lc.displayName    = patch.displayName;
  if ('visible'        in patch) lc.visible        = patch.visible;
  if ('order'          in patch) lc.order          = patch.order;
  if ('color'          in patch) lc.color          = patch.color;
  if ('stroke_color'   in patch) lc.stroke_color   = patch.stroke_color;
  if ('fill_color'     in patch) lc.fill_color     = patch.fill_color;
  if ('thumbnail_url'  in patch) lc.thumbnail_url  = patch.thumbnail_url || null;
  if ('pointType'      in patch) lc.pointType      = patch.pointType || null;
  if ('attribution'    in patch) lc.attribution    = patch.attribution;
  if ('search_fields'  in patch) lc.search_fields  = patch.search_fields;
  if ('opacity'        in patch) lc.opacity        = patch.opacity;
  if ('noDataValue'    in patch) lc.noDataValue    = patch.noDataValue;
  if ('normalize'      in patch) lc.normalize      = patch.normalize;
  if ('tiffProjection' in patch) lc.tiffProjection = patch.tiffProjection;
  if ('sourceCrs'      in patch) lc.sourceCrs      = patch.sourceCrs;
}

/**
 * Send all accumulated pending changes to the server.
 * Called by AdminView just before it writes config.yaml.
 */
async function flushPendingChanges() {
  const errors = [];

  for (const [layerId, patch] of pendingPatches) {
    try {
      const res = await fetch(getApiUrl(`/admin/layers/${layerId}`), {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        errors.push(body.error || `Layer ${layerId.slice(0, 8)} save failed`);
      }
    } catch (err) {
      errors.push(String(err?.message ?? err));
    }
  }
  pendingPatches.clear();

  for (const [layerId, csvLink] of pendingCsvLinks) {
    try {
      const res = await fetch(getApiUrl(`/admin/layers/${layerId}`), {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ csvLink }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        errors.push(body.error || `CSV link save failed`);
      }
    } catch (err) {
      errors.push(String(err?.message ?? err));
    }
  }
  pendingCsvLinks.clear();

  for (const [layerId, assignments] of pendingModelLinks) {
    try {
      const res = await fetch(getApiUrl(`/admin/layers/${layerId}/link`), {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ assignments }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        errors.push(body.error || `3D link save failed`);
      }
    } catch (err) {
      errors.push(String(err?.message ?? err));
    }
  }
  pendingModelLinks.clear();

  if (errors.length) throw new Error(errors.join('; '));
}

// ── Modal pending-change handlers ────────────────────────────────

function onLinkChanged(csvLink) {
  pendingCsvLinks.set(linkDataModal.value.layerId, csvLink);
}

function onAssignmentsChanged(assignments) {
  pendingModelLinks.set(linkModal.value.layerId, assignments);
}

// ── Polling ─────────────────────────────────────────────────────
function startPolling() {
  pollTimer = setInterval(async () => {
    if (!hasOptimizing.value && !uploadPlaceholders.value.length) return;
    await fetchLayers();
  }, 2000);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

// ── Config emission ─────────────────────────────────────────────
function metaToEntry(meta) {
  const lc = meta.layerConfig || {};
  const url = getApiUrl(`data/layers/${meta.id}/${meta.id}${meta.extension}`);
  const entry = {
    name:    lc.displayName || meta.originalName,
    url,
    type:    lc.type || meta.fileType,
    visible: lc.visible ?? true,
    order:   lc.order   ?? 0,
  };
  const extras = ['color', 'stroke_color', 'fill_color', 'attribution', 'tileSize', 'search_fields', 'thumbnail_url'];
  for (const k of extras) {
    if (lc[k] != null) entry[k] = lc[k];
  }
  if (meta.fileType === 'geojson' && lc.sourceCrs) entry.sourceCrs = lc.sourceCrs;
  // GeoTIFF-specific metadata: source projection, band count, data range, nodata.
  // tiffProjection falls back to cogOptions.sourceCrs (set during upload) so that
  // the client can set up correct reprojection even when not explicitly overridden.
  if (meta.fileType === 'geotiff') {
    const tiffExtras = ['tiffProjection', 'bandCount', 'dataMin', 'dataMax', 'noDataValue', 'opacity', 'normalize'];
    for (const k of tiffExtras) {
      if (lc[k] != null) entry[k] = lc[k];
    }
    if (entry.tiffProjection == null && meta.cogOptions?.sourceCrs) {
      entry.tiffProjection = meta.cogOptions.sourceCrs;
    }
  }
  return entry;
}

function emitLayers() {
  // Only emit layer types that make sense as map config entries.
  // If a layer is currently being edited, merge the live draft values so that
  // AdminView's isDirty check reacts immediately (without waiting for the server PATCH).
  const configEntries = layers.value
    .filter(l => ['geojson', 'geotiff'].includes(l.fileType))
    .map(l => {
      if (l.id !== editingId.value) return metaToEntry(l);
      const d = editDraft.value;
      const lc = l.layerConfig || {};
      const merged = {
        ...l,
        layerConfig: {
          ...lc,
          displayName:  d.displayName  ?? lc.displayName,
          visible:      d.visible      ?? lc.visible,
          order:        d.order        ?? lc.order,
          color:        d.color        || lc.color,
          stroke_color: d.stroke_color || lc.stroke_color,
          fill_color:   d.fill_color   || lc.fill_color,
          attribution:  d.attribution  || lc.attribution,
          thumbnail_url: d.thumbnail_url !== undefined ? (d.thumbnail_url || null) : lc.thumbnail_url,
          pointType:     d.pointType !== undefined ? (d.pointType || null) : lc.pointType,
          search_fields: searchFieldsStr.value
            .split(',').map(s => s.trim()).filter(Boolean),
        },
      };
      return metaToEntry(merged);
    });
  emit('update:layers', configEntries);
}

// ── Upload flow ─────────────────────────────────────────────────
function onFilesSelected(e) {
  const files = Array.from(e.target.files);
  e.target.value = '';
  if (!files.length) return;
  const allowed = new Set([
    '.geojson', '.json', '.tif', '.tiff', '.csv',
    '.obj', '.ply', '.stl', '.las', '.laz',
    '.mtl', '.jpg', '.jpeg', '.png', '.bmp', '.tga', '.webp',
  ]);
  const bad = files.filter(f => !allowed.has('.' + f.name.split('.').pop().toLowerCase()));
  if (bad.length) {
    uploadError.value = `Unsupported type(s): ${bad.map(f => f.name).join(', ')}.`;
    return;
  }
  pendingFiles.value = files;
  showUploadModal.value = true;
}

function cancelUpload() {
  pendingFiles.value  = [];
  showUploadModal.value = false;
}

function removePendingFile(index) {
  pendingFiles.value.splice(index, 1);
  if (!pendingFiles.value.length) showUploadModal.value = false;
}

async function doUpload(settings) {
  showUploadModal.value = false;
  uploadPending.value   = true;
  uploadProgress.value  = 0;
  uploadError.value     = '';

  // Create one placeholder card per primary file (skip obvious companions)
  const companionExts = new Set(['.mtl', '.jpg', '.jpeg', '.png', '.bmp', '.tga', '.webp']);
  const primaryFiles  = pendingFiles.value.filter(
    f => !companionExts.has('.' + f.name.split('.').pop().toLowerCase())
  );
  const placeholderIds = primaryFiles.map((f, i) => {
    const id = `ph-${Date.now()}-${i}`;
    uploadPlaceholders.value.push({
      id,
      name:     f.name,
      ext:      f.name.split('.').pop().toUpperCase(),
      phase:    'uploading',
      progress: 0,
    });
    return id;
  });

  const formData = new FormData();
  for (const file of pendingFiles.value) {
    formData.append('files', file);
  }
  formData.append('settings', JSON.stringify(settings));

  try {
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', getApiUrl('/admin/upload'));
      xhr.setRequestHeader('Authorization', props.authHeader);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          uploadProgress.value = pct;
          // keep placeholder cards in sync
          for (const ph of uploadPlaceholders.value) {
            if (placeholderIds.includes(ph.id)) ph.progress = pct;
          }
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Switch placeholders to "processing" phase
          for (const ph of uploadPlaceholders.value) {
            if (placeholderIds.includes(ph.id)) ph.phase = 'processing';
          }
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

    // Poll until the new layers appear in the list, then clear placeholders
    const clearWhenReady = async () => {
      await fetchLayers();
      // Remove placeholders whose file names now appear in the real layer list
      const names = new Set(layers.value.map(l => l.originalName));
      uploadPlaceholders.value = uploadPlaceholders.value.filter(ph => !names.has(ph.name));
      if (uploadPlaceholders.value.length > 0) {
        setTimeout(clearWhenReady, 1500);
      }
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

// ── Sub-file display ────────────────────────────────────────────
function subfileGroups(layer) {
  const subs = layer.subFiles ?? [];
  const models      = subs.filter(sf => sf.role === 'model');
  const pointclouds = subs.filter(sf => sf.role === 'pointcloud');
  const groups = [];
  const attributes = subs.filter(sf => sf.role === 'attributes');
  if (models.length)      groups.push({ role: 'model',      count: models.length,      label: models.length === 1 ? 'model' : 'models',             names: models.map(sf => sf.originalName) });
  if (pointclouds.length) groups.push({ role: 'pointcloud', count: pointclouds.length, label: pointclouds.length === 1 ? 'point cloud' : 'point clouds', names: pointclouds.map(sf => sf.originalName) });
  if (attributes.length)  groups.push({ role: 'attributes', count: attributes.length,  label: attributes.length === 1 ? 'CSV' : 'CSVs',                   names: attributes.map(sf => sf.originalName) });
  return groups;
}

// ── Delete flow ─────────────────────────────────────────────────
function confirmDelete(layer) {
  deleteConfirmId.value = layer.id;
  editingId.value = null;    // close edit panel if open
}

async function doDelete(id) {
  deletePending.value = { ...deletePending.value, [id]: true };
  try {
    const res = await fetch(getApiUrl(`/admin/layers/${id}`), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Delete failed (${res.status})`);
    }
    layers.value = layers.value.filter(l => l.id !== id);
    deleteConfirmId.value = null;
    emitLayers();
  } catch (err) {
    uploadError.value = err.message;
  } finally {
    const next = { ...deletePending.value };
    delete next[id];
    deletePending.value = next;
  }
}

function openLinkModal(layer) {
  linkModal.value = { open: true, layerId: layer.id };
}

function openLinkDataModal(layer) {
  linkDataModal.value = { open: true, layerId: layer.id };
}

function openDebugModal(layer) {
  debugModalLayer.value = layer;
  debugModalTab.value = 'config';
}

// ── Companion file upload (for existing model/pointcloud layers) ─
function openCompanionPicker(layer) {
  companionTargetLayerId.value = layer.id;
  companionUploadError.value   = '';
  companionFileInputRef.value?.click();
}

async function onCompanionFilesSelected(e) {
  const files = Array.from(e.target.files);
  e.target.value = '';
  if (!files.length || !companionTargetLayerId.value) return;

  const bad = files.filter(f => {
    const ext = '.' + f.name.split('.').pop().toLowerCase();
    return !COMPANION_UPLOAD_EXTS.has(ext);
  });
  if (bad.length) {
    companionUploadError.value = `Unsupported type(s): ${bad.map(f => f.name).join(', ')}.`;
    return;
  }

  const layerId = companionTargetLayerId.value;
  companionUploading.value    = true;
  companionUploadError.value  = '';
  try {
    for (const file of files) {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      const role = ext === '.mtl' ? 'companion'
        : ['.obj', '.ply', '.stl'].includes(ext) ? 'model'
        : ['.las', '.laz'].includes(ext) ? 'pointcloud'
        : 'companion';
      const fd = new FormData();
      fd.append('file', file);
      fd.append('role', role);
      const res = await fetch(getApiUrl(`/admin/layers/${layerId}/subfiles`), {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Upload failed (${res.status})`);
      }
    }
    // Refresh layer list to show new sub-files
    await fetchLayers();
  } catch (err) {
    companionUploadError.value = err.message;
  } finally {
    companionUploading.value = false;
  }
}

// ── Sub-file delete (for companion chips on model/pointcloud layers) ────────────
async function deleteSubFile(layerId, subId) {
  try {
    const res = await fetch(getApiUrl(`/admin/layers/${layerId}/subfiles/${subId}`), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Delete failed (${res.status})`);
    }
    await fetchLayers();
  } catch (err) {
    uploadError.value = err.message;
  }
}

// ── Edit flow ───────────────────────────────────────────────────
function scheduleEditAutoSave() {
  if (ignoreNextEditChange) return;
  emitLayers(); // update isDirty immediately
  clearTimeout(editAutoSaveTimer);
  editAutoSaveTimer = setTimeout(() => {
    if (editingId.value) saveEdit(editingId.value, { closePanel: false });
  }, 600);
}

watch(editDraft, scheduleEditAutoSave, { deep: true });
watch(searchFieldsStr, scheduleEditAutoSave);

function toggleEdit(layer) {
  if (editingId.value === layer.id) {
    cancelEdit();
    return;
  }
  deleteConfirmId.value = null;
  dataPreviewOpen.value = false;
  dataPreview.value = null;
  dataPreviewError.value = '';
  ignoreNextEditChange = true;
  const lc = layer.layerConfig || {};
  editDraft.value = {
    displayName:  lc.displayName  ?? '',
    visible:      lc.visible      ?? true,
    order:        lc.order        ?? 0,
    // GeoJSON extras
    color:        lc.color        ?? '',
    stroke_color: lc.stroke_color ?? '',
    fill_color:   lc.fill_color   ?? '',
    pointType:    lc.pointType    ?? '',
    thumbnail_url: lc.thumbnail_url ?? '',
    // GeoTIFF extras
    opacity:      lc.opacity      ?? null,
    noDataValue:  lc.noDataValue  ?? null,
    normalize:    lc.normalize    ?? true,
    // CRS override (editable; stored as tiffProjection for GeoTIFF, sourceCrs for others)
    crsOverride:  layer.fileType === 'geotiff'
      ? (lc.tiffProjection ?? layer.sourceCrs ?? '')
      : (lc.sourceCrs      ?? layer.sourceCrs ?? ''),
  };
  searchFieldsStr.value = (lc.search_fields ?? []).join(', ');
  editingId.value = layer.id;
  editError.value = '';
  nextTick(() => { ignoreNextEditChange = false; });
}

async function onDownloadOriginal(layer) {
  window._adminDownloading = true;
  setTimeout(() => { window._adminDownloading = false; }, 2000);
  try {
    const res = await fetch(getApiUrl(`/admin/layers/${layer.id}/original`), { headers: authHeaders() });
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    const ext = layer.originalName?.split('.').pop() ?? 'bin';
    const filename = layer.originalName ?? `${layer.id}.${ext}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    editError.value = err.message;
  }
}

function cancelEdit() {
  // If a debounced save is pending, flush it immediately before closing.
  if (editAutoSaveTimer !== null && editingId.value) {
    clearTimeout(editAutoSaveTimer);
    editAutoSaveTimer = null;
    saveEdit(editingId.value, { closePanel: false });
  }
  ignoreNextEditChange = false;
  editingId.value = null;
  editError.value = '';
  searchFieldsStr.value = '';
  dataPreviewOpen.value = false;
  dataPreview.value = null;
  dataPreviewError.value = '';
}

async function toggleDataPreview(layerId) {
  if (dataPreviewOpen.value) {
    dataPreviewOpen.value = false;
    return;
  }
  dataPreviewOpen.value = true;
  if (dataPreview.value) return; // already loaded
  dataPreviewLoading.value = true;
  dataPreviewError.value = '';
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

function saveEdit(id, { closePanel = false } = {}) {
  editError.value = '';

  // Build the same patch shape the server expects
  const parsedSearchFields = searchFieldsStr.value
    .split(',').map(s => s.trim()).filter(Boolean);
  const patch = Object.fromEntries(
    Object.entries(editDraft.value).filter(([k, v]) => k !== 'crsOverride' && v !== '' && v != null)
  );
  patch.search_fields = parsedSearchFields;
  patch.thumbnail_url = editDraft.value.thumbnail_url ?? '';
  patch.pointType = editDraft.value.pointType || null;
  const layer = layers.value.find(l => l.id === id);
  const crsVal = editDraft.value.crsOverride?.trim() || null;
  if (layer?.fileType === 'geotiff') {
    patch.tiffProjection = crsVal;
  } else if (crsVal) {
    patch.sourceCrs = crsVal;
  }

  // Apply locally — no server round-trip until "Save Configuration"
  const idx = layers.value.findIndex(l => l.id === id);
  if (idx !== -1) {
    applyPatchToLayerConfig(layers.value[idx].layerConfig, patch);
    pendingPatches.set(id, { ...(pendingPatches.get(id) ?? {}), ...patch });
  }

  if (closePanel) editingId.value = null;
  emitLayers();
}
</script>

<style scoped>
/* ── Section header ─────────────────────────────────────────── */
.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.1rem;
}
.section-title { font-size: 1rem; font-weight: 600; margin: 0 0 0.2rem; }
.section-desc  { font-size: 0.8rem; color: var(--admin-muted, #777); margin: 0; }

/* btn-add — label wraps a hidden file input */
.btn-add {
  display: inline-flex; align-items: center;
  padding: 0.4rem 0.85rem; border-radius: 6px; border: none;
  background: #3b82f6; color: #fff;
  font-size: 0.82rem; font-weight: 500; cursor: pointer; white-space: nowrap;
  transition: background 0.15s, opacity 0.15s;
  user-select: none;
}
.btn-add:hover:not(.btn-add-disabled) { background: #2563eb; }
.btn-add-disabled { opacity: 0.55; cursor: default; }

/* ── Upload progress ─────────────────────────────────────────── */
.upload-progress-wrap {
  margin-bottom: 0.75rem;
}
.upload-progress-label {
  display: flex; justify-content: space-between;
  font-size: 0.78rem; color: var(--admin-muted, #666); margin-bottom: 0.3rem;
}
.upload-progress-track {
  height: 6px; background: var(--admin-border, #e0e0e0); border-radius: 3px; overflow: hidden;
}
.upload-progress-fill {
  height: 100%; background: #3b82f6; border-radius: 3px;
  transition: width 0.15s ease;
}

/* ── Upload error ───────────────────────────────────────────── */
.upload-error-banner {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.35);
  border-radius: 6px; padding: 0.55rem 0.8rem; margin-bottom: 0.75rem;
  font-size: 0.82rem; color: #ef4444;
}
.banner-close {
  background: none; border: none; cursor: pointer; color: #ef4444; font-size: 1rem; line-height: 1; padding: 0;
}

/* ── Empty / loading ────────────────────────────────────────── */
.empty-state {
  padding: 1.25rem; text-align: center;
  font-size: 0.85rem; color: var(--admin-muted, #777);
  background: var(--admin-bg, #f3f4f6);
  border-radius: 6px;
}

/* ── Layer list ─────────────────────────────────────────────── */
.layer-list { display: flex; flex-direction: column; gap: 0.5rem; }

.layer-card {
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 8px;
  background: var(--admin-surface, #fff);
  overflow: hidden;
  transition: border-color 0.15s;
}
.layer-card:hover { border-color: var(--admin-border, #c0c0c0); filter: brightness(0.98); }
.layer-card-editing { border-color: #3b82f6 !important; }
.layer-card-uploading { border-color: #93c5fd; background: #eff6ff; opacity: 0.9; }
:global(body.theme-dark) .layer-card-uploading { border-color: #1d4ed8; background: rgba(59,130,246,0.1); }
.status-uploading { color: #2563eb; }
:global(body.theme-dark) .status-uploading { color: #60a5fa; }
.lc-upload-bar-track {
  height: 3px; background: #dbeafe; overflow: hidden;
}
.lc-upload-bar-fill {
  height: 100%; background: #3b82f6;
  transition: width 0.2s ease;
}
.lc-upload-bar-processing {
  width: 100% !important;
  background: linear-gradient(90deg, #3b82f6 25%, #93c5fd 50%, #3b82f6 75%);
  background-size: 200% 100%;
  animation: shimmer 1.2s linear infinite;
}
@keyframes shimmer { to { background-position: -200% 0; } }

/* ── Card header ────────────────────────────────────────────── */
.lc-header {
  display: flex; align-items: center; gap: 0.65rem;
  padding: 0.6rem 0.85rem;
}

.type-badge {
  flex-shrink: 0;
  font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  padding: 0.15rem 0.5rem; border-radius: 4px;
  background: var(--admin-bg, #f3f4f6); color: var(--admin-muted, #777);
}
.type-geojson    { background: rgba(34,197,94,0.15);  color: #15803d; }
.type-geotiff    { background: rgba(168,85,247,0.15); color: #6d28d9; }
.type-model      { background: rgba(251,191,36,0.15); color: #b45309; }
.type-pointcloud { background: rgba(56,189,248,0.15); color: #0369a1; }
:global(body.theme-dark) .type-geojson    { color: #4ade80; }
:global(body.theme-dark) .type-geotiff    { color: #c084fc; }
:global(body.theme-dark) .type-model      { color: #fbbf24; }
:global(body.theme-dark) .type-pointcloud { color: #38bdf8; }

.lc-names { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.1rem; }
.lc-display-name { font-size: 0.88rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--admin-text, #1a1a1a); }
.lc-original-name { font-size: 0.72rem; color: var(--admin-muted, #777); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.lc-status { display: flex; align-items: center; gap: 0.35rem; flex-shrink: 0; }
.status-text { font-size: 0.75rem; font-weight: 500; }
.status-optimizing { color: #d97706; }
.status-error      { color: #dc2626; }
.status-ok         { color: #16a34a; }
:global(body.theme-dark) .status-optimizing { color: #fbbf24; }
:global(body.theme-dark) .status-error      { color: #f87171; }
:global(body.theme-dark) .status-ok         { color: #4ade80; }

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.9s linear infinite; }

/* ── Card action buttons ────────────────────────────────────── */
.lc-actions { display: flex; gap: 0.3rem; flex-shrink: 0; }
.action-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 5px; border: 1px solid var(--admin-border, #e0e0e0);
  background: transparent; color: var(--admin-muted, #777); cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.action-btn:hover:not(:disabled) { background: var(--admin-bg, #f3f4f6); border-color: var(--admin-muted, #aaa); color: var(--admin-text, #1a1a1a); }
.action-btn:disabled { opacity: 0.35; cursor: default; }
.action-btn-active { background: rgba(59,130,246,0.15) !important; border-color: rgba(59,130,246,0.5) !important; color: #3b82f6 !important; }
.action-btn-danger:hover:not(:disabled) { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.4); color: #dc2626; }
.action-btn-link3d { color: #7c3aed; border-color: rgba(124,58,237,0.3); }
.action-btn-link3d:hover:not(:disabled) { background: rgba(124,58,237,0.08); border-color: rgba(124,58,237,0.5); color: #7c3aed; }
.action-btn-linkdata { color: #059669; border-color: rgba(5,150,105,0.3); }
.action-btn-linkdata:hover:not(:disabled) { background: rgba(5,150,105,0.08); border-color: rgba(5,150,105,0.5); color: #059669; }
.action-btn-debug { color: #d97706; border-color: rgba(217,119,6,0.3); }
.action-btn-debug:hover:not(:disabled) { background: rgba(217,119,6,0.08); border-color: rgba(217,119,6,0.5); color: #d97706; }

/* ── Debug modal ─────────────────────────────────────────────── */
.dbl-overlay {
  position: fixed; inset: 0; z-index: 1200;
  background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center;
}
.dbl-modal {
  background: var(--admin-surface, #fff); border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18); width: min(640px, 92vw);
  display: flex; flex-direction: column; max-height: 80vh; overflow: hidden;
}
.dbl-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.85rem 1rem 0.75rem; border-bottom: 1px solid var(--admin-border, #e8e8e8);
}
.dbl-title { font-size: 0.9rem; font-weight: 600; color: var(--admin-text, #1a1a1a); }
.dbl-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 5px; border: none;
  background: transparent; cursor: pointer; color: var(--admin-muted, #888);
  transition: background 0.12s, color 0.12s;
}
.dbl-close:hover { background: var(--admin-bg, #f3f4f6); color: var(--admin-text, #1a1a1a); }
.dbl-tabs {
  display: flex; gap: 0; border-bottom: 1px solid var(--admin-border, #e8e8e8);
  padding: 0 0.75rem;
}
.dbl-tab {
  padding: 0.55rem 0.85rem; font-size: 0.8rem; font-weight: 500;
  background: none; border: none; border-bottom: 2px solid transparent;
  cursor: pointer; color: var(--admin-muted, #888); margin-bottom: -1px;
  transition: color 0.12s, border-color 0.12s;
}
.dbl-tab:hover { color: var(--admin-text, #1a1a1a); }
.dbl-tab-active { color: #3b82f6; border-bottom-color: #3b82f6; }
.dbl-body { flex: 1; overflow: auto; padding: 0.75rem; }
.dbl-pre {
  margin: 0; padding: 0.75rem; border-radius: 5px;
  background: var(--admin-bg, #f3f4f6); border: 1px solid var(--admin-border, #e0e0e0);
  font-size: 0.78rem; line-height: 1.55; color: var(--admin-text, #333);
  font-family: ui-monospace, 'Cascadia Code', monospace;
  white-space: pre; overflow-x: auto;
}

/* ── Sub-files strip ────────────────────────────────────────── */
.lc-subfile-uploading {
  padding: 0.35rem 0.8rem;
  font-size: 0.78rem;
  color: var(--admin-muted, #777);
  border-top: 1px solid var(--admin-border, #e0e0e0);
}
.lc-subfile-error {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  padding: 0.35rem 0.8rem;
  font-size: 0.78rem;
  color: #dc2626;
  border-top: 1px solid rgba(239,68,68,0.2);
  background: rgba(239,68,68,0.06);
}
.lc-subfiles {
  display: flex; flex-wrap: wrap; gap: 0.3rem;
  padding: 0 0.85rem 0.6rem; border-top: 1px solid var(--admin-border, #e0e0e0);
  margin-top: -0.05rem; padding-top: 0.4rem;
}
.subfile-chip {
  display: inline-flex; align-items: center; gap: 0.25rem;
  font-size: 0.7rem; padding: 0.1rem 0.45rem; border-radius: 3px;
  background: var(--admin-bg, #f3f4f6); color: var(--admin-muted, #777); border: 1px solid var(--admin-border, #e0e0e0); text-transform: capitalize;
}
.subfile-chip-model      { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; }
.subfile-chip-pointcloud { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
.subfile-chip-attributes { background: #f0fdf4; color: #059669; border-color: #a7f3d0; }
.subfile-chip-companion  { background: #faf5ff; color: #7c3aed; border-color: #ddd6fe; }
.subfile-chip-rm {
  background: transparent; border: none; cursor: pointer;
  font-size: 0.8rem; line-height: 1; padding: 0; opacity: 0.45;
  color: inherit; border-radius: 2px; transition: opacity 0.1s;
}
.subfile-chip-rm:hover { opacity: 1; }

/* ── Delete confirm bar ─────────────────────────────────────── */
.lc-confirm-bar {
  display: flex; align-items: center; gap: 0.6rem;
  padding: 0.55rem 0.85rem;
  background: rgba(239,68,68,0.08); border-top: 1px solid rgba(239,68,68,0.2);
  font-size: 0.82rem;
}
.confirm-text { flex: 1; color: var(--admin-text, #1a1a1a); }
.btn-danger-sm {
  padding: 0.28rem 0.7rem; border-radius: 5px; border: none; cursor: pointer;
  background: #dc2626; color: #fff; font-size: 0.8rem; font-weight: 500;
  transition: background 0.12s;
}
.btn-danger-sm:hover:not(:disabled) { background: #b91c1c; }
.btn-danger-sm:disabled { opacity: 0.5; cursor: default; }

/* ── Inline edit panel ──────────────────────────────────────── */
.lc-edit-panel {
  padding: 0.85rem;
  border-top: 1px solid var(--admin-border, #e0e0e0);
  background: var(--admin-bg, #f3f4f6);
  display: flex; flex-direction: column; gap: 0.7rem;
}

.edit-row { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.edit-field { display: flex; flex-direction: column; gap: 0.25rem; }
.edit-field label { font-size: 0.75rem; color: var(--admin-muted, #777); font-weight: 500; }
.edit-field input[type="text"],
.edit-field input[type="number"] {
  padding: 0.35rem 0.6rem; border-radius: 5px;
  border: 1px solid var(--admin-border, #e0e0e0);
  background: var(--admin-input-bg, #fff); color: var(--admin-text, #1a1a1a);
  font-size: 0.83rem;
}
.edit-field input:focus { outline: none; border-color: #3b82f6; }

.edit-field-grow { flex: 1; min-width: 14rem; }
.edit-field-sm   { width: 6rem; }
.edit-field-toggle { align-items: flex-start; }

/* toggle switch (same as used elsewhere in admin) */
.toggle-switch { position: relative; display: inline-block; width: 36px; height: 20px; margin-top: 3px; }
.toggle-switch input { opacity: 0; width:0; height:0; }
.slider {
  position: absolute; cursor: pointer; inset: 0; border-radius: 20px;
  background: var(--admin-border, #ccc); transition: background 0.2s;
}
.slider::before {
  content:''; position:absolute; height:14px; width:14px; left:3px; bottom:3px;
  border-radius:50%; background:#fff; transition: transform 0.2s;
}
input:checked + .slider { background: #3b82f6; }
input:checked + .slider::before { transform: translateX(16px); }

/* Edit section headings */
.edit-section-heading {
  font-size: 0.72rem; font-weight: 600; letter-spacing: 0.05em;
  text-transform: uppercase; color: var(--admin-muted, #888);
  border-top: 1px solid var(--admin-border, #e8e8e8);
  margin-top: 0.75rem; padding-top: 0.6rem; margin-bottom: 0.1rem;
}
.lc-edit-panel > .edit-section-heading:first-child { border-top: none; margin-top: 0; }

/* Color row */
.color-row { display: flex; gap: 0.4rem; align-items: center; }
.color-swatch { width: 28px; height: 28px; padding: 1px; border-radius: 4px; border: 1px solid var(--admin-border, #e0e0e0); background:none; cursor:pointer; }
.color-row input[type="text"] { flex: 1; }

/* Edit footer */
.edit-footer { display: flex; align-items: center; gap: 0.5rem; }
.edit-footer-spacer { flex: 1; }
.edit-field-hint { font-size: 0.75rem; color: var(--admin-muted, #888); font-weight: 400; }
.edit-field-hint code { font-family: monospace; font-size: 0.8em; background: var(--admin-bg, #f3f4f6); padding: 0 3px; border-radius: 3px; }

/* Clickable field-name chips in the thumbnail hint */
.thumb-field-chip {
  display: inline-block;
  margin: 2px 3px 0 0;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 0.73rem;
  font-family: monospace;
  background: var(--admin-bg, #f3f4f6);
  border: 1px solid var(--admin-border, #d1d5db);
  color: #3b82f6;
  cursor: pointer;
  user-select: none;
  transition: background 0.1s;
}
.thumb-field-chip:hover { background: #dbeafe; border-color: #93c5fd; }
.checkbox-label { display: flex; align-items: baseline; gap: 0.35rem; cursor: pointer; font-size: 0.82rem; }

/* Data head preview */
.data-preview-section { border-top: 1px solid var(--admin-border, #e8e8e8); margin-top: 0.6rem; padding-top: 0.5rem; }
.data-preview-body { margin-top: 0.5rem; }
.data-preview-empty { font-size: 0.8rem; color: var(--admin-muted, #888); padding: 0.3rem 0; }
.data-preview-error { color: #dc2626; }
.data-preview-scroll { overflow-x: auto; max-height: 220px; overflow-y: auto; border: 1px solid var(--admin-border, #e0e0e0); border-radius: 5px; }
.data-preview-table {
  border-collapse: collapse;
  font-size: 0.74rem;
  width: 100%;
  font-family: ui-monospace, 'Cascadia Code', monospace;
}
.data-preview-table th {
  position: sticky; top: 0;
  background: var(--admin-bg, #f3f4f6);
  border-bottom: 1px solid var(--admin-border, #e0e0e0);
  padding: 0.3rem 0.55rem;
  text-align: left;
  white-space: nowrap;
  font-weight: 600;
  color: var(--admin-text, #333);
}
.data-preview-table td {
  padding: 0.25rem 0.55rem;
  border-bottom: 1px solid var(--admin-border, #f0f0f0);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--admin-text, #444);
}
.data-preview-table tbody tr:last-child td { border-bottom: none; }
.data-preview-table tbody tr:hover td { background: var(--admin-bg, #f9f9f9); }

/* Config preview */
.edit-preview { border-top: 1px solid var(--admin-border, #e8e8e8); margin-top: 0.6rem; padding-top: 0.5rem; }
.edit-preview-toggle {
  display: inline-flex; align-items: center; gap: 0.35rem;
  background: none; border: none; cursor: pointer; padding: 0.15rem 0;
  font-size: 0.76rem; color: var(--admin-muted, #888);
  user-select: none;
}
.edit-preview-toggle:hover { color: var(--admin-text, #1a1a1a); }
.edit-preview-body {
  margin: 0.5rem 0 0;
  padding: 0.6rem 0.75rem;
  background: var(--admin-bg, #f3f4f6);
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 5px;
  font-size: 0.74rem;
  line-height: 1.55;
  color: var(--admin-text, #333);
  overflow-x: auto;
  white-space: pre;
  font-family: ui-monospace, 'Cascadia Code', monospace;
}
.edit-error { font-size: 0.78rem; color: #dc2626; }

.btn-primary-sm {
  padding: 0.3rem 0.75rem; border-radius: 5px; border: none; cursor: pointer;
  background: #3b82f6; color: #fff; font-size: 0.8rem; font-weight: 500;
  transition: background 0.12s;
}
.btn-primary-sm:hover:not(:disabled) { background: #2563eb; }
.btn-primary-sm:disabled { opacity: 0.55; cursor: default; }

.btn-secondary-sm {
  padding: 0.3rem 0.75rem; border-radius: 5px; cursor: pointer; font-size: 0.8rem;
  background: transparent; color: var(--admin-muted, #777);
  border: 1px solid var(--admin-border, #e0e0e0);
  transition: background 0.12s, color 0.12s;
  text-decoration: none; display: inline-flex; align-items: center;
}
.btn-secondary-sm:hover { background: var(--admin-bg, #f3f4f6); color: var(--admin-text, #1a1a1a); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
