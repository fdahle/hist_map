<template>
  <Teleport to="body">
    <div v-if="layer" class="lim-overlay" @click.self="$emit('close')">
      <div class="lim-panel">

        <!-- Header -->
        <div class="lim-header">
          <div class="lim-title-row">
            <span class="lim-badge" :class="`type-${layer.fileType}`">{{ layer.fileType }}</span>
            <span class="lim-title">{{ layer.layerConfig?.displayName || layer.originalName }}</span>
          </div>
          <button class="lim-close" @click="$emit('close')" title="Close">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="lim-body">

          <!-- 1. General (all types) -->
          <div class="lim-section">
            <div class="lim-section-title">General</div>
            <div class="lim-rows">
              <div v-if="layer.layerConfig?.displayName && layer.layerConfig.displayName !== layer.originalName" class="lim-row">
                <span class="lim-key">File name</span>
                <span class="lim-val mono">{{ layer.originalName }}</span>
              </div>
              <div class="lim-row">
                <span class="lim-key">Uploaded</span>
                <span class="lim-val">{{ formatDate(layer.uploadedAt) }}</span>
              </div>
              <div v-if="layer.fileSizeBytes != null" class="lim-row">
                <span class="lim-key">File size</span>
                <span class="lim-val">
                  {{ formatBytes(layer.fileSizeBytes) }}
                  <span v-if="originalDiffersFromStored" class="lim-aside">(original: {{ formatBytes(layer.originalSizeBytes) }})</span>
                </span>
              </div>
            </div>
          </div>

          <!-- 2. GeoJSON -->
          <template v-if="layer.fileType === 'geojson'">
            <div class="lim-section">
              <div class="lim-section-title">Geometry</div>
              <div class="lim-rows">
                <div v-if="layer.featureCount != null" class="lim-row">
                  <span class="lim-key">Features</span>
                  <span class="lim-val">{{ layer.featureCount.toLocaleString() }}</span>
                </div>
                <div v-if="layer.geometryType" class="lim-row">
                  <span class="lim-key">Type</span>
                  <span class="lim-val">{{ layer.geometryType }}</span>
                </div>
                <div v-if="layer.targetCrs" class="lim-row">
                  <span class="lim-key">CRS</span>
                  <span class="lim-val mono">{{ layer.targetCrs }}</span>
                </div>
                <div v-if="layer.bbox" class="lim-row lim-row-top">
                  <span class="lim-key">Extent</span>
                  <span class="lim-val mono small pre">{{ formatBbox(layer.bbox) }}</span>
                </div>
              </div>
            </div>
          </template>

          <!-- 2. GeoTIFF -->
          <template v-if="layer.fileType === 'geotiff'">
            <div class="lim-section">
              <div class="lim-section-title">Raster</div>
              <div class="lim-rows">
                <div v-if="layer.rasterSize" class="lim-row">
                  <span class="lim-key">Dimensions</span>
                  <span class="lim-val">{{ layer.rasterSize[0].toLocaleString() }} × {{ layer.rasterSize[1].toLocaleString() }} px</span>
                </div>
                <div v-if="layer.resolution" class="lim-row">
                  <span class="lim-key">Resolution</span>
                  <span class="lim-val mono">{{ layer.resolution[0] }} × {{ layer.resolution[1] }}</span>
                </div>
                <div v-if="layer.bandStats?.length" class="lim-row">
                  <span class="lim-key">Bands</span>
                  <span class="lim-val">{{ layer.bandStats.length }}</span>
                </div>
                <div v-if="layer.sourceCrs" class="lim-row">
                  <span class="lim-key">CRS</span>
                  <span class="lim-val mono">{{ layer.sourceCrs }}</span>
                </div>
                <div v-if="layer.bbox" class="lim-row lim-row-top">
                  <span class="lim-key">Extent</span>
                  <span class="lim-val mono small pre">{{ formatBbox(layer.bbox) }}</span>
                </div>
              </div>
            </div>
            <div v-if="layer.bandStats?.length" class="lim-section">
              <div class="lim-section-title">Band statistics</div>
              <div class="lim-rows">
                <div v-for="(band, i) in layer.bandStats" :key="i" class="lim-row">
                  <span class="lim-key">Band {{ i + 1 }}</span>
                  <span class="lim-val mono small">{{ band.min }} — {{ band.max }}</span>
                </div>
              </div>
            </div>
          </template>

          <!-- 2. 3D Model -->
          <template v-if="layer.fileType === 'model'">
            <div class="lim-section">
              <div class="lim-section-title">Model</div>
              <div class="lim-rows">
                <div v-if="layer.vertexCount != null" class="lim-row">
                  <span class="lim-key">Vertices</span>
                  <span class="lim-val">{{ layer.vertexCount.toLocaleString() }}</span>
                </div>
                <div v-if="layer.faceCount != null" class="lim-row">
                  <span class="lim-key">Faces</span>
                  <span class="lim-val">{{ layer.faceCount.toLocaleString() }}</span>
                </div>
                <div v-if="layer.subFiles?.length" class="lim-row">
                  <span class="lim-key">Companions</span>
                  <span class="lim-val">{{ layer.subFiles.length }} file{{ layer.subFiles.length === 1 ? '' : 's' }}</span>
                </div>
                <div v-if="!layer.vertexCount && !layer.faceCount && !layer.subFiles?.length" class="lim-row">
                  <span class="lim-val lim-muted">No geometry metadata available</span>
                </div>
              </div>
            </div>
            <div v-if="layer.subFiles?.length" class="lim-section">
              <div class="lim-section-title">Companion files</div>
              <div class="lim-rows">
                <div v-for="sub in layer.subFiles" :key="sub.id" class="lim-row">
                  <span class="lim-key lim-key-cap">{{ sub.role }}</span>
                  <span class="lim-val mono small">{{ sub.originalName }}</span>
                </div>
              </div>
            </div>
          </template>

          <!-- 2. Point cloud -->
          <template v-if="layer.fileType === 'pointcloud'">
            <div class="lim-section">
              <div class="lim-section-title">Point Cloud</div>
              <div class="lim-rows">
                <div v-if="layer.pointCount != null" class="lim-row">
                  <span class="lim-key">Points</span>
                  <span class="lim-val">{{ layer.pointCount.toLocaleString() }}</span>
                </div>
                <div v-if="layer.sourceCrs" class="lim-row">
                  <span class="lim-key">CRS</span>
                  <span class="lim-val mono">{{ layer.sourceCrs }}</span>
                </div>
                <div v-if="layer.bbox" class="lim-row lim-row-top">
                  <span class="lim-key">Extent</span>
                  <span class="lim-val mono small pre">{{ formatBbox(layer.bbox) }}</span>
                </div>
              </div>
            </div>
          </template>

          <!-- 2. CSV -->
          <template v-if="layer.fileType === 'csv'">
            <div class="lim-section">
              <div class="lim-section-title">Data</div>
              <div class="lim-rows">
                <div v-if="layer.rowCount != null" class="lim-row">
                  <span class="lim-key">Rows</span>
                  <span class="lim-val">{{ layer.rowCount.toLocaleString() }}</span>
                </div>
                <div v-if="layer.csvDelimiter" class="lim-row">
                  <span class="lim-key">Delimiter</span>
                  <span class="lim-val mono">{{ layer.csvDelimiter === '\t' ? 'tab' : `"${layer.csvDelimiter}"` }}</span>
                </div>
              </div>
            </div>
            <div v-if="layer.csvColumns?.length" class="lim-section">
              <div class="lim-section-title">Columns ({{ layer.csvColumns.length }})</div>
              <div class="col-chips">
                <span v-for="col in layer.csvColumns" :key="col" class="col-chip">{{ col }}</span>
              </div>
            </div>
          </template>

          <!-- 3. Processing log -->
          <div v-if="layer.processingLog?.length" class="lim-section">
            <div class="lim-section-title">Processing log</div>
            <div class="proc-log">
                <div v-for="(entry, i) in layer.processingLog" :key="i" class="proc-entry">- {{ entry }}</div>
              </div>
          </div>

          <!-- 4. Debug -->
          <div class="lim-section">
            <div class="lim-section-title">Debug</div>
            <div class="lim-rows">
              <div class="lim-row">
                <span class="lim-key">Layer ID</span>
                <span class="lim-val mono small">{{ layer.id }}</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({ layer: { type: Object, default: null } });
