<template>
  <Transition name="fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('cancel')">
      <div class="modal-content">
        <header class="modal-header">
          <h3>{{ isNew ? (layerGroup === 'base' ? 'Add Basemap' : 'Add Layer') : (layerGroup === 'base' ? 'Edit Basemap' : 'Edit Layer') }}</h3>
          <button class="close-btn" @click="$emit('cancel')" title="Close">✕</button>
        </header>

        <div class="modal-body">
          <!-- Common fields -->
          <div class="field-row">
            <div class="field-group">
              <label>Name <span class="required">*</span></label>
              <input v-model="draft.name" type="text" placeholder="Layer name" />
            </div>
            <div class="field-group">
              <label>Type <span class="required">*</span></label>
              <select v-model="draft.type" :disabled="!isNew">
                <option v-for="t in allowedTypes" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
          </div>

          <div class="field-row">
            <div class="field-group">
              <label>Order <span class="required">*</span><FieldHint text="Controls rendering priority. Higher values appear on top. Each layer should have a unique order number." /></label>
              <input v-model.number="draft.order" type="number" min="0" />
            </div>
            <div class="field-group field-toggle-row">
              <label>Visible by default<FieldHint text="Whether this layer is shown when the map first loads. For base layers, exactly one should be visible." /></label>
              <div class="toggle-switch">
                <input :id="`vis-${uid}`" v-model="draft.visible" type="checkbox" />
                <label :for="`vis-${uid}`" class="slider"></label>
              </div>
            </div>
          </div>

          <!-- URL (all types) -->
          <div class="field-group">
            <label>URL <span class="required">*</span><FieldHint text="Full URL to the data source: tile server template ({x}/{y}/{z}), WMS/WMTS endpoint, or path to a GeoJSON/GeoTIFF file." /></label>
            <input v-model="draft.url" type="text" placeholder="https://..." />
          </div>

          <!-- Select from uploaded files (overlay only) -->
          <template v-if="layerGroup === 'overlay'">
            <details class="collapsible server-file-picker">
              <summary>Select from uploaded files</summary>
              <div class="collapsible-body">
                <template v-if="serverFilesLoading">
                  <p class="picker-hint">Loading…</p>
                </template>
                <template v-else-if="serverFilesError">
                  <p class="picker-hint picker-error">{{ serverFilesError }}</p>
                </template>
                <template v-else-if="pickerFiles.length === 0">
                  <p class="picker-hint">No {{ draft.type === 'geojson' ? 'GeoJSON' : 'GeoTIFF' }} files found on server.</p>
                </template>
                <template v-else>
                  <p class="picker-hint">Click a file to use its URL:</p>
                  <ul class="picker-list">
                    <li
                      v-for="f in pickerFiles"
                      :key="f.dataPath"
                      class="picker-item"
                      :class="{ 'picker-item-active': draft.url === getApiUrl(f.dataPath) }"
                      @click="selectServerFile(f)"
                    >
                      {{ f.filename }}
                    </li>
                  </ul>
                </template>
              </div>
            </details>
          </template>

          <!-- ── tile / wmts / wms fields ─────────────────────── -->
          <template v-if="isBaseType">
            <div class="field-group">
              <label>Attribution <span class="required">*</span><FieldHint text="Copyright notice shown on the map. Use © followed by the provider's name (e.g. © OpenStreetMap contributors)." /></label>
              <input v-model="draft.attribution" type="text" placeholder="© Source" />
            </div>

            <!-- wmts specifics -->
            <template v-if="draft.type === 'wmts'">
              <div class="field-row">
                <div class="field-group">
                  <label>Layer <span class="required">*</span><FieldHint text="Layer identifier from the WMTS GetCapabilities document." /></label>
                  <input v-model="draft.layer" type="text" />
                </div>
                <div class="field-group">
                  <label>Matrix Set <span class="required">*</span><FieldHint text="Tile matrix set identifier — must match the project CRS (e.g. GoogleMapsCompatible for EPSG:3857)." /></label>
                  <input v-model="draft.matrixSet" type="text" />
                </div>
              </div>
              <div class="field-row">
                <div class="field-group">
                  <label>Format <span class="required">*</span><FieldHint text="Image MIME type: image/jpeg (no transparency, smaller files) or image/png (supports transparency)." /></label>
                  <input v-model="draft.format" type="text" placeholder="image/jpeg" />
                </div>
                <div class="field-group">
                  <label>Style<FieldHint text="WMTS style identifier. Use 'default' if the server doesn't specify a named style." /></label>
                  <input v-model="draft.style" type="text" placeholder="default" />
                </div>
              </div>
            </template>

            <!-- wms specifics -->
            <template v-if="draft.type === 'wms'">
              <div class="field-row">
                <div class="field-group">
                  <label>Layers <span class="required">*</span><FieldHint text="Comma-separated WMS layer name(s) from the server's GetCapabilities response." /></label>
                  <input v-model="draft.layers" type="text" placeholder="0" />
                </div>
                <div class="field-group">
                  <label>Format <span class="required">*</span><FieldHint text="Image MIME type: image/jpeg (no transparency) or image/png (with transparency)." /></label>
                  <input v-model="draft.format" type="text" placeholder="image/jpeg" />
                </div>
              </div>
              <div class="field-row">
                <div class="field-group">
                  <label>Version<FieldHint text="WMS protocol version. Use 1.3.0 (recommended) or 1.1.1 for older servers." /></label>
                  <input v-model="draft.version" type="text" placeholder="1.3.0" />
                </div>
                <div class="field-group field-toggle-row">
                  <label>Transparent<FieldHint text="Request tiles with alpha transparency (requires image/png format). Enable for overlay WMS layers." /></label>
                  <div class="toggle-switch">
                    <input :id="`tr-${uid}`" v-model="draft.transparent" type="checkbox" />
                    <label :for="`tr-${uid}`" class="slider"></label>
                  </div>
                </div>
              </div>
              <div class="field-group field-toggle-row">
                <label>CRS supported by this layer<FieldHint text="Enable if the WMS server natively supports the project's CRS. Disable to request in EPSG:3857 as a fallback." /></label>
                <div class="toggle-switch">
                  <input :id="`cs-${uid}`" v-model="draft.crs_support" type="checkbox" />
                  <label :for="`cs-${uid}`" class="slider"></label>
                </div>
              </div>
            </template>

            <!-- tile specifics -->
            <template v-if="draft.type === 'tile'">
              <div class="field-group">
                <label>Tile Size<FieldHint text="Tile dimensions in pixels. Default is 256; use 512 for high-DPI (retina) tile servers." /></label>
                <input v-model.number="draft.tileSize" type="number" placeholder="256" />
              </div>
            </template>

            <!-- crs_options (tile + wmts) -->
            <template v-if="draft.type === 'tile' || draft.type === 'wmts'">
              <details class="collapsible">
                <summary>CRS Options (extent &amp; resolutions)</summary>
                <div class="collapsible-body">
                  <div class="field-group">
                    <label>Extent <span class="hint">[minX, minY, maxX, maxY]</span></label>
                    <input v-model="crsExtentStr" type="text" placeholder="-20037508, -20037508, 20037508, 20037508" @blur="parseCrsExtent" />
                  </div>
                  <div class="field-group">
                    <label>Resolutions <span class="hint">comma-separated</span></label>
                    <input v-model="crsResStr" type="text" placeholder="156543, 78271, ..." @blur="parseCrsRes" />
                  </div>
                </div>
              </details>
            </template>
          </template>

          <!-- ── geojson fields ───────────────────────────────── -->
          <template v-if="draft.type === 'geojson'">
            <div class="field-row">
              <div class="field-group">
                <label>Stroke Color</label>
                <div class="color-row">
                  <input type="color" class="color-swatch" :value="/^#[0-9a-f]{6}$/i.test(draft.stroke_color) ? draft.stroke_color : '#000000'" @input="draft.stroke_color = $event.target.value" />
                  <input v-model="draft.stroke_color" type="text" placeholder="#ff0000" />
                </div>
              </div>
              <div class="field-group">
                <label>Fill Color<FieldHint text="'auto' = stroke color at 50% opacity · 'none' = transparent · or a hex color like #ff0000" /></label>
                <div class="color-row">
                  <input
                    type="color"
                    class="color-swatch"
                    :value="fillSwatchColor(draft.fill_color, draft.stroke_color)"
                    :disabled="!fillIsHex(draft.fill_color)"
                    @input="draft.fill_color = $event.target.value"
                  />
                  <input
                    v-model="draft.fill_color"
                    type="text"
                    placeholder="auto / none / #ff0000"
                    @blur="draft.fill_color = normalizeFillColor(draft.fill_color)"
                  />
                </div>
              </div>
            </div>
            <div class="field-row">
              <div class="field-group">
                <label>Point Type</label>
                <select v-model="draft.pointType">
                  <option value="">— auto —</option>
                  <option value="circle">circle</option>
                  <option value="square">square</option>
                  <option value="camera">camera (SfM positions)</option>
                  <option value="crosshair">crosshair (GCPs)</option>
                </select>
              </div>
            </div>
            <div class="field-row">
              <div class="field-group">
                <label>Render Mode<FieldHint text="Use 'image' mode for large datasets (>10 000 features) for significantly better performance." /></label>
                <select v-model="draft.render_mode">
                  <option value="">— default —</option>
                  <option value="image">image (faster, large datasets)</option>
                </select>
              </div>
              <div class="field-group">
                <label>Group By field<FieldHint text="Property name to group features by in the attribute panel — each unique value gets its own colour." /></label>
                <input v-model="draft.group_by" type="text" placeholder="field name" />
              </div>
            </div>
            <div class="field-group">
              <label>Search Fields<FieldHint text="Feature property names that users can search through in the search bar." /><span class="hint"> comma-separated</span></label>
              <input v-model="searchFieldsStr" type="text" placeholder="id, name" @blur="parseSearchFields" />
            </div>
          </template>

          <!-- ── geotiff fields ───────────────────────────────── -->
          <template v-if="draft.type === 'geotiff'">
            <div class="field-row">
              <div class="field-group">
                <label>Opacity<FieldHint text="0 = fully transparent, 1 = fully opaque. Intermediate values blend the layer over the base map." /></label>
                <input v-model.number="draft.opacity" type="number" min="0" max="1" step="0.05" placeholder="1" />
              </div>
              <div class="field-group">
                <label>No-Data Value<FieldHint text="Pixel value to treat as transparent/missing data (e.g. -9999 or 0). Shown as empty on the map." /></label>
                <input v-model.number="draft.noDataValue" type="number" placeholder="e.g. -9999" />
              </div>
            </div>
            <div class="field-row">
              <div class="field-group field-toggle-row">
                <label>Normalize<FieldHint text="Stretch pixel values to fill the full 0–255 range for better contrast and visualisation." /></label>
                <div class="toggle-switch">
                  <input :id="`norm-${uid}`" v-model="draft.normalize" type="checkbox" />
                  <label :for="`norm-${uid}`" class="slider"></label>
                </div>
              </div>
              <div class="field-group field-toggle-row">
                <label>Overviews<FieldHint text="Use pre-built image pyramids for faster rendering at low zoom levels. Requires a Cloud-Optimised GeoTIFF (COG)." /></label>
                <div class="toggle-switch">
                  <input :id="`ov-${uid}`" v-model="draft.overviews" type="checkbox" />
                  <label :for="`ov-${uid}`" class="slider"></label>
                </div>
              </div>
            </div>
          </template>

          <div v-if="liveWarnings.length" class="live-warn-box">
            <p v-for="w in liveWarnings" :key="w" class="live-warn-line">⚠ {{ w }}</p>
          </div>
          <p v-if="validationError" class="validation-error">{{ validationError }}</p>
        </div>

        <footer class="modal-footer">
          <button class="btn-secondary" @click="$emit('cancel')">Cancel</button>
          <button class="btn-primary" @click="save">{{ isNew ? (layerGroup === 'base' ? 'Add Basemap' : 'Add Layer') : 'Save Changes' }}</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import FieldHint from '../../ui/FieldHint.vue';
