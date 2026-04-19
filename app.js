// ============================================
// ZÄME 5000 – Main App Entry Point
// ============================================
// This is the central orchestrator that initializes
// all modules and wires them together.
// ============================================

import { 
  getSession, 
  clearSession, 
  getProfileById,
  saveSession
} from './supabase.js';

import { initAuth, destroyAuth } from './auth.js';

import { 
  initRouter, 
  showApp, 
  showAuth, 
  hideSplash, 
  showSplash,
  navigateTo, 
  showToast,
  onViewChange,
  closeEventModal,
  closeIdeaModal
} from './router.js';

import { 
  initHome, 
  refreshHome, 
  destroyHome, 
  getEventFromCache,
  onIdeaModalOpen
} from './home.js';

import { 
  initEventModal, 
  openEvent, 
  destroyEventModal 
} from './event-modal.js';

import { 
  initProfile, 
  refreshProfile, 
  destroyProfile, 
  setLogoutCallback,
  playEntranceSound
} from './profile.js';

import { 
  initPings, 
  destroyPings, 
  startPolling, 
  stopPolling 
} from './pings.js';

import { 
  initAdmin, 
  destroyAdmin 
} from './admin.js';

// ============================================
// APP STATE
// ============================================

const App = {
  initialized: false,
  session: null,
  profile: null,
  modules: {
    router: false,
    auth: false,
    home: false,
    eventModal: false,
    profile: false,
    pings: false,
    admin: false
  }
};

// ============================================
// BOOT SEQUENCE
// ============================================

document.addEventListener('DOMContentLoaded', boot);

async function boot() {
  console.log('%c🎉 Zäme 5000 – Booting...', 'color:#c8a06e;font-size:16px;font-weight:bold;');

  try {
    // 1. Init router first (manages views, modals, nav)
    initRouter();
    App.modules.router = true;

    // 2. Check for existing session
    const session = getSession();

    if (session) {
      // Validate session is still good
      const isValid = await validateSession(session);

      if (isValid) {
        // Session valid → go straight to app
        App.session = session;
        await launchApp(session);
      } else {
        // Session expired or invalid
        clearSession();
        await launchAuth();
      }
    } else {
      // No session → show login
      await launchAuth();
    }

  } catch (e) {
    console.error('Boot error:', e);
    // Fallback: show auth
    hideSplash();
    await launchAuth();
  }
}

// ============================================
// SESSION VALIDATION
// ============================================

async function validateSession(session) {
  try {
    const profile = await getProfileById(session.id);

    if (!profile) {
      console.warn('Profile not found for session');
      return false;
    }

    if (!profile.approved) {
      console.warn('Profile not approved');
      showToast('Din Account isch nonig freigschalte.', 'warn');
      return false;
    }

    // Update session with fresh data
    App.profile = profile;
    saveSession(profile);

    // Apply theme
    document.body.dataset.theme = profile.theme || 'cardboard';

    return true;

  } catch (e) {
    console.error('Session validation error:', e);
    return false;
  }
}

// ============================================
// LAUNCH AUTH (Login/Register)
// ============================================

async function launchAuth() {
  hideSplash();

  // Cleanup any existing app state
  teardownApp();

  // Show auth view
  showAuth();

  // Init auth module with success callback
  if (!App.modules.auth) {
    await initAuth(onLoginSuccess);
    App.modules.auth = true;
  }
}

// ---- Login Success Callback ----

async function onLoginSuccess(profile) {
  console.log(`%c👋 Willkomme, ${profile.display_name}!`, 'color:#6b9e5f;font-size:14px;');

  App.session = getSession();
  App.profile = profile;

  // Cleanup auth
  destroyAuth();
  App.modules.auth = false;

  // Launch the app
  await launchApp(App.session);

  // Play entrance sound if exists
  if (profile.signature_sound_url) {
    setTimeout(() => {
      playEntranceSound(profile.signature_sound_url);
    }, 500);
  }

  // Welcome toast
  showToast(`Willkomme, ${profile.display_name}! 🎉`, 'success', 2500);
}

// ============================================
// LAUNCH APP (Main Experience)
// ============================================

async function launchApp(session) {
  console.log('%c🚀 Launching Zäme 5000...', 'color:#3a8fb7;font-size:14px;');

  // Show app shell
  showApp();

  // Initialize all modules in parallel where possible
  await initAllModules(session);

  // Hide splash with delay for smooth transition
  setTimeout(() => {
    hideSplash();
  }, 300);

  // Navigate to home
  navigateTo('home', false);

  App.initialized = true;

  console.log('%c✅ Zäme 5000 ready!', 'color:#6b9e5f;font-size:14px;font-weight:bold;');
}

async function initAllModules(session) {
  // Event Modal (no async needed, just binds events)
  if (!App.modules.eventModal) {
    initEventModal();
    App.modules.eventModal = true;
  }

  // Home (loads data from Supabase)
  if (!App.modules.home) {
    await initHome(handleEventClick);
    App.modules.home = true;
  }

  // Profile
  if (!App.modules.profile) {
    await initProfile();
    App.modules.profile = true;

    // Set logout callback
    setLogoutCallback(handleLogout);
  }

  // Pings (starts polling)
  if (!App.modules.pings) {
    initPings();
    App.modules.pings = true;
  }

  // Admin (checks permissions internally)
  if (!App.modules.admin) {
    await initAdmin();
    App.modules.admin = true;
  }
}

