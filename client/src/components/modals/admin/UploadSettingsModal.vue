<template>
  <Transition name="fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('cancel')">
      <div class="modal-content">

        <header class="modal-header">
          <h3>Configure Upload</h3>
          <button class="close-btn" title="Close" @click="$emit('cancel')">
            <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="1" y1="1" x2="13" y2="13" /><line x1="13" y1="1" x2="1" y2="13" />
            </svg>
          </button>
        </header>

        <div class="modal-body">
          <div v-for="(fs, i) in fileSettings" :key="fs.name + i" class="file-entry">

            <!-- File info row -->
            <div class="file-entry-header">
              <span class="file-type-badge" :class="extClass(fs.name)">{{ extLabel(fs.name) }}</span>
              <span class="file-entry-name">{{ fs.name }}</span>
              <span class="file-entry-size">{{ formatSize(fs.size) }}</span>
            </div>

            <!-- Companion: no settings -->
            <template v-if="isCompanion(fs.name)">
              <p class="companion-note">Companion file &mdash; processed automatically with its parent.</p>
            </template>

            <!-- Primary file settings -->
            <template v-else>
              <div class="file-card-settings">

                <!-- GeoTIFF -->
                <template v-if="isGeoTiff(fs.name)">
                  <div class="field-group">
                    <label>No-data value <FieldHint text="Pixel value to treat as transparent / missing data (e.g. 0 or -9999). Leave blank to auto-detect from the source file." /></label>
                    <input v-model="fs.cogNodata" type="text" placeholder="e.g. -9999" class="input-narrow" />
                  </div>
                  <div class="field-group">
                    <label>Source CRS <FieldHint text="EPSG code of the projection embedded in the file. Auto-detected from metadata — override only if it is wrong or missing." /></label>
                    <div class="crs-row">
                      <input v-model="fs.cogCrs" type="text" placeholder="e.g. EPSG:4326" class="input-narrow" />
                      <span v-if="fs.cogCrsDetecting" class="crs-badge detecting">Detecting…</span>
                      <span v-else-if="fs.cogCrsDetected" class="crs-badge detected">Auto-detected</span>
                    </div>
                  </div>
                  <div class="field-group">
                    <label>Format <FieldHint text="Save original keeps the file exactly as uploaded. Save optimized converts to Cloud Optimised GeoTIFF (COG) for efficient tile streaming — runs in the background." /></label>
                    <div class="seg-control">
                      <label class="seg-option">
                        <input type="radio" v-model="fs.optimize" value="" />
                        <span>Save original</span>
                      </label>
                      <label class="seg-option">
                        <input type="radio" v-model="fs.optimize" value="cog" />
                        <span>Save optimized (COG)</span>
                      </label>
                    </div>
                  </div>
                  <div class="cog-options" :class="{ 'cog-disabled': fs.optimize !== 'cog' }">
                    <div class="field-group">
                      <label>Compression <FieldHint text="LZW is lossless and fast (recommended for most rasters). DEFLATE gives slightly smaller files. ZSTD offers the best compression ratio (GDAL 3.x+)." /></label>
                      <div class="seg-control">
                        <label v-for="c in cogCompressions" :key="c.value" class="seg-option">
                          <input type="radio" v-model="fs.cogCompression" :value="c.value" :disabled="fs.optimize !== 'cog'" />
                          <span>{{ c.label }}</span>
                        </label>
                      </div>
                    </div>
                    <div class="field-group">
                      <label>Resampling <FieldHint text="Nearest preserves exact values (categorical data). Bilinear and Cubic produce smoother results for continuous rasters." /></label>
                      <div class="seg-control">
                        <label v-for="r in resamplingMethods" :key="r.value" class="seg-option">
                          <input type="radio" v-model="fs.cogResampling" :value="r.value" :disabled="fs.optimize !== 'cog'" />
                          <span>{{ r.label }}</span>
                        </label>
                      </div>
                    </div>
                    <div class="field-group">
                      <label>Tile size <FieldHint text="Internal tile dimensions in pixels. 256 is standard; 512 reduces HTTP requests but increases the initial tile payload." /></label>
                      <div class="seg-control seg-control-sm">
                        <label v-for="s in cogTileSizes" :key="s" class="seg-option">
                          <input type="radio" v-model="fs.cogTileSize" :value="s" :disabled="fs.optimize !== 'cog'" />
                          <span>{{ s }}</span>
                        </label>
                      </div>
                    </div>
                  </div>
                  <div class="field-group field-toggle-row" :class="{ 'toggle-row-disabled': !fs.optimize }">
                    <label>Keep copy of original <FieldHint text="Retain the original file on the server alongside the COG version." /></label>
                    <div class="toggle-switch">
                      <input :id="`keep-${i}`" v-model="fs.keepOriginal" type="checkbox" :disabled="!fs.optimize" />
                      <label :for="`keep-${i}`" class="slider"></label>
                    </div>
                  </div>
                </template>

                <!-- Point cloud -->
                <template v-if="isPointcloud(fs.name)">
                  <div class="field-group">
                    <label>Format <FieldHint text="Save original keeps the file as uploaded. Save optimized converts to COPC (Cloud Optimised Point Cloud) for progressive streaming — runs in the background." /></label>
                    <div class="seg-control">
                      <label class="seg-option">
                        <input type="radio" v-model="fs.optimize" value="" />
                        <span>Save original</span>
                      </label>
                      <label class="seg-option">
                        <input type="radio" v-model="fs.optimize" value="copc" />
                        <span>Save optimized (COPC)</span>
                      </label>
                    </div>
                  </div>
                  <div class="field-group field-toggle-row" :class="{ 'toggle-row-disabled': !fs.optimize }">
                    <label>Keep copy of original <FieldHint text="Retain the original file on the server alongside the COPC version." /></label>
                    <div class="toggle-switch">
                      <input :id="`keep-pc-${i}`" v-model="fs.keepOriginal" type="checkbox" :disabled="!fs.optimize" />
                      <label :for="`keep-pc-${i}`" class="slider"></label>
                    </div>
                  </div>
                </template>

                <!-- CSV -->
                <template v-if="isCsv(fs.name)">
                  <div class="field-group">
                    <label>X / Longitude <FieldHint text="Column that holds the X (longitude / easting) coordinate." /></label>
                    <select v-if="csvHeaders(fs.name).length" v-model="fs.csvSettings.xColumn">
                      <option value="">&mdash; select &mdash;</option>
                      <option v-for="h in csvHeaders(fs.name)" :key="h" :value="h">{{ h }}</option>
                    </select>
                    <input v-else v-model="fs.csvSettings.xColumn" type="text" placeholder="lon" />
                  </div>
                  <div class="field-group">
                    <label>Y / Latitude <FieldHint text="Column that holds the Y (latitude / northing) coordinate." /></label>
                    <select v-if="csvHeaders(fs.name).length" v-model="fs.csvSettings.yColumn">
                      <option value="">&mdash; select &mdash;</option>
                      <option v-for="h in csvHeaders(fs.name)" :key="h" :value="h">{{ h }}</option>
                    </select>
                    <input v-else v-model="fs.csvSettings.yColumn" type="text" placeholder="lat" />
                  </div>
                  <div class="field-group">
                    <label>CRS <FieldHint text="EPSG code of the X/Y coordinates." /></label>
                    <input v-model="fs.csvSettings.crs" type="text" placeholder="EPSG:4326" class="input-narrow" />
                  </div>
                </template>

                <!-- GeoJSON -->
                <template v-if="isGeoJson(fs.name)">
                  <div class="field-group">
                    <label>Source CRS <FieldHint text="EPSG code of the projection the file is already in. Leave blank to auto-detect from the file's CRS annotation (defaults to EPSG:4326 if not present)." /></label>
                    <div class="crs-row">
                      <input v-model="fs.shapeSettings.sourceCrs" type="text" placeholder="auto-detect" class="input-narrow" />
                      <span v-if="fs.shapeSettings.sourceCrsDetecting" class="crs-badge detecting">Detecting…</span>
                      <span v-else-if="fs.shapeSettings.sourceCrsDetected" class="crs-badge detected">Auto-detected</span>
                    </div>
                  </div>
                  <div class="field-group">
                    <label>Target CRS <FieldHint text="EPSG code to reproject to. Should match your map's CRS." /></label>
                    <input v-model="fs.shapeSettings.targetCrs" type="text" placeholder="EPSG:3031" class="input-narrow" />
                  </div>
                  <div class="field-group field-toggle-row">
                    <label>Simplify geometry <FieldHint text="Reduces vertex count (Douglas-Peucker). Shrinks file size but may lose detail." /></label>
                    <div class="toggle-switch">
                      <input :id="`simplify-${i}`" v-model="fs.doSimplify" type="checkbox" />
                      <label :for="`simplify-${i}`" class="slider"></label>
                    </div>
                  </div>
                  <div class="simplify-options" :class="{ 'simplify-disabled': !fs.doSimplify }">
                    <div class="field-group">
                      <label>Tolerance (m) <FieldHint text="Higher = more aggressive. Units in the target CRS (usually metres)." /></label>
                      <input v-model.number="fs.shapeSettings.simplifyTolerance" type="number" min="0" placeholder="50" class="input-narrow" />
                    </div>
                    <div class="field-group">
                      <label>Coord precision <FieldHint text="Decimal places to keep. 0 = round to whole units, 6 = full precision." /></label>
                      <input v-model.number="fs.shapeSettings.coordinatePrecision" type="number" min="0" max="10" placeholder="0" class="input-narrow" />
                    </div>
                  </div>
                  <div class="field-group">
                    <label>Format <FieldHint text="Save original stores a standard GeoJSON file after processing (reproject, simplify). Save optimized also converts to NDJSON (one feature per line) for efficient streaming of large datasets." /></label>
                    <div class="seg-control">
                      <label class="seg-option">
                        <input type="radio" v-model="fs.optimize" value="" />
                        <span>Save original</span>
                      </label>
                      <label class="seg-option">
                        <input type="radio" v-model="fs.optimize" value="ndjson" />
                        <span>Save optimized (NDJSON)</span>
                      </label>
                    </div>
                  </div>
                  <div class="field-group field-toggle-row" :class="{ 'toggle-row-disabled': !fs.optimize }">
                    <label>Keep copy of original <FieldHint text="Retain the raw uploaded file on the server alongside the processed NDJSON version." /></label>
                    <div class="toggle-switch">
                      <input :id="`keep-geo-${i}`" v-model="fs.keepOriginal" type="checkbox" :disabled="!fs.optimize" />
                      <label :for="`keep-geo-${i}`" class="slider"></label>
                    </div>
                  </div>
                </template>

              </div>
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
import { watch, ref } from 'vue';
import FieldHint from '../../ui/FieldHint.vue';
import { fromBlob } from 'geotiff';

