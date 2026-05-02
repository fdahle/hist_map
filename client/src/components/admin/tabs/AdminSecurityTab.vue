<template>
  <section class="tab-section">
    <!-- ── User Access Password ───────────────────────────────────────────── -->
    <div class="settings-card">
      <h3 class="card-title">User Access Password</h3>
      <p class="card-desc">Require visitors to enter a password before viewing the app. Leave unset for public access.</p>

      <div v-if="hasUserPassword" class="user-pw-active">
        <p class="user-pw-status">Password protection is <strong>active</strong>.</p>
        <p v-if="userPwSuccess" class="form-success">{{ userPwSuccess }}</p>
        <div class="form-actions">
          <button class="btn-danger-sm" :disabled="userPwSaving" @click="clearUserPassword">
            {{ userPwSaving ? 'Removing…' : 'Remove Password' }}
          </button>
        </div>
      </div>

      <form v-else class="password-form" @submit.prevent="setUserPassword">
        <div class="field">
          <label for="user-pw">Password <span class="field-hint-inline">(min 4 characters)</span></label>
          <input id="user-pw" v-model="userPassword" type="password" autocomplete="new-password"
            placeholder="Set access password" :disabled="userPwSaving" />
        </div>
        <p v-if="userPwError" class="form-error">{{ userPwError }}</p>
        <p v-if="userPwSuccess" class="form-success">{{ userPwSuccess }}</p>
        <div class="form-actions">
          <button type="submit" class="btn-primary-sm" :disabled="userPwSaving || !userPassword">
            {{ userPwSaving ? 'Saving…' : 'Enable Password' }}
          </button>
        </div>
      </form>
    </div>

    <!-- ── Admin Password ─────────────────────────────────────────────────── -->
    <div class="settings-card">
      <h3 class="card-title">Admin Password</h3>
      <form class="password-form" @submit.prevent="changePassword">
        <div class="field">
          <label for="new-pw">New password <span class="field-hint-inline">(min 8 characters)</span></label>
          <input id="new-pw" v-model="newPassword" type="password" autocomplete="new-password"
            placeholder="New password" :disabled="pwSaving" />
        </div>
        <div class="field">
          <label for="confirm-pw">Confirm new password</label>
          <input id="confirm-pw" v-model="confirmPassword" type="password" autocomplete="new-password"
            placeholder="Repeat password" :disabled="pwSaving" />
        </div>
        <p v-if="pwError" class="form-error">{{ pwError }}</p>
        <p v-if="pwSuccess" class="form-success">{{ pwSuccess }}</p>
        <div class="form-actions">
          <button type="submit" class="btn-primary-sm" :disabled="pwSaving || !newPassword || !confirmPassword">
            {{ pwSaving ? 'Saving…' : 'Change Password' }}
          </button>
        </div>
      </form>
    </div>

    <!-- ── Feature Flags ──────────────────────────────────────────────────── -->
    <div class="settings-card">
      <h3 class="card-title">Feature Flags</h3>
      <p class="card-desc">Control what users can do in the map and 3D viewer.</p>

      <div class="flag-list">
        <div class="flag-row">
          <div class="flag-info">
            <span class="flag-label">Map viewer access</span>
            <span class="flag-desc">Allow non-admin users to open the map viewer</span>
          </div>
          <div class="toggle-switch">
            <input id="flag-map-access" v-model="draft.ui.map_access" type="checkbox" @change="scheduleSave" />
            <label for="flag-map-access" class="slider"></label>
          </div>
        </div>

        <div class="flag-row">
          <div class="flag-info">
            <span class="flag-label">3D viewer access</span>
            <span class="flag-desc">Allow non-admin users to open the 3D viewer</span>
          </div>
          <div class="toggle-switch">
            <input id="flag-viewer-access" v-model="draft.ui.viewer_access" type="checkbox" @change="scheduleSave" />
            <label for="flag-viewer-access" class="slider"></label>
          </div>
        </div>

        <hr class="flag-divider" />

        <div class="flag-row">
          <div class="flag-info">
            <span class="flag-label">Map download</span>
            <span class="flag-desc">Show download buttons in the map viewer</span>
          </div>
          <div class="toggle-switch">
            <input id="flag-map-download" v-model="draft.ui.map_download" type="checkbox" @change="scheduleSave" />
            <label for="flag-map-download" class="slider"></label>
          </div>
        </div>

        <div class="flag-row">
          <div class="flag-info">
            <span class="flag-label">Map upload</span>
            <span class="flag-desc">Allow users to upload temporary data in the map viewer</span>
          </div>
          <div class="toggle-switch">
            <input id="flag-map-upload" v-model="draft.ui.map_upload" type="checkbox" @change="scheduleSave" />
            <label for="flag-map-upload" class="slider"></label>
          </div>
        </div>

        <div class="flag-row">
          <div class="flag-info">
            <span class="flag-label">3D viewer download</span>
            <span class="flag-desc">Show download buttons in the 3D viewer</span>
          </div>
          <div class="toggle-switch">
            <input id="flag-viewer-download" v-model="draft.ui.viewer_download" type="checkbox" @change="scheduleSave" />
            <label for="flag-viewer-download" class="slider"></label>
          </div>
        </div>

        <div class="flag-row">
          <div class="flag-info">
            <span class="flag-label">3D viewer upload</span>
            <span class="flag-desc">Allow users to upload temporary data in the 3D viewer</span>
          </div>
          <div class="toggle-switch">
            <input id="flag-viewer-upload" v-model="draft.ui.viewer_upload" type="checkbox" @change="scheduleSave" />
            <label for="flag-viewer-upload" class="slider"></label>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, inject, onMounted } from 'vue';
