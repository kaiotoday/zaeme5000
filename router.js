// ============================================
// ZÄME 5000 – Router Module (SPA Navigation)
// ============================================

// ---- STATE ----
let currentView = 'home';
let viewChangeCallbacks = [];
let modalStack = []; // Track open modals for back-button

// ---- DOM REFS ----
const els = {};

function cacheDom() {
  els.appShell = document.getElementById('app-shell');
  els.viewHome = document.getElementById('view-home');
  els.viewProfile = document.getElementById('view-profile');
  els.viewAuth = document.getElementById('view-auth');
  els.bottomNav = document.getElementById('bottom-nav');
  els.topBar = document.getElementById('top-bar');
  els.navBtns = document.querySelectorAll('.nav-btn');

  // Modals
  els.eventModal = document.getElementById('event-modal');
  els.eventModalBackdrop = els.eventModal?.querySelector('.bottom-sheet-backdrop');
  els.eventModalClose = document.getElementById('modal-close');
  els.ideaModal = document.getElementById('idea-modal');
  els.ideaClose = document.getElementById('idea-close');
  els.ideaBtn = document.getElementById('btn-idea');
  els.splash = document.getElementById('splash-screen');
}

// ---- VIEWS REGISTRY ----

const VIEWS = {
  home: {
    el: () => els.viewHome,
    title: 'Zäme 5000',
    navBtn: 'home'
  },
  profile: {
    el: () => els.viewProfile,
    title: 'Profil',
    navBtn: 'profile'
  }
};

// ---- INIT ----

export function initRouter() {
  cacheDom();
  bindNavEvents();
  bindModalEvents();
  bindBackButton();

  // Set initial view from hash
  const hash = window.location.hash.replace('#', '');
  if (VIEWS[hash]) {
    navigateTo(hash, false);
  } else {
    navigateTo('home', false);
  }
}

// ---- NAVIGATION ----

export function navigateTo(viewName, updateHash = true) {
  if (!VIEWS[viewName]) {
    console.warn(`View "${viewName}" not found`);
    return;
  }

  const prevView = currentView;
  currentView = viewName;

  // Hide all views
  Object.keys(VIEWS).forEach(key => {
    const viewEl = VIEWS[key].el();
    if (viewEl) {
      viewEl.classList.add('hidden');
      viewEl.style.display = 'none';
    }
  });

  // Show target view
  const targetEl = VIEWS[viewName].el();
  if (targetEl) {
    targetEl.classList.remove('hidden');
    targetEl.style.display = '';

    // Scroll to top on view change
    targetEl.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // Update nav buttons
  els.navBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === VIEWS[viewName].navBtn);
  });

  // Update top bar title
  const titleEl = els.topBar?.querySelector('.top-bar-title');
  if (titleEl) {
    titleEl.textContent = VIEWS[viewName].title;
  }

  // Update URL hash
  if (updateHash) {
    window.location.hash = viewName;
  }

  // Fire callbacks
  viewChangeCallbacks.forEach(cb => {
    try { cb(viewName, prevView); } catch (e) { console.error('View change callback error:', e); }
  });
}

export function getCurrentView() {
  return currentView;
}

// ---- VIEW CHANGE HOOKS ----

export function onViewChange(callback) {
  if (typeof callback === 'function') {
    viewChangeCallbacks.push(callback);
  }
}

export function offViewChange(callback) {
  viewChangeCallbacks = viewChangeCallbacks.filter(cb => cb !== callback);
}

// ---- SHOW / HIDE APP SHELL ----

export function showApp() {
  els.viewAuth.classList.add('hidden');
  els.viewAuth.style.display = 'none';
  els.appShell.classList.remove('hidden');
  els.appShell.style.display = '';

  // Make sure initial view is visible
  navigateTo(currentView, false);
}

export function showAuth() {
  els.appShell.classList.add('hidden');
  els.appShell.style.display = 'none';
  els.viewAuth.classList.remove('hidden');
  els.viewAuth.style.display = '';
}

// ---- SPLASH SCREEN ----

export function hideSplash() {
  if (els.splash) {
    els.splash.classList.add('fade-out');
    setTimeout(() => {
      els.splash.style.display = 'none';
    }, 500);
  }
}

export function showSplash() {
  if (els.splash) {
    els.splash.classList.remove('fade-out');
    els.splash.style.display = '';
  }
}

// ============================================
// MODAL MANAGEMENT
// ============================================

// ---- EVENT BOTTOM SHEET ----

export function openEventModal() {
  if (!els.eventModal) return;

  els.eventModal.classList.remove('hidden');
  els.eventModal.style.display = '';

  // Trigger animation on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      els.eventModal.classList.add('open');
    });
  });

  // Prevent body scroll
  document.body.style.overflow = 'hidden';

  // Track in modal stack
  pushModal('event');
}

