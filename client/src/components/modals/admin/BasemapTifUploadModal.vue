<template>
  <Transition name="fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="onClose">
      <div class="modal-content">
        <header class="modal-header">
          <h3>Upload TIF as Base Layer</h3>
          <button class="close-btn" @click="onClose" title="Close">✕</button>
        </header>

        <div class="modal-body">

          <!-- ── Step 1: File selection ───────────────────────────────────── -->
          <template v-if="step === 'upload'">
            <div
              class="drop-zone"
              :class="{ 'drop-zone-over': isDragging }"
              @dragover.prevent="isDragging = true"
              @dragleave="isDragging = false"
              @drop.prevent="onDrop"
            >
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <p class="drop-hint">Drag & drop a GeoTIFF here, or</p>
              <label class="btn-pick">
                Choose File
                <input type="file" accept=".tif,.tiff" style="display:none" @change="onFileInput" />
              </label>
            </div>

            <p v-if="selectedFile" class="selected-name">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              {{ selectedFile.name }}
            </p>
            <p v-if="uploadError" class="field-error">{{ uploadError }}</p>

            <div class="modal-footer">
              <button class="btn-secondary" @click="onClose">Cancel</button>
              <button class="btn-primary" :disabled="!selectedFile || uploading" @click="doUpload">
                <span v-if="uploading">
                  <svg class="spin" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 2a10 10 0 0110 10" opacity="0.3"/><path d="M12 2a10 10 0 000 20a10 10 0 0010-10"/></svg>
                  Uploading…
                </span>
                <span v-else>Upload &amp; Analyze</span>
              </button>
            </div>
          </template>

          <!-- ── Step 2: Configure ────────────────────────────────────────── -->
          <template v-else-if="step === 'configure'">
            <div class="meta-pills">
              <span class="pill">{{ meta.originalName }}</span>
              <span v-if="meta.size" class="pill">{{ meta.size[0] }} × {{ meta.size[1] }} px</span>
              <span v-if="meta.detectedCrs" class="pill">{{ meta.detectedCrs }}</span>
            </div>

            <div class="field-group">
              <label>Name <span class="required">*</span></label>
              <input v-model="form.name" type="text" placeholder="My Basemap" />
            </div>

            <div class="field-group">
              <label>Attribution</label>
              <input v-model="form.attribution" type="text" placeholder="© Data Source" />
            </div>

            <div class="field-row">
              <div class="field-group field-sm">
                <label>
                  Source EPSG
                  <span class="label-hint">(override if wrong/missing)</span>
                </label>
                <input v-model.number="form.sourceEpsg" type="number" min="1" placeholder="e.g. 4326" />
              </div>
            </div>

            <div class="field-row">
              <div class="field-group field-xs">
                <label>Min zoom</label>
                <input v-model.number="form.minZoom" type="number" min="0" max="18" step="1" />
              </div>
              <div class="field-group field-xs">
                <label>Max zoom</label>
                <input v-model.number="form.maxZoom" type="number" min="0" max="20" step="1" />
              </div>
              <div class="field-group">
                <label>Resampling</label>
                <select v-model="form.resampling">
                  <option value="bilinear">Bilinear (recommended)</option>
                  <option value="nearest">Nearest neighbour</option>
                  <option value="cubic">Cubic</option>
                  <option value="cubicspline">Cubic Spline</option>
                  <option value="lanczos">Lanczos</option>
                </select>
              </div>
            </div>

            <div class="field-group">
              <label>Tile format</label>
              <div class="radio-row">
                <label class="radio-label">
                  <input type="radio" v-model="form.format" value="PNG" />
                  PNG <span class="radio-hint">— supports transparency</span>
                </label>
                <label class="radio-label">
                  <input type="radio" v-model="form.format" value="JPEG" />
                  JPEG <span class="radio-hint">— smaller files, no transparency</span>
                </label>
              </div>
            </div>

            <div class="estimate-box" :class="{ 'estimate-warn': form.maxZoom > 16 }">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>
              <span>Estimated disk usage: <strong>{{ diskEstimate }}</strong></span>
              <span v-if="form.maxZoom > 16" class="warn-tag">⚠ zoom &gt;16 can generate very large tile sets</span>
            </div>

            <p v-if="generateError" class="field-error">{{ generateError }}</p>

            <div class="modal-footer">
              <button class="btn-secondary" @click="step = 'upload'">Back</button>
              <button class="btn-primary" :disabled="!form.name || generating" @click="doGenerate">
                <span v-if="generating">
                  <svg class="spin" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 2a10 10 0 0110 10" opacity="0.3"/><path d="M12 2a10 10 0 000 20a10 10 0 0010-10"/></svg>
                  Starting…
                </span>
                <span v-else>Generate Tiles</span>
              </button>
            </div>
          </template>

          <!-- ── Step 3: Progress / Done ──────────────────────────────────── -->
          <template v-else-if="step === 'progress'">
            <div class="progress-header">
              <p class="progress-name">{{ liveStatus.name }}</p>
              <p class="progress-detail">
                zoom {{ liveStatus.minZoom }}–{{ liveStatus.maxZoom }}
                &nbsp;·&nbsp; {{ liveStatus.format }}
                &nbsp;·&nbsp; {{ liveStatus.resampling }}
              </p>
            </div>

            <!-- Generating -->
            <template v-if="liveStatus.status === 'tiling'">
              <div class="progress-bar-wrap">
                <div class="progress-bar-labels">
                  <span>Generating tiles…</span>
                  <span>{{ liveStatus.progress }}%</span>
                </div>
                <div class="progress-track">
                  <div class="progress-fill" :style="{ width: liveStatus.progress + '%' }" />
                </div>
              </div>
              <p class="progress-note">
                This may take several minutes depending on zoom range and file size.
                You can close this dialog — the job will continue in the background.
              </p>
            </template>

            <!-- Done -->
            <template v-else-if="liveStatus.status === 'ready'">
              <div class="result-box result-success">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <div>
                  <p class="result-title">Tiles generated successfully</p>
                  <p class="result-url">{{ liveStatus.tileUrl }}</p>
                </div>
              </div>
            </template>

            <!-- Error -->
            <template v-else-if="liveStatus.status === 'error'">
              <div class="result-box result-error">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                <div>
                  <p class="result-title">Tile generation failed</p>
                  <p class="result-url">{{ liveStatus.error }}</p>
                </div>
              </div>
            </template>

            <div class="modal-footer">
              <button class="btn-secondary" @click="onClose">Close</button>
              <button v-if="liveStatus.status === 'ready'" class="btn-primary" @click="doAdd">
                Add as Basemap
              </button>
              <button v-if="liveStatus.status === 'error'" class="btn-secondary" @click="step = 'configure'">
                Retry
              </button>
            </div>
          </template>

        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue';

