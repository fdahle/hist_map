<template>
  <Transition name="fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('cancel')">
      <div class="modal-content">

        <header class="modal-header">
          <h3>Upload CSV Data</h3>
          <button class="close-btn" title="Close" @click="$emit('cancel')">
            <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
            </svg>
          </button>
        </header>

        <div class="modal-body">
          <div v-for="(f, i) in localFiles" :key="f.name + i" class="file-entry">
            <div class="file-entry-row">
              <span class="file-type-badge">CSV</span>
              <span class="file-entry-name" :title="f.name">{{ f.name }}</span>
              <span class="file-entry-size">{{ formatSize(f.size) }}</span>
            </div>
          </div>
          <p v-if="!localFiles.length" class="empty-note">No files selected.</p>
        </div>

        <footer class="modal-footer">
          <button class="btn-secondary" @click="$emit('cancel')">Cancel</button>
          <button class="btn-primary" :disabled="!localFiles.length" @click="confirm">
            Upload {{ localFiles.length }} file{{ localFiles.length !== 1 ? 's' : '' }}
          </button>
        </footer>

      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  isOpen: Boolean,
  files:  { type: Array, default: () => [] },
});

const emit = defineEmits(['confirm', 'cancel']);

const localFiles = ref([]);

watch(() => props.files, files => {
  localFiles.value = [...files];
}, { immediate: true });

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function confirm() {
  emit('confirm', localFiles.value);
}
</script>

<style scoped>
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
  width: min(520px, 100%);
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
  display: flex; flex-direction: column; gap: 0.5rem;
  flex: 1;
}
.modal-footer {
  display: flex; justify-content: flex-end; gap: 0.6rem;
  padding: 0.85rem 1.25rem;
  border-top: 1px solid var(--admin-border, #e0e0e0);
  flex-shrink: 0;
}
.btn-primary {
  padding: 0.45rem 1.1rem;
  background: #0891b2; color: #fff;
  border: none; border-radius: 6px;
  font-size: 0.85rem; font-weight: 500;
  cursor: pointer; font-family: "Segoe UI", sans-serif;
  transition: background 0.15s;
}
.btn-primary:hover:not(:disabled) { background: #0e7490; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
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

.file-entry { display: flex; flex-direction: column; }
.file-entry + .file-entry {
  border-top: 1px solid var(--admin-border, #e0e0e0);
  padding-top: 0.5rem;
  margin-top: 0.1rem;
}
.file-entry-row {
  display: flex; align-items: center; gap: 0.55rem;
}
.file-type-badge {
  font-size: 0.64rem; font-weight: 700; letter-spacing: .06em;
  padding: 0.15rem 0.4rem; border-radius: 4px;
  text-transform: uppercase; white-space: nowrap; flex-shrink: 0;
  background: #cffafe; color: #0e7490;
}
:global(body.theme-dark) .file-type-badge { background: rgba(8,145,178,0.2); color: #22d3ee; }
.file-entry-name {
  flex: 1; font-size: 0.85rem; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.file-entry-size { font-size: 0.75rem; color: var(--admin-muted, #777); white-space: nowrap; }
.empty-note { margin: 0; font-size: 0.82rem; color: var(--admin-muted, #777); }

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
