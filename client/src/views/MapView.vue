<template>
  <div class="app-layout">
    <MapRibbonMenu
      v-if="settingsStore.showMapRibbon"
      :is-measuring-distance="isMeasurementModalVisible && activeMeasurementType === 'distance'"
      :is-measuring-area="isMeasurementModalVisible && activeMeasurementType === 'area'"
      :is-elevation-open="isElevationModalVisible"
      :is-volume-open="isVolumeModalVisible"
      :is-pins-open="isPinsOpen"
      @add-files="handleRibbonFiles"
      @measure-distance="onMeasureDistance"
      @measure-area="onMeasureArea"
      @elevation-profile="onElevationProfile"
      @volume-calc="onVolumeCalc"
      @share-scene="isShareSceneOpen = true"
      @extended-search="onExtendedSearch"
      @toggle-pins="onTogglePins"
      @toggle-bookmarks="isBookmarksOpen = !isBookmarksOpen"
      :is-bookmarks-open="isBookmarksOpen"
    />

    <div
      class="content-row"
      @dragover.prevent="handleDragOver"
      @dragleave="handleDragLeave"
      @drop.prevent="handleDrop"
    >
      <button class="menu-toggle" @click="isLayerPanelOpen = !isLayerPanelOpen">
        ☰
      </button>

      <div
        class="main-layerpanel-wrap"
        :class="{ open: isLayerPanelOpen }"
        :style="{ width: layerPanelWidth + 'px' }"
      >
        <LayerPanel
          class="main-layerpanel"
          @open-settings="isSettingsOpen = true"
        />
        <div class="layerpanel-resize-handle" @mousedown="startLayerPanelResize"></div>
      </div>

      <div
        v-if="isLayerPanelOpen"
        class="layerpanel-overlay"
        @click="isLayerPanelOpen = false"
      ></div>

      <div class="map-area">
      <MapWidget :is-pins-open="isPinsOpen" />
      <SearchBar />
      <PinPanel :is-open="isPinsOpen" @close="isPinsOpen = false" />
      <div
        class="bottom-left-control"
        :class="{ 'has-info-bar': settingsStore.showInfoBar }"
      >
        <BaseMapSwitcher />
      </div>
      <AttributionOverlay />
      <InformationBar v-if="settingsStore.showInfoBar" />
      <AttributePanel />
      <BugReportButton />

      <!-- Notification toast -->
      <Transition name="notification">
        <div
          v-if="notification"
          class="drop-notification"
          :class="'drop-notification--' + notification.type"
        >
          {{ notification.message }}
        </div>
      </Transition>
      </div>

      <!-- Drag-and-drop overlay covering the full content row -->
      <div v-if="isDragging" class="drop-overlay">
        <div class="drop-overlay-content">
          <div class="drop-icon">
            <svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
              <path d="M12 8v8M8 12l4-4 4 4" stroke-width="1.3"/>
            </svg>
          </div>
          <div class="drop-text">Drop file to add layer</div>
        </div>
      </div>
    </div>

    <MapBookmarksModal :is-visible="isBookmarksOpen" @close="isBookmarksOpen = false" />

    <SettingsModal :is-open="isSettingsOpen" @close="isSettingsOpen = false" />

    <ShareSceneModal :is-open="isShareSceneOpen" @close="isShareSceneOpen = false" />

    <ExtendedSearchModal :is-open="isExtendedSearchOpen" @close="isExtendedSearchOpen = false" />

    <MeasurementModal
      :is-visible="isMeasurementModalVisible"
      :measurement-type="activeMeasurementType"
      :measurements="measurements"
      :points-count="measurementPointsCount"
      :current-value="currentMeasurementValue"
      @close="closeMeasurementModal"
      @reset="resetMeasurements"
      @remove-measurement="removeMeasurement"
      @save-current="saveCurrentMeasurement"
      @undo-point="undoLastPoint"
      @cancel-measurement="cancelCurrentMeasurement"
    />

    <ElevationModal
      :is-visible="isElevationModalVisible"
      :is-drawing="isElevationDrawing"
      :is-loading="isElevationLoading"
      :profile-data="elevationProfile"
      @close="closeElevationModal"
      @toggle-draw="onToggleElevationDraw"
      @finish-draw="onFinishElevationDraw"
      @hover-profile="onElevationHoverProfile"
      @reset-profile="onResetElevationProfile"
    />

    <VolumeModal
      :is-visible="isVolumeModalVisible"
      :is-drawing="isVolumeDrawing"
      :is-loading="isVolumeLoading"
      :volume-data="volumeResult"
      @close="closeVolumeModal"
      @toggle-draw="onToggleVolumeDraw"
      @finish-draw="onFinishVolumeDraw"
      @reset-result="onResetVolumeResult"
    />

    <CsvColumnPickerModal
      :is-open="csvModalOpen"
      :file-name="csvModalFileName"
      :columns="csvModalColumns"
      :sample-rows="csvModalSampleRows"
      :preselected-x="csvModalPreX"
      :preselected-y="csvModalPreY"
      @confirm="handleCsvConfirm"
      @cancel="handleCsvCancel"
    />
  </div>
