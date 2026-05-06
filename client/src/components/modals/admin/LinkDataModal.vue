<template>
  <Transition name="fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
      <div class="link-data-modal">

        <!-- ── Header ─── -->
        <header class="modal-header">
          <h3>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
                 stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="header-icon">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="3" y1="9" x2="21" y2="9"/>
              <line x1="3" y1="15" x2="21" y2="15"/>
              <line x1="9" y1="9" x2="9" y2="21"/>
            </svg>
            Link Data &mdash; {{ layerDisplayName || layerId.slice(0, 8) + '…' }}
          </h3>
          <button class="close-btn" @click="$emit('close')" title="Close">✕</button>
        </header>

        <!-- ── Loading / Error ─── -->
        <div v-if="loading" class="modal-status">Loading…</div>
        <div v-else-if="loadError" class="modal-status modal-error">{{ loadError }}</div>

        <!-- ── Body ─── -->
        <div v-else class="modal-body">
          <p class="modal-desc">
            Attach a CSV to this layer. Rows are joined to GeoJSON features by matching a CSV
            column value against a feature property. All matched columns are merged into each
            feature's attributes.
          </p>

          <!-- ── CSV files ─── -->
          <div class="section">
            <div class="section-header">
              <span class="section-title">CSV Files</span>
              <button class="btn-upload" :disabled="uploading" @click="csvInputRef.click()">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor"
                     stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
                     style="margin-right:4px;flex-shrink:0">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                {{ uploading ? 'Uploading…' : 'Upload CSV' }}
              </button>
              <input
                ref="csvInputRef"
                type="file"
                accept=".csv,.tsv"
                style="display:none"
                @change="onCsvSelected"
              />
            </div>

            <div v-if="uploadError" class="upload-error">{{ uploadError }}</div>

            <div v-if="!csvFiles.length" class="list-empty">
              No CSV files attached yet. Upload one above.
            </div>
            <div v-else class="csv-list">
              <div
                v-for="f in csvFiles"
                :key="f.id"
                class="csv-row"
                :class="{ 'csv-row-active': selectedCsvId === f.id }"
                @click="selectCsv(f.id)"
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
                     stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="csv-row-icon">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="8" y1="13" x2="16" y2="13"/>
                  <line x1="8" y1="17" x2="16" y2="17"/>
                </svg>
                <span class="csv-row-name" :title="f.originalName">{{ f.originalName }}</span>
                <span v-if="selectedCsvId === f.id" class="csv-active-badge">selected</span>
                <button
                  class="csv-row-delete"
                  title="Remove"
                  :disabled="deleting === f.id"
                  @click.stop="deleteCsv(f.id)"
                >
                  <svg viewBox="0 0 14 14" width="10" height="10" fill="none" stroke="currentColor"
                       stroke-width="2.5" stroke-linecap="round">
                    <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- ── Join configuration ─── -->
          <div v-if="selectedCsvId" class="section join-section">
            <span class="section-title">Join Configuration</span>
            <p class="section-desc">
              Each CSV row is matched to a feature where the chosen CSV column equals the chosen
              feature property.
            </p>
            <div class="delimiter-row">
              <span class="delimiter-label">Delimiter</span>
              <select
                :value="csvDelimiters[selectedCsvId] ?? ','"
                class="delimiter-select"
                @change="setDelimiter($event.target.value)"
              >
                <option value=",">Comma  ( , )</option>
                <option value=";">Semicolon  ( ; )</option>
                <option value="&#9;">Tab  ( ⇥ )</option>
              </select>
            </div>
            <div class="join-fields">
              <div class="join-field">
                <label>CSV join column <span class="required">*</span></label>
                <select v-model="joinConfig.csvJoinColumn">
                  <option value="">
                    {{ csvColumnsLoading ? 'Loading columns…' : '— select column —' }}
                  </option>
                  <option v-for="col in csvColumns" :key="col" :value="col">{{ col }}</option>
                </select>
                <p class="field-hint">The CSV column whose value identifies each row.</p>
              </div>
              <div class="join-field">
                <label>Feature property to match <span class="required">*</span></label>
                <select v-if="featureProps.length" v-model="joinConfig.featureJoinProperty">
                  <option value="">— select property —</option>
                  <option v-for="p in featureProps" :key="p" :value="p">{{ p }}</option>
                </select>
                <input
                  v-else
                  v-model="joinConfig.featureJoinProperty"
                  type="text"
                  placeholder="e.g. id"
                />
                <p class="field-hint">The GeoJSON feature property whose value is matched.</p>
              </div>
            </div>
          </div>

          <div v-else-if="csvFiles.length" class="list-empty join-hint-inactive">
            Select a CSV file above to configure the join.
          </div>
        </div>

        <!-- ── Footer ─── -->
        <footer class="modal-footer">
          <div class="footer-status">
            <span v-if="canSave || hasSavedLink" class="footer-pending">Pending — click "Save configuration" to apply</span>
          </div>
          <div class="footer-actions">
            <button v-if="hasSavedLink" class="btn-clear" @click="clearLink">
              Clear link
            </button>
            <button class="btn-cancel" @click="$emit('close')">Close</button>
          </div>
        </footer>

      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue';