const props = defineProps({
  isOpen: Boolean,
  files:  { type: Array, default: () => [] },
});

const emit = defineEmits(['confirm', 'cancel', 'remove']);

const GEOJSON_EXTS    = new Set(['.geojson', '.json']);
const GEOTIFF_EXTS    = new Set(['.tif', '.tiff']);
const POINTCLOUD_EXTS = new Set(['.las', '.laz']);
const CSV_EXTS        = new Set(['.csv']);
const COMPANION_EXTS  = new Set(['.mtl', '.jpg', '.jpeg', '.png', '.bmp', '.tga', '.gif', '.webp']);

const cogCompressions = [
  { value: 'lzw',     label: 'LZW' },
  { value: 'deflate', label: 'DEFLATE' },
  { value: 'zstd',    label: 'ZSTD' },
  { value: 'none',    label: 'None' },
];
const resamplingMethods = [
  { value: 'nearest',  label: 'Nearest' },
  { value: 'bilinear', label: 'Bilinear' },
  { value: 'cubic',    label: 'Cubic' },
  { value: 'none',     label: 'None' },
];
const cogTileSizes = [256, 512];

function extOf(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.copc.laz')) return '.copc.laz';
  return '.' + lower.split('.').pop();
}

function isGeoJson(name)    { return GEOJSON_EXTS.has(extOf(name)); }
function isGeoTiff(name)    { return GEOTIFF_EXTS.has(extOf(name)); }
function isPointcloud(name) { const e = extOf(name); return POINTCLOUD_EXTS.has(e) || e === '.copc.laz'; }
function isCsv(name)        { return CSV_EXTS.has(extOf(name)); }
function isCompanion(name)  { return COMPANION_EXTS.has(extOf(name)) || extOf(name) === '.mtl'; }

