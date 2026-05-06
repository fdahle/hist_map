<template>
  <Transition name="fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-content">
        <header class="modal-header">
          <h3>
            <span v-html="ICON_SEARCH"></span>
            Extended Search
          </h3>
          <button class="close-btn" @click="$emit('close')" title="Close">
            <span v-html="ICON_CLOSE"></span>
          </button>
        </header>

        <div class="modal-body">
          <!-- Layer selector -->
          <div class="field-row">
            <label class="field-label">Layer</label>
            <select v-model="selectedLayerId" class="field-select">
              <option value="" disabled>Select a layer…</option>
              <option
                v-for="layer in searchableLayers"
                :key="layer._layerId"
                :value="layer._layerId"
              >{{ layer.name }}</option>
            </select>
          </div>

          <!-- Search input -->
          <div class="field-row">
            <label class="field-label">Search</label>
            <div class="search-input-wrap">
              <span class="search-icon" v-html="ICON_SEARCH_SM"></span>
              <input
                v-model="query"
                class="field-input"
                placeholder="Search all attributes…"
                :disabled="!selectedLayerId"
                @input="onQueryInput"
              />
              <button v-if="query" class="clear-btn" @click="query = ''" title="Clear">
                <span v-html="ICON_CLOSE"></span>
              </button>
            </div>
          </div>

          <!-- No layer selected -->
          <div v-if="!selectedLayerId" class="empty-hint">
            Select a layer above to start searching.
          </div>

          <!-- No features / layer not ready -->
          <div v-else-if="selectedLayerNotReady" class="empty-hint warn">
            This layer hasn't finished loading yet. Please try again once it is ready.
          </div>

          <!-- Results -->
          <template v-else>
            <div class="results-meta">
              <span v-if="query">{{ filteredResults.length }} result{{ filteredResults.length !== 1 ? 's' : '' }} for "{{ query }}"</span>
              <span v-else>{{ allResults.length }} feature{{ allResults.length !== 1 ? 's' : '' }} total — enter a query to filter</span>
              <label class="sys-toggle">
                <input type="checkbox" v-model="hideSystemAttrs" />
                Hide system attributes
              </label>
            </div>

            <div class="results-table-wrap">
              <table v-if="displayResults.length" class="results-table">
                <thead>
                  <tr>
                    <th class="th th-action"></th>
                    <th
                      v-for="col in columns"
                      :key="col"
                      class="th"
                      @click="toggleSort(col)"
                      :title="'Sort by ' + col"
                    >
                      {{ col }}
                      <span v-if="sortCol === col" class="sort-indicator">{{ sortAsc ? '▲' : '▼' }}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(row, i) in displayResults"
                    :key="i"
                    class="result-row"
                  >
                    <td class="td td-action">
                      <button class="zoom-btn" @click="zoomToFeature(row.feature)" title="Zoom to feature">
                        <span v-html="ICON_ZOOM"></span>
                      </button>
                    </td>
                    <td
                      v-for="col in columns"
                      :key="col"
                      class="td"
                      :title="String(row.props[col] ?? '')"
                    >
                      <span v-html="highlight(String(row.props[col] ?? ''))"></span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div v-else-if="query" class="no-results">
                No features match "{{ query }}".
              </div>
            </div>

            <div v-if="filteredResults.length > PAGE_SIZE" class="pagination">
              <button class="page-btn" :disabled="page === 0" @click="page--">‹ Prev</button>
              <span class="page-info">Page {{ page + 1 }} / {{ totalPages }}</span>
              <button class="page-btn" :disabled="page >= totalPages - 1" @click="page++">Next ›</button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useLayerStore } from '@/stores/map/layerStore';
import { useMapStore } from '@/stores/map/mapStore';
import { isEmpty } from 'ol/extent';
import { ICON_CLOSE } from '@/constants/icons.js';

