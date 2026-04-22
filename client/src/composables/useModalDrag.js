import { ref, computed, onUnmounted } from 'vue';

/**
 * Shared drag-to-reposition behaviour for floating modals.
 *
 * @param {import('vue').Ref} modalRef - Template ref pointing at the modal root element
 * @param {object} [options]
 * @param {number} [options.initialX] - Initial left position in px (default: near right edge)
 * @param {number} [options.initialY] - Initial top position in px (default: 80)
 * @returns {{ modalStyle: import('vue').ComputedRef, startDrag: Function }}
 */
export function useModalDrag(modalRef, { initialX = window.innerWidth - 330, initialY = 80 } = {}) {
  const isDragging = ref(false);
  const dragOffset = ref({ x: 0, y: 0 });
  const position = ref({ x: initialX, y: initialY });

  const modalStyle = computed(() => ({
    left: `${position.value.x}px`,
    top: `${position.value.y}px`,
  }));

  const onDrag = (e) => {
    if (!isDragging.value) return;
    const w = modalRef.value?.offsetWidth || 300;
    const h = modalRef.value?.offsetHeight || 300;
    position.value = {
      x: Math.max(0, Math.min(e.clientX - dragOffset.value.x, window.innerWidth - w)),
      y: Math.max(0, Math.min(e.clientY - dragOffset.value.y, window.innerHeight - h)),
    };
  };

  const stopDrag = () => {
    isDragging.value = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
  };

  const startDrag = (e) => {
    if (!e.target.closest('.modal-header')) return;
    if (e.target.closest('button')) return;
    isDragging.value = true;
    dragOffset.value = { x: e.clientX - position.value.x, y: e.clientY - position.value.y };
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
  };

  onUnmounted(() => {
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
  });

  return { modalStyle, startDrag };
}
