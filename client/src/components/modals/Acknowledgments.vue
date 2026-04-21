<template>
  <div v-if="isOpen" class="acknowledgments-overlay" @click="$emit('close')">
    <div class="acknowledgments-modal" @click.stop>
      <div class="modal-header">
        <h3>
          <span v-html="ICON_INFO"></span>
          Acknowledgments
        </h3>
        <button @click="$emit('close')" class="close-btn" title="Close">
          <span v-html="ICON_CLOSE"></span>
        </button>
      </div>

      <div class="modal-body">
        <section class="ack-section">
          <h4>Built With</h4>
          <div class="ack-item">
            <strong>Vue.js</strong>
            <p>Progressive JavaScript framework for building user interfaces</p>
            <a href="https://vuejs.org" target="_blank" rel="noopener noreferrer">vuejs.org</a>
          </div>
          <div class="ack-item">
            <strong>Three.js</strong>
            <p>JavaScript 3D library for WebGL rendering</p>
            <a href="https://threejs.org" target="_blank" rel="noopener noreferrer">threejs.org</a>
          </div>
          <div class="ack-item">
            <strong>OpenLayers</strong>
            <p>High-performance library for displaying map data</p>
            <a href="https://openlayers.org" target="_blank" rel="noopener noreferrer">openlayers.org</a>
          </div>
        </section>

        <section class="ack-section">
          <h4>Icons & Design</h4>
          <div class="ack-item">
            <strong>Feather Icons</strong>
            <p>Beautiful open source icon set</p>
            <a href="https://feathericons.com" target="_blank" rel="noopener noreferrer">feathericons.com</a>
          </div>
        </section>

        <section class="ack-section">
          <h4>License</h4>
          <p class="license-text">
            This project is open source and available under the MIT License.
          </p>
        </section>

        <section class="ack-section version">
          <p>Version 1.0.0</p>
          <p class="copyright">© {{ currentYear }} Stratum3D</p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { ICON_INFO, ICON_CLOSE } from '@/constants/icons';

defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
});

defineEmits(['close']);

const currentYear = computed(() => new Date().getFullYear());
</script>

<style scoped>
.acknowledgments-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
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

.acknowledgments-modal {
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

.theme-light .acknowledgments-modal {
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

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.ack-section {
  margin-bottom: 32px;
}

.ack-section:last-child {
  margin-bottom: 0;
}

.ack-section h4 {
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: #4a9eff;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.theme-light .ack-section h4 {
  color: #2563eb;
}

.ack-item {
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid #333;
  border-radius: 8px;
  margin-bottom: 12px;
  transition: all 0.2s;
}

.theme-light .ack-item {
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid #ddd;
}

.ack-item:hover {
  background: rgba(255, 255, 255, 0.05);
  border-color: #444;
}

.theme-light .ack-item:hover {
  background: rgba(0, 0, 0, 0.04);
  border-color: #ccc;
}

.ack-item:last-child {
  margin-bottom: 0;
}

.ack-item strong {
  display: block;
  font-size: 15px;
  color: #fff;
  margin-bottom: 6px;
}

.theme-light .ack-item strong {
  color: #1a1a1a;
}

.ack-item p {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: #aaa;
  line-height: 1.5;
}

.theme-light .ack-item p {
  color: #666;
}

.ack-item a {
  display: inline-block;
  font-size: 12px;
  color: #4a9eff;
  text-decoration: none;
  padding: 4px 0;
  border-bottom: 1px solid transparent;
  transition: all 0.2s;
}

.theme-light .ack-item a {
  color: #2563eb;
}

.ack-item a:hover {
  color: #6bb0ff;
  border-bottom-color: #4a9eff;
}

.theme-light .ack-item a:hover {
  color: #1d4ed8;
  border-bottom-color: #2563eb;
}

.license-text {
  font-size: 13px;
  color: #aaa;
  line-height: 1.6;
  margin: 0;
  padding: 16px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.theme-light .license-text {
  color: #666;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.ack-section.version {
  text-align: center;
  padding-top: 24px;
  border-top: 1px solid #333;
}

.theme-light .ack-section.version {
  border-top: 1px solid #e5e5e5;
}

.ack-section.version p {
  margin: 8px 0;
  font-size: 13px;
  color: #666;
}

.theme-light .ack-section.version p {
  color: #999;
}

.copyright {
  font-size: 12px !important;
}

.theme-light .copyright {
  color: #aaa !important;
}

/* Scrollbar styling */
.modal-body::-webkit-scrollbar {
  width: 8px;
}

.modal-body::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.theme-light .modal-body::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
}

.modal-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 4px;
}

.theme-light .modal-body::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
}

.modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.4);
}

.theme-light .modal-body::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.3);
}
</style>
