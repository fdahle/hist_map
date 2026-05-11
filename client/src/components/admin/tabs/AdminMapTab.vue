<template>
  <section class="tab-section">
    <!-- ── Projection ─────────────────────────────────────────────────────── -->
    <div class="settings-card">
      <h3 class="card-title">Projection</h3>

      <div class="field-row">
        <div class="field field-grow">
          <label>CRS (EPSG code or proj string)</label>
          <input v-model="draft.crs" type="text" placeholder="EPSG:3857"
            @blur="draft.crs = (draft.crs || '').trim() || 'EPSG:3857'" />
          <p v-if="projectionChanged" class="field-hint field-hint-warn">
            CRS changed from <strong>{{ loadedCrs }}</strong> — reload the map to apply.
          </p>
        </div>
      </div>

      <div class="field-row">
        <div class="field field-grow">
          <label>Proj4 definition <span class="field-hint-inline">(only needed when the EPSG code isn't auto-recognized by proj4js)</span></label>
          <input v-model="draft.projection_params.proj_string" type="text"
            placeholder="+proj=utm +zone=32 +datum=WGS84 …" />
        </div>
      </div>

      <div class="field-row">
        <div class="field field-grow">
          <label>Projection extent <span class="field-hint-inline">(optional — [minX, minY, maxX, maxY] in projected units)</span></label>
          <input v-model="projExtentStr" type="text" placeholder="e.g. -180,-90,180,90"
            @blur="onProjExtentBlur" :class="{ 'input-error': projExtentError }" />
          <p v-if="projExtentError" class="field-hint field-hint-error">{{ projExtentError }}</p>
        </div>
      </div>
    </div>

    <!-- ── Initial View ───────────────────────────────────────────────────── -->
    <div class="settings-card">
      <h3 class="card-title">Initial View</h3>

      <div class="field-row">
        <div class="field">
          <label>{{ centerXLabel }}</label>
          <input v-model.number="draft.view.center[0]" type="number" step="0.0001" placeholder="0" />
        </div>
        <div class="field">
          <label>{{ centerYLabel }}</label>
          <input v-model.number="draft.view.center[1]" type="number" step="0.0001" placeholder="0" />
        </div>
        <div class="field field-sm">
          <label>Zoom</label>
          <input v-model.number="draft.view.zoom" type="number" min="0" max="28" step="0.5" placeholder="7" />
        </div>
      </div>
    </div>

    <!-- ── View Constraints ──────────────────────────────────────────────── -->
    <div class="settings-card">
      <h3 class="card-title">View Constraints</h3>

      <div class="field-row">
        <div class="field field-sm">
          <label>Min zoom</label>
          <input v-model.number="draft.view.minZoom" type="number" min="0" max="28" step="1" placeholder="0" />
        </div>
        <div class="field field-sm">
          <label>Max zoom</label>
          <input v-model.number="draft.view.maxZoom" type="number" min="0" max="28" step="1" placeholder="28" />
        </div>
      </div>

      <div class="field-row">
        <div class="field field-grow">
          <label>View extent <span class="field-hint-inline">(optional lock — [minX, minY, maxX, maxY])</span></label>
          <input v-model="viewExtentStr" type="text" placeholder="e.g. -180,-90,180,90"
            @blur="onViewExtentBlur" :class="{ 'input-error': viewExtentError }" />
          <p v-if="viewExtentError" class="field-hint field-hint-error">{{ viewExtentError }}</p>
        </div>
      </div>
    </div>

    <!-- ── Background & Basemaps ─────────────────────────────────────────── -->
    <div class="settings-card">
      <div class="card-header">
        <div>
          <h3 class="card-title card-title-inline">Basemaps</h3>
          <p class="card-desc">Tile, WMS, or WMTS layers shown in the base layer switcher. Drag handle to reorder — the top entry is shown first.</p>
        </div>
        <div class="btn-group">
          <button class="btn-add-sm" @click="openAddBasemap">+ Add Basemap</button>
          <button class="btn-add-sm btn-add-sm-outline" @click="showTifUpload = true">+ Upload TIF</button>
        </div>
      </div>

      <div v-if="noBackgroundWarning" class="warn-list">
        <p class="warn-line">⚠ No background active — the map will appear empty. Enable OSM or add a basemap.</p>
      </div>

      <div class="layer-list">
        <div
          v-for="(row, idx) in allRows" :key="row._osm ? '__osm' : row.origIdx"
          class="layer-row"
          :class="{
            'layer-row-osm': row._osm,
            'row-disabled':  row._osm && !osmBackground,
            'drag-over':     dropIdx === idx && dropIdx !== dragIdx,
          }"
          draggable="true"
          @dragstart="onDragStart(idx, $event)"
          @dragover.prevent="onDragOver(idx)"
          @drop.prevent="onDrop(idx)"
          @dragend="onDragEnd"
        >
          <div class="drag-handle" title="Drag to reorder">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
              <rect x="2" y="3" width="12" height="1.5" rx="0.75"/>
              <rect x="2" y="7.25" width="12" height="1.5" rx="0.75"/>
              <rect x="2" y="11.5" width="12" height="1.5" rx="0.75"/>
            </svg>
          </div>

          <!-- OSM built-in row -->
          <template v-if="row._osm">
            <span class="type-badge type-tile">tile</span>
            <div class="layer-info">
              <span class="layer-name">
                OpenStreetMap
                <span class="osm-builtin-tag">(built-in)</span>
                <span v-if="idx === 0" class="default-badge">default</span>
              </span>
              <span class="layer-url">tile.openstreetmap.org</span>
            </div>
            <div class="toggle-switch osm-toggle">
              <input id="osm-bg" v-model="osmBackground" type="checkbox" />
              <label for="osm-bg" class="slider"></label>
            </div>
          </template>

          <!-- Custom basemap row -->
          <template v-else>
            <span class="type-badge" :class="`type-${row.layer.type}`">{{ row.layer.type }}</span>
            <div class="layer-info">
              <span class="layer-name">
                {{ row.layer.name }}
                <span v-if="idx === 0" class="default-badge">default</span>
              </span>
              <span class="layer-url">{{ truncateUrl(row.layer.url) }}</span>
            </div>
            <div class="row-actions">
              <button class="action-btn" title="Edit" @click="openEditBasemap(row.origIdx)">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
              <button class="action-btn action-btn-danger" title="Delete" @click="removeBasemap(row.origIdx)">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                  <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                </svg>
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Layer editor modal (reused for both basemaps and overlay layers) -->
    <LayerEditorModal
      :is-open="layerModalOpen"
      :layer="layerModalValue"
      :layer-group="layerModalGroup"
      :auth-header="authHeader"
      @save="onLayerModalSave"
      @cancel="layerModalOpen = false"
    />

    <!-- ── TIF Tile Jobs ─────────────────────────────────────────────── -->
    <div v-if="tileJobs.length" class="settings-card">
      <div class="card-header">
        <div>
          <h3 class="card-title card-title-inline">TIF Tile Conversions</h3>
          <p class="card-desc">GeoTIFFs being converted to tile pyramids. Add completed ones as basemaps.</p>
        </div>
      </div>
      <div class="layer-list">
        <div
          v-for="job in tileJobs" :key="job.id"
          class="layer-row tile-job-row"
          :class="{
            'tile-job-tiling': job.status === 'tiling',
            'tile-job-ready':  job.status === 'ready',
            'tile-job-error':  job.status === 'error',
          }"
        >
          <!-- Status badge -->
          <span class="type-badge" :class="`type-${job.status}`">
            {{ job.status === 'tiling' ? 'tiling' : job.status === 'ready' ? 'ready' : job.status === 'error' ? 'error' : 'pending' }}
          </span>

          <!-- Info -->
          <div class="layer-info">
            <span class="layer-name">{{ job.name || job.originalName }}</span>
            <span class="layer-url">
              <template v-if="job.status === 'tiling'">zoom {{ job.minZoom }}–{{ job.maxZoom }} · {{ job.format }} · {{ job.progress }}%</template>
              <template v-else-if="job.status === 'ready'">{{ job.tileUrl }}</template>
              <template v-else-if="job.status === 'error'">{{ job.error }}</template>
              <template v-else>Pending configuration</template>
            </span>

            <!-- Inline progress bar for tiling jobs -->
            <div v-if="job.status === 'tiling'" class="tile-progress-track">
              <div class="tile-progress-fill" :style="{ width: job.progress + '%' }" />
            </div>
          </div>

          <!-- Actions -->
          <div class="row-actions">
            <button
              v-if="job.status === 'ready' && !isAlreadyAdded(job)"
              class="btn-add-sm btn-add-sm-sm"
              title="Add to basemaps"
              @click="addJobAsBasemap(job)"
            >
              + Add
            </button>
            <span v-if="job.status === 'ready' && isAlreadyAdded(job)" class="added-tag">Added</span>
            <button
              class="action-btn action-btn-danger"
              title="Delete"
              :disabled="deletingJob[job.id]"
              @click="deleteJob(job.id)"
            >
              <svg v-if="!deletingJob[job.id]" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
              <span v-else style="font-size:10px">…</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- TIF upload modal -->
    <BasemapTifUploadModal
      :is-open="showTifUpload"
      :auth-header="authHeader"
      @close="showTifUpload = false"
      @added="onTifBasemapAdded"
    />
  </section>
