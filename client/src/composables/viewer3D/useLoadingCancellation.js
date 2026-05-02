import { ref } from 'vue';

export function useLoadingCancellation() {
  const loadingCancelled = ref(false);
  const activeReaders = new Set();
  let _activeStreamReader = null;
  const activeWorker = ref(null);
  const activeWorkerCancel = ref(null);

  const setActiveStreamReader = (reader) => { _activeStreamReader = reader; };
  const clearActiveStreamReader = () => { _activeStreamReader = null; };

  const cancelLoading = () => {
    loadingCancelled.value = true;
    for (const reader of activeReaders) {
      try { reader.abort(); } catch (_) {}
    }
    activeReaders.clear();
    if (_activeStreamReader) {
      try { _activeStreamReader.cancel(); } catch (_) {}
      _activeStreamReader = null;
    }
    if (activeWorker.value) {
      activeWorker.value.terminate();
      activeWorker.value = null;
    }
    activeWorkerCancel.value?.();
    activeWorkerCancel.value = null;
  };

  return {
    loadingCancelled,
    activeReaders,
    activeWorker,
    activeWorkerCancel,
    setActiveStreamReader,
    clearActiveStreamReader,
    cancelLoading,
  };
}
