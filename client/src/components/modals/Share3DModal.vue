<template>
  <Transition name="fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-content">
        <header class="modal-header">
          <h3>
            <span v-html="ICON_SHARE"></span>
            Share 3D View
          </h3>
          <button class="close-btn" @click="$emit('close')" title="Close">
            <span v-html="ICON_CLOSE"></span>
          </button>
        </header>

        <div class="modal-body">
          <!-- Tabs -->
          <div class="share-tabs">
            <button :class="['share-tab', { active: tab === 'export' }]" @click="tab = 'export'">Export</button>
            <button :class="['share-tab', { active: tab === 'import' }]" @click="tab = 'import'; importError = ''; importSuccess = false">Import</button>
          </div>

          <!-- Export tab -->
          <div v-if="tab === 'export'" class="tab-content">
            <p class="description">
              This code captures the current camera position and orientation.
              Share it with others so they can restore the exact same 3D view.
            </p>
            <div class="code-box">
              <textarea ref="exportTextarea" class="code-textarea" readonly :value="exportCode" rows="4"></textarea>
            </div>
            <div class="action-row">
              <button class="btn btn-primary" @click="copyToClipboard">
                <span v-html="ICON_COPY"></span>
                {{ copyLabel }}
              </button>
            </div>
          </div>

          <!-- Import tab -->
          <div v-if="tab === 'import'" class="tab-content">
            <p class="description">
              Paste a 3D view code below to restore a shared camera position.
            </p>
            <div class="code-box">
              <textarea
                v-model="importCode"
                class="code-textarea"
                placeholder="Paste view code here…"
                rows="4"
                spellcheck="false"
              ></textarea>
            </div>

            <div v-if="importSuccess" class="success-box">
              ✓ Camera position restored.
            </div>

            <div v-if="importError" class="error-box">
              ✗ {{ importError }}
            </div>

            <div class="action-row">
              <button class="btn btn-primary" @click="loadView" :disabled="!importCode.trim()">
                Load View
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch } from 'vue';
import { useViewer3DStore } from '@/stores/viewer3D/viewer3dStore';
import { storeToRefs } from 'pinia';
import { ICON_CLOSE } from '@/constants/icons.js';

const ICON_SHARE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;
const ICON_COPY  = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;

const props = defineProps({
  isOpen: { type: Boolean, default: false },
});

const emit = defineEmits(['close', 'apply-view']);

const viewer3DStore = useViewer3DStore();
const { camera, controls } = storeToRefs(viewer3DStore);

const tab = ref('export');
const exportCode = ref('');
const importCode = ref('');
const copyLabel = ref('Copy to Clipboard');
const importSuccess = ref(false);
const importError = ref('');
const exportTextarea = ref(null);

watch(() => props.isOpen, (open) => {
  if (open) {
    tab.value = 'export';
    importCode.value = '';
    importError.value = '';
    importSuccess.value = false;
    copyLabel.value = 'Copy to Clipboard';
    exportCode.value = generateViewCode();
  }
});

const generateViewCode = () => {
  if (!camera.value || !controls.value) return '';
  const pos = camera.value.position;
  const tgt = controls.value.target;
  const payload = {
    v: 1,
    position: { x: pos.x, y: pos.y, z: pos.z },
    target:   { x: tgt.x, y: tgt.y, z: tgt.z },
  };
  return btoa(JSON.stringify(payload));
};

const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(exportCode.value);
    copyLabel.value = '✓ Copied!';
    setTimeout(() => { copyLabel.value = 'Copy to Clipboard'; }, 2000);
  } catch {
    exportTextarea.value?.select();
    document.execCommand('copy');
    copyLabel.value = '✓ Copied!';
    setTimeout(() => { copyLabel.value = 'Copy to Clipboard'; }, 2000);
  }
};

const loadView = () => {
  importError.value = '';
  importSuccess.value = false;
  let payload;
  try {
    payload = JSON.parse(atob(importCode.value.trim()));
  } catch {
    importError.value = 'Invalid view code. Make sure you pasted the full, unmodified text.';
    return;
  }
  if (!payload?.v || !payload.position || !payload.target) {
    importError.value = 'Unrecognised view format.';
    return;
  }
  emit('apply-view', payload);
  importSuccess.value = true;
};
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.modal-content {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  width: 440px;
  max-width: 95vw;
  display: flex;
  flex-direction: column;
  font-family: "Segoe UI", sans-serif;
  position: relative;
  overflow: hidden;
}

.theme-dark .modal-content {
  background: #2a2a2a;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid #e5e7eb;
}

.theme-dark .modal-header {
  border-bottom-color: #444;
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

.theme-dark .modal-header h3 {
  color: #e0e0e0;
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

.theme-dark .close-btn { color: #aaa; }
.theme-dark .close-btn:hover { color: #fff; background: #3a3a3a; }

.modal-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.share-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 4px;
}

.theme-dark .share-tabs { border-bottom-color: #444; }

.share-tab {
  padding: 6px 16px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 13px;
  color: #6b7280;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.15s;
  font-family: "Segoe UI", sans-serif;
}

.share-tab:hover { color: #111; }
.share-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; font-weight: 500; }

.theme-dark .share-tab { color: #aaa; }
.theme-dark .share-tab:hover { color: #fff; }

.tab-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.description {
  font-size: 12px;
  color: #6b7280;
  margin: 0;
  line-height: 1.5;
}

.theme-dark .description { color: #aaa; }

.code-box { position: relative; }

.code-textarea {
  width: 100%;
  box-sizing: border-box;
  font-family: "Cascadia Code", "Fira Mono", monospace;
  font-size: 11px;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #f9fafb;
  color: #374151;
  resize: vertical;
  outline: none;
  line-height: 1.5;
  transition: border-color 0.15s;
}

.code-textarea:focus { border-color: #3b82f6; background: #fff; }
.code-textarea[readonly] { cursor: default; }

.theme-dark .code-textarea {
  background: #1e1e1e;
  border-color: #555;
  color: #d4d4d4;
}

.theme-dark .code-textarea:focus {
  border-color: #4a9eff;
  background: #252525;
}

.action-row {
  display: flex;
  justify-content: flex-end;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 6px;
  border: none;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
  font-family: "Segoe UI", sans-serif;
}

.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-primary { background: #3b82f6; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #2563eb; }

.success-box {
  background: #f0fdf4;
  border: 1px solid #86efac;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  color: #166534;
}

.theme-dark .success-box {
  background: rgba(134, 239, 172, 0.08);
  border-color: rgba(134, 239, 172, 0.3);
  color: #86efac;
}

.error-box {
  background: #fff1f2;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 12px;
  color: #991b1b;
}

.theme-dark .error-box {
  background: rgba(252, 165, 165, 0.08);
  border-color: rgba(252, 165, 165, 0.3);
  color: #fca5a5;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