// ============================================
// GLOBAL EVENT HANDLERS
// ============================================

// ---- Event Card Click → Open Modal ----

function handleEventClick(eventId) {
  if (!eventId) return;

  console.log('Opening event:', eventId);
  openEvent(eventId);
}

// ---- Logout ----

function handleLogout() {
  console.log('%c🚪 Logging out...', 'color:#c0564f;font-size:14px;');

  // Clear session
  clearSession();
  App.session = null;
  App.profile = null;

  // Close any open modals
  closeEventModal();
  closeIdeaModal();

  // Teardown all modules
  teardownApp();

  // Reset theme to default
  document.body.dataset.theme = 'cardboard';

  // Launch auth
  launchAuth();
}

// ============================================
// TEARDOWN
// ============================================

function teardownApp() {
  console.log('Tearing down app modules...');

  if (App.modules.home) {
    destroyHome();
    App.modules.home = false;
  }

  if (App.modules.eventModal) {
    destroyEventModal();
    App.modules.eventModal = false;
  }

  if (App.modules.profile) {
    destroyProfile();
    App.modules.profile = false;
  }

  if (App.modules.pings) {
    destroyPings();
    App.modules.pings = false;
  }

  if (App.modules.admin) {
    destroyAdmin();
    App.modules.admin = false;
  }

  App.initialized = false;
}

// ============================================
// GLOBAL ERROR HANDLING
// ============================================

window.addEventListener('error', (e) => {
  console.error('Global error:', e.error);
  // Don't show toast for every error, just log it
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
  // Show toast only for network errors
  if (e.reason?.message?.includes('fetch') || e.reason?.message?.includes('network')) {
    showToast('Netzwerk-Fehler. Bisch online?', 'error');
  }
});

// ============================================
// ONLINE / OFFLINE HANDLING
// ============================================

let wasOffline = false;

window.addEventListener('online', () => {
  if (wasOffline) {
    wasOffline = false;
    showToast('Wieder online! 🟢', 'success', 2000);

    // Resume polling
    if (App.modules.pings) {
      startPolling();
    }

    // Refresh data
    if (App.modules.home) {
      refreshHome().catch(console.error);
    }
  }
});

window.addEventListener('offline', () => {
  wasOffline = true;
  showToast('Offline 🔴 – Manche Funktione gö nöd.', 'warn', 4000);

  // Pause polling
  if (App.modules.pings) {
    stopPolling();
  }
});

// ============================================
// PWA / INSTALL PROMPT
// ============================================

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;

  // Show install hint after a delay (non-intrusive)
  setTimeout(() => {
    showInstallHint();
  }, 30000); // Show after 30 seconds
});

function showInstallHint() {
  if (!deferredInstallPrompt) return;

  showToast('📱 Tipp: Füeg Zäme 5000 zum Homescreen hinzu!', 'info', 5000);
}

// Public function to trigger install
window.installApp = async () => {
  if (!deferredInstallPrompt) {
    showToast('Installiere über Browser-Menü → "Zum Homescreen"', 'info');
    return;
  }

  deferredInstallPrompt.prompt();
  const result = await deferredInstallPrompt.userChoice;

  if (result.outcome === 'accepted') {
    showToast('App installiert! 🎉', 'success');
  }

  deferredInstallPrompt = null;
};

// ============================================
// PERFORMANCE: Preload critical images
// ============================================

function preloadCriticalAssets() {
  // Preload fonts (already handled by <link> in HTML)
  // Preload any critical images here if needed

  // Prefetch Supabase connection
  if ('connection' in navigator) {
    const conn = navigator.connection;
    if (conn.saveData) {
      console.log('Save data mode detected – reducing asset loads');
    }
  }
}

preloadCriticalAssets();

// ============================================
// DEBUG HELPERS (accessible from console)
// ============================================

window.ZAM = {
  // Debug info
  getState: () => ({
    initialized: App.initialized,
    session: App.session,
    modules: { ...App.modules }
  }),

  // Manual refresh
  refresh: async () => {
    if (App.modules.home) await refreshHome();
    if (App.modules.profile) await refreshProfile();
    showToast('Refreshed! 🔄', 'info', 1500);
  },

  // Force theme
  setTheme: (theme) => {
    document.body.dataset.theme = theme;
    showToast(`Theme: ${theme}`, 'info', 1500);
  },

  // Navigate
  go: (view) => navigateTo(view),

  // Open event
  event: (id) => openEvent(id),

  // Version
  version: '1.0.0',
  name: 'Zäme 5000'
};

console.log(
  '%c' +
  '╔══════════════════════════════════╗\n' +
  '║         ZÄME 5000 v1.0.0        ║\n' +
  '║   Debug: window.ZAM.getState()  ║\n' +
  '╚══════════════════════════════════╝',
  'color: #c8a06e; font-family: monospace; font-size: 12px;'
);
