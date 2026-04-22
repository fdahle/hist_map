<template>
  <a
    v-if="showBugReportButton"
    href="https://github.com/fdahle/stratum3D/issues"
    target="_blank"
    rel="noopener noreferrer"
    class="bug-report-btn"
    title="Report a bug"
  >
    <span v-html="ICON_BUG"></span>
  </a>
</template>

<script setup>
import { storeToRefs } from 'pinia';
import { useSettingsStore } from '@/stores/settingsStore';
import { ICON_BUG } from '@/constants/icons.js';

const { showBugReportButton } = storeToRefs(useSettingsStore());
</script>

<style scoped>
.bug-report-btn {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: rgba(30, 30, 30, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.5);
  text-decoration: none;
  backdrop-filter: blur(4px);
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.bug-report-btn:hover {
  background: rgba(50, 50, 50, 0.92);
  color: #ff6b6b;
  border-color: rgba(255, 107, 107, 0.4);
}

.bug-report-btn :deep(svg) {
  width: 14px;
  height: 14px;
  display: block;
}

@media (max-width: 768px) {
  .bug-report-btn {
    top: auto;
    bottom: 80px;
    left: auto;
    right: 12px;
  }
}

/* Light theme */
.theme-light .bug-report-btn {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(0, 0, 0, 0.12);
  color: rgba(0, 0, 0, 0.4);
}

.theme-light .bug-report-btn:hover {
  background: rgba(255, 255, 255, 0.95);
  color: #e53e3e;
  border-color: rgba(229, 62, 62, 0.4);
}
</style>