import { getApiUrl } from '../../../utils/config.js';

const props = defineProps({
  isOpen:      { type: Boolean, required: true },
  layerId:     { type: String,  required: true },
  authHeader:  { type: String,  required: true },
  initialLink: { type: Object,  default: undefined }, // pending link held by parent
});

const emit = defineEmits(['close', 'link-changed']);

// ── State ──────────────────────────────────────────────────────

const loading      = ref(false);
const loadError    = ref('');
const uploading    = ref(false);
const uploadError  = ref('');
const saveError    = ref('');
const saveSuccess  = ref('');
const deleting    = ref('');

const layerDisplayName  = ref('');
const csvFiles          = ref([]);        // subFiles with role === 'attributes'
const featureProps      = ref([]);        // known GeoJSON property keys (for suggestions)
const selectedCsvId     = ref('');
const csvColumns        = ref([]);
const csvColumnsLoading = ref(false);
const csvDelimiters     = ref({});        // subFileId → detected delimiter char
const joinConfig        = ref({ csvJoinColumn: '', featureJoinProperty: '' });
const hasSavedLink      = ref(false);

const csvInputRef = ref(null);

// ── Computed ───────────────────────────────────────────────────

const canSave = computed(() =>
  selectedCsvId.value &&
  joinConfig.value.csvJoinColumn &&
  joinConfig.value.featureJoinProperty.trim()
);

// ── Emit changes to parent (deferred save) ─────────────────────

function emitLinkChanged() {
  if (!canSave.value) return;
  emit('link-changed', {
    subFileId:           selectedCsvId.value,
    csvJoinColumn:       joinConfig.value.csvJoinColumn,
    featureJoinProperty: joinConfig.value.featureJoinProperty.trim(),
  });
}

watch(joinConfig, emitLinkChanged, { deep: true });
watch(selectedCsvId, async (newId, oldId) => {
  if (!newId || newId === oldId) return;
  await nextTick();
  emitLinkChanged();
});

// ── Lifecycle ──────────────────────────────────────────────────

watch(() => props.isOpen, async (open) => {
  if (!open) {
    saveError.value   = '';
    saveSuccess.value = '';
    uploadError.value = '';
    return;
  }
  await loadData();
});

// ── Load ───────────────────────────────────────────────────────