async function detectGeoTiffCrs(file) {
  try {
    const tiff = await fromBlob(file);
    const image = await tiff.getImage();
    const geoKeys = image.getGeoKeys();
    if (geoKeys.ProjectedCSTypeGeoKey) return `EPSG:${geoKeys.ProjectedCSTypeGeoKey}`;
    if (geoKeys.GeographicTypeGeoKey)  return `EPSG:${geoKeys.GeographicTypeGeoKey}`;
    return null;
  } catch { return null; }
}

async function detectGeoJsonCrs(file) {
  try {
    const text = await file.slice(0, 2048).text();
    const m = text.match(/"crs"\s*:\s*\{[^}]*?"name"\s*:\s*"([^"]+)"/s);
    if (!m) return null;
    const name = m[1];
    if (name.includes('CRS84')) return 'EPSG:4326';
    const colonMatch = name.match(/EPSG::?(\d+)/i);
    if (colonMatch) return `EPSG:${colonMatch[1]}`;
    const slashMatch = name.match(/\/EPSG\/\d+\/(\d+)/i);
    if (slashMatch) return `EPSG:${slashMatch[1]}`;
    return null;
  } catch { return null; }
}

const csvHeaderMap = ref({});

async function readCsvHeaders(file) {
  try {
    const text = await file.slice(0, 4096).text();
    const firstLine = text.split('\n')[0];
    const delim = firstLine.includes(';') ? ';' : ',';
    return firstLine.split(delim).map(h => h.trim().replace(/^"|"$/g, ''));
  } catch { return []; }
}

