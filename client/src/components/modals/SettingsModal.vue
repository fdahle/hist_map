<template>
  <div>
    <Transition name="fade">
      <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-content">
          <header class="modal-header">
            <h3>
              <span v-html="ICON_SETTINGS"></span>
              Settings
            </h3>
            <button class="close-btn" @click="$emit('close')" title="Close">
              <span v-html="ICON_CLOSE"></span>
            </button>
          </header>

          <div class="modal-body">
            <section class="settings-section">
              <h4>Appearance</h4>

              <div class="setting-row">
                <div class="setting-info">
                  <label for="theme-toggle">Dark Mode</label>
                  <p class="setting-desc">
                    Switch between light and dark theme
                  </p>
                </div>

                <div class="toggle-switch">
                  <input
                    id="theme-toggle"
                    type="checkbox"
                    :checked="theme === 'dark'"
                    @change="toggleTheme"
                  />
                  <label for="theme-toggle" class="slider"></label>
                </div>
              </div>
            </section>

            <section class="settings-section">
              <h4>Interface</h4>

              <div class="setting-row">
                <div class="setting-info">
                  <label for="info-bar-toggle">Show Information Bar</label>
                  <p class="setting-desc">
                    Displays coordinates, zoom level, and layer stats.
                  </p>
                </div>

                <div class="toggle-switch">
                  <input
                    id="info-bar-toggle"
                    type="checkbox"
                    :checked="showInfoBar"
                    @change="toggleInfoBar"
                  />
                  <label for="info-bar-toggle" class="slider"></label>
                </div>
              </div>

              <div class="setting-row">
                <div class="setting-info">
                  <label for="map-ribbon-toggle">Show Map Ribbon</label>
                  <p class="setting-desc">
                    Display the ribbon toolbar at the top of the map view.
                  </p>
                </div>

                <div class="toggle-switch">
                  <input
                    id="map-ribbon-toggle"
                    type="checkbox"
                    :checked="showMapRibbon"
                    @change="toggleMapRibbon"
                  />
                  <label for="map-ribbon-toggle" class="slider"></label>
                </div>
              </div>

              <div v-if="bugReportMode === 'auto'" class="setting-row">
                <div class="setting-info">
                  <label for="bug-report-toggle">Show Bug Report Button</label>
                  <p class="setting-desc">
                    Display a small bug icon in the bottom-left corner linking to the issue tracker.
                  </p>
                </div>

                <div class="toggle-switch">
                  <input
                    id="bug-report-toggle"
                    type="checkbox"
                    :checked="showBugReportButton"
                    @change="toggleBugReportButton"
                  />
                  <label for="bug-report-toggle" class="slider"></label>
                </div>
              </div>

              <div class="setting-row">
                <div class="setting-info">
                  <label for="arrow-buttons-toggle">Show Layer Order Arrows</label>
                  <p class="setting-desc">
                    Display ▲▼ buttons for layer ordering. Drag &amp; drop always available.
                  </p>
                </div>

                <div class="toggle-switch">
                  <input
                    id="arrow-buttons-toggle"
                    type="checkbox"
                    :checked="showArrowButtons"
                    @change="toggleArrowButtons"
                  />
                  <label for="arrow-buttons-toggle" class="slider"></label>
                </div>
              </div>
            </section>

            <section class="settings-section">
              <h4>Map Preferences</h4>
              <div class="empty-state">More settings coming soon...</div>
            </section>
          </div>

          <footer class="modal-footer">
            <button class="btn-secondary" @click="openAcknowledgments" title="About & Acknowledgments">
              <span v-html="ICON_INFO"></span>
              <span>About</span>
            </button>
            <button v-if="adminEnabled" class="btn-secondary" @click="goToAdmin" title="Open Admin Panel">
              <span v-html="ICON_SETTINGS"></span>
              <span>Admin</span>
            </button>
            <button class="btn-primary" @click="$emit('close')">Done</button>
          </footer>
        </div>
      </div>
    </Transition>

    <!-- Acknowledgments Modal -->
    <Acknowledgments
      :is-open="isAcknowledgmentsOpen"
      @close="isAcknowledgmentsOpen = false"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { storeToRefs } from "pinia";
import { useSettingsStore } from "../../stores/settingsStore";
import Acknowledgments from './Acknowledgments.vue';
import { ICON_INFO, ICON_CLOSE, ICON_SETTINGS } from '@/constants/icons.js';

defineProps({
  isOpen: {
    type: Boolean,
  },
});

const emit = defineEmits(["close"]);

const router = useRouter();
const settingsStore = useSettingsStore();
const isAcknowledgmentsOpen = ref(false);

const openAcknowledgments = () => {
  isAcknowledgmentsOpen.value = true;
};

const goToAdmin = () => {
  emit('close');
  router.push('/admin');
};