</template>

<script setup>
import { ref, computed, inject, watch, onMounted, onBeforeUnmount } from 'vue';
import LayerEditorModal        from '../../modals/admin/LayerEditorModal.vue';
import BasemapTifUploadModal   from '../../modals/admin/BasemapTifUploadModal.vue';

// ── Injected from AdminView ────────────────────────────────────────────────────
const draft         = inject('draft');
const osmBackground = inject('osmBackground');
const scheduleSave  = inject('scheduleSave');
const loadedCrs     = inject('loadedCrs');
const authHeader    = inject('authHeader');

// ── Projection changed warning ─────────────────────────────────────────────────
const projectionChanged = computed(() =>
  loadedCrs.value && draft.value.crs && draft.value.crs !== loadedCrs.value
);

// ── Geographic vs projected CRS ────────────────────────────────────────────────
const GEOGRAPHIC_EPSG = new Set(['EPSG:4326', 'EPSG:4269', 'EPSG:4258', 'EPSG:4979', 'CRS:84', 'WGS84']);
const isGeographic = computed(() => {
  const crs  = (draft.value.crs || '').trim().toUpperCase();
  const proj = (draft.value.projection_params?.proj_string || '').toLowerCase();
  return GEOGRAPHIC_EPSG.has(crs) || proj.includes('+proj=longlat') || proj.includes('+proj=latlong');
});
const centerXLabel = computed(() => isGeographic.value ? 'Longitude (center)' : 'X (center)');
const centerYLabel = computed(() => isGeographic.value ? 'Latitude (center)' : 'Y (center)');