function csvHeaders(name) { return csvHeaderMap.value[name] ?? []; }

function guessXYColumns(headers) {
  const lower = headers.map(h => h.toLowerCase());
  const xGuess = headers[lower.findIndex(h => ['lon', 'lng', 'longitude', 'x', 'easting'].includes(h))] ?? '';
  const yGuess = headers[lower.findIndex(h => ['lat', 'latitude', 'y', 'northing'].includes(h))] ?? '';
  return { xGuess, yGuess };
}

const fileSettings = ref([]);

watch(() => props.files, async (files) => {
  csvHeaderMap.value = {};
  fileSettings.value = await Promise.all(files.map(async f => {
    let csvSettings = { xColumn: '', yColumn: '', crs: 'EPSG:4326' };
    if (isCsv(f.name)) {
      const headers = await readCsvHeaders(f);
      csvHeaderMap.value[f.name] = headers;
      const { xGuess, yGuess } = guessXYColumns(headers);
      csvSettings = { xColumn: xGuess, yColumn: yGuess, crs: 'EPSG:4326' };
    }
    return {
      name: f.name, size: f.size,
      optimize: isGeoTiff(f.name) ? 'cog' : '', keepOriginal: false,
      doSimplify: true,
      cogCompression: 'lzw',
      cogResampling: 'nearest',
      cogTileSize: 256,
      cogNodata: '',
      cogCrs: '',
      cogCrsDetecting: isGeoTiff(f.name),
      cogCrsDetected: false,
      csvSettings,
      shapeSettings: { sourceCrs: '', targetCrs: 'EPSG:3031', simplifyTolerance: 50, coordinatePrecision: 0, sourceCrsDetecting: isGeoJson(f.name), sourceCrsDetected: false },
    };
  }));

  // Run detections AFTER fileSettings.value is assigned so mutations hit the
  // reactive proxies Vue is tracking, not the original plain objects.
  files.forEach((f, i) => {
    if (isGeoTiff(f.name)) {
      detectGeoTiffCrs(f).then(crs => {
        fileSettings.value[i].cogCrsDetecting = false;
        if (crs) { fileSettings.value[i].cogCrs = crs; fileSettings.value[i].cogCrsDetected = true; }
      });
    }
    if (isGeoJson(f.name)) {
      detectGeoJsonCrs(f).then(crs => {
        fileSettings.value[i].shapeSettings.sourceCrsDetecting = false;
        if (crs) { fileSettings.value[i].shapeSettings.sourceCrs = crs; fileSettings.value[i].shapeSettings.sourceCrsDetected = true; }
      });
    }
  });
}, { immediate: true });