// Extract State (Must use storeToRefs to keep it reactive!)
const { showInfoBar, showArrowButtons, showMapRibbon, showBugReportButton, theme, adminEnabled } = storeToRefs(settingsStore);
const { toggleInfoBar, toggleArrowButtons, toggleMapRibbon, toggleBugReportButton, toggleTheme } = settingsStore;
const bugReportMode = import.meta.env.VITE_BUG_REPORT || 'auto';
</script>

<style scoped>
/* --- Transitions --- */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* --- Layout --- */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(5px);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.modal-content {
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  background: rgba(30, 30, 30, 0.98);
  border: 1px solid #444;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
  color: #e0e0e0;
  font-family: 'Segoe UI', sans-serif;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.3s ease;
}

.theme-light .modal-content {
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid #ddd;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  color: #1a1a1a;
}

@keyframes slideUp {
  from {
    transform: translateY(30px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* --- Header --- */
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #444;
  background: rgba(40, 40, 40, 0.9);
  border-radius: 12px 12px 0 0;
}

.theme-light .modal-header {
  border-bottom: 1px solid #e5e5e5;
  background: rgba(245, 245, 245, 0.9);
}

.modal-header h3 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 12px;
  color: #fff;
  line-height: 1;
}

.theme-light .modal-header h3 {
  color: #333;
}

.modal-header h3 :deep(span) {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.modal-header h3 :deep(svg) {
  width: 20px;
  height: 20px;
  stroke: #4a9eff;
  display: block;
}

.theme-light .modal-header h3 :deep(svg) {
  stroke: #2563eb;
}

.close-btn {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
}

.theme-light .close-btn {
  color: #666;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.theme-light .close-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #000;
}

.close-btn :deep(svg) {
  width: 18px;
  height: 18px;
}

/* --- Body --- */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.modal-body::-webkit-scrollbar {
  width: 6px;
}

.modal-body::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
}

.theme-light .modal-body::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
}

.modal-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.theme-light .modal-body::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
}

.modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

.theme-light .modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}

.settings-section {
  margin-bottom: 32px;
}

.settings-section:last-child {
  margin-bottom: 0;
}

.settings-section h4 {
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: #4a9eff;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.theme-light .settings-section h4 {
  color: #2563eb;
}

/* --- Setting Row --- */
.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  transition: all 0.2s;
  margin-bottom: 12px;
}

.theme-light .setting-row {
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.setting-row:last-child {
  margin-bottom: 0;
}

.setting-row:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.12);
}

.theme-light .setting-row:hover {
  background: rgba(0, 0, 0, 0.04);
  border-color: rgba(0, 0, 0, 0.12);
}

.setting-info {
  flex: 1;
}

.setting-info label {
  font-weight: 500;
  color: #fff;
  display: block;
  margin-bottom: 4px;
  cursor: pointer;
  font-size: 15px;
}

.theme-light .setting-info label {
  color: #1a1a1a;
}

.setting-desc {
  margin: 0;
  font-size: 13px;
  color: #999;
  line-height: 1.4;
}

.theme-light .setting-desc {
  color: #666;
}

.empty-state {
  font-size: 14px;
  color: #888;
  font-style: italic;
  padding: 16px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  text-align: center;
}

.theme-light .empty-state {
  color: #999;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(0, 0, 0, 0.05);
}

/* --- Toggle Switch CSS --- */
.toggle-switch {
  position: relative;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #555;
  transition: 0.3s;
  border-radius: 24px;
}

.theme-light .slider {
  background-color: #ccc;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: #ccc;
  transition: 0.3s;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.theme-light .slider:before {
  background-color: #fff;
}

input:checked + .slider {
  background-color: #4a9eff;
}

input:checked + .slider:before {
  transform: translateX(20px);
  background-color: #fff;
}

/* --- Footer --- */
.modal-footer {
  padding: 20px 24px;
  border-top: 1px solid #444;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(40, 40, 40, 0.9);
}

.theme-light .modal-footer {
  border-top: 1px solid #e5e5e5;
  background: rgba(245, 245, 245, 0.9);
}

.btn-primary {
  background: #4a9eff;
  color: white;
  border: none;
  padding: 10px 24px;
  border-radius: 8px;
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary:hover {
  background: #3b8eef;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(74, 158, 255, 0.3);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.05);
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 10px 18px;
  border-radius: 8px;
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.theme-light .btn-secondary {
  background: rgba(0, 0, 0, 0.03);
  color: #555;
  border: 1px solid rgba(0, 0, 0, 0.15);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}

.theme-light .btn-secondary:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #000;
  border-color: rgba(0, 0, 0, 0.25);
}

.btn-secondary:active {
  transform: translateY(0);
}

.btn-secondary :deep(svg) {
  width: 16px;
  height: 16px;
}
</style>