async function loadData() {
  loading.value   = true;
  loadError.value = '';
  try {
    const metaRes = await fetch(getApiUrl(`/admin/layers/${props.layerId}`), {
      headers: { Authorization: props.authHeader },
    });
    if (!metaRes.ok) throw new Error(`Failed to load layer (${metaRes.status})`);
    const meta = await metaRes.json();

    layerDisplayName.value = meta.layerConfig?.displayName || meta.originalName || '';
    csvFiles.value = (meta.subFiles ?? []).filter(sf => sf.role === 'attributes');

    // Use pending link from parent if available, otherwise fall back to server state
    const active = props.initialLink !== undefined
      ? props.initialLink
      : (meta.layerConfig?.csvLink ?? null);
    if (active && active.subFileId) {
      hasSavedLink.value                   = true;
      selectedCsvId.value                  = active.subFileId;
      joinConfig.value.csvJoinColumn       = active.csvJoinColumn       ?? '';
      joinConfig.value.featureJoinProperty = active.featureJoinProperty ?? '';
      await loadCsvColumns(active.subFileId);
    } else {
      hasSavedLink.value  = false;
      selectedCsvId.value = '';
      joinConfig.value    = { csvJoinColumn: '', featureJoinProperty: '' };
    }

    // Load feature property keys from GeoJSON for datalist suggestions (best-effort)
    const geojsonRes = await fetch(
      getApiUrl(`data/layers/${props.layerId}/${props.layerId}.geojson`)
    ).catch(() => null);
    if (geojsonRes?.ok) {
      try {
        const gj = await geojsonRes.json();
        const SYSTEM = new Set(['_featureId', '_model3dUrls', '_pointcloudUrls', '_layerId']);
        const keys = new Set();
        for (const f of (gj.features ?? []).slice(0, 5)) {
          for (const k of Object.keys(f.properties ?? {})) {
            if (!SYSTEM.has(k)) keys.add(k);
          }
        }
        featureProps.value = [...keys];
      } catch { /* GeoJSON not yet ready — ignore */ }
    }
  } catch (err) {
    loadError.value = err.message ?? 'Failed to load data.';
  } finally {
    loading.value = false;
  }
}

// ── Select CSV ─────────────────────────────────────────────────

async function selectCsv(id) {
  if (selectedCsvId.value === id) return;
  selectedCsvId.value = id;
  // Keep featureJoinProperty but reset column selection
  joinConfig.value = { csvJoinColumn: '', featureJoinProperty: joinConfig.value.featureJoinProperty };
  await loadCsvColumns(id);
}

function detectDelimiter(line) {
  const t = (line.match(/\t/g) || []).length;
  const c = (line.match(/,/g)  || []).length;
  const s = (line.match(/;/g)  || []).length;
  if (t > c && t > s) return '\t';
  if (s > c)          return ';';
  return ',';
}

async function loadCsvColumns(subFileId, overrideDelimiter = null) {
  const sf = csvFiles.value.find(f => f.id === subFileId);
  if (!sf) return;
  csvColumns.value        = [];
  csvColumnsLoading.value = true;
  try {
    const url = getApiUrl(`data/layers/${props.layerId}/${subFileId}${sf.extension}`);
    const res = await fetch(url);
    if (!res.ok) return;
    // Stream just enough to capture the first line
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      buf += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const nl = buf.indexOf('\n');
      if (nl !== -1 || done) {
        const headerLine = nl !== -1 ? buf.slice(0, nl) : buf;
        await reader.cancel();
        const delim = overrideDelimiter ?? detectDelimiter(headerLine);
        csvDelimiters.value[subFileId] = delim;
        csvColumns.value = headerLine
          .split(delim)
          .map(c => c.trim().replace(/^"|"$/g, ''))
          .filter(c => c.length > 0);
        break;
      }
    }
  } catch { /* ignore — columns will fall back to free-text */ } finally {
    csvColumnsLoading.value = false;
  }
}

async function setDelimiter(delim) {
  if (!selectedCsvId.value) return;
  csvDelimiters.value[selectedCsvId.value] = delim;
  joinConfig.value.csvJoinColumn = '';
  await loadCsvColumns(selectedCsvId.value, delim);
}

// ── Upload CSV ─────────────────────────────────────────────────

async function onCsvSelected(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  uploading.value   = true;
  uploadError.value = '';
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('role', 'attributes');
    const res = await fetch(getApiUrl(`/admin/layers/${props.layerId}/subfiles`), {
      method: 'POST',
      headers: { Authorization: props.authHeader },
      body: fd,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Upload failed (${res.status})`);
    }
    const updated = await res.json();
    // Server returns the new sub-file meta, not the full subFiles array
    csvFiles.value.push(updated.meta);
    await selectCsv(updated.meta.id);
  } catch (err) {
    uploadError.value = err.message ?? 'Upload failed.';
  } finally {
    uploading.value = false;
  }
}


// ── Delete CSV sub-file ───────────────────────────────────────

async function deleteCsv(id) {
  if (deleting.value) return;
  deleting.value    = id;
  uploadError.value = '';
  try {
    const res = await fetch(getApiUrl(`/admin/layers/${props.layerId}/subfiles/${id}`), {
      method: 'DELETE',
      headers: { Authorization: props.authHeader },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Delete failed (${res.status})`);
    }
    csvFiles.value = csvFiles.value.filter(f => f.id !== id);
    if (selectedCsvId.value === id) {
      selectedCsvId.value = '';
      joinConfig.value    = { csvJoinColumn: '', featureJoinProperty: joinConfig.value.featureJoinProperty };
      csvColumns.value    = [];
    }
  } catch (err) {
    uploadError.value = err.message ?? 'Delete failed.';
  } finally {
    deleting.value = '';
  }
}