function confirm() {
  const settings = {};
  for (const s of fileSettings.value) {
    const entry = {
      visible:      true,
      optimize:     s.optimize || undefined,
      keepOriginal: s.optimize ? s.keepOriginal : false,
      csvSettings:  s.csvSettings,
      shapeSettings: {
        ...s.shapeSettings,
        sourceCrs:           s.shapeSettings.sourceCrs?.trim() || undefined,
        simplifyTolerance:   s.doSimplify ? s.shapeSettings.simplifyTolerance   : 0,
        coordinatePrecision: s.doSimplify ? s.shapeSettings.coordinatePrecision : 0,
      },
    };
    if (isGeoTiff(s.name)) {
      entry.cogOptions = {
        compression: s.cogCompression,
        resampling:  s.cogResampling,
        tileSize:    s.cogTileSize,
        ...(s.cogNodata.trim() !== '' ? { nodata: s.cogNodata.trim() } : {}),
        ...(s.cogCrs.trim()    !== '' ? { sourceCrs: s.cogCrs.trim() }  : {}),
      };
    }
    settings[s.name] = entry;
  }
  emit('confirm', settings);
}

function extLabel(name) {
  if (isCsv(name)) return 'CSV';
  const e = extOf(name).replace('.', '').toUpperCase();
  if (e === 'COPC.LAZ') return 'COPC';
  return e || '?';
}

function extClass(name) {
  if (isGeoJson(name))    return 'badge-geojson';
  if (isGeoTiff(name))    return 'badge-geotiff';
  if (isPointcloud(name)) return 'badge-pointcloud';
  if (isCsv(name))        return 'badge-csv';
  const e = extOf(name).replace('.', '');
  if (['obj', 'ply', 'stl'].includes(e)) return 'badge-model';
  return 'badge-companion';
}

