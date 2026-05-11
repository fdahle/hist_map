import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'

// Patch canvas 2D context creation to suppress the willReadFrequently warning.
// OpenLayers uses getImageData for hit-detection on every pointermove, which
// triggers the browser warning when willReadFrequently is not set.
const _origGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, attributes) {
  if (type === '2d') {
    attributes = { willReadFrequently: true, ...attributes };
  }
  return _origGetContext.call(this, type, attributes);
};

const app = createApp(App)

app.use(createPinia())
app.use(router)
await router.isReady()
app.mount('#app')