import { getApiUrl } from '../../../utils/config';

const props = defineProps({
  isOpen: Boolean,
  layer: Object,       // null → new layer
  layerGroup: String,  // 'base' | 'overlay'
  authHeader: { type: String, default: '' },
});

const emit = defineEmits(['save', 'cancel']);

const uid = Math.random().toString(36).slice(2, 8);

const BASE_TYPES    = ['tile', 'wmts', 'wms'];
const OVERLAY_TYPES = ['geojson', 'geotiff'];

const allowedTypes = computed(() =>
  props.layerGroup === 'base' ? BASE_TYPES : OVERLAY_TYPES
);

const isNew = computed(() => !props.layer);
const isBaseType = computed(() => BASE_TYPES.includes(draft.value.type));

// ── Server file picker (overlay only) ─────────────────────────
const serverFiles        = ref({ shapes: [], geotiffs: [] });
const serverFilesLoading = ref(false);
const serverFilesError   = ref('');
const serverFilesLoaded  = ref(false);

const pickerFiles = computed(() => {
  if (draft.value.type === 'geojson')  return serverFiles.value.shapes   ?? [];
  if (draft.value.type === 'geotiff')  return serverFiles.value.geotiffs ?? [];
  return [];
});

async function loadServerFiles() {
  if (serverFilesLoaded.value || serverFilesLoading.value || !props.authHeader) return;
  serverFilesLoading.value = true;
  serverFilesError.value   = '';
  try {
    const res = await fetch(getApiUrl('/admin/uploads'), {
      headers: { Authorization: props.authHeader },
    });
    if (!res.ok) {
      serverFilesError.value = `Could not load files (${res.status})`;
    } else {
      serverFiles.value      = await res.json();
      serverFilesLoaded.value = true;
    }
  } catch {
    serverFilesError.value = 'Network error loading server files.';
  } finally {
    serverFilesLoading.value = false;
  }
}

