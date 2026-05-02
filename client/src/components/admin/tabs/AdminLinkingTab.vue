<template>
  <section class="tab-section">
    <div class="settings-card">
      <div class="section-header">
        <div>
          <h2 class="section-title">Linking</h2>
          <p class="section-desc">Connect 2D layers to 3D assets (per feature) and data tables (per layer).</p>
        </div>
        <span v-if="saveState === 'saving'" class="save-badge saving">Saving…</span>
        <span v-else-if="saveState === 'saved'" class="save-badge saved">Saved ✓</span>
        <span v-else-if="saveState === 'error'" class="save-badge error" :title="saveError">Save failed</span>
      </div>
    <div class="linking-layout">
      <!-- ── Left: 2D layer list ────────────────────────────────────────── -->
      <div class="layer-panel">
        <div class="panel-label">2D Layers</div>
        <div v-if="!geojsonLayers.length" class="panel-empty">No GeoJSON layers uploaded yet.</div>
        <div v-else class="layer-list">
          <div
            v-for="l in geojsonLayers"
            :key="l.id"
            class="layer-item"
            :class="{ 'layer-item-active': selectedLayerId === l.id }"
            @click="selectLayer(l.id)"
          >
            <div class="layer-item-main">
              <span class="layer-item-name" :title="l.originalName">
                {{ l.layerConfig?.displayName || l.originalName }}
              </span>
              <span v-if="l.originalName && l.layerConfig?.displayName && l.layerConfig.displayName !== l.originalName"
                class="layer-item-orig">{{ l.originalName }}</span>
            </div>
            <div v-if="selectedLayerId === l.id && !layerLoading" class="layer-item-badges">
              <span v-if="links.csvLinks.length" class="lbadge lbadge-csv">{{ links.csvLinks.length }} CSV</span>
              <span v-if="total3DLinks" class="lbadge lbadge-3d">{{ total3DLinks }} 3D</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ── Right: link management ─────────────────────────────────────── -->
      <div class="link-panel">
        <div v-if="!selectedLayerId" class="empty-state">
          Select a layer on the left to manage its links.
        </div>

        <template v-else-if="layerLoading">
          <div class="empty-state">Loading layer data…</div>
        </template>

        <template v-else>
          <!-- Tab bar -->
          <div class="link-tabs">
            <button class="link-tab-btn" :class="{ 'link-tab-active': activeTab === 'csv' }" @click="activeTab = 'csv'">
              Data
              <span v-if="links.csvLinks.length" class="tab-count">{{ links.csvLinks.length }}</span>
            </button>
            <button class="link-tab-btn" :class="{ 'link-tab-active': activeTab === '3d' }" @click="activeTab = '3d'">
              3D Assets
              <span v-if="total3DLinks" class="tab-count">{{ total3DLinks }}</span>
            </button>
          </div>

          <!-- ── CSV tab ──────────────────────────────────────────────── -->
          <div v-if="activeTab === 'csv'" class="tab-content">
            <div class="tab-content-header">
              <p class="tab-content-desc">Attribute tables joined to this layer's features by a shared column.</p>
              <button class="btn-add-sm" @click="startAddCsvLink">+ Link Data</button>
            </div>

            <div v-if="links.csvLinks.length" class="csv-link-list">
              <div v-for="(cl, idx) in links.csvLinks" :key="idx" class="csv-link-row">
                <div class="csv-link-info">
                  <span class="csv-link-name">{{ csvLayerName(cl.dataLayerId) }}</span>
                  <span class="csv-link-join">{{ cl.featureJoinProperty }} ↔ {{ cl.csvJoinColumn }}</span>
                </div>
                <button class="action-btn action-btn-danger" title="Remove data link" @click="removeCsvLink(idx)">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>

            <div v-if="addingCsvLink" class="csv-add-form">
              <div class="form-row">
                <div class="form-field form-field-grow">
                  <label>Data layer</label>
                  <select v-model="newCsvLink.dataLayerId">
                    <option value="">— choose data layer —</option>
                    <option v-for="l in csvLayers" :key="l.id" :value="l.id">
                      {{ l.layerConfig?.displayName || l.originalName }}
                    </option>
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-field">
                  <label>Layer join property</label>
                  <select v-model="newCsvLink.featureJoinProperty">
                    <option value="">— choose property —</option>
                    <option v-for="col in geojsonColumns" :key="col" :value="col">{{ col }}</option>
                  </select>
                </div>
                <div class="form-field">
                  <label>Data join column</label>
                  <select v-model="newCsvLink.csvJoinColumn" :disabled="!newCsvLink.dataLayerId">
                    <option value="">— choose column —</option>
                    <option v-for="col in csvLayerColumns(newCsvLink.dataLayerId)" :key="col" :value="col">{{ col }}</option>
                  </select>
                </div>
              </div>
              <p v-if="csvLinkError" class="form-error">{{ csvLinkError }}</p>
              <div class="form-actions">
                <button class="btn-secondary-sm" @click="cancelAddCsvLink">Cancel</button>
                <button class="btn-primary-sm" @click="confirmAddCsvLink">Add Link</button>
              </div>
            </div>

            <div v-if="!links.csvLinks.length && !addingCsvLink" class="link-empty">
              No data links yet. Click <strong>Link Data</strong> to join a data table to this layer.
            </div>
          </div>

          <!-- ── 3D Assets tab ────────────────────────────────────────── -->
          <div v-if="activeTab === '3d'" class="tab-content">
            <p class="tab-content-desc">Assign 3D models or point clouds to individual features.</p>

            <div v-if="!threeDLayers.length" class="link-empty">
              No 3D layers uploaded yet. Go to the <strong>3D Layers</strong> tab to upload models or point clouds.
            </div>

            <template v-else>
              <div class="feature-3d-layout">
                <!-- Feature list -->
                <div class="feature-col">
                  <div class="col-header">
                    <span class="col-title">Features ({{ filteredFeatures.length }}<template v-if="featureSearch.trim() || showLinkedOnly"> / {{ features.length }}</template>)</span>
                  </div>
                  <div class="col-toolbar">
                    <input v-model="featureSearch" type="search" class="feature-search" placeholder="Search…" />
                    <label class="filter-checkbox-label">
                      <input type="checkbox" v-model="showLinkedOnly" />
                      <span>3D only</span>
                    </label>
                  </div>
                  <div v-if="featuresLoading" class="col-empty">Loading features…</div>
                  <div v-else-if="!features.length" class="col-empty">No features found (are UUIDs assigned?).</div>
                  <div v-else class="feature-list">
                    <div
                      v-for="feat in filteredFeatures"
                      :key="feat.id"
                      class="feature-row"
                      :class="{ 'feature-row-selected': selectedFeatureId === feat.id, 'feature-row-linked': hasAny3DLink(feat.id) }"
                      @click="selectedFeatureId = selectedFeatureId === feat.id ? null : feat.id"
                    >
                      <div class="feature-row-left">
                        <span class="feature-label" :title="feat.id">{{ feat.label }}</span>
                        <div v-if="hasAny3DLink(feat.id)" class="feature-link-chips">
                          <span v-for="mid in getFeatureLink(feat.id).modelLayerIds" :key="mid" class="link-chip chip-model"
                            :title="layerName(mid)" @click.stop="removeFeatureLink3D(feat.id, 'model', mid)">
                            {{ shortName(layerName(mid)) }} ✕
                          </span>
                          <span v-for="pid in getFeatureLink(feat.id).pointcloudLayerIds" :key="pid" class="link-chip chip-pc"
                            :title="layerName(pid)" @click.stop="removeFeatureLink3D(feat.id, 'pointcloud', pid)">
                            {{ shortName(layerName(pid)) }} ✕
                          </span>
                        </div>
                      </div>
                      <span v-if="selectedFeatureId === feat.id" class="feature-row-arrow">←</span>
                    </div>
                  </div>
                </div>

                <!-- 3D asset list -->
                <div class="assets-col">
                  <div class="col-header">
                    <span class="col-title">3D Layers</span>
                  </div>
                  <div class="col-toolbar">
                    <p class="assets-hint">{{ selectedFeatureId ? 'Click to assign to selected feature' : 'Select a feature first' }}</p>
                  </div>
                  <div class="asset-group">
                    <div class="asset-group-label">Models</div>
                    <div v-if="!modelLayers.length" class="col-empty">None uploaded</div>
                    <div v-for="l in modelLayers" :key="l.id" class="asset-item"
                      :class="{ 'asset-item-disabled': !selectedFeatureId, 'asset-item-assigned': isAssigned(selectedFeatureId, l.id) }"
                      @click="toggleAssign(selectedFeatureId, 'model', l.id)">
                      <span class="asset-dot asset-dot-model"></span>
                      <span class="asset-name">{{ l.layerConfig?.displayName || l.originalName }}</span>
                      <span v-if="isAssigned(selectedFeatureId, l.id)" class="asset-check">✓</span>
                    </div>
                  </div>
                  <div class="asset-group">
                    <div class="asset-group-label">Point Clouds</div>
                    <div v-if="!pointcloudLayers.length" class="col-empty">None uploaded</div>
                    <div v-for="l in pointcloudLayers" :key="l.id" class="asset-item"
                      :class="{ 'asset-item-disabled': !selectedFeatureId, 'asset-item-assigned': isAssigned(selectedFeatureId, l.id) }"
                      @click="toggleAssign(selectedFeatureId, 'pointcloud', l.id)">
                      <span class="asset-dot asset-dot-pc"></span>
                      <span class="asset-name">{{ l.layerConfig?.displayName || l.originalName }}</span>
                      <span v-if="isAssigned(selectedFeatureId, l.id)" class="asset-check">✓</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </template>
      </div>
    </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, inject, watch } from 'vue';