function formatSize(bytes) {
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<style scoped>
/* -- Modal shell ----------------------------------------------- */
.modal-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  z-index: 1000;
  display: flex; align-items: center; justify-content: center;
  padding: 1rem;
}
.modal-content {
  background: var(--admin-surface, #fff);
  color: var(--admin-text, #1a1a1a);
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 10px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.2);
  width: min(700px, 100%);
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
  color: var(--admin-muted, #777); font-size: 1rem;
  padding: 0.25rem 0.5rem; border-radius: 4px;
  transition: background 0.15s, color 0.15s;
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

/* -- Buttons --------------------------------------------------- */
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

/* -- File entry ------------------------------------------------ */
.file-entry {
  display: flex; flex-direction: column; gap: 0;
}
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
.companion-note { font-size: 0.78rem; color: var(--admin-muted, #777); margin: 0; }

/* -- Type badges ----------------------------------------------- */
.file-type-badge {
  font-size: 0.64rem; font-weight: 700; letter-spacing: .06em;
  padding: 0.15rem 0.4rem; border-radius: 4px;
  text-transform: uppercase; white-space: nowrap; flex-shrink: 0;
}
.badge-geojson    { background: #dcfce7; color: #15803d; }
.badge-geotiff    { background: #dbeafe; color: #1d4ed8; }
.badge-model      { background: #ede9fe; color: #6d28d9; }
.badge-pointcloud { background: #e0f2fe; color: #0369a1; }
.badge-companion  { background: var(--admin-bg, #f3f4f6); color: var(--admin-muted, #777); }
.badge-csv        { background: #ffedd5; color: #c2410c; }
:global(body.theme-dark) .badge-geojson    { background: #1a4d2e; color: #4ade80; }
:global(body.theme-dark) .badge-geotiff    { background: #1e3a5f; color: #60a5fa; }
:global(body.theme-dark) .badge-model      { background: #3b2a6e; color: #c4b5fd; }
:global(body.theme-dark) .badge-pointcloud { background: #1a3a4d; color: #38bdf8; }
:global(body.theme-dark) .badge-csv        { background: #3d2b1a; color: #fb923c; }

/* -- Form fields ----------------------------------------------- */
.field-group { display: flex; flex-direction: column; gap: 0.3rem; }
.field-group label:not(.slider) {
  font-size: 0.8rem; font-weight: 500;
  color: var(--admin-text, #1a1a1a);
  display: flex; align-items: center; gap: 0.3rem;
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
.field-toggle-flush {
  background: transparent;
  border: none;
  padding: 0;
  align-items: flex-start;
}
.field-row   { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; }
.field-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.6rem; }
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
  width: 100%;
}
.field-group input:focus,
.field-group select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.12); }

/* -- Segmented radio control ----------------------------------- */
.seg-control {
  display: flex;
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 6px;
  overflow: hidden;
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

/* -- Settings section block ------------------------------------ */
.settings-section {
  display: flex; flex-direction: column; gap: 0.55rem;
  background: var(--admin-bg, #f3f4f6);
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 6px;
  padding: 0.7rem 0.8rem;
}
.settings-section-title {
  font-size: 0.7rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: .07em;
  color: var(--admin-muted, #777);
}
.section-hint { font-size: 0.75rem; color: var(--admin-muted, #777); line-height: 1.4; }
.cog-options {
  display: flex; flex-direction: column; gap: 0.6rem;
  padding: 0.65rem 0.75rem;
  background: var(--admin-bg, #f3f4f6);
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 6px;
  transition: opacity 0.2s;
}
.cog-disabled {
  opacity: 0.4;
  pointer-events: none;
}
.crs-row {
  display: flex; align-items: center; gap: 0.5rem;
}
.crs-row input { flex: 1; }
.crs-badge {
  font-size: 0.7rem; font-weight: 600; white-space: nowrap;
  padding: 0.15rem 0.45rem; border-radius: 4px;
}
.crs-badge.detecting { background: var(--admin-bg, #f3f4f6); color: var(--admin-muted, #777); }
.crs-badge.detected  { background: #dcfce7; color: #15803d; }
:global(body.theme-dark) .crs-badge.detected { background: #1a4d2e; color: #4ade80; }
.simplify-options {
  display: flex; flex-direction: column; gap: 0.6rem;
  padding: 0.65rem 0.75rem;
  background: var(--admin-bg, #f3f4f6);
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 6px;
  transition: opacity 0.2s;
}
.simplify-disabled {
  opacity: 0.4;
  pointer-events: none;
}
.toggle-row-disabled {
  opacity: 0.4;
  pointer-events: none;
}
.seg-control-sm { max-width: 140px; }
.input-narrow { max-width: 180px !important; }
.field-section-title {
  font-size: 0.8rem; font-weight: 600;
  color: var(--admin-text, #1a1a1a);
  margin-bottom: 0.1rem;
}

/* -- Toggle switch --------------------------------------------- */
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
  box-shadow: 0 1px 4px rgba(0,0,0,.3);
  transition: transform 0.2s cubic-bezier(.4,0,.2,1);
}
.toggle-switch input:checked + .slider { background: #3b82f6; }
.toggle-switch input:checked + .slider::before { transform: translateX(16px); }

/* -- Transitions ----------------------------------------------- */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: opacity 0.18s ease, max-height 0.3s ease;
  max-height: 400px; overflow: hidden;
}
.slide-down-enter-from,
.slide-down-leave-to { opacity: 0; max-height: 0; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