// ── Clear link ─────────────────────────────────────────────────

function clearLink() {
  hasSavedLink.value  = false;
  selectedCsvId.value = '';
  joinConfig.value    = { csvJoinColumn: '', featureJoinProperty: '' };
  emit('link-changed', null);
}
</script>

<style scoped>
/* ── Overlay & shell ─────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 1rem;
}

.link-data-modal {
  background: var(--admin-surface, #fff);
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 10px;
  width: 100%;
  max-width: 560px;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  font-family: "Segoe UI", sans-serif;
  overflow: hidden;
}

/* ── Header ─────────────────────────────────────────────────── */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1.25rem;
  border-bottom: 1px solid var(--admin-border, #e0e0e0);
  flex-shrink: 0;
  gap: 1rem;
}

.modal-header h3 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}

.header-icon { flex-shrink: 0; color: #059669; }

.close-btn {
  background: transparent;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  color: var(--admin-muted, #777);
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  line-height: 1;
  flex-shrink: 0;
}
.close-btn:hover { background: var(--admin-bg, #f3f4f6); }

/* ── Loading / error ─────────────────────────────────────────── */
.modal-status {
  padding: 2rem;
  text-align: center;
  font-size: 0.85rem;
  color: var(--admin-muted, #777);
}
.modal-error { color: #ef4444; }

/* ── Body ────────────────────────────────────────────────────── */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.modal-desc {
  margin: 0;
  font-size: 0.82rem;
  color: var(--admin-muted, #777);
  line-height: 1.5;
}

/* ── Generic section ─────────────────────────────────────────── */
.section {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.section-title {
  font-size: 0.8rem;
  font-weight: 600;
  flex: 1;
}

.section-desc {
  margin: 0;
  font-size: 0.78rem;
  color: var(--admin-muted, #777);
  line-height: 1.45;
}

.list-empty {
  font-size: 0.82rem;
  color: var(--admin-muted, #777);
  padding: 0.6rem 0.75rem;
  background: var(--admin-bg, #f3f4f6);
  border-radius: 6px;
  border: 1px dashed var(--admin-border, #ddd);
}

/* ── Upload button ───────────────────────────────────────────── */
.btn-upload {
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.7rem;
  border-radius: 5px;
  border: 1px solid rgba(5,150,105,0.4);
  background: transparent;
  color: #059669;
  font-size: 0.78rem;
  font-weight: 500;
  font-family: "Segoe UI", sans-serif;
  cursor: pointer;
  transition: background 0.13s, border-color 0.13s;
  white-space: nowrap;
}
.btn-upload:hover:not(:disabled) {
  background: rgba(5,150,105,0.08);
  border-color: rgba(5,150,105,0.6);
}
.btn-upload:disabled { opacity: 0.5; cursor: default; }

/* ── Upload error ────────────────────────────────────────────── */
.upload-error {
  font-size: 0.8rem;
  color: #ef4444;
  padding: 0.3rem 0.5rem;
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.25);
  border-radius: 4px;
}

/* ── CSV list ────────────────────────────────────────────────── */
.csv-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.csv-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 6px;
  background: var(--admin-bg, #f9fafb);
  cursor: pointer;
  transition: border-color 0.13s, background 0.13s;
  user-select: none;
}
.csv-row:hover { border-color: #93c5fd; background: rgba(59,130,246,0.04); }
.csv-row-active {
  border-color: rgba(5,150,105,0.45) !important;
  background: rgba(5,150,105,0.07) !important;
}
.csv-row-icon { flex-shrink: 0; color: var(--admin-muted, #777); }
.csv-row-active .csv-row-icon { color: #059669; }

.csv-row-name {
  flex: 1;
  font-size: 0.83rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--admin-text, #1a1a1a);
}

.csv-active-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.1rem 0.45rem;
  border-radius: 3px;
  background: rgba(5,150,105,0.15);
  color: #059669;
  flex-shrink: 0;
}

.csv-row-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border-radius: 4px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--admin-muted, #999);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.13s, background 0.13s, color 0.13s;
}
.csv-row:hover .csv-row-delete { opacity: 1; }
.csv-row-delete:hover:not(:disabled) {
  background: rgba(239,68,68,0.1);
  border-color: rgba(239,68,68,0.35);
  color: #ef4444;
}
.csv-row-delete:disabled { opacity: 0.4; cursor: default; }

/* ── Delimiter row ─────────────────────────────────────────── */
.delimiter-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.25rem;
}

.delimiter-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--admin-text, #1a1a1a);
  white-space: nowrap;
}

.delimiter-select {
  padding: 0.28rem 0.5rem;
  border: 1px solid var(--admin-input-border, #ccc);
  border-radius: 5px;
  background: var(--admin-input-bg, #fff);
  color: var(--admin-text, #1a1a1a);
  font-size: 0.8rem;
  font-family: "Segoe UI", sans-serif;
  cursor: pointer;
}
.delimiter-select:focus {
  outline: none;
  border-color: #059669;
  box-shadow: 0 0 0 3px rgba(5,150,105,0.12);
}

/* ── Join section ────────────────────────────────────────────── */
.join-section {
  border-top: 1px solid var(--admin-border, #e0e0e0);
  padding-top: 1rem;
}

.join-hint-inactive {
  border-top: 1px solid var(--admin-border, #e0e0e0);
  padding-top: 1rem;
}

.join-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-top: 0.5rem;
}
@media (max-width: 480px) {
  .join-fields { grid-template-columns: 1fr; }
}

.join-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.join-field label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--admin-text, #1a1a1a);
}

.join-field select,
.join-field input[type="text"] {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--admin-input-border, #ccc);
  border-radius: 5px;
  background: var(--admin-input-bg, #fff);
  color: var(--admin-text, #1a1a1a);
  font-size: 0.83rem;
  font-family: "Segoe UI", sans-serif;
  transition: border-color 0.13s;
}
.join-field select:focus,
.join-field input:focus {
  outline: none;
  border-color: #059669;
  box-shadow: 0 0 0 3px rgba(5,150,105,0.12);
}

.field-hint {
  margin: 0;
  font-size: 0.72rem;
  color: var(--admin-muted, #777);
  line-height: 1.4;
}

.required { color: #ef4444; margin-left: 2px; }

/* ── Footer ──────────────────────────────────────────────────── */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 0.85rem 1.25rem;
  border-top: 1px solid var(--admin-border, #e0e0e0);
  flex-shrink: 0;
}

.footer-status { flex: 1; }
.footer-actions { display: flex; align-items: center; gap: 0.5rem; }

.footer-pending { font-size: 0.82rem; color: #d97706; font-style: italic; }

.btn-cancel {
  padding: 0.45rem 0.9rem;
  background: transparent;
  border: 1px solid var(--admin-border, #d1d5db);
  border-radius: 6px;
  font-size: 0.85rem;
  font-family: "Segoe UI", sans-serif;
  color: var(--admin-text, #555);
  cursor: pointer;
  transition: background 0.13s;
}
.btn-cancel:hover { background: var(--admin-bg, #f3f4f6); }

.btn-clear {
  padding: 0.45rem 0.9rem;
  background: transparent;
  border: 1px solid rgba(239,68,68,0.4);
  border-radius: 6px;
  font-size: 0.85rem;
  font-family: "Segoe UI", sans-serif;
  color: #ef4444;
  cursor: pointer;
  transition: background 0.13s;
}
.btn-clear:hover:not(:disabled) { background: rgba(239,68,68,0.08); }
.btn-clear:disabled { opacity: 0.5; cursor: default; }

.btn-save {
  padding: 0.45rem 1.25rem;
  background: #059669;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 600;
  font-family: "Segoe UI", sans-serif;
  cursor: pointer;
  transition: background 0.13s, opacity 0.13s;
}
.btn-save:hover:not(:disabled) { background: #047857; }
.btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Transition ──────────────────────────────────────────────── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s; }
.fade-enter-from,  .fade-leave-to      { opacity: 0; }
</style>