export function closeEventModal() {
  if (!els.eventModal) return;

  els.eventModal.classList.remove('open');

  // Wait for animation to complete
  setTimeout(() => {
    els.eventModal.classList.add('hidden');
    els.eventModal.style.display = 'none';
    document.body.style.overflow = '';
  }, 350);

  popModal('event');
}

export function isEventModalOpen() {
  return els.eventModal && els.eventModal.classList.contains('open');
}

// ---- IDEA MODAL ----

export function openIdeaModal() {
  if (!els.ideaModal) return;

  els.ideaModal.classList.remove('hidden');
  els.ideaModal.style.display = '';

  pushModal('idea');
}

export function closeIdeaModal() {
  if (!els.ideaModal) return;

  els.ideaModal.classList.add('hidden');
  els.ideaModal.style.display = 'none';

  popModal('idea');
}

export function isIdeaModalOpen() {
  return els.ideaModal && !els.ideaModal.classList.contains('hidden');
}

// ---- GENERIC MODAL HELPERS ----

function pushModal(name) {
  if (!modalStack.includes(name)) {
    modalStack.push(name);
  }
}

function popModal(name) {
  modalStack = modalStack.filter(m => m !== name);
}

export function closeTopModal() {
  if (modalStack.length === 0) return false;

  const top = modalStack[modalStack.length - 1];

  switch (top) {
    case 'event':
      closeEventModal();
      return true;
    case 'idea':
      closeIdeaModal();
      return true;
    default:
      modalStack.pop();
      return false;
  }
}

export function hasOpenModal() {
  return modalStack.length > 0;
}

// ============================================
// EVENT MODAL TABS
// ============================================

let currentTab = 'info';
let tabChangeCallbacks = [];

export function switchTab(tabName) {
  currentTab = tabName;

  // Update tab buttons
  const tabs = els.eventModal.querySelectorAll('.modal-tab');
  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });

  // Update tab content
  const contents = els.eventModal.querySelectorAll('.modal-tab-content');
  contents.forEach(content => {
    content.classList.toggle('active', content.dataset.tabContent === tabName);
  });

  // Fire callbacks
  tabChangeCallbacks.forEach(cb => {
    try { cb(tabName); } catch (e) { console.error('Tab change callback error:', e); }
  });
}

export function getCurrentTab() {
  return currentTab;
}

export function onTabChange(callback) {
  if (typeof callback === 'function') {
    tabChangeCallbacks.push(callback);
  }
}

export function showTournamentTab() {
  const tab = document.getElementById('tab-turnier');
  if (tab) {
    tab.classList.remove('hidden');
    tab.style.display = '';
  }
}

export function hideTournamentTab() {
  const tab = document.getElementById('tab-turnier');
  if (tab) {
    tab.classList.add('hidden');
    tab.style.display = 'none';
  }
}

// ============================================
// EVENT BINDINGS
// ============================================

function bindNavEvents() {
  // Bottom nav buttons
  els.navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view && view !== currentView) {
        // Haptic-style feedback
        animateNavBtn(btn);
        navigateTo(view);
      }
    });
  });

  // Hash change (browser back/forward)
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (VIEWS[hash] && hash !== currentView) {
      navigateTo(hash, false);
    }
  });
}

function bindModalEvents() {
  // Event Modal: Close button
  if (els.eventModalClose) {
    els.eventModalClose.addEventListener('click', closeEventModal);
  }

  // Event Modal: Backdrop click
  if (els.eventModalBackdrop) {
    els.eventModalBackdrop.addEventListener('click', closeEventModal);
  }

  // Event Modal: Tabs
  const modalTabs = els.eventModal?.querySelectorAll('.modal-tab');
  if (modalTabs) {
    modalTabs.forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
  }

  // Event Modal: Swipe down to close
  if (els.eventModal) {
    setupSwipeToClose(els.eventModal.querySelector('.bottom-sheet-content'));
  }

  // Idea Modal: Open
  if (els.ideaBtn) {
    els.ideaBtn.addEventListener('click', openIdeaModal);
  }

  // Idea Modal: Close
  if (els.ideaClose) {
    els.ideaClose.addEventListener('click', closeIdeaModal);
  }

  // Idea Modal: Backdrop click
  if (els.ideaModal) {
    els.ideaModal.addEventListener('click', (e) => {
      if (e.target === els.ideaModal) {
        closeIdeaModal();
      }
    });
  }

  // Escape key closes top modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeTopModal();
    }
  });
}

function bindBackButton() {
  // Handle Android back button / browser back
  window.addEventListener('popstate', (e) => {
    if (hasOpenModal()) {
      e.preventDefault();
      closeTopModal();
      // Re-push state so back button still works
      window.history.pushState(null, '', window.location.href);
    }
  });

  // Push initial state
  window.history.pushState(null, '', window.location.href);
}