defineEmits(['close']);

const originalDiffersFromStored = computed(() =>
  props.layer?.originalSizeBytes != null &&
  props.layer.originalSizeBytes !== props.layer.fileSizeBytes
);

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatBytes(bytes) {
  if (bytes == null || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function formatBbox(bbox) {
  if (!bbox) return '—';
  const fmt = v => (typeof v === 'number' ? v.toFixed(5) : v);
  return `${fmt(bbox[0])}, ${fmt(bbox[1])}\n${fmt(bbox[2])}, ${fmt(bbox[3])}`;
}
</script>

<style scoped>
.lim-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: center; justify-content: center;
  padding: 1rem;
}

.lim-panel {
  background: var(--admin-surface, #fff);
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 10px;
  width: 100%; max-width: 480px;
  max-height: 85vh;
  display: flex; flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  overflow: hidden;
  font-family: "Segoe UI", system-ui, sans-serif;
  color: var(--admin-text, #1a1a1a);
}

/* Header */
.lim-header {
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  padding: 0.85rem 1rem; border-bottom: 1px solid var(--admin-border, #e0e0e0);
  flex-shrink: 0;
}
.lim-title-row { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
.lim-badge {
  font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em;
  padding: 0.15rem 0.4rem; border-radius: 3px;
  background: var(--admin-border, #e0e0e0); color: var(--admin-muted, #777);
  white-space: nowrap; flex-shrink: 0;
}
.type-geojson    { background: #dcfce7; color: #16a34a; }
.type-geotiff    { background: #dbeafe; color: #1d4ed8; }
.type-model      { background: #ede9fe; color: #7c3aed; }
.type-pointcloud { background: #f0fdf4; color: #16a34a; }
.type-csv        { background: #cffafe; color: #0e7490; }
:global(body.theme-dark) .type-geojson    { background: rgba(22,163,74,0.2);  color: #4ade80; }
:global(body.theme-dark) .type-geotiff    { background: rgba(29,78,216,0.2);  color: #60a5fa; }
:global(body.theme-dark) .type-model      { background: rgba(124,58,237,0.2); color: #a78bfa; }
:global(body.theme-dark) .type-pointcloud { background: rgba(22,163,74,0.2);  color: #4ade80; }
:global(body.theme-dark) .type-csv        { background: rgba(8,145,178,0.2);  color: #22d3ee; }

.lim-title {
  font-size: 0.9rem; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.lim-close {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 5px; flex-shrink: 0;
  background: transparent; border: 1px solid var(--admin-border, #e0e0e0);
  color: var(--admin-muted, #777); cursor: pointer;
}
.lim-close:hover { color: var(--admin-text, #1a1a1a); border-color: var(--admin-muted, #999); }

/* Body */
.lim-body {
  overflow-y: auto; padding: 0.75rem 1rem;
  display: flex; flex-direction: column; gap: 0.1rem;
}

.lim-section { padding: 0.5rem 0; }
.lim-section + .lim-section { border-top: 1px solid var(--admin-border, #f0f0f0); }
.lim-section-title {
  font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--admin-muted, #999); margin-bottom: 0.4rem;
}

.lim-rows { display: flex; flex-direction: column; gap: 0.3rem; }
.lim-row { display: flex; gap: 0.75rem; align-items: baseline; font-size: 0.82rem; }
.lim-key {
  font-weight: 500; color: var(--admin-muted, #777);
  flex-shrink: 0; min-width: 90px;
}
.lim-key-cap { text-transform: capitalize; }
.lim-val { color: var(--admin-text, #1a1a1a); word-break: break-all; }
.lim-val.mono { font-size: 0.78rem; }
.lim-val.small { font-size: 0.75rem; }
.lim-val.pre { white-space: pre-line; }
.lim-row-top { align-items: flex-start; }

/* Processing log */
.proc-log {
  background: var(--admin-bg, #f3f4f6); border-radius: 5px;
  padding: 0.45rem 0.6rem;
  max-height: 200px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 0.15rem;
}
.proc-entry {
  font-family: monospace;
  font-size: 0.78rem;
  color: var(--admin-text, #374151);
  line-height: 1.5;
}
.lim-aside { color: var(--admin-muted, #888); font-size: 0.78rem; margin-left: 0.25rem; }
.lim-muted { color: var(--admin-muted, #aaa); font-size: 0.8rem; font-style: italic; }

/* Property schema */
.prop-list {
  display: flex; flex-direction: column; gap: 0.2rem;
  max-height: 180px; overflow-y: auto;
  border: 1px solid var(--admin-border, #e0e0e0); border-radius: 5px;
  padding: 0.35rem 0.5rem;
}
.prop-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem; gap: 0.5rem; }
.prop-name { color: var(--admin-text, #333); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prop-type {
  font-size: 0.68rem; padding: 0.1rem 0.35rem; border-radius: 3px; flex-shrink: 0;
  background: var(--admin-bg, #f3f4f6); color: var(--admin-muted, #777); font-weight: 500;
}

/* CSV columns */
.col-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.col-chip {
  font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 3px;
  background: #cffafe; color: #0e7490;
}
:global(body.theme-dark) .col-chip { background: rgba(8,145,178,0.2); color: #22d3ee; }


</style>