function selectServerFile(f) {
  draft.value.url = getApiUrl(f.dataPath);
}

// Load server files when modal opens for overlay layers
watch(() => props.isOpen, (open) => {
  if (open && props.layerGroup === 'overlay') loadServerFiles();
});

// ── Draft state ────────────────────────────────────────────────
function blankDraft() {
  return {
    name: '', type: allowedTypes.value[0], visible: false, order: 0,
    url: '', attribution: '',
    // wmts
    layer: '', matrixSet: '', format: '', style: '',
    // wms
    layers: '', version: '', transparent: false, crs_support: true,
    // tile
    tileSize: null,
    // geojson
    stroke_color: '#3b82f6', fill_color: 'auto',
    render_mode: '', pointType: '', group_by: '', search_fields: [],
    // geotiff
    opacity: null, noDataValue: null, normalize: false, overviews: false,
    // shared crs_options
    crs_options: null,
  };
}

const draft = ref(blankDraft());
const validationError = ref('');

const liveWarnings = computed(() => {
  const warnings = [];
  const d = draft.value;
  if (d.url && !/^https?:\/\//i.test(d.url.trim()))
    warnings.push('URL should start with http:// or https://');
  if (d.type === 'geotiff' && d.opacity !== null && d.opacity !== '' && (d.opacity < 0 || d.opacity > 1))
    warnings.push('Opacity must be between 0 (transparent) and 1 (opaque).');
  return warnings;
});

// Derived string helpers for array fields
const crsExtentStr = ref('');
const crsResStr    = ref('');
const searchFieldsStr = ref('');

function parseCrsExtent() {
  const nums = crsExtentStr.value.split(',').map(n => parseFloat(n.trim())).filter(n => !isNaN(n));
  if (nums.length === 4) {
    draft.value.crs_options = { ...(draft.value.crs_options || {}), extent: nums };
  }
}
function parseCrsRes() {
  const nums = crsResStr.value.split(',').map(n => parseFloat(n.trim())).filter(n => !isNaN(n));
  if (nums.length > 0) {
    draft.value.crs_options = { ...(draft.value.crs_options || {}), resolutions: nums };
  }
}
function parseSearchFields() {
  draft.value.search_fields = searchFieldsStr.value
    .split(',').map(s => s.trim()).filter(Boolean);
}

// Populate draft when layer prop changes
watch(() => props.layer, (layer) => {
  if (layer) {
    draft.value = { ...blankDraft(), ...layer };
    crsExtentStr.value = layer.crs_options?.extent?.join(', ') ?? '';
    crsResStr.value    = layer.crs_options?.resolutions?.join(', ') ?? '';
    searchFieldsStr.value = (layer.search_fields ?? []).join(', ');
  } else {
    draft.value = blankDraft();
    crsExtentStr.value = '';
    crsResStr.value    = '';
    searchFieldsStr.value = '';
  }
  validationError.value = '';
}, { immediate: true });

// ── Fill color helpers ────────────────────────────────────────
const HEX6 = /^#[0-9a-f]{6}$/i;

function fillIsHex(val) {
  return HEX6.test(val);
}

function fillSwatchColor(fillColor, strokeColor) {
  if (HEX6.test(fillColor)) return fillColor;
  if (HEX6.test(strokeColor)) return strokeColor;
  return '#000000';
}

function normalizeFillColor(val) {
  const v = (val ?? '').trim();
  if (!v || v === 'auto' || v === 'automatic') return 'auto';
  if (v === 'none') return 'none';
  if (HEX6.test(v)) return v.toLowerCase();
  return 'auto';
}

// ── Validation & save ──────────────────────────────────────────
function validate() {
  const d = draft.value;
  if (!d.name.trim()) return 'Name is required.';
  if (!d.url.trim())  return 'URL is required.';
  if (BASE_TYPES.includes(d.type) && !d.attribution?.trim()) return 'Attribution is required.';
  if (d.type === 'wmts' && (!d.layer?.trim() || !d.matrixSet?.trim() || !d.format?.trim()))
    return 'WMTS requires Layer, Matrix Set and Format.';
  if (d.type === 'wms' && (!d.layers?.trim() || !d.format?.trim()))
    return 'WMS requires Layers and Format.';
  return '';
}

function save() {
  const err = validate();
  if (err) { validationError.value = err; return; }

  // Build a clean output — strip empty/null optional fields
  const out = {};
  const d = draft.value;

  // Always-present fields
  out.name    = d.name.trim();
  out.type    = d.type;
  out.visible = d.visible;
  out.order   = d.order;
  out.url     = d.url.trim();

  if (BASE_TYPES.includes(d.type)) {
    out.attribution = d.attribution.trim();
    if (d.type === 'tile') {
      if (d.tileSize) out.tileSize = d.tileSize;
    }
    if (d.type === 'wmts') {
      out.layer     = d.layer.trim();
      out.matrixSet = d.matrixSet.trim();
      out.format    = d.format.trim();
      if (d.style?.trim()) out.style = d.style.trim();
    }
    if (d.type === 'wms') {
      out.layers = d.layers.trim();
      out.format = d.format.trim();
      if (d.version?.trim()) out.version = d.version.trim();
      if (d.transparent)     out.transparent = true;
      if (d.crs_support === false) out.crs_support = false;
    }
    if (d.crs_options?.extent || d.crs_options?.resolutions) {
      out.crs_options = {};
      if (d.crs_options.extent)      out.crs_options.extent = d.crs_options.extent;
      if (d.crs_options.resolutions) out.crs_options.resolutions = d.crs_options.resolutions;
    }
  }

  if (d.type === 'geojson') {
    if (d.stroke_color?.trim()) out.stroke_color = d.stroke_color.trim();
    if (d.fill_color?.trim())   out.fill_color   = d.fill_color.trim();
    if (d.render_mode?.trim())  out.render_mode  = d.render_mode.trim();
    if (d.pointType?.trim())    out.pointType    = d.pointType.trim();
    if (d.group_by?.trim())     out.group_by     = d.group_by.trim();
    if (d.search_fields?.length) out.search_fields = d.search_fields;
  }

  if (d.type === 'geotiff') {
    if (d.opacity   !== null && d.opacity !== '')   out.opacity      = d.opacity;
    if (d.noDataValue !== null && d.noDataValue !== '') out.noDataValue = d.noDataValue;
    if (d.normalize)  out.normalize = true;
    if (d.overviews)  out.overviews = true;
  }

  emit('save', out);
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}

.modal-content {
  background: var(--admin-surface, #fff);
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 10px;
  width: 100%;
  max-width: 580px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  font-family: "Segoe UI", sans-serif;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--admin-border, #e0e0e0);
}
.modal-header h3 { margin: 0; font-size: 1rem; font-weight: 600; }

.close-btn {
  background: transparent;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  color: var(--admin-muted, #777);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}
.close-btn:hover { background: var(--admin-bg, #f3f4f6); }

.modal-body {
  padding: 1.25rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 1;
}

.modal-footer {
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--admin-border, #e0e0e0);
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

/* fields */
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}
.field-group {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.field-group label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--admin-text, #1a1a1a);
}
.field-toggle-row {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  background: var(--admin-bg, #f3f4f6);
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
}
.field-group input[type="text"],
.field-group input[type="number"],
.field-group select {
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--admin-input-border, #ccc);
  border-radius: 6px;
  background: var(--admin-input-bg, #fff);
  color: var(--admin-text, #1a1a1a);
  font-size: 0.875rem;
  font-family: "Segoe UI", sans-serif;
}
.field-group input:focus,
.field-group select:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
}
.field-group select:disabled { opacity: 0.6; }

.color-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.color-swatch {
  width: 36px;
  height: 32px;
  padding: 2px;
  border: 1px solid var(--admin-input-border, #ccc);
  border-radius: 6px;
  background: var(--admin-input-bg, #fff);
  cursor: pointer;
  flex-shrink: 0;
}
.color-row input[type="text"] {
  flex: 1;
}

.required { color: #ef4444; margin-left: 2px; }
.hint { font-size: 0.75rem; color: var(--admin-muted, #777); margin-left: 4px; font-weight: 400; }

/* collapsible */
.collapsible {
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 6px;
}
.collapsible summary {
  padding: 0.5rem 0.75rem;
  font-size: 0.825rem;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  background: var(--admin-bg, #f3f4f6);
  border-radius: 5px 5px 0 0;
}
details.collapsible:not([open]) > summary {
  border-radius: 5px;
}
.collapsible-body {
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  border-top: 1px solid var(--admin-border, #e0e0e0);
}

.validation-error {
  color: #ef4444;
  font-size: 0.825rem;
  margin: 0;
}

.live-warn-box {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.live-warn-line {
  margin: 0;
  padding: 0.3rem 0.5rem;
  font-size: 0.78rem;
  color: #b45309;
  background: rgba(217, 119, 6, 0.09);
  border: 1px solid rgba(217, 119, 6, 0.25);
  border-radius: 4px;
}

/* toggle */
.toggle-switch { position: relative; display: inline-block; width: 36px; height: 20px; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute; inset: 0;
  background: var(--admin-border, #ccc);
  border-radius: 20px;
  cursor: pointer;
  transition: background 0.2s;
}
.slider::before {
  content: '';
  position: absolute;
  width: 14px; height: 14px;
  left: 3px; bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}
.toggle-switch input:checked + .slider { background: #3b82f6; }
.toggle-switch input:checked + .slider::before { transform: translateX(16px); }

/* buttons */
.btn-primary {
  padding: 0.55rem 1.25rem;
  background: #3b82f6;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  font-family: "Segoe UI", sans-serif;
}
.btn-primary:hover { background: #2563eb; }
.btn-secondary {
  padding: 0.55rem 1.25rem;
  background: transparent;
  color: var(--admin-text, #1a1a1a);
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 6px;
  font-size: 0.875rem;
  cursor: pointer;
  font-family: "Segoe UI", sans-serif;
}
.btn-secondary:hover { background: var(--admin-bg, #f3f4f6); }

/* transition */
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* server file picker */
.server-file-picker > summary { color: #3b82f6; }
.picker-hint {
  margin: 0 0 0.4rem;
  font-size: 0.78rem;
  color: var(--admin-muted, #777);
}
.picker-error { color: #ef4444 !important; }
.picker-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.picker-item {
  padding: 0.3rem 0.55rem;
  font-size: 0.8rem;
  font-family: "Consolas", monospace;
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 4px;
  cursor: pointer;
  background: var(--admin-surface, #fff);
  color: var(--admin-text, #333);
  transition: background 0.1s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.picker-item:hover         { background: #eff6ff; border-color: #93c5fd; color: #1d4ed8; }
.picker-item-active        { background: rgba(59,130,246,0.1); border-color: #3b82f6; color: #1d4ed8; }
</style>
