import { createRouter, createWebHistory } from 'vue-router'
import { useSettingsStore } from '../stores/settingsStore'
import { getApiUrl } from '../utils/config'

import ThreeDView from '../views/3DView.vue'
import MapView from '../views/MapView.vue'
import AdminView from '../views/AdminView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'map',
      component: MapView,
      meta: { title: 'Map' }
    },
    {
      path: '/viewer',
      name: '3d-viewer',
      component: ThreeDView,
      meta: { title: '3D Viewer' }
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
      meta: { title: 'Admin' }
    }
  ]
})

router.beforeEach(async (to) => {
  if (to.name === '3d-viewer') {
    try {
      const res = await fetch(getApiUrl('/viewer/access-status'))
      if (res.ok) {
        const v = await res.json()
        if (v.viewerEnabled === false) {
          useSettingsStore().setViewerEnabled(false)
          return { name: 'map' }
        }
      }
    } catch { /* server unreachable — allow through */ }
  }

  if (to.name === 'admin') {
    // Always ask the server — don't rely on the store being populated yet
    // (e.g. direct browser navigation before App.vue has mounted)
    try {
      const res = await fetch(getApiUrl('/admin/setup-status'))
      if (res.ok) {
        const s = await res.json()
        if (s.adminEnabled === false) {
          useSettingsStore().setAdminEnabled(false)
          return { name: 'map' }
        }
      }
    } catch { /* server unreachable — allow through */ }
  }
})

router.afterEach((to) => {
  const base = document.title.split(' — ')[0] || document.title
  const pageTitle = to.meta?.title ?? null
  document.title = pageTitle ? `${base} — ${pageTitle}` : base
})

export default router