// ============================================
// SWIPE-TO-CLOSE (Bottom Sheet)
// ============================================

function setupSwipeToClose(contentEl) {
  if (!contentEl) return;

  let startY = 0;
  let currentY = 0;
  let isDragging = false;
  const threshold = 100; // px needed to trigger close

  contentEl.addEventListener('touchstart', (e) => {
    // Only trigger if at scroll top
    if (contentEl.scrollTop > 5) return;

    const handle = contentEl.querySelector('.bottom-sheet-handle');
    const touch = e.touches[0];

    // Only start drag from top area (first 60px) or handle
    if (touch.clientY - contentEl.getBoundingClientRect().top > 60 && !handle?.contains(e.target)) {
      return;
    }

    startY = touch.clientY;
    isDragging = true;
    contentEl.style.transition = 'none';
  }, { passive: true });

  contentEl.addEventListener('touchmove', (e) => {
    if (!isDragging) return;

    currentY = e.touches[0].clientY;
    const diff = currentY - startY;

    // Only allow downward drag
    if (diff > 0) {
      contentEl.style.transform = `translateY(${diff}px)`;
      // Fade backdrop
      const opacity = Math.max(0, 1 - diff / 300);
      const backdrop = els.eventModal.querySelector('.bottom-sheet-backdrop');
      if (backdrop) backdrop.style.opacity = opacity;
    }
  }, { passive: true });

  contentEl.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;

    const diff = currentY - startY;

    // Reset transition
    contentEl.style.transition = '';

    if (diff > threshold) {
      // Close
      closeEventModal();
    } else {
      // Snap back
      contentEl.style.transform = '';
      const backdrop = els.eventModal.querySelector('.bottom-sheet-backdrop');
      if (backdrop) backdrop.style.opacity = '';
    }

    currentY = 0;
    startY = 0;
  }, { passive: true });
}

// ============================================
// NAV ANIMATION
// ============================================

function animateNavBtn(btn) {
  // Quick scale bounce
  btn.style.transform = 'scale(0.85)';
  setTimeout(() => {
    btn.style.transform = '';
  }, 150);
}

// ============================================
// NOTIFICATION TOAST (reusable)
// ============================================

let toastTimeout = null;

export function showToast(message, type = 'info', duration = 3000) {
  // Remove existing toast
  const existingToast = document.querySelector('.toast-notification');
  if (existingToast) {
    existingToast.remove();
    clearTimeout(toastTimeout);
  }

  // Create toast
  const toast = document.createElement('div');
  toast.className = `toast-notification toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${getToastIcon(type)}</span>
    <span class="toast-msg">${message}</span>
  `;

  // Inject styles if not present
  injectToastStyles();

  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.add('toast-visible');
  });

  // Auto dismiss
  toastTimeout = setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);

  // Tap to dismiss
  toast.addEventListener('click', () => {
    clearTimeout(toastTimeout);
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  });
}

function getToastIcon(type) {
  switch (type) {
    case 'success': return '✅';
    case 'error': return '❌';
    case 'warn': return '⚠️';
    default: return 'ℹ️';
  }
}

let toastStylesInjected = false;

function injectToastStyles() {
  if (toastStylesInjected) return;
  toastStylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .toast-notification {
      position: fixed;
      bottom: calc(var(--bottom-nav-h) + 16px);
      left: 16px;
      right: 16px;
      max-width: 500px;
      margin: 0 auto;
      padding: 14px 18px;
      border-radius: var(--radius);
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 400;
      font-size: 0.9rem;
      font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      transform: translateY(20px);
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }

    .toast-notification.toast-visible {
      transform: translateY(0);
      opacity: 1;
    }

    .toast-info {
      background: var(--glass-bg);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--glass-border);
      color: var(--text);
    }

    .toast-success {
      background: var(--success);
      color: white;
    }

    .toast-error {
      background: var(--danger);
      color: white;
    }

    .toast-warn {
      background: var(--warn);
      color: var(--text);
    }

    .toast-icon { font-size: 1.1rem; flex-shrink: 0; }
    .toast-msg { flex: 1; }
  `;
  document.head.appendChild(style);
}

// ============================================
// PAGE VISIBILITY (for polling optimization)
// ============================================

let visibilityCallbacks = [];

export function onVisibilityChange(callback) {
  visibilityCallbacks.push(callback);
}

document.addEventListener('visibilitychange', () => {
  const visible = !document.hidden;
  visibilityCallbacks.forEach(cb => {
    try { cb(visible); } catch (e) { console.error('Visibility callback error:', e); }
  });
});

export function isPageVisible() {
  return !document.hidden;
}