const ICON_SEARCH    = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
const ICON_SEARCH_SM = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
const ICON_ZOOM      = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`;

const PAGE_SIZE = 50;

const props = defineProps({
  isOpen: { type: Boolean, default: false },
});

const emit = defineEmits(['close']);

const layerStore = useLayerStore();
const mapStore   = useMapStore();

const selectedLayerId   = ref('');
const query             = ref('');
const page              = ref(0);
const sortCol           = ref('');
const sortAsc           = ref(true);
const hideSystemAttrs   = ref(true);

// Only overlay layers that are fully loaded (have an OL source with features)
// GeoTIFFs are excluded — they have no attribute data to search.
const searchableLayers = computed(() =>
  layerStore.layers.filter(
    l => l.category === 'overlay' && l.type !== 'geotiff' && l.layerInstance && typeof l.layerInstance.getSource === 'function'
  )
);

// Reset state when modal opens/closes or layer changes
watch(() => props.isOpen, (open) => {
  if (!open) return;
  selectedLayerId.value = '';
  query.value = '';
  page.value = 0;
  sortCol.value = '';
  sortAsc.value = true;
});

watch(selectedLayerId, () => {
  query.value = '';
  page.value = 0;
  sortCol.value = '';
  sortAsc.value = true;
});

watch(query, () => { page.value = 0; });

const selectedLayer = computed(() =>
  layerStore.layers.find(l => l._layerId === selectedLayerId.value) ?? null
);

const selectedLayerNotReady = computed(() => {
  if (!selectedLayer.value) return false;
  const source = selectedLayer.value.layerInstance?.getSource?.();
  return !source || typeof source.getFeatures !== 'function';
});

// All features from selected layer
const allResults = computed(() => {
  if (!selectedLayer.value || selectedLayerNotReady.value) return [];
  const source = selectedLayer.value.layerInstance.getSource();
  return source.getFeatures().map(f => ({
    feature: f,
    props: (() => {
      const p = { ...f.getProperties() };
      delete p.geometry;
      delete p._layerId;
      return p;
    })(),
  }));
});

// Column headers derived from the first N features
const columns = computed(() => {
  const sample = allResults.value.slice(0, 20);
  const keys = new Set();
  sample.forEach(r => Object.keys(r.props).forEach(k => keys.add(k)));
  const all = [...keys];
  const visible = hideSystemAttrs.value ? all.filter(k => !k.startsWith('_')) : all;
  return visible.slice(0, 12); // cap at 12 columns
});

const lowerQuery = computed(() => query.value.trim().toLowerCase());

const filteredResults = computed(() => {
  const base = allResults.value;
  const matchesQuery = (r) => {
    if (!lowerQuery.value) return true;
    const propsToSearch = hideSystemAttrs.value
      ? Object.entries(r.props).filter(([k]) => !k.startsWith('_')).map(([, v]) => v)
      : Object.values(r.props);
    return propsToSearch.some(v => String(v ?? '').toLowerCase().includes(lowerQuery.value));
  };
  return base.filter(matchesQuery);
});

const sortedResults = computed(() => {
  if (!sortCol.value) return filteredResults.value;
  return [...filteredResults.value].sort((a, b) => {
    const va = String(a.props[sortCol.value] ?? '');
    const vb = String(b.props[sortCol.value] ?? '');
    const cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' });
    return sortAsc.value ? cmp : -cmp;
  });
});

const totalPages = computed(() => Math.ceil(sortedResults.value.length / PAGE_SIZE));

const displayResults = computed(() => {
  const start = page.value * PAGE_SIZE;
  return sortedResults.value.slice(start, start + PAGE_SIZE);
});

const onQueryInput = () => { /* page reset handled by watcher */ };

const toggleSort = (col) => {
  if (sortCol.value === col) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortCol.value = col;
    sortAsc.value = true;
  }
  page.value = 0;
};

const highlight = (text) => {
  if (!lowerQuery.value || !text) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const escapedQuery = escapeHtml(query.value.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return escaped.replace(new RegExp(`(${escapedQuery})`, 'gi'), '<mark>$1</mark>');
};

const escapeHtml = (str) =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const zoomToFeature = (feature) => {
  const map = mapStore.getMap();
  if (!map || !feature) return;
  const geom = feature.getGeometry();
  if (!geom) return;
  const extent = geom.getExtent();
  if (!isEmpty(extent)) {
    map.getView().fit(extent, { padding: [80, 80, 80, 80], duration: 600, maxZoom: 18 });
  }
  emit('close');
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  overflow-y: auto;
  z-index: 4000;
}

.modal-content {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  width: 720px;
  max-width: 96vw;
  max-height: calc(100vh - 80px);
  display: flex;
  flex-direction: column;
  font-family: "Segoe UI", sans-serif;
  margin: 60px auto 20px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}

.modal-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
  display: flex;
  align-items: center;
  gap: 8px;
}

.close-btn {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: #6b7280;
  border-radius: 4px;
  display: flex;
  align-items: center;
}
.close-btn:hover { color: #111; background: #f3f4f6; }

.modal-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  flex: 1;
}

/* Fields */
.field-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.field-label {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  width: 52px;
  flex-shrink: 0;
}
.field-select {
  flex: 1;
  height: 32px;
  padding: 0 8px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  background: #fff;
  outline: none;
}
.field-select:focus { border-color: #3b82f6; }

.search-input-wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}
.search-icon {
  position: absolute;
  left: 9px;
  color: #9ca3af;
  display: flex;
  pointer-events: none;
}
.field-input {
  width: 100%;
  height: 32px;
  padding: 0 30px 0 30px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 13px;
  color: #374151;
  outline: none;
  box-sizing: border-box;
}
.field-input:focus { border-color: #3b82f6; }
.field-input:disabled { background: #f9fafb; color: #9ca3af; cursor: not-allowed; }
.clear-btn {
  position: absolute;
  right: 6px;
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: #9ca3af;
  display: flex;
}
.clear-btn:hover { color: #374151; }

.empty-hint {
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
  padding: 24px 0;
}
.empty-hint.warn { color: #b45309; }

.results-meta {
  font-size: 11px;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.sys-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #6b7280;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.sys-toggle input { cursor: pointer; accent-color: #3b82f6; }

/* Results table */
.results-table-wrap {
  overflow: auto;
  flex: 1;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  min-height: 0;
  max-height: 50vh;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.th {
  position: sticky;
  top: 0;
  background: #f3f4f6;
  padding: 6px 10px;
  text-align: left;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
  border-bottom: 1px solid #e5e7eb;
  cursor: pointer;
  user-select: none;
}
.th:hover { background: #e9ecef; }
.th-action { width: 30px; cursor: default; }
.sort-indicator { margin-left: 4px; font-size: 10px; color: #3b82f6; }

.result-row {
  transition: background 0.1s;
}
.result-row:hover { background: #f9fafb; }
.result-row:nth-child(even) { background: #f9fafb; }
.result-row:nth-child(even):hover { background: #f3f4f6; }

.td {
  padding: 5px 10px;
  color: #374151;
  border-bottom: 1px solid #f3f4f6;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.td-action {
  padding: 4px 6px;
  text-align: center;
}

.zoom-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #6b7280;
  padding: 2px;
  border-radius: 3px;
  display: flex;
}
.zoom-btn:hover { color: #3b82f6; background: #eff6ff; }

:deep(mark) {
  background: #fef08a;
  border-radius: 2px;
  padding: 0 1px;
}

.no-results {
  padding: 24px;
  text-align: center;
  color: #9ca3af;
  font-size: 12px;
}

/* Pagination */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding-top: 4px;
}
.page-btn {
  padding: 4px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  font-size: 12px;
  cursor: pointer;
  color: #374151;
}
.page-btn:hover:not(:disabled) { background: #f3f4f6; }
.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.page-info { font-size: 12px; color: #6b7280; }

/* Transition */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