</template>

<script setup>
import { ref, inject, onUnmounted } from 'vue';
import { useMapStore } from '../stores/map/mapStore';
import { useLayerStore } from '../stores/map/layerStore';
import { useSettingsStore } from '../stores/settingsStore';
import AttributePanel from '../components/map/AttributePanel.vue';
import BaseMapSwitcher from '../components/map/BaseMapSwitcher.vue';
import InformationBar from '../components/map/InformationBar.vue';
import AttributionOverlay from '../components/map/AttributionOverlay.vue';
import MapWidget from '../components/map/MapWidget.vue';
import SearchBar from '../components/map/SearchBar.vue';
import LayerPanel from '../components/map/LayerPanel.vue';
import MapRibbonMenu from '../components/map/MapRibbonMenu.vue';
import MeasurementModal from '../components/modals/MeasurementModal.vue';
import ElevationModal from '../components/modals/ElevationModal.vue';
import VolumeModal from '../components/modals/VolumeModal.vue';
import ShareSceneModal from '../components/modals/ShareSceneModal.vue';
import ExtendedSearchModal from '../components/modals/ExtendedSearchModal.vue';
import SettingsModal from '../components/modals/SettingsModal.vue';
import CsvColumnPickerModal from '../components/modals/CsvColumnPickerModal.vue';
import PinPanel from '../components/map/PinPanel.vue';
import BugReportButton from '../components/common/BugReportButton.vue';
import MapBookmarksModal from '../components/modals/MapBookmarksModal.vue';
import { useMeasurementMode } from '../composables/useMeasurementMode';
import { useElevationProfile } from '../composables/useElevationProfile';
import { useVolumeCalculation } from '../composables/useVolumeCalculation';
import { useFileDropHandler } from '../composables/useFileDropHandler';

const settingsStore = useSettingsStore();
const mapStore = useMapStore();
const layerStore = useLayerStore();
const layerManagerRef = inject('layerManager');

// ── UI state ──────────────────────────────────────────────────────────────────
const isSettingsOpen = ref(false);
const isLayerPanelOpen = ref(false);
const isShareSceneOpen = ref(false);
const isExtendedSearchOpen = ref(false);
const isPinsOpen = ref(false);
const isBookmarksOpen = ref(false);

