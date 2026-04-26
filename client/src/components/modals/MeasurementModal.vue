<template>
  <div 
    v-if="isVisible"
    ref="modalRef"
    class="measurement-modal"
    :style="modalStyle"
    @mousedown="startDrag"
  >
    <div class="modal-header">
      <h3>
        <span v-html="icon"></span>
        {{ title }}
      </h3>
      <div class="header-buttons">
        <button 
          v-if="pointsCount > 0"
          @click="$emit('cancel-measurement')" 
          class="header-btn cancel-header-btn"
          title="Cancel current measurement"
        >
          <span v-html="ICON_CLOSE"></span>
        </button>
        <button @click="$emit('close')" class="header-btn close-btn" title="Close">
          <span v-html="ICON_CLOSE"></span>
        </button>
      </div>
    </div>

    <div class="modal-body">
      <!-- Instructions -->
      <div class="instructions">
        {{ instructions }}
      </div>

      <!-- Current measurement in progress -->
      <div v-if="pointsCount > 0" class="current-measurement">
        <div class="points-info">
          <strong>Points:</strong> {{ pointsCount }}{{ requiredPointsDisplay }}
        </div>
        <div v-if="currentValue" class="current-value">
          <strong>Result:</strong> <span class="value">{{ currentValue }}</span>
        </div>
        <div class="measurement-actions">
          <button 
            @click="$emit('undo-point')" 
            class="action-btn undo-btn"
            title="Remove last point"
          >
            ↶ Undo
          </button>
          <button 
            v-if="pointsCount >= minPoints"
            @click="$emit('save-current')"
            class="action-btn save-current-btn"
          >
            ✓ Save
          </button>
          <button 
            v-else
            class="action-btn save-current-btn disabled"
            disabled
            title="Add more points to save"
          >
            ✓ Save
          </button>
        </div>
      </div>

      <!-- Saved measurements list -->
      <div v-if="measurements.length > 0" class="measurements-list">
        <h4>Saved Measurements</h4>
        <div 
          v-for="(measurement, index) in measurements" 
          :key="index"
          class="measurement-item"
        >
          <div class="measurement-content">
            <span class="measurement-type">{{ getTypeLabel(measurement.type) }}</span>
            <span class="measurement-value">{{ measurement.value }}</span>
          </div>
          <button 
            @click="$emit('remove-measurement', index)" 
            class="remove-btn"
            title="Remove"
          >
            <span v-html="ICON_TRASH"></span>
          </button>
        </div>
      </div>

      <div v-if="measurements.length === 0 && pointsCount === 0" class="empty-state">
        No measurements yet.
      </div>
    </div>

    <div class="modal-footer">
      <button 
        @click="$emit('reset')" 
        class="reset-btn"
        :disabled="measurements.length === 0 && pointsCount === 0"
      >
        Reset All
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useModalDrag } from '@/composables/useModalDrag';
import { ICON_DISTANCE, ICON_AREA, ICON_CLOSE, ICON_TRASH } from '@/constants/icons';

const props = defineProps({
  isVisible: {
    type: Boolean,
    default: false
  },
  measurementType: {
    type: String,
    default: 'distance' // 'distance' or 'area'
  },
  measurements: {
    type: Array,
    default: () => []
  },
  pointsCount: {
    type: Number,
    default: 0
  },
  currentValue: {
    type: String,
    default: null
  }
});

defineEmits(['close', 'reset', 'remove-measurement', 'save-current', 'undo-point', 'cancel-measurement']);

const modalRef = ref(null);
const { modalStyle, startDrag } = useModalDrag(modalRef, { initialX: window.innerWidth - 320, initialY: 80 });

const minPoints = computed(() => {
  return props.measurementType === 'distance' ? 2 : 3;
});

const title = computed(() => {
  return props.measurementType === 'distance' ? 'Distance Measurement' : 'Area Measurement';
});

const icon = computed(() => {
  return props.measurementType === 'distance' ? ICON_DISTANCE : ICON_AREA;
});

const instructions = computed(() => {
  return props.measurementType === 'distance' 
    ? 'Click points in the scene to measure distance. Click "Save Measurement" when done.'
    : 'Click points in the scene to define an area. Click "Save Measurement" when done.';
});

const requiredPoints = computed(() => {
  return props.measurementType === 'distance' ? 2 : 3;
});

const requiredPointsDisplay = computed(() => {
  return props.measurementType === 'distance' ? ` / ${requiredPoints.value}` : '';
});

const getTypeLabel = (type) => {
  switch (type) {
    case 'distance': return 'Distance';
    case 'area': return 'Area';
    default: return type;
  }
};

</script>

<style scoped>
.measurement-modal {
  position: fixed;
  width: 300px;
  max-height: 500px;
  background: rgba(30, 30, 30, 0.95);
  border: 1px solid #444;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  color: #e0e0e0;
  font-family: 'Segoe UI', sans-serif;
  display: flex;
  flex-direction: column;
  z-index: 4000;
  backdrop-filter: blur(10px);
}

.theme-light .measurement-modal {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #ccc;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  color: #333;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #444;
  background: rgba(40, 40, 40, 0.8);
  border-radius: 8px 8px 0 0;
  cursor: move;
  user-select: none;
}

.theme-light .modal-header {
  border-bottom: 1px solid #ddd;
  background: rgba(248, 249, 250, 0.95);
}

.modal-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #fff;
}

.theme-light .modal-header h3 {
  color: #333;
}

.modal-header h3 :deep(span) {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  line-height: 1;
}

.modal-header h3 :deep(svg) {
  width: 16px;
  height: 16px;
  stroke: #4a9eff;
  display: block;
}

.theme-light .modal-header h3 :deep(svg) {
  stroke: #2563eb;
}