import { getApiUrl } from '../../../utils/config';

// ── Injected ───────────────────────────────────────────────────────────────────
const authHeader = inject('authHeader');
function authHeaders(extra = {}) { return { Authorization: authHeader.value, ...extra }; }

// ── Layer state ────────────────────────────────────────────────────────────────
const allLayers = ref([]);

const geojsonLayers    = computed(() => allLayers.value.filter(l => l.fileType === 'geojson'));
const csvLayers        = computed(() => allLayers.value.filter(l => l.fileType === 'csv'));
const threeDLayers     = computed(() => allLayers.value.filter(l => ['model','pointcloud'].includes(l.fileType)));
const modelLayers      = computed(() => allLayers.value.filter(l => l.fileType === 'model'));
const pointcloudLayers = computed(() => allLayers.value.filter(l => l.fileType === 'pointcloud'));

// ── Selection state ────────────────────────────────────────────────────────────
const selectedLayerId   = ref('');
const selectedFeatureId = ref(null);
const activeTab         = ref('csv');
const layerLoading      = ref(false);
const featuresLoading   = ref(false);
const features          = ref([]);
const featureSearch     = ref('');
const showLinkedOnly    = ref(false);
const geojsonColumns    = ref([]);

// ── Links state ────────────────────────────────────────────────────────────────
const links = ref({ csvLinks: [], featureLinks: [] });