import { getApiUrl } from '../../../utils/config';

// ── Injected from AdminView ────────────────────────────────────────────────────
const authHeader      = inject('authHeader');
const getStoredPassword = inject('getStoredPassword');
const buildAuthHeader = inject('buildAuthHeader');
const draft           = inject('draft');
const scheduleSave    = inject('scheduleSave');
const storePassword   = inject('storePassword');

// ── User access password ───────────────────────────────────────────────────────
const hasUserPassword = ref(false);
const userPassword    = ref('');
const userPwSaving    = ref(false);
const userPwError     = ref('');
const userPwSuccess   = ref('');

onMounted(async () => {
  try {
    const res = await fetch(getApiUrl('/user/auth-status'));
    if (res.ok) {
      const data = await res.json();
      hasUserPassword.value = !!data.hasUserPassword;
    }
  } catch { /* ignore */ }
});

async function setUserPassword() {
  userPwError.value = '';
  userPwSuccess.value = '';
  if (userPassword.value.length < 4) { userPwError.value = 'Password must be at least 4 characters.'; return; }
  userPwSaving.value = true;
  try {
    const res = await fetch(getApiUrl('/admin/user-password'), {
      method: 'POST',
      headers: { Authorization: authHeader.value, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: userPassword.value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed (${res.status})`);
    }
    hasUserPassword.value = true;
    userPassword.value = '';
    userPwSuccess.value = 'Password enabled.';
    setTimeout(() => { userPwSuccess.value = ''; }, 4000);
  } catch (err) {
    userPwError.value = err.message;
  } finally {
    userPwSaving.value = false;
  }
}

async function clearUserPassword() {
  userPwSaving.value = true;
  try {
    const res = await fetch(getApiUrl('/admin/user-password'), {
      method: 'POST',
      headers: { Authorization: authHeader.value, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clear: true }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed (${res.status})`);
    }
    hasUserPassword.value = false;
    userPwSuccess.value = 'Password removed.';
    setTimeout(() => { userPwSuccess.value = ''; }, 4000);
  } catch (err) {
    userPwError.value = err.message;
  } finally {
    userPwSaving.value = false;
  }
}

// ── Admin password change ──────────────────────────────────────────────────────
const newPassword     = ref('');
const confirmPassword = ref('');
const pwSaving        = ref(false);
const pwError         = ref('');
const pwSuccess       = ref('');

async function changePassword() {
  pwError.value   = '';
  pwSuccess.value = '';
  if (newPassword.value.length < 8) { pwError.value = 'Password must be at least 8 characters.'; return; }
  if (newPassword.value !== confirmPassword.value) { pwError.value = 'Passwords do not match.'; return; }
  pwSaving.value = true;
  try {
    const res = await fetch(getApiUrl('/admin/change-password'), {
      method: 'POST',
      headers: { Authorization: authHeader.value, 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPassword: newPassword.value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Failed (${res.status})`);
    }
    // Update the in-memory password so the session stays valid
    storePassword(newPassword.value);
    newPassword.value     = '';
    confirmPassword.value = '';
    pwSuccess.value = 'Password changed successfully.';
    setTimeout(() => { pwSuccess.value = ''; }, 4000);
  } catch (err) {
    pwError.value = err.message;
  } finally {
    pwSaving.value = false;
  }
}
</script>

<style scoped>
.tab-section { max-width: 900px; display: flex; flex-direction: column; gap: 1rem; }

.settings-card {
  border: 1px solid var(--admin-border, #e0e0e0); border-radius: 8px;
  background: var(--admin-surface, #fff); padding: 1rem 1.1rem;
}
.card-title { font-size: 0.9rem; font-weight: 600; margin: 0 0 0.75rem; }
.card-desc  { font-size: 0.78rem; color: var(--admin-muted, #777); margin: 0 0 0.85rem; }

.password-form { display: flex; flex-direction: column; gap: 0.6rem; max-width: 380px; }
.field { display: flex; flex-direction: column; gap: 0.2rem; }
.field label { font-size: 0.78rem; font-weight: 500; color: var(--admin-text, #333); }
.field input {
  padding: 0.35rem 0.5rem; border: 1px solid var(--admin-input-border, #ccc);
  border-radius: 5px; font-size: 0.82rem; background: var(--admin-input-bg, #fff); color: var(--admin-text, #1a1a1a);
}
.field input:focus { outline: 2px solid #3b82f6; border-color: transparent; }
.field-hint-inline { font-size: 0.72rem; color: var(--admin-muted, #999); font-weight: 400; }

.form-error   { font-size: 0.78rem; color: #ef4444; margin: 0.1rem 0 0; }
.form-success { font-size: 0.78rem; color: #16a34a; margin: 0.1rem 0 0; }
.form-actions { display: flex; gap: 0.5rem; margin-top: 0.25rem; }

/* Flags */
.flag-list { display: flex; flex-direction: column; }
.flag-divider { border: none; border-top: 1px solid var(--admin-border, #e8e8e8); margin: 0.25rem 0; }
.flag-row {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 0.65rem 0; border-bottom: 1px solid var(--admin-border, #f0f0f0);
}
.flag-row:last-child { border-bottom: none; padding-bottom: 0; }
.flag-info { display: flex; flex-direction: column; gap: 0.1rem; }
.flag-label { font-size: 0.85rem; font-weight: 500; color: var(--admin-text, #1a1a1a); }
.flag-desc  { font-size: 0.75rem; color: var(--admin-muted, #777); }

/* Toggle */
.toggle-switch { display: flex; align-items: center; flex-shrink: 0; }
.toggle-switch input[type=checkbox] { display: none; }
.slider {
  width: 34px; height: 18px; border-radius: 9px; background: var(--admin-border, #ccc);
  cursor: pointer; position: relative; transition: background 0.15s; display: block;
}
.slider::after {
  content: ''; position: absolute; top: 2px; left: 2px;
  width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform 0.15s;
}
input:checked + .slider { background: #3b82f6; }
input:checked + .slider::after { transform: translateX(16px); }

/* Buttons */
.btn-primary-sm {
  padding: 0.35rem 0.75rem; border-radius: 5px; background: #3b82f6;
  border: 1px solid #3b82f6; color: #fff; font-size: 0.82rem; cursor: pointer;
}
.btn-primary-sm:hover:not(:disabled) { background: #2563eb; }
.btn-primary-sm:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-danger-sm {
  padding: 0.35rem 0.75rem; border-radius: 5px; background: #ef4444;
  border: 1px solid #ef4444; color: #fff; font-size: 0.82rem; cursor: pointer;
}
.btn-danger-sm:hover:not(:disabled) { background: #dc2626; }
.btn-danger-sm:disabled { opacity: 0.5; cursor: not-allowed; }

.user-pw-active { display: flex; flex-direction: column; gap: 0.5rem; }
.user-pw-status { font-size: 0.82rem; color: var(--admin-text, #333); margin: 0; }
</style>
