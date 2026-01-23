import { createApp } from 'vue'
import { createPinia } from 'pinia' // <--- 1. Import it
import App from './App.vue'

const app = createApp(App)

const pinia = createPinia() // <--- 2. Create the instance
app.use(pinia)              // <--- 3. Tell Vue to use it

app.mount('#app')