// ============================================
// ZÄME 5000 – Profile Module (Updated)
// ============================================

import {
  getSession,
  updateSessionField,
  getProfileById,
  updateProfile,
  uploadAvatar,
  getUserBadges,
  getUserTransactions,
  getUserAttendedEvents,
  eventEmoji
} from './supabase.js';

import {
  showToast,
  onViewChange
} from './router.js';

import { requestNotificationPermission } from './pings.js';

// ---- STATE ----
let currentProfile = null;
let attendedEvents = [];

// ---- DOM REFS ----
const els = {};

function cacheDom() {
  els.avatar = document.getElementById('profile-avatar');
  els.avatarUpload = document.getElementById('avatar-upload');
  els.profileName = document.getElementById('profile-name');
  els.profileRole = document.getElementById('profile-role');

  // Batzen
  els.batzenTotal = document.getElementById('batzen-total');
  els.batzenPlus = document.getElementById('batzen-plus');
  els.batzenMinus = document.getElementById('batzen-minus');

  // Language
  els.langChips = document.querySelectorAll('.lang-chip');

  // Theme
  els.themeChips = document.querySelectorAll('.theme-chip:not(.lang-chip)');

  // Badges
  els.badgeShowcase = document.getElementById('badge-showcase');

  // Notifications
  els.notifToggle = document.getElementById('notif-toggle');
  els.notifActivitiesSection = document.getElementById('notif-activities-section');
  els.notifActivityChips = document.querySelectorAll('.notif-chip');

  // Logout
  els.logoutBtn = document.getElementById('btn-logout');
}

// ---- INIT ----

export async function initProfile() {
  cacheDom();
  bindEvents();

  onViewChange((view) => {
    if (view === 'profile') refreshProfile();
  });
}

export async function refreshProfile() {
  const session = getSession();
  if (!session) return;

  try {
    currentProfile = await getProfileById(session.id);
    if (!currentProfile) return;

    renderProfileHeader();
    renderBatzen();
    renderLanguageSelector();
    renderThemeSelector();
    await loadEventBadges();
    renderNotifSettings();
  } catch (e) {
    console.error('Profile load error:', e);
  }
}

// ============================================
// PROFILE HEADER
// ============================================

function renderProfileHeader() {
  if (!currentProfile) return;

  els.profileName.textContent = currentProfile.display_name || currentProfile.username;
  els.profileRole.textContent = getRoleLabel(currentProfile.role);
  els.profileRole.style.background = getRoleColor(currentProfile.role);

  if (currentProfile.avatar_url) {
    els.avatar.src = currentProfile.avatar_url;
    els.avatar.onerror = () => { els.avatar.src = generateDefaultAvatar(currentProfile.display_name); };
  } else {
    els.avatar.src = generateDefaultAvatar(currentProfile.display_name);
  }
}

function getRoleLabel(role) {
  switch (role) {
    case 'admin': return '👑 Admin';
    case 'organizer': return '📋 Organizer';
    default: return '👤 Member';
  }
}

function getRoleColor(role) {
  switch (role) {
    case 'admin': return 'var(--danger)';
    case 'organizer': return 'var(--accent)';
    default: return 'var(--accent)';
  }
}

function generateDefaultAvatar(name = '') {
  const initial = (name.charAt(0) || '?').toUpperCase();
  const colors = ['#c8a06e', '#3a8fb7', '#e06080', '#6b9e5f', '#c8a050'];
  const color = colors[initial.charCodeAt(0) % colors.length];
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" rx="4" fill="${color}"/><text x="100" y="125" text-anchor="middle" fill="white" font-family="sans-serif" font-size="80" font-weight="bold">${initial}</text></svg>`)}`;
}

// ---- AVATAR UPLOAD ----

async function handleAvatarUpload(file) {
  if (!file || !currentProfile) return;
  if (!file.type.startsWith('image/')) { showToast('Nur Bilder!', 'warn'); return; }
  if (file.size > 5 * 1024 * 1024) { showToast('Max 5MB!', 'warn'); return; }

  els.avatar.style.opacity = '0.5';
  els.avatar.style.filter = 'blur(2px)';

  try {
    const processed = await compressImage(file, 400, 0.85);
    const url = await uploadAvatar(currentProfile.id, processed);
    els.avatar.src = url;
    els.avatar.style.opacity = '';
    els.avatar.style.filter = '';
    updateSessionField('avatar_url', url);
    showToast('Profilbild aktualisiert! 📸', 'success');
  } catch (e) {
    console.error('Avatar upload error:', e);
    els.avatar.style.opacity = '';
    els.avatar.style.filter = '';
    showToast('Fehler bim Upload.', 'error');
  }
  els.avatarUpload.value = '';
}

function compressImage(file, maxSize = 400, quality = 0.85) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) { height = Math.round((height / width) * maxSize); width = maxSize; }
          else { width = Math.round((width / height) * maxSize); height = maxSize; }
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file);
        }, 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

// ============================================
// BATZEN OVERVIEW
// ============================================

async function renderBatzen() {
  if (!currentProfile) return;

  try {
    const transactions = await getUserTransactions(currentProfile.id);

    const totalPlus = transactions
      .filter(t => parseFloat(t.amount) > 0)
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    const totalMinus = transactions
      .filter(t => parseFloat(t.amount) < 0)
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);

    const balance = parseFloat(currentProfile.batzen || 0);

    // Animate total
    if (els.batzenTotal) {
      const isPositive = balance >= 0;
      els.batzenTotal.textContent = `${isPositive ? '' : '-'} CHF ${Math.abs(balance).toFixed(2)}`;
      els.batzenTotal.style.color = isPositive ? 'var(--success)' : 'var(--danger)';
    }

    if (els.batzenPlus) els.batzenPlus.textContent = `+ CHF ${totalPlus.toFixed(2)}`;
    if (els.batzenMinus) els.batzenMinus.textContent = `- CHF ${totalMinus.toFixed(2)}`;

  } catch (e) {
    console.error('Batzen load error:', e);
  }
}

// ============================================
// LANGUAGE SELECTOR
// ============================================

function renderLanguageSelector() {
  const activeLang = currentProfile?.language || 'de';
  els.langChips.forEach(chip => {
    chip.classList.toggle('active', chip.dataset.lang === activeLang);
  });
}

async function handleLanguageChange(lang) {
  if (!currentProfile || lang === currentProfile.language) return;

  els.langChips.forEach(chip => {
    chip.classList.toggle('active', chip.dataset.lang === lang);
  });

  try {
    await updateProfile(currentProfile.id, { language: lang });
    currentProfile.language = lang;
    updateSessionField('language', lang);

    const names = { de: '🇨🇭 Düütsch', pt: '🇧🇷 Português', it: '🇮🇹 Italiano', es: '🇪🇸 Español' };
    showToast(`Spraach gwächslet: ${names[lang]} ✨`, 'success', 1500);
  } catch (e) {
    console.error('Language change error:', e);
    renderLanguageSelector();
    showToast('Fehler.', 'error');
  }
}

// ============================================
// THEME SELECTOR
// ============================================

function renderThemeSelector() {
  const activeTheme = currentProfile?.theme || 'cardboard';
  els.themeChips.forEach(chip => {
    if (chip.dataset.theme) {
      chip.classList.toggle('active', chip.dataset.theme === activeTheme);
    }
  