// ── Extent string helpers ──────────────────────────────────────────────────────
function extentToStr(arr) {
  if (!arr || !Array.isArray(arr)) return '';
  return arr.join(', ');
}
function parseExtent(str) {
  if (!str?.trim()) return null;
  const parts = str.split(',').map(s => parseFloat(s.trim()));
  if (parts.length !== 4 || parts.some(isNaN)) return undefined; // undefined = invalid
  return parts;
}

// Projection extent
const projExtentStr = ref(extentToStr(draft.value.projection_params?.extent));
const projExtentError = ref('');
function onProjExtentBlur() {
  const v = projExtentStr.value.trim();
  if (!v) { draft.value.projection_params.extent = null; projExtentError.value = ''; return; }
  const parsed = parseExtent(v);
  if (parsed === undefined) { projExtentError.value = 'Must be 4 numbers: minX, minY, maxX, maxY'; return; }
  projExtentError.value = '';
  draft.value.projection_params.extent = parsed;
}

// View extent
const viewExtentStr = ref(extentToStr(draft.value.view?.extent));
const viewExtentError = ref('');
function onViewExtentBlur() {
  const v = viewExtentStr.value.trim();
  if (!v) { draft.value.view.extent = null; viewExtentError.value = ''; return; }
  const parsed = parseExtent(v);
  if (parsed === undefined) { viewExtentError.value = 'Must be 4 numbers: minLng, minLat, maxLng, maxLat'; return; }
  viewExtentError.value = '';
  draft.value.view.extent = parsed;
}