// ── Layer panel resize ────────────────────────────────────────────────────────
const LP_MIN = 180, LP_MAX = 480, LP_DEFAULT = 280;
const layerPanelWidth = ref(
  Math.min(LP_MAX, Math.max(LP_MIN, parseInt(localStorage.getItem('s3d_layerpanel_width')) || LP_DEFAULT))
);
const startLayerPanelResize = (e) => {
  e.preventDefault();
  const startX = e.clientX;
  const startWidth = layerPanelWidth.value;
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  const onMove = (me) => {
    layerPanelWidth.value = Math.min(LP_MAX, Math.max(LP_MIN, startWidth + me.clientX - startX));
  };
  const onUp = () => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem('s3d_layerpanel_width', String(layerPanelWidth.value));
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
};

// ── Composables ───────────────────────────────────────────────────────────────
const {
  isMeasurementModalVisible, activeMeasurementType, measurements,
  measurementPointsCount, currentMeasurementValue,
  openMeasurementMode, closeMeasurementModal,
  resetMeasurements, removeMeasurement, saveCurrentMeasurement,
  undoLastPoint, cancelCurrentMeasurement,
} = useMeasurementMode(mapStore, layerManagerRef);

const {
  isElevationModalVisible, isElevationDrawing, isElevationLoading, elevationProfile,
  openElevationModal, closeElevationModal,
  onResetElevationProfile, onToggleElevationDraw, onFinishElevationDraw, onElevationHoverProfile,
} = useElevationProfile(mapStore, layerStore, layerManagerRef);

const {
  isVolumeModalVisible, isVolumeDrawing, isVolumeLoading, volumeResult,
  openVolumeModal, closeVolumeModal,
  onResetVolumeResult, onToggleVolumeDraw, onFinishVolumeDraw,
} = useVolumeCalculation(mapStore, layerStore, layerManagerRef);

const {
  isDragging, notification,
  csvModalOpen, csvModalFileName, csvModalColumns, csvModalSampleRows, csvModalPreX, csvModalPreY,
  handleDragOver, handleDragLeave, handleDrop, handleRibbonFiles,
  handleCsvConfirm, handleCsvCancel,
  cleanup: cleanupFileDropHandler,
} = useFileDropHandler(mapStore, layerManagerRef);

onUnmounted(cleanupFileDropHandler);

// ── Tool orchestration ────────────────────────────────────────────────────────
// Closes all exclusive tools so only one is active at a time.
// Extended search is non-exclusive and intentionally excluded.
const closeAllTools = () => {
  if (isMeasurementModalVisible.value) closeMeasurementModal();
  if (isElevationModalVisible.value) closeElevationModal();
  if (isVolumeModalVisible.value) closeVolumeModal();
  if (isPinsOpen.value) isPinsOpen.value = false;
};

const onMeasureDistance = () => {
  if (isMeasurementModalVisible.value && activeMeasurementType.value === 'distance') {
    closeMeasurementModal();
  } else {
    closeAllTools();
    layerManagerRef.value?.setSelectionActive(false);
    openMeasurementMode('distance');
  }
};

const onMeasureArea = () => {
  if (isMeasurementModalVisible.value && activeMeasurementType.value === 'area') {
    closeMeasurementModal();
  } else {
    closeAllTools();
    layerManagerRef.value?.setSelectionActive(false);
    openMeasurementMode('area');
  }
};

const onElevationProfile = () => {
  if (isElevationModalVisible.value) {
    closeElevationModal();
  } else {
    closeAllTools();
    layerManagerRef.value?.setSelectionActive(false);
    openElevationModal();
  }
};

const onVolumeCalc = () => {
  if (isVolumeModalVisible.value) {
    closeVolumeModal();
  } else {
    closeAllTools();
    layerManagerRef.value?.setSelectionActive(false);
    openVolumeModal();
  }
};

const onExtendedSearch = () => {
  isExtendedSearchOpen.value = !isExtendedSearchOpen.value;
};

const onTogglePins = () => {
  if (isPinsOpen.value) {
    isPinsOpen.value = false;
  } else {
    closeAllTools();
    isPinsOpen.value = true;
  }
};

</script>

<style scoped>
/* --- DEFAULT DESKTOP STYLES --- */
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
}