const props = defineProps({
  isOpen:     { type: Boolean, required: true },
  authHeader: { type: String,  default: '' },
});

const emit = defineEmits(['close', 'added']);

// ── State ──────────────────────────────────────────────────────────────────────
const step         = ref('upload');
const isDragging   = ref(false);
const selectedFile = ref(null);
const uploading    = ref(false);
const uploadError  = ref('');
const meta         = ref(null);   // probe response
const generating   = ref(false);
const generateError = ref('');
const liveStatus   = ref(null);   // polled status during/after generation

const form = ref({
  name:        '',
  attribution: '',
  sourceEpsg:  null,
  minZoom:     1,
  maxZoom:     14,
  resampling:  'bilinear',
  format:      'PNG',
});

let pollTimer = null;

// ── File selection ──────────────────────────────────────────────────────────────
function onFileInput(e) {
  const f = e.target.files?.[0];
  if (f) selectFile(f);
}

function onDrop(e) {
  isDragging.value = false;
  const f = e.dataTransfer.files?.[0];
  if (!f) return;
  const ext = f.name.split('.').pop().toLowerCase();
  if (ext !== 'tif' && ext !== 'tiff') {
    uploadError.value = 'Only .tif and .tiff files are accepted.';
    return;
  }
  selectFile(f);
}

function selectFile(f) {
  selectedFile.value = f;
  uploadError.value  = '';
}

// ── Upload & probe ──────────────────────────────────────────────────────────────
async function doUpload() {
  if (!selectedFile.value) return;
  uploading.value  = true;
  uploadError.value = '';

  const fd = new FormData();
  fd.append('file', selectedFile.value);

  try {
    const res = await fetch('/admin/basemap-tiles/probe', {
      method: 'POST',
      headers: { Authorization: props.authHeader },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');

    meta.value = data;
    form.value.name        = data.name || '';
    form.value.attribution = data.attribution || '';
    form.value.sourceEpsg  = data.detectedEpsg || null;
    step.value = 'configure';
  } catch (err) {
    uploadError.value = err.message;
  } finally {
    uploading.value = false;
  }
}

// ── Disk estimate ───────────────────────────────────────────────────────────────
function estimateTileCount(bboxWgs84, minZoom, maxZoom) {
  if (!bboxWgs84) return null;
  const [minLon, minLat, maxLon, maxLat] = bboxWgs84;
  let total = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const n    = Math.pow(2, z);
    const x1   = Math.floor((minLon + 180) / 360 * n);
    const x2   = Math.floor((maxLon + 180) / 360 * n);
    const latY = (lat) => {
      const rad = lat * Math.PI / 180;
      return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * n);
    };
    const y1 = latY(maxLat);
    const y2 = latY(minLat);
    total += Math.max(1, x2 - x1 + 1) * Math.max(1, y2 - y1 + 1);
  }
  return total;
}

function fmtBytes(b) {
  if (b < 1024 * 1024)            return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024)    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const diskEstimate = computed(() => {
  const tiles = estimateTileCount(meta.value?.bboxWgs84, form.value.minZoom, form.value.maxZoom);
  if (tiles === null) return 'Unknown (no geographic extent detected)';
  const avgBytes = form.value.format === 'JPEG' ? 8_000 : 22_000;
  return `~${fmtBytes(tiles * avgBytes)} (${tiles.toLocaleString()} tiles)`;
});

// ── Generate tiles ──────────────────────────────────────────────────────────────
async function doGenerate() {
  if (!meta.value) return;
  generating.value   = true;
  generateError.value = '';

  try {
    const res = await fetch(`/admin/basemap-tiles/${meta.value.id}/generate`, {
      method:  'POST',
      headers: { Authorization: props.authHeader, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name:        form.value.name,
        attribution: form.value.attribution,
        sourceEpsg:  form.value.sourceEpsg || null,
        minZoom:     form.value.minZoom,
        maxZoom:     form.value.maxZoom,
        resampling:  form.value.resampling,
        format:      form.value.format,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start generation');

    liveStatus.value = { ...meta.value, status: 'tiling', progress: 0 };
    step.value = 'progress';
    startPolling(meta.value.id);
  } catch (err) {
    generateError.value = err.message;
  } finally {
    generating.value = false;
  }
}

// ── Status polling ──────────────────────────────────────────────────────────────
function startPolling(id) {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const res  = await fetch(`/admin/basemap-tiles/${id}/status`, {
        headers: { Authorization: props.authHeader },
      });
      const data = await res.json();
      if (!res.ok) return;
      liveStatus.value = data;
      if (data.status !== 'tiling') stopPolling();
    } catch { /* ignore network hiccups */ }
  }, 2000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ── Add as basemap ──────────────────────────────────────────────────────────────
function doAdd() {
  if (!liveStatus.value?.tileUrl) return;
  const entry = {
    name:        liveStatus.value.name,
    type:        'tile',
    url:         liveStatus.value.tileUrl,
    attribution: liveStatus.value.attribution || '',
    visible:     false,
    order:       0,
    tileSize:    256,
  };
  emit('added', entry, liveStatus.value.id);
  onClose();
}

// ── Modal lifecycle ─────────────────────────────────────────────────────────────
function onClose() {
  stopPolling();
  emit('close');
}

function reset() {
  stopPolling();
  step.value         = 'upload';
  selectedFile.value = null;
  uploadError.value  = '';
  meta.value         = null;
  generating.value   = false;
  generateError.value = '';
  liveStatus.value   = null;
  form.value = { name: '', attribution: '', sourceEpsg: null, minZoom: 1, maxZoom: 14, resampling: 'bilinear', format: 'PNG' };
}

watch(() => props.isOpen, (v) => { if (v) reset(); });
onBeforeUnmount(stopPolling);
</script>

<style scoped>
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.modal-content {
  background: var(--admin-surface, #fff); border-radius: 10px;
  width: min(520px, 96vw); max-height: 92vh; overflow-y: auto;
  box-shadow: 0 8px 40px rgba(0,0,0,0.22);
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1.2rem 0.75rem; border-bottom: 1px solid var(--admin-border, #e0e0e0);
}
.modal-header h3 { margin: 0; font-size: 0.95rem; font-weight: 600; }
.close-btn {
  background: none; border: none; font-size: 1rem; cursor: pointer;
  color: var(--admin-muted, #777); line-height: 1; padding: 2px 4px;
}
.close-btn:hover { color: var(--admin-text, #1a1a1a); }

.modal-body  { padding: 1.1rem 1.2rem; display: flex; flex-direction: column; gap: 0.85rem; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 0.5rem;
  padding-top: 0.75rem; border-top: 1px solid var(--admin-border, #e0e0e0); margin-top: 0.5rem;
}

/* ── Drop zone ── */
.drop-zone {
  border: 2px dashed var(--admin-border, #d1d5db); border-radius: 8px;
  padding: 2rem 1.5rem; display: flex; flex-direction: column; align-items: center;
  gap: 0.6rem; cursor: default; transition: border-color 0.15s, background 0.15s;
  color: var(--admin-muted, #888);
}
.drop-zone-over { border-color: #3b82f6; background: rgba(59,130,246,0.05); }
.drop-hint { margin: 0; font-size: 0.83rem; }

.btn-pick {
  padding: 0.35rem 0.9rem; border-radius: 6px; background: #3b82f6;
  color: #fff; border: none; font-size: 0.8rem; font-weight: 500; cursor: pointer;
}
.btn-pick:hover { background: #2563eb; }

.selected-name {
  display: flex; align-items: center; gap: 0.4rem;
  font-size: 0.8rem; color: var(--admin-text, #333);
  background: var(--admin-bg, #f3f4f6); border-radius: 5px; padding: 0.3rem 0.6rem; margin: 0;
}

/* ── Configure ── */
.meta-pills { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.pill {
  font-size: 0.72rem; padding: 0.15rem 0.5rem; border-radius: 99px;
  background: var(--admin-bg, #f3f4f6); color: var(--admin-muted, #666);
  border: 1px solid var(--admin-border, #e0e0e0);
}

.field-group  { display: flex; flex-direction: column; gap: 0.25rem; }
.field-row    { display: flex; gap: 0.65rem; flex-wrap: wrap; }
.field-sm     { min-width: 160px; flex: 1; }
.field-xs     { width: 80px; min-width: 80px; flex-shrink: 0; }

.field-group label { font-size: 0.78rem; font-weight: 500; color: var(--admin-text, #333); }
.label-hint { font-size: 0.71rem; font-weight: 400; color: var(--admin-muted, #999); }

.field-group input,
.field-group select {
  padding: 0.35rem 0.5rem; border: 1px solid var(--admin-input-border, #ccc);
  border-radius: 5px; font-size: 0.82rem; background: var(--admin-input-bg, #fff);
  color: var(--admin-text, #1a1a1a);
}
.field-group input:focus,
.field-group select:focus { outline: 2px solid #3b82f6; border-color: transparent; }

.radio-row   { display: flex; gap: 1rem; flex-wrap: wrap; }
.radio-label { display: flex; align-items: center; gap: 0.4rem; font-size: 0.82rem; cursor: pointer; }
.radio-hint  { font-size: 0.72rem; color: var(--admin-muted, #999); }

.estimate-box {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.7rem; border-radius: 6px; font-size: 0.8rem;
  background: var(--admin-bg, #f3f4f6); border: 1px solid var(--admin-border, #e0e0e0);
  color: var(--admin-text, #333);
}
.estimate-warn {
  border-color: rgba(217,119,6,0.35); background: rgba(217,119,6,0.07); color: #92400e;
}
.warn-tag { font-size: 0.74rem; font-weight: 500; }

/* ── Progress ── */
.progress-header { margin-bottom: 0.25rem; }
.progress-name   { margin: 0; font-weight: 600; font-size: 0.88rem; }
.progress-detail { margin: 0.15rem 0 0; font-size: 0.75rem; color: var(--admin-muted, #777); }

.progress-bar-wrap { display: flex; flex-direction: column; gap: 0.3rem; }
.progress-bar-labels { display: flex; justify-content: space-between; font-size: 0.78rem; }
.progress-track { height: 8px; border-radius: 4px; background: var(--admin-border, #e0e0e0); overflow: hidden; }
.progress-fill  { height: 100%; border-radius: 4px; background: #3b82f6; transition: width 0.4s ease; }
.progress-note  { margin: 0; font-size: 0.75rem; color: var(--admin-muted, #888); }

.result-box {
  display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem 0.9rem;
  border-radius: 7px; border: 1px solid;
}
.result-success { background: rgba(34,197,94,0.07); border-color: rgba(34,197,94,0.3); color: #166534; }
.result-error   { background: rgba(239,68,68,0.07);  border-color: rgba(239,68,68,0.3); color: #991b1b; }
.result-title   { margin: 0; font-weight: 600; font-size: 0.85rem; }
.result-url     { margin: 0.2rem 0 0; font-size: 0.72rem; font-family: monospace; word-break: break-all; }

/* ── Shared ── */
.field-error { color: #ef4444; font-size: 0.78rem; margin: 0; }

.btn-primary {
  padding: 0.4rem 1rem; border-radius: 6px; background: #3b82f6;
  color: #fff; border: none; font-size: 0.82rem; font-weight: 500; cursor: pointer;
  display: flex; align-items: center; gap: 0.4rem;
}
.btn-primary:hover:not(:disabled) { background: #2563eb; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-secondary {
  padding: 0.4rem 0.9rem; border-radius: 6px;
  background: var(--admin-bg, #f3f4f6); color: var(--admin-text, #333);
  border: 1px solid var(--admin-border, #d1d5db); font-size: 0.82rem; font-weight: 500; cursor: pointer;
}
.btn-secondary:hover { background: var(--admin-border, #e5e7eb); }

@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.8s linear infinite; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from,  .fade-leave-to      { opacity: 0; }
</style>