// ── Autosave ───────────────────────────────────────────────────────────────────
const saveState = ref('idle');
const saveError = ref('');
let saveTimer      = null;
let loadingLinks   = false;

function scheduleSave() {
  if (!selectedLayerId.value) return;
  if (loadingLinks) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveLinks, 600);
}

watch(links, scheduleSave, { deep: true });

async function saveLinks() {
  if (!selectedLayerId.value) return;
  saveState.value = 'saving';
  saveError.value = '';
  try {
    const res = await fetch(getApiUrl(`/admin/layers/${selectedLayerId.value}/links`), {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(links.value),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Save failed (${res.status})`);
    }
    saveState.value = 'saved';
    setTimeout(() => { if (saveState.value === 'saved') saveState.value = 'idle'; }, 2500);
  } catch (err) {
    saveState.value = 'error';
    saveError.value = err.message;
  }
}

// ── Fetch helpers ──────────────────────────────────────────────────────────────
async function fetchAllLayers() {
  try {
    const res = await fetch(getApiUrl('/admin/layers'), { headers: authHeaders() });
    if (res.ok) allLayers.value = await res.json();
  } catch { /* non-fatal */ }
}

async function fetchLayerData(layerId) {
  layerLoading.value = true;
  loadingLinks = true;
  links.value = { csvLinks: [], featureLinks: [] };
  features.value = [];
  geojsonColumns.value = [];
  selectedFeatureId.value = null;
  try {
    const [linksRes, featRes, previewRes] = await Promise.all([
      fetch(getApiUrl(`/admin/layers/${layerId}/links`), { headers: authHeaders() }),
      fetch(getApiUrl(`/admin/layers/${layerId}/features`), { headers: authHeaders() }),
      fetch(getApiUrl(`/admin/layers/${layerId}/preview?n=1`), { headers: authHeaders() }),
    ]);
    if (linksRes.ok) links.value = await linksRes.json();
    if (featRes.ok)  {
      const data = await featRes.json();
      features.value = data.features ?? [];
    }
    if (previewRes.ok) {
      const data = await previewRes.json();
      geojsonColumns.value = data.columns ?? [];
    }
  } catch { /* non-fatal */ }
  finally {
    loadingLinks = false;
    layerLoading.value = false;
  }
}

async function onLayerChange() {
  if (!selectedLayerId.value) {
    links.value = { csvLinks: [], featureLinks: [] };
    features.value = [];
    return;
  }
  clearTimeout(saveTimer); // don't auto-save during layer switch
  selectedFeatureId.value = null;
  await fetchLayerData(selectedLayerId.value);
}

// Load on mount
fetchAllLayers();

// ── Total 3D link count (for tab badge) ───────────────────────────────────────
const total3DLinks = computed(() =>
  links.value.featureLinks.reduce(
    (sum, fl) => sum + (fl.modelLayerIds?.length ?? 0) + (fl.pointcloudLayerIds?.length ?? 0), 0
  )
);

// ── Select layer ──────────────────────────────────────────────────────────────
async function selectLayer(id) {
  if (selectedLayerId.value === id) return;
  selectedLayerId.value = id;
  await onLayerChange();
}

// ── Feature filtering ──────────────────────────────────────────────────────────
const filteredFeatures = computed(() => {
  let list = features.value;
  if (showLinkedOnly.value) list = list.filter(f => hasAny3DLink(f.id));
  if (featureSearch.value.trim()) {
    const q = featureSearch.value.toLowerCase();
    list = list.filter(f => f.label?.toLowerCase().includes(q) || f.id?.toLowerCase().includes(q));
  }
  return list;
});

// ── CSV link management ────────────────────────────────────────────────────────
const addingCsvLink  = ref(false);
const csvLinkError   = ref('');
const newCsvLink     = ref({ dataLayerId: '', csvJoinColumn: '', featureJoinProperty: '' });

function startAddCsvLink() {
  newCsvLink.value = { dataLayerId: '', csvJoinColumn: '', featureJoinProperty: '' };
  csvLinkError.value = '';
  addingCsvLink.value = true;
}
function cancelAddCsvLink() { addingCsvLink.value = false; csvLinkError.value = ''; }

function confirmAddCsvLink() {
  const { dataLayerId, csvJoinColumn, featureJoinProperty } = newCsvLink.value;
  if (!dataLayerId) { csvLinkError.value = 'Select a data layer.'; return; }
  if (!csvJoinColumn) { csvLinkError.value = 'Select the data join column.'; return; }
  if (!featureJoinProperty) { csvLinkError.value = 'Select the layer join property.'; return; }
  if (links.value.csvLinks.some(cl => cl.dataLayerId === dataLayerId)) {
    csvLinkError.value = 'This CSV layer is already linked.'; return;
  }
  links.value.csvLinks.push({ dataLayerId, csvJoinColumn, featureJoinProperty });
  addingCsvLink.value = false;
}

function removeCsvLink(idx) { links.value.csvLinks.splice(idx, 1); }

// ── Feature-3D link management ─────────────────────────────────────────────────
function getFeatureLink(featureId) {
  let fl = links.value.featureLinks.find(f => f.featureId === featureId);
  if (!fl) {
    fl = { featureId, modelLayerIds: [], pointcloudLayerIds: [] };
    links.value.featureLinks.push(fl);
  }
  return fl;
}

function hasAny3DLink(featureId) {
  const fl = links.value.featureLinks.find(f => f.featureId === featureId);
  return fl && (fl.modelLayerIds?.length || fl.pointcloudLayerIds?.length);
}

function isAssigned(featureId, layerId) {
  if (!featureId) return false;
  const fl = links.value.featureLinks.find(f => f.featureId === featureId);
  if (!fl) return false;
  return fl.modelLayerIds?.includes(layerId) || fl.pointcloudLayerIds?.includes(layerId);
}

function toggleAssign(featureId, kind, layerId) {
  if (!featureId) return;
  const fl = getFeatureLink(featureId);
  const arr = kind === 'model' ? fl.modelLayerIds : fl.pointcloudLayerIds;
  const idx = arr.indexOf(layerId);
  if (idx === -1) arr.push(layerId);
  else arr.splice(idx, 1);
  // Prune empty entries so the saved JSON stays lean
  if (!fl.modelLayerIds.length && !fl.pointcloudLayerIds.length) {
    const i = links.value.featureLinks.indexOf(fl);
    if (i !== -1) links.value.featureLinks.splice(i, 1);
  }
}

function removeFeatureLink3D(featureId, kind, layerId) {
  toggleAssign(featureId, kind, layerId);
}

// ── Display helpers ────────────────────────────────────────────────────────────
function layerName(id) {
  const l = allLayers.value.find(l => l.id === id);
  return l ? (l.layerConfig?.displayName || l.originalName) : id.slice(0, 8) + '…';
}
function csvLayerName(id) { return layerName(id); }
function csvLayerColumns(id) {
  const l = allLayers.value.find(l => l.id === id);
  return l?.csvColumns ?? [];
}
function shortName(name) {
  return name.length > 22 ? name.slice(0, 20) + '…' : name;
}
</script>

<style scoped>
/* ── Base ─────────────────────────────────────────────────────────────────── */
.tab-section { max-width: 900px; display: flex; flex-direction: column; gap: 1rem; }
.settings-card { border: 1px solid var(--admin-border, #e0e0e0); border-radius: 8px; background: var(--admin-surface, #fff); padding: 0; overflow: hidden; }
.section-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--admin-border, #e0e0e0); padding: 1rem 1.1rem; margin-bottom: 0; }
.section-title { font-size: 1rem; font-weight: 600; margin: 0 0 0.2rem; }
.section-desc  { font-size: 0.8rem; color: var(--admin-muted, #777); margin: 0; }

.save-badge { font-size: 0.78rem; padding: 0.2rem 0.55rem; border-radius: 4px; flex-shrink: 0; }
.save-badge.saving { background: rgba(245,158,11,0.12); color: #b45309; }
.save-badge.saved  { background: rgba(34,197,94,0.12);  color: #16a34a; }
.save-badge.error  { background: rgba(239,68,68,0.12);  color: #ef4444; cursor: help; }

/* ── Two-panel layout ─────────────────────────────────────────────────────── */
.linking-layout {
  display: flex;
  gap: 0;
  overflow: hidden;
  height: 540px;
}

/* Left: layer list */
.layer-panel {
  width: 220px;
  min-width: 180px;
  flex-shrink: 0;
  border-right: 1px solid var(--admin-border, #e0e0e0);
  background: var(--admin-surface, #fff);
  display: flex;
  flex-direction: column;
}
.panel-label {
  padding: 0.6rem 0.75rem 0.5rem;
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--admin-muted, #999);
  border-bottom: 1px solid var(--admin-border, #e0e0e0);
}
.panel-empty {
  padding: 1rem 0.75rem;
  font-size: 0.8rem;
  color: var(--admin-muted, #aaa);
}
.layer-list { flex: 1; overflow-y: auto; padding: 0.35rem 0; }

.layer-item {
  padding: 0.45rem 0.75rem;
  cursor: pointer;
  border-left: 2px solid transparent;
  transition: background 0.1s;
}
.layer-item:hover { background: var(--admin-surface, #fff); }
.layer-item-active {
  background: var(--admin-surface, #fff);
  border-left-color: #3b82f6;
}
.layer-item-main { display: flex; flex-direction: column; gap: 0.1rem; }
.layer-item-name {
  font-size: 0.82rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--admin-text, #1a1a1a);
}
.layer-item-active .layer-item-name { color: #3b82f6; }
.layer-item-orig {
  font-size: 0.7rem;
  color: var(--admin-muted, #999);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.layer-item-badges { display: flex; gap: 0.3rem; flex-wrap: wrap; margin-top: 0.25rem; }
.lbadge {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 0.05rem 0.35rem;
  border-radius: 3px;
}
.lbadge-csv { background: #dbeafe; color: #1d4ed8; }
.lbadge-3d  { background: #ede9fe; color: #7c3aed; }
:global(body.theme-dark) .lbadge-csv { background: rgba(29,78,216,0.2); color: #93c5fd; }
:global(body.theme-dark) .lbadge-3d  { background: rgba(124,58,237,0.2); color: #a78bfa; }

/* Right: link panel */
.link-panel {
  flex: 1;
  min-width: 0;
  background: var(--admin-surface, #fff);
  display: flex;
  flex-direction: column;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
  color: var(--admin-muted, #777);
  padding: 2rem;
  text-align: center;
}

/* ── Tab bar ──────────────────────────────────────────────────────────────── */
.link-tabs {
  display: flex;
  border-bottom: 1px solid var(--admin-border, #e0e0e0);
  padding: 0 1rem;
  gap: 0;
  flex-shrink: 0;
}
.link-tab-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.6rem 0.75rem;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--admin-muted, #777);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  transition: color 0.1s;
}
.link-tab-btn:hover { color: var(--admin-text, #333); }
.link-tab-active { color: #3b82f6 !important; border-bottom-color: #3b82f6; }

.tab-count {
  font-size: 0.68rem;
  font-weight: 600;
  background: #dbeafe;
  color: #1d4ed8;
  padding: 0.05rem 0.35rem;
  border-radius: 10px;
}
.link-tab-active .tab-count { background: #3b82f6; color: #fff; }
:global(body.theme-dark) .tab-count { background: rgba(29,78,216,0.25); color: #93c5fd; }

/* ── Tab content ──────────────────────────────────────────────────────────── */
.tab-content { flex: 1; overflow-y: auto; padding: 0.9rem 1rem; display: flex; flex-direction: column; }

.tab-content-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}
.tab-content-desc {
  font-size: 0.8rem;
  color: var(--admin-muted, #777);
  margin: 0;
}
.tab-content-header > .tab-content-desc { flex: 1; }

.link-empty { font-size: 0.82rem; color: var(--admin-muted, #777); padding: 0.4rem 0; }

/* ── CSV links ────────────────────────────────────────────────────────────── */
.csv-link-list { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: 0.5rem; }
.csv-link-row {
  display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 0.6rem;
  border: 1px solid var(--admin-border, #e0e0e0); border-radius: 5px; background: var(--admin-bg, #f9fafb);
}
.csv-link-info { flex: 1; min-width: 0; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
.csv-link-name { font-size: 0.82rem; font-weight: 500; }
.csv-link-join { font-size: 0.75rem; color: var(--admin-muted, #777); }

/* CSV add form */
.csv-add-form {
  padding: 0.75rem; border: 1px dashed var(--admin-border, #ccc); border-radius: 6px;
  background: var(--admin-bg, #f9fafb); margin-top: 0.5rem;
}
.form-row { display: flex; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
.form-field { display: flex; flex-direction: column; gap: 0.2rem; min-width: 150px; }
.form-field-grow { flex: 1; }
.form-field label { font-size: 0.75rem; font-weight: 500; color: var(--admin-text, #333); }
.form-field input, .form-field select {
  padding: 0.3rem 0.45rem; border: 1px solid var(--admin-input-border, #ccc);
  border-radius: 5px; font-size: 0.8rem; background: var(--admin-input-bg, #fff); color: var(--admin-text, #1a1a1a);
}
.form-field input:focus, .form-field select:focus { outline: 2px solid #3b82f6; }
.form-actions { display: flex; gap: 0.4rem; justify-content: flex-end; margin-top: 0.5rem; }
.form-error { font-size: 0.75rem; color: #ef4444; margin: 0.25rem 0 0; }

/* ── 3D feature layout (inner split within tab) ───────────────────────────── */
.feature-3d-layout { display: flex; gap: 1rem; flex: 1; min-height: 0; margin-top: 0.75rem; }
.feature-col { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.assets-col  { width: 230px; min-width: 190px; flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; overflow-y: auto; }

.col-header {
  display: flex; align-items: center; gap: 0.5rem;
  margin-bottom: 0; padding-bottom: 0.4rem; border-bottom: 1px solid var(--admin-border, #e0e0e0);
}
.col-toolbar {
  display: flex; align-items: center; gap: 0.5rem;
  min-height: 32px; padding: 0.35rem 0; margin-bottom: 0.35rem;
}
.filter-checkbox-label {
  display: flex; align-items: center; gap: 0.25rem;
  font-size: 0.75rem; color: var(--admin-muted, #777); cursor: pointer; white-space: nowrap; flex-shrink: 0;
}
.filter-checkbox-label input[type="checkbox"] { cursor: pointer; }
.col-title { font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--admin-muted, #777); }
.col-empty { font-size: 0.78rem; color: var(--admin-muted, #aaa); padding: 0.4rem 0; }

.assets-hint { font-size: 0.75rem; color: var(--admin-muted, #999); margin: 0; }

.feature-search {
  flex: 1; padding: 0.25rem 0.4rem; border: 1px solid var(--admin-input-border, #ccc);
  border-radius: 4px; font-size: 0.78rem; background: var(--admin-input-bg, #fff); min-width: 0;
}
.feature-search:focus { outline: 2px solid #3b82f6; }

.feature-list { flex: 1; display: flex; flex-direction: column; gap: 0.2rem; overflow-y: auto; min-height: 0; }
.feature-row {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 0.4rem;
  padding: 0.4rem 0.55rem; border-radius: 5px; cursor: pointer;
  border: 1px solid transparent; transition: background 0.1s;
}
.feature-row:hover { background: var(--admin-bg, #f3f4f6); }
.feature-row-selected { background: #eff6ff !important; border-color: #93c5fd; }
.feature-row-linked .feature-label { font-weight: 500; }
:global(body.theme-dark) .feature-row-selected { background: rgba(59,130,246,0.12) !important; }

.feature-row-left { display: flex; flex-direction: column; gap: 0.2rem; flex: 1; min-width: 0; }
.feature-label { font-size: 0.82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.feature-link-chips { display: flex; flex-wrap: wrap; gap: 0.2rem; }
.link-chip {
  font-size: 0.68rem; padding: 0.1rem 0.35rem; border-radius: 3px; cursor: pointer;
  user-select: none; transition: opacity 0.1s;
}
.link-chip:hover { opacity: 0.7; }
.chip-model { background: #ede9fe; color: #7c3aed; }
.chip-pc    { background: #dcfce7; color: #16a34a; }
:global(body.theme-dark) .chip-model { background: rgba(124,58,237,0.2); color: #a78bfa; }
:global(body.theme-dark) .chip-pc    { background: rgba(22,163,74,0.2);  color: #4ade80; }

.feature-row-arrow { font-size: 0.78rem; color: #3b82f6; flex-shrink: 0; }

/* Asset list */
.asset-group { margin-bottom: 0.85rem; }
.asset-group-label {
  font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--admin-muted, #aaa); margin-bottom: 0.35rem;
}
.asset-item {
  display: flex; align-items: center; gap: 0.45rem; padding: 0.4rem 0.5rem;
  border-radius: 5px; cursor: pointer; font-size: 0.82rem; transition: background 0.1s;
  border: 1px solid transparent;
}
.asset-item:hover:not(.asset-item-disabled) { background: var(--admin-bg, #f3f4f6); }
.asset-item-disabled { opacity: 0.45; cursor: default; }
.asset-item-assigned { background: #f5f3ff; border-color: #c4b5fd; }
:global(body.theme-dark) .asset-item-assigned { background: rgba(124,58,237,0.1); border-color: rgba(124,58,237,0.3); }
.asset-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.asset-dot-model { background: #7c3aed; }
.asset-dot-pc    { background: #16a34a; }
.asset-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.asset-check { font-size: 0.75rem; color: #7c3aed; flex-shrink: 0; }

/* ── Buttons ──────────────────────────────────────────────────────────────── */
.btn-add-sm {
  padding: 0.3rem 0.65rem; border-radius: 5px; background: #3b82f6;
  color: #fff; border: none; font-size: 0.78rem; font-weight: 500; cursor: pointer; white-space: nowrap; flex-shrink: 0;
}
.btn-add-sm:hover { background: #2563eb; }

.action-btn {
  display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;
  border: 1px solid var(--admin-border, #e0e0e0); border-radius: 5px;
  background: transparent; color: var(--admin-muted, #777); cursor: pointer; flex-shrink: 0;
}
.action-btn:hover { color: var(--admin-text, #1a1a1a); border-color: var(--admin-muted, #999); }
.action-btn-danger:hover { color: #ef4444; border-color: #fca5a5; }

.btn-secondary-sm, .btn-primary-sm {
  padding: 0.3rem 0.65rem; border-radius: 5px; font-size: 0.78rem; cursor: pointer;
}
.btn-secondary-sm { background: transparent; border: 1px solid var(--admin-border, #ccc); color: var(--admin-text, #333); }
.btn-secondary-sm:hover { border-color: var(--admin-muted, #999); }
.btn-primary-sm { background: #3b82f6; border: 1px solid #3b82f6; color: #fff; }
.btn-primary-sm:hover { background: #2563eb; }
</style>
