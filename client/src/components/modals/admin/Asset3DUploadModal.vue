<template>
  <Transition name="fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('cancel')">
      <div class="modal-content">

        <header class="modal-header">
          <h3>Configure 3D Asset Upload</h3>
          <button class="close-btn" title="Close" @click="$emit('cancel')">
            <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
            </svg>
          </button>
        </header>

        <div class="modal-body">
          <div v-for="(fs, i) in fileSettings" :key="fs.name + i" class="file-entry">

            <!-- File info row -->
            <div class="file-entry-header">
              <span class="file-type-badge" :class="badgeClass(fs.name)">{{ extLabel(fs.name) }}</span>
              <span class="file-entry-name" :title="fs.name">{{ fs.name }}</span>
              <span class="file-entry-size">{{ formatSize(fs.size) }}</span>
            </div>

            <!-- ── Point cloud settings ── -->
            <template v-if="isPointcloud(fs.name)">
              <div class="file-card-settings">

                <div class="field-group">
                  <label>
                    Format
                    <FieldHint text="Save original keeps the file as uploaded. Convert to COPC (Cloud Optimised Point Cloud) restructures it for progressive streaming — requires PDAL on the server." />
                  </label>
                  <div class="seg-control">
                    <label class="seg-option">
                      <input type="radio" v-model="fs.optimize" value="" />
                      <span>Save original</span>
                    </label>
                    <label class="seg-option" :class="{ 'seg-option--disabled': !pdalAvailable }" :title="!pdalAvailable ? 'PDAL is not installed on the server' : undefined">
                      <input type="radio" v-model="fs.optimize" value="copc" :disabled="!pdalAvailable" />
                      <span>Convert to COPC</span>
                    </label>
                  </div>
                  <p v-if="!pdalAvailable" class="lib-warning">PDAL is not installed on the server — COPC conversion is unavailable.</p>
                </div>

                <div class="field-group">
                  <label>
                    Source CRS
                    <FieldHint text="EPSG code of the coordinate system the point cloud is stored in (e.g. EPSG:4326 for WGS-84 lon/lat). Stored as metadata — used by COPC conversion and future reprojection." />
                  </label>
                  <input v-model="fs.sourceCrs" type="text" placeholder="e.g. EPSG:4326" class="input-narrow" />
                </div>

                <div class="field-group field-toggle-row" :class="{ 'field-disabled': !fs.optimize }">
                  <label>
                    Keep copy of original
                    <FieldHint text="Retain the original LAS/LAZ file alongside the COPC output. Only applies when Convert to COPC is selected." />
                  </label>
                  <div class="toggle-switch">
                    <input :id="`keep-pc-${i}`" v-model="fs.keepOriginal" type="checkbox" :disabled="!fs.optimize" />
                    <label :for="`keep-pc-${i}`" class="slider"></label>
                  </div>
                </div>

              </div>
            </template>

            <!-- ── 3D model note ── -->
            <template v-else-if="isModel(fs.name)">
              <p class="model-note">
                3D models are stored and served as uploaded.
                Geometry decimation (for large OBJ/PLY files) requires external tools
                (MeshLab or Blender) installed on the server — not available yet in this panel.
              </p>
            </template>

            <!-- ── Companion file note ── -->
            <template v-else>
              <p class="model-note companion-note">
                Companion file — will be processed automatically alongside its parent model.
              </p>
            </template>

          </div>
        </div>

        <footer class="modal-footer">
          <button class="btn-secondary" @click="$emit('cancel')">Cancel</button>
          <button class="btn-primary" @click="confirm">Upload &amp; Process</button>
        </footer>

      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch } from 'vue';
import FieldHint from '../../ui/FieldHint.vue';

const props = defineProps({
  isOpen:        Boolean,
  files:         { type: Array,    default: () => [] },
  pdalAvailable: { type: Boolean,  default: true },
});

const emit = defineEmits(['confirm', 'cancel']);

// ── File type helpers ──────────────────────────────────────────────────────────

const POINTCLOUD_EXTS = new Set(['.las', '.laz']);
const MODEL_EXTS      = new Set(['.obj', '.ply', '.stl']);
const COMPANION_EXTS  = new Set(['.mtl', '.jpg', '.jpeg', '.png', '.bmp', '.tga', '.gif', '.webp']);

function extOf(name) {
  return '.' + name.toLowerCase().split('.').pop();
}