.header-buttons {
  display: flex;
  gap: 4px;
}

.header-btn {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.theme-light .header-btn {
  color: #666;
}

.header-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.theme-light .header-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #333;
}

.cancel-header-btn:hover {
  background: rgba(255, 80, 80, 0.2);
  color: #ff5050;
}

.theme-light .cancel-header-btn:hover {
  background: rgba(220, 53, 69, 0.15);
  color: #dc3545;
}

.header-btn :deep(svg) {
  width: 14px;
  height: 14px;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  max-height: 400px;
  user-select: text;
  cursor: auto;
}

.instructions {
  font-size: 12px;
  color: #aaa;
  margin-bottom: 16px;
  padding: 8px 12px;
  background: rgba(74, 158, 255, 0.1);
  border-left: 3px solid #4a9eff;
  border-radius: 4px;
  line-height: 1.5;
}

.theme-light .instructions {
  color: #666;
  background: rgba(59, 130, 246, 0.1);
  border-left: 3px solid #3b82f6;
}

.current-measurement {
  margin-bottom: 16px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  border: 1px solid #444;
}

.theme-light .current-measurement {
  background: #f8f9fa;
  border: 1px solid #ddd;
}

.points-info {
  font-size: 12px;
  color: #ccc;
  margin-bottom: 8px;
}

.theme-light .points-info {
  color: #666;
}

.points-info strong {
  color: #fff;
}

.theme-light .points-info strong {
  color: #333;
}

.current-value {
  font-size: 13px;
  color: #ccc;
}

.theme-light .current-value {
  color: #666;
}

.current-value strong {
  color: #fff;
}

.theme-light .current-value strong {
  color: #333;
}

.current-value .value {
  color: #4a9eff;
  font-weight: 600;
  font-size: 14px;
}

.theme-light .current-value .value {
  color: #0d6efd;
}

.measurement-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.action-btn {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  transition: all 0.2s;
  background: rgba(255, 255, 255, 0.05);
  color: #ccc;
}

.theme-light .action-btn {
  border: 1px solid #ccc;
  background: #fff;
  color: #666;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #666;
}

.theme-light .action-btn:hover {
  background: #f8f9fa;
  border-color: #999;
}

.undo-btn:hover {
  background: rgba(74, 158, 255, 0.2);
  border-color: rgba(74, 158, 255, 0.4);
  color: #4a9eff;
}

.theme-light .undo-btn:hover {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.4);
  color: #3b82f6;
}

.save-current-btn {
  background: rgba(74, 158, 255, 0.1);
  border-color: rgba(74, 158, 255, 0.3);
  color: #4a9eff;
}

.theme-light .save-current-btn {
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.3);
  color: #0d6efd;
}

.save-current-btn:hover:not(.disabled) {
  background: rgba(74, 158, 255, 0.3);
  border-color: rgba(74, 158, 255, 0.5);
  color: #6bb0ff;
}

.theme-light .save-current-btn:hover:not(.disabled) {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.5);
  color: #0a58ca;
}

.save-current-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.measurements-list h4 {
  margin: 0 0 12px 0;
  font-size: 12px;
  font-weight: 600;
  color: #aaa;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.theme-light .measurements-list h4 {
  color: #6c757d;
}

.measurement-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid #444;
  border-radius: 6px;
  margin-bottom: 8px;
  transition: all 0.2s;
}

.theme-light .measurement-item {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
}

.measurement-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: #555;
}

.theme-light .measurement-item:hover {
  background: #e9ecef;
  border-color: #adb5bd;
}

.measurement-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.measurement-type {
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.theme-light .measurement-type {
  color: #6c757d;
}

.measurement-value {
  font-size: 14px;
  color: #4a9eff;
  font-weight: 600;
}

.theme-light .measurement-value {
  color: #0d6efd;
}

.remove-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.theme-light .remove-btn {
  color: #6c757d;
}

.remove-btn:hover {
  background: rgba(255, 80, 80, 0.2);
  color: #ff5050;
}

.theme-light .remove-btn:hover {
  background: rgba(220, 53, 69, 0.15);
  color: #dc3545;
}

.remove-btn :deep(svg) {
  width: 12px;
  height: 12px;
}

.empty-state {
  padding: 24px;
  text-align: center;
  color: #666;
  font-size: 12px;
  line-height: 1.6;
}

.theme-light .empty-state {
  color: #999;
}

.modal-footer {
  padding: 8px 16px;
  border-top: 1px solid #444;
  background: rgba(40, 40, 40, 0.8);
  border-radius: 0 0 8px 8px;
}

.theme-light .modal-footer {
  border-top: 1px solid #ddd;
  background: rgba(248, 249, 250, 0.95);
}

.reset-btn {
  width: 100%;
  padding: 6px 12px;
  background: rgba(255, 80, 80, 0.2);
  border: 1px solid rgba(255, 80, 80, 0.4);
  color: #ff8080;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s;
}

.theme-light .reset-btn {
  background: rgba(220, 53, 69, 0.1);
  border: 1px solid rgba(220, 53, 69, 0.3);
  color: #dc3545;
}

.reset-btn:hover:not(:disabled) {
  background: rgba(255, 80, 80, 0.3);
  border-color: rgba(255, 80, 80, 0.6);
  color: #ff5050;
}

.theme-light .reset-btn:hover:not(:disabled) {
  background: rgba(220, 53, 69, 0.2);
  border-color: rgba(220, 53, 69, 0.5);
  color: #bb2d3b;
}

.reset-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Scrollbar styling */
.modal-body::-webkit-scrollbar {
  width: 6px;
}

.modal-body::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.theme-light .modal-body::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.05);
}

.modal-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
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
