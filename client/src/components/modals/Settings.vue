<template>
  <Transition name="fade">
    <div v-if="isOpen" class="modal-overlay" @click.self="$emit('close')">
      <div class="modal-content">
        <header class="modal-header">
          <h2>Settings</h2>
          <button class="close-btn" @click="$emit('close')" title="Close">
            &times;
          </button>
        </header>

        <div class="modal-body">
          <section class="settings-section">
            <h3 class="section-title">Interface</h3>

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
          </section>

          <section class="settings-section">
            <h3 class="section-title">Map Preferences</h3>
            <div class="empty-state">More settings coming soon...</div>
          </section>
        </div>

        <footer class="modal-footer">
          <button class="btn-primary" @click="$emit('close')">Done</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { useSettingsStore } from "../../stores/settingsStore"; // Import store

// 1. Props & Emits
defineProps({
  isOpen: {
    type: Boolean,
  },
});

defineEmits(["close"]);

// Connect to store
const settingsStore = useSettingsStore();
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
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5); /* Dimmed background */
  backdrop-filter: blur(3px); /* Modern blur effect */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.modal-content {
  background: #fff;
  width: 90%;
  max-width: 480px;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  max-height: 85vh; /* Prevent overflowing small screens */
  overflow: hidden;
}

/* --- Header --- */
.modal-header {
  padding: 16px 24px;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #fafafa;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #1f2937;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  color: #9ca3af;
  cursor: pointer;
  line-height: 1;
  padding: 0;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #ef4444; /* Red on hover */
}

/* --- Body --- */
.modal-body {
  padding: 24px;
  overflow-y: auto;
}

.settings-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6b7280;
  margin-bottom: 12px;
  font-weight: 700;
}

/* --- Setting Row --- */
.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
}

.setting-info label {
  font-weight: 500;
  color: #374151;
  display: block;
  margin-bottom: 4px;
  cursor: pointer;
}

.setting-desc {
  margin: 0;
  font-size: 0.85rem;
  color: #9ca3af;
}

.empty-state {
  font-size: 0.9rem;
  color: #d1d5db;
  font-style: italic;
  padding: 8px 0;
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
  background-color: #e5e7eb;
  transition: 0.3s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

input:checked + .slider {
  background-color: #3b82f6; /* Primary Blue */
}

input:checked + .slider:before {
  transform: translateX(20px);
}

/* --- Footer --- */
.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid #f0f0f0;
  display: flex;
  justify-content: flex-end;
  background: #fafafa;
}

.btn-primary {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 8px 20px;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #2563eb;
}
</style>