function isPointcloud(name) {
  const lower = name.toLowerCase();
  return lower.endsWith('.copc.laz') || POINTCLOUD_EXTS.has(extOf(lower));
}

function isModel(name) {
  return MODEL_EXTS.has(extOf(name.toLowerCase()));
}

function extLabel(name) {
  const e = extOf(name).replace('.', '').toUpperCase();
  return e || '?';
}

function badgeClass(name) {
  if (isPointcloud(name))                    return 'badge-pointcloud';
  if (MODEL_EXTS.has(extOf(name)))           return 'badge-model';
  if (COMPANION_EXTS.has(extOf(name)))       return 'badge-companion';
  return 'badge-other';
}

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Per-file settings ──────────────────────────────────────────────────────────

const fileSettings = ref([]);

watch(() => [props.files, props.pdalAvailable], ([files]) => {
  fileSettings.value = files.map(f => ({
    name:         f.name,
    size:         f.size,
    optimize:     isPointcloud(f.name) && props.pdalAvailable ? 'copc' : '',
    sourceCrs:    '',
    keepOriginal: false,
  }));
}, { immediate: true, deep: false });

// ── Confirm ────────────────────────────────────────────────────────────────────

function confirm() {
  const settings = {};
  for (const s of fileSettings.value) {
    settings[s.name] = {
      optimize:     s.optimize || undefined,
      sourceCrs:    s.sourceCrs?.trim()  || undefined,
      keepOriginal: s.keepOriginal,
    };
  }
  emit('confirm', settings);
}
</script>