// Keep string fields in sync when draft changes externally (e.g. initial load)
watch(() => draft.value.projection_params?.extent, (val) => {
  projExtentStr.value = extentToStr(val);
}, { immediate: true });
watch(() => draft.value.view?.extent, (val) => {
  viewExtentStr.value = extentToStr(val);
}, { immediate: true });

// ── Basemap warnings / state ──────────────────────────────────────────────────
const noBackgroundWarning = computed(() =>
  !osmBackground.value && (draft.value.basemaps ?? []).length === 0
);

// ── Unified basemap rows (OSM + custom, in drag order) ───────────────────────
const allRows = computed(() => {
  const basemaps = draft.value.basemaps ?? [];
  const osmPos = Math.min(draft.value.osm_background_order ?? 0, basemaps.length);
  const rows = basemaps.map((layer, origIdx) => ({ _osm: false, layer, origIdx }));
  rows.splice(osmPos, 0, { _osm: true });
  return rows;
});

// ── Drag-and-drop reordering ──────────────────────────────────────────────────
const dragIdx = ref(-1);
const dropIdx = ref(-1);

function onDragStart(idx, e) {
  dragIdx.value = idx;
  e.dataTransfer.effectAllowed = 'move';
}
function onDragOver(idx) {
  dropIdx.value = idx;
}
function onDrop(idx) {
  const from = dragIdx.value;
  if (from === idx || from === -1) return;
  const rows = allRows.value.slice();
  const item = rows.splice(from, 1)[0];
  rows.splice(idx, 0, item);
  // Rebuild basemaps and osm position from new order
  const newBasemaps = [];
  let newOsmPos = 0;
  rows.forEach((row, i) => {
    if (row._osm) newOsmPos = i;
    else newBasemaps.push(row.layer);
  });
  draft.value.basemaps = newBasemaps;
  draft.value.osm_background_order = newOsmPos;
  scheduleSave();
}
function onDragEnd() {
  dragIdx.value = -1;
  dropIdx.value = -1;
}

// ── Layer editor modal ─────────────────────────────────────────────────────────
const layerModalOpen  = ref(false);
const layerModalValue = ref(null);
const layerModalGroup = ref('base');
let   layerModalIdx   = -1;

function openAddBasemap() {
  layerModalValue.value = null;
  layerModalGroup.value = 'base';
  layerModalIdx = -1;
  layerModalOpen.value = true;
}
function openEditBasemap(idx) {
  layerModalValue.value = { ...draft.value.basemaps[idx] };
  layerModalGroup.value = 'base';
  layerModalIdx = idx;
  layerModalOpen.value = true;
}
function removeBasemap(idx) {
  draft.value.basemaps.splice(idx, 1);
  scheduleSave();
}
function onLayerModalSave(layer) {
  if (layerModalIdx >= 0) {
    draft.value.basemaps[layerModalIdx] = layer;
  } else {
    draft.value.basemaps.push(layer);
  }
  layerModalOpen.value = false;
}

// ── TIF tile jobs ──────────────────────────────────────────────────────────────
const showTifUpload = ref(false);
const tileJobs      = ref([]);
const deletingJob   = ref({});
let   jobPollTimer  = null;

async function fetchTileJobs() {
  try {
    const res  = await fetch('/admin/basemap-tiles', { headers: { Authorization: authHeader.value } });
    if (!res.ok) return;
    tileJobs.value = await res.json();
  } catch { /* ignore */ }
}

function scheduleTileJobPoll() {
  clearInterval(jobPollTimer);
  const hasActive = tileJobs.value.some(j => j.status === 'tiling');
  jobPollTimer = setInterval(async () => {
    await fetchTileJobs();
    if (!tileJobs.value.some(j => j.status === 'tiling')) {
      clearInterval(jobPollTimer);
    }
  }, hasActive ? 2000 : 10_000);
}

function isAlreadyAdded(job) {
  return (draft.value.basemaps ?? []).some(b => b.url === job.tileUrl);
}

function addJobAsBasemap(job) {
  const entry = {
    name:        job.name || job.originalName,
    type:        'tile',
    url:         job.tileUrl,
    attribution: job.attribution || '',
    visible:     false,
    order:       (draft.value.basemaps?.length ?? 0),
    tileSize:    256,
  };
  draft.value.basemaps = [...(draft.value.basemaps ?? []), entry];
  scheduleSave();
}

async function deleteJob(id) {
  deletingJob.value[id] = true;
  try {
    await fetch(`/admin/basemap-tiles/${id}`, {
      method: 'DELETE', headers: { Authorization: authHeader.value },
    });
    tileJobs.value = tileJobs.value.filter(j => j.id !== id);
  } catch { /* ignore */ } finally {
    delete deletingJob.value[id];
  }
}

function onTifBasemapAdded(entry, jobId) {
  draft.value.basemaps = [...(draft.value.basemaps ?? []), entry];
  scheduleSave();
  // Refresh jobs list so the new entry shows "Added"
  fetchTileJobs();
}

onMounted(async () => {
  await fetchTileJobs();
  scheduleTileJobPoll();
});

onBeforeUnmount(() => clearInterval(jobPollTimer));

// ── URL display helper ─────────────────────────────────────────────────────────
function truncateUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const p = u.pathname.length > 30 ? '…' + u.pathname.slice(-28) : u.pathname;
    return u.hostname + p;
  } catch {
    return url.length > 50 ? url.slice(0, 48) + '…' : url;
  }
}
</script>

<style scoped>
.tab-section { max-width: 900px; display: flex; flex-direction: column; gap: 1rem; }