.content-row {
  display: flex;
  flex: 1;
  min-height: 0;
  position: relative;
}

.main-layerpanel-wrap {
  position: relative;
  flex-shrink: 0;
  z-index: 2000;
}

.main-layerpanel {
  width: 100%;
  height: 100%;
}

.layerpanel-resize-handle {
  position: absolute;
  right: -3px;
  top: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 2001;
  background: transparent;
  transition: background 0.15s;
}

.layerpanel-resize-handle:hover {
  background: rgba(100, 100, 100, 0.18);
}

.map-area {
  flex: 1;
  position: relative;
  min-width: 0;
  overflow: hidden;
}

.menu-toggle {
  display: none;
}

.layerpanel-overlay {
  display: none;
}

/* --- CONTROL POSITIONING --- */
.bottom-left-control {
  position: absolute;
  bottom: 25px;
  left: 20px;
  z-index: 1000;
  transition: bottom 0.3s ease; /* Smooth animation */
}

/* 4. ADDED: Moves switcher up when InfoBar is visible */
.bottom-left-control.has-info-bar {
  bottom: 40px; /* 28px bar + 12px gap */
}

/* --- MOBILE STYLES (Max Width 768px) --- */
@media (max-width: 768px) {
  .menu-toggle {
    display: block;
    position: absolute;
    top: 15px;
    left: 15px;
    z-index: 3000;
    background: white;
    border: none;
    font-size: 24px;
    padding: 8px 12px;
    border-radius: 4px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
    cursor: pointer;
  }

  .theme-dark .menu-toggle {
    background: #2a2a2a;
    color: #e0e0e0;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
  }

  .main-layerpanel-wrap {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    transform: translateX(-100%);
    transition: transform 0.3s ease-in-out;
    box-shadow: 2px 0 10px rgba(0, 0, 0, 0.3);
    z-index: 3500;
  }

  .main-layerpanel-wrap.open {
    transform: translateX(0);
  }

  .layerpanel-resize-handle {
    display: none;
  }

  .layerpanel-overlay {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 3200;
    backdrop-filter: blur(2px);
  }

  .bottom-left-control {
    bottom: 30px;
    left: 10px;
    transform: scale(0.9);
    transform-origin: bottom left;
  }

  /* Adjust mobile spacing for InfoBar */
  .bottom-left-control.has-info-bar {
    bottom: 45px;
  }

  .attribute-panel {
    width: 100% !important;
    height: 50% !important;
    top: auto !important;
    bottom: 0 !important;
    border-top: 2px solid #ddd;
  }
}

/* --- DRAG AND DROP --- */
.drop-overlay {
  position: absolute;
  inset: 0;
  background: rgba(30, 100, 200, 0.18);
  border: 3px dashed #3388ff;
  border-radius: 4px;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.drop-overlay-content {
  text-align: center;
  color: #1a4fa0;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 12px;
  padding: 32px 48px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18);
}

.theme-dark .drop-overlay-content {
  color: #90c8ff;
  background: rgba(30, 40, 60, 0.92);
}

.drop-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.drop-text {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 6px;
}

.drop-subtext {
  font-size: 13px;
  opacity: 0.7;
}

.drop-notification {
  position: absolute;
  bottom: 70px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5000;
  padding: 10px 20px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.2);
  white-space: nowrap;
  pointer-events: none;
}

.drop-notification--success {
  background: #2e7d32;
  color: #fff;
}

.drop-notification--warning {
  background: #e65100;
  color: #fff;
}

.drop-notification--error {
  background: #c62828;
  color: #fff;
}

.drop-notification--info {
  background: #1565c0;
  color: #fff;
}

.notification-enter-active,
.notification-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.notification-enter-from,
.notification-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  font-family: sans-serif;
  color: #666;
}

.theme-dark .loading {
  color: #999;
}

/* Error screen styles are in assets/error-screen.css (imported globally in App.vue) */
</style>