<style scoped>
/* ── Modal shell ──────────────────────────────────────────────────────────────── */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 1rem;
}
.modal-content {
  background: var(--admin-surface, #fff);
  color: var(--admin-text, #1a1a1a);
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 10px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.2);
  width: min(600px, 100%);
  display: flex; flex-direction: column;
  max-height: 90vh;
  font-family: "Segoe UI", system-ui, sans-serif;
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--admin-border, #e0e0e0);
  flex-shrink: 0;
}
.modal-header h3 { margin: 0; font-size: 1rem; font-weight: 600; }
.close-btn {
  background: transparent; border: none; cursor: pointer;
  color: var(--admin-muted, #777); padding: 0.25rem 0.5rem;
  border-radius: 4px; transition: background 0.15s, color 0.15s;
  display: flex; align-items: center;
}
.close-btn:hover { background: var(--admin-bg, #f3f4f6); color: var(--admin-text, #1a1a1a); }
.modal-body {
  overflow-y: auto;
  padding: 1rem 1.25rem;
  display: flex; flex-direction: column; gap: 0.75rem;
  flex: 1;
}
.modal-footer {
  display: flex; justify-content: flex-end; gap: 0.6rem;
  padding: 0.85rem 1.25rem;
  border-top: 1px solid var(--admin-border, #e0e0e0);
  flex-shrink: 0;
}

/* ── Buttons ─────────────────────────────────────────────────────────────────── */
.btn-primary {
  padding: 0.45rem 1.1rem;
  background: #3b82f6; color: #fff;
  border: none; border-radius: 6px;
  font-size: 0.85rem; font-weight: 500;
  cursor: pointer; font-family: "Segoe UI", sans-serif;
  transition: background 0.15s;
}
.btn-primary:hover { background: #2563eb; }
.btn-secondary {
  padding: 0.45rem 1rem;
  background: var(--admin-bg, #f3f4f6);
  color: var(--admin-text, #1a1a1a);
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 6px; font-size: 0.85rem; font-weight: 500;
  cursor: pointer; font-family: "Segoe UI", sans-serif;
  transition: background 0.15s;
}
.btn-secondary:hover { background: var(--admin-border, #e0e0e0); }

/* ── File entry ──────────────────────────────────────────────────────────────── */
.file-entry { display: flex; flex-direction: column; gap: 0; }
.file-entry + .file-entry {
  border-top: 1px solid var(--admin-border, #e0e0e0);
  padding-top: 0.75rem;
  margin-top: 0.25rem;
}
.file-entry-header {
  display: flex; align-items: center; gap: 0.55rem;
  margin-bottom: 0.65rem;
}
.file-entry-name {
  flex: 1; font-size: 0.85rem; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.file-entry-size { font-size: 0.75rem; color: var(--admin-muted, #777); white-space: nowrap; }
.file-card-settings { display: flex; flex-direction: column; gap: 0.7rem; }

/* ── Type badges ─────────────────────────────────────────────────────────────── */
.file-type-badge {
  font-size: 0.64rem; font-weight: 700; letter-spacing: .06em;
  padding: 0.15rem 0.4rem; border-radius: 4px;
  text-transform: uppercase; white-space: nowrap; flex-shrink: 0;
}
.badge-model      { background: #ede9fe; color: #6d28d9; }
.badge-companion  { background: #fef3c7; color: #92400e; }
.badge-pointcloud { background: #e0f2fe; color: #0369a1; }
.badge-other      { background: var(--admin-bg, #f3f4f6); color: var(--admin-muted, #777); }
:global(body.theme-dark) .badge-model      { background: #3b2a6e; color: #c4b5fd; }
:global(body.theme-dark) .badge-companion  { background: #3d2a0a; color: #fbbf24; }
:global(body.theme-dark) .badge-pointcloud { background: #1a3a4d; color: #38bdf8; }

/* ── Form fields ─────────────────────────────────────────────────────────────── */
.field-group { display: flex; flex-direction: column; gap: 0.3rem; }
.field-group label:not(.slider) {
  font-size: 0.8rem; font-weight: 500;
  color: var(--admin-text, #1a1a1a);
  display: flex; align-items: center; gap: 0.3rem;
}
.field-group input[type="text"] {
  padding: 0.45rem 0.65rem;
  border: 1px solid var(--admin-input-border, #ccc);
  border-radius: 6px;
  background: var(--admin-input-bg, #fff);
  color: var(--admin-text, #1a1a1a);
  font-size: 0.875rem;
  font-family: "Segoe UI", sans-serif;
  width: 100%;
}
.field-group input[type="text"]:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
}
.input-narrow { max-width: 180px !important; }
.field-toggle-row {
  flex-direction: row !important;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem !important;
}
.field-toggle-row label:not(.slider) { flex: 1; }
.field-disabled { opacity: 0.4; pointer-events: none; }

/* ── Segmented radio ─────────────────────────────────────────────────────────── */
.seg-control {
  display: flex;
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 6px;
  overflow: hidden;
  max-width: 360px;
}
.seg-option {
  flex: 1;
  display: flex; align-items: center; justify-content: center;
  padding: 0.38rem 0.5rem;
  cursor: pointer;
  font-size: 0.82rem; font-weight: 500;
  color: var(--admin-muted, #777);
  background: var(--admin-input-bg, #fff);
  transition: background 0.15s, color 0.15s;
  user-select: none; text-align: center; white-space: nowrap;
}
.seg-option + .seg-option { border-left: 1px solid var(--admin-border, #e0e0e0); }
.seg-option input[type="radio"] { display: none; }
.seg-option:has(input:checked) { background: #3b82f6; color: #fff; }
.seg-option--disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }
.lib-warning {
  margin: 0.3rem 0 0;
  font-size: 0.75rem;
  color: #b45309;
  background: #fef3c7;
  border-radius: 4px;
  padding: 0.3rem 0.55rem;
}
:global(body.theme-dark) .lib-warning {
  color: #fbbf24;
  background: #2a1f06;
}

/* ── Toggle switch ───────────────────────────────────────────────────────────── */
.toggle-switch { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
.toggle-switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute; inset: 0;
  background: var(--admin-border, #ccc);
  border-radius: 20px; cursor: pointer;
  transition: background 0.2s;
}
.slider::before {
  content: '';
  position: absolute;
  width: 14px; height: 14px; left: 3px; bottom: 3px;
  background: #fff; border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s cubic-bezier(.4, 0, .2, 1);
}
.toggle-switch input:checked + .slider { background: #3b82f6; }
.toggle-switch input:checked + .slider::before { transform: translateX(16px); }

/* ── Model note ──────────────────────────────────────────────────────────────── */
.model-note {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--admin-muted, #777);
  background: var(--admin-bg, #f3f4f6);
  border-radius: 6px;
  padding: 0.55rem 0.75rem;
}
.companion-note {
  color: #92400e;
  background: #fef9ee;
}
:global(body.theme-dark) .companion-note {
  color: #fbbf24;
  background: #2a1f06;
}

/* ── Transition ─────────────────────────────────────────────────────────────── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