.settings-card {
  border: 1px solid var(--admin-border, #e0e0e0); border-radius: 8px;
  background: var(--admin-surface, #fff); padding: 1rem 1.1rem;
}

.card-header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 0.85rem;
}
.card-title { font-size: 0.9rem; font-weight: 600; margin: 0 0 0.7rem; }
.card-title-inline { margin-bottom: 0.1rem; }
.card-desc  { font-size: 0.78rem; color: var(--admin-muted, #777); margin: 0; }

.field-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.65rem; }
.field-row:last-child { margin-bottom: 0; }
.field { display: flex; flex-direction: column; gap: 0.25rem; min-width: 140px; }
.field-grow { flex: 1; }
.field-sm { width: 100px; min-width: 100px; }

.field label { font-size: 0.78rem; font-weight: 500; color: var(--admin-text, #333); }
.field input {
  padding: 0.35rem 0.5rem; border: 1px solid var(--admin-input-border, #ccc);
  border-radius: 5px; font-size: 0.82rem; background: var(--admin-input-bg, #fff); color: var(--admin-text, #1a1a1a);
}
.field input:focus { outline: 2px solid #3b82f6; border-color: transparent; }
.input-error { border-color: #ef4444 !important; }

.field-hint-inline { font-size: 0.72rem; color: var(--admin-muted, #999); font-weight: 400; }
.field-hint { font-size: 0.75rem; margin: 0.2rem 0 0; }
.field-hint-warn  { color: #b45309; }
.field-hint-error { color: #ef4444; }

.checkbox-label {
  display: flex; align-items: center; gap: 0.55rem; font-size: 0.82rem; cursor: pointer;
  color: var(--admin-text, #333);
}
.toggle-switch { display: flex; align-items: center; flex-shrink: 0; }
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

.btn-add-sm {
  padding: 0.35rem 0.75rem; border-radius: 6px; background: #3b82f6;
  color: #fff; border: none; font-size: 0.78rem; font-weight: 500; cursor: pointer; white-space: nowrap; flex-shrink: 0;
}
.btn-add-sm:hover { background: #2563eb; }

.warn-list { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.75rem; }
.warn-line {
  margin: 0; padding: 0.3rem 0.6rem; font-size: 0.78rem;
  color: #b45309; background: rgba(217,119,6,0.09); border: 1px solid rgba(217,119,6,0.25); border-radius: 4px;
}

.empty-state { padding: 1rem; text-align: center; font-size: 0.82rem; color: var(--admin-muted, #777); background: var(--admin-bg, #f3f4f6); border-radius: 6px; }

.layer-list { display: flex; flex-direction: column; gap: 0.4rem; }
.layer-row {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.65rem;
  border: 1px solid var(--admin-border, #e0e0e0); border-radius: 6px; background: var(--admin-bg, #f9fafb);
}

.type-badge {
  font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
  padding: 0.12rem 0.35rem; border-radius: 3px; background: var(--admin-border, #e0e0e0);
  color: var(--admin-muted, #777); flex-shrink: 0;
}
.type-tile  { background: rgba(99,102,241,0.15);  color: #6366f1; }
.type-wmts  { background: rgba(168,85,247,0.15);  color: #a855f7; }
.type-wms   { background: rgba(236,72,153,0.15);  color: #ec4899; }

.vis-dot { display: none; }

.layer-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.layer-name { font-size: 0.83rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.layer-url  { font-size: 0.72rem; color: var(--admin-muted, #777); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.order-chip { display: none; }

.layer-row-osm { border-left: 3px solid rgba(99,102,241,0.4); }
.row-disabled { opacity: 0.45; }
.osm-builtin-tag { font-size: 0.7rem; color: var(--admin-muted, #999); font-weight: 400; }
.osm-toggle { margin-left: 0.25rem; flex-shrink: 0; }

.drag-handle {
  display: flex; align-items: center; justify-content: center;
  color: var(--admin-muted, #bbb); cursor: grab; flex-shrink: 0; padding: 0 2px;
}
.drag-handle:active { cursor: grabbing; }
.layer-row[draggable="true"] { cursor: default; }
.layer-row.drag-over { outline: 2px solid #3b82f6; outline-offset: -1px; }

.default-badge {
  font-size: 0.62rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
  background: rgba(59,130,246,0.12); color: #3b82f6; padding: 0.1rem 0.3rem;
  border-radius: 3px; vertical-align: middle; margin-left: 4px;
}

.row-actions { display: flex; gap: 0.25rem; flex-shrink: 0; }
.action-btn {
  display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;
  border: 1px solid var(--admin-border, #e0e0e0); border-radius: 5px;
  background: transparent; color: var(--admin-muted, #777); cursor: pointer;
}
.action-btn:hover { color: var(--admin-text, #1a1a1a); border-color: var(--admin-muted, #999); }
.action-btn-danger:hover { color: #ef4444; border-color: #fca5a5; }

.btn-group { display: flex; gap: 0.35rem; flex-wrap: wrap; }

.btn-add-sm-outline {
  background: transparent; color: #3b82f6;
  border: 1px solid #3b82f6;
}
.btn-add-sm-outline:hover { background: rgba(59,130,246,0.08); }

.btn-add-sm-sm { padding: 0.2rem 0.55rem; font-size: 0.73rem; }

/* Tile job rows */
.tile-job-row   { flex-wrap: wrap; gap: 0.4rem; align-items: flex-start; }
.tile-job-tiling { border-left: 3px solid #3b82f6; }
.tile-job-ready  { border-left: 3px solid #22c55e; }
.tile-job-error  { border-left: 3px solid #ef4444; }

.type-tiling  { background: rgba(59,130,246,0.15); color: #3b82f6; }
.type-ready   { background: rgba(34,197,94,0.15);  color: #16a34a; }
.type-error   { background: rgba(239,68,68,0.15);  color: #dc2626; }
.type-probed  { background: rgba(156,163,175,0.2); color: #6b7280; }

.tile-progress-track {
  height: 4px; border-radius: 2px; background: var(--admin-border, #e0e0e0);
  overflow: hidden; margin-top: 4px; width: 100%;
}
.tile-progress-fill { height: 100%; border-radius: 2px; background: #3b82f6; transition: width 0.5s ease; }

.added-tag {
  font-size: 0.7rem; font-weight: 600; color: #16a34a;
  background: rgba(34,197,94,0.12); border-radius: 4px; padding: 0.15rem 0.4rem;
}
</style>
