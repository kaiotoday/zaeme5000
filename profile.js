// ============================================
// ZÄME 5000 – Profile Module
// ============================================

import {
  getSession,
  updateSessionField,
  getProfileById,
  updateProfile,
  uploadAvatar,
  uploadSound,
  getAllBadges,
  getUserBadges,
  getUserTransactions
} from './supabase.js';

import {
  showToast,
  onViewChange
} from './router.js';

// ---- STATE ----
let currentProfile = null;
let allBadges = [];
let userBadgeIds = [];
let signatureAudio = null;

// ---- DOM REFS ----
const els = {};

function cacheDom() {
  // Profile header
  els.avatar = document.getElementById('profile-avatar');
  els.avatarUpload = document.getElementById('avatar-upload');
  els.profileName = document.getElementById('profile-name');
  els.profileRole = document.getElementById('profile-role');

  // Theme
  els.themeChips = document.querySelectorAll('.theme-chip');

  // Badges
  els.badgeShowcase = document.getElementById('badge-showcase');

  // Sound
  els.soundUpload = document.getElementById('sound-upload');
  els.soundPlay = document.getElementById('sound-play');

  // Logout
  els.logoutBtn = document.getElementById('btn-logout');
}

// ---- INIT ----

export async function initProfile() {
  cacheDom();
  bindEvents();

  // Listen for view changes to refresh on profile visit
  onViewChange((view) => {
    if (view === 'profile') {
      refreshProfile();
    }
  });
}

export async function refreshProfile() {
  const session = getSession();
  if (!session) return;

  try {
    // Fetch fresh profile data
    currentProfile = await getProfileById(session.id);

    if (!currentProfile) {
      showToast('Profil nöd gfunde.', 'error');
      return;
    }

    renderProfileHeader();
    renderThemeSelector();
    await loadBadges();
    setupSound();
  } catch (e) {
    console.error('Error loading profile:', e);
    showToast('Fehler bim Profil lade.', 'error');
  }
}

// ============================================
// PROFILE HEADER
// ============================================

function renderProfileHeader() {
  if (!currentProfile) return;

  // Name
  els.profileName.textContent = currentProfile.display_name || currentProfile.username;

  // Role badge
  els.profileRole.textContent = getRoleLabel(currentProfile.role);
  els.profileRole.style.background = getRoleColor(currentProfile.role);

  // Avatar
  if (currentProfile.avatar_url) {
    els.avatar.src = currentProfile.avatar_url;
    els.avatar.onerror = () => {
      els.avatar.src = generateDefaultAvatar(currentProfile.display_name);
    };
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
  const colors = ['#c8a06e', '#3a8fb7', '#e06080', '#6b9e5f', '#c8a050', '#8b7355'];
  const color = colors[initial.charCodeAt(0) % colors.length];
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <rect width="200" height="200" rx="4" fill="${color}"/>
      <text x="100" y="125" text-anchor="middle" fill="white" font-family="sans-serif" font-size="80" font-weight="bold">${initial}</text>
    </svg>
  `)}`;
}

// ---- AVATAR UPLOAD ----

async function handleAvatarUpload(file) {
  if (!file || !currentProfile) return;

  // Validate file type
  if (!file.type.startsWith('image/')) {
    showToast('Nur Bilder erlaubt!', 'warn');
    return;
  }

  // Validate size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    showToast('Bild isch z gross (max 5MB)', 'warn');
    return;
  }

  // Show loading state
  els.avatar.style.opacity = '0.5';
  els.avatar.style.filter = 'blur(2px)';

  try {
    // Compress if needed
    const processedFile = await compressImage(file, 400, 0.85);

    const url = await uploadAvatar(currentProfile.id, processedFile);

    // Update UI
    els.avatar.src = url;
    els.avatar.style.opacity = '';
    els.avatar.style.filter = '';

    // Update session cache
    updateSessionField('avatar_url', url);

    showToast('Profilbild aktualisiert! 📸', 'success');
  } catch (e) {
    console.error('Avatar upload error:', e);
    els.avatar.style.opacity = '';
    els.avatar.style.filter = '';
    showToast('Fehler bim Upload.', 'error');
  }

  // Reset input
  els.avatarUpload.value = '';
}

// ---- IMAGE COMPRESSION ----

function compressImage(file, maxSize = 400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // Scale down
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height / width) * maxSize);
            width = maxSize;
          } else {
            width = Math.round((width / height) * maxSize);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressed = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressed);
            } else {
              resolve(file); // fallback to original
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// ============================================
// THEME SELECTOR
// ============================================

function renderThemeSelector() {
  if (!currentProfile) return;

  const activeTheme = currentProfile.theme || 'cardboard';

  els.themeChips.forEach(chip => {
    chip.classList.toggle('active', chip.dataset.theme === activeTheme);
  });
}

async function handleThemeChange(theme) {
  if (!currentProfile) return;
  if (theme === currentProfile.theme) return;

  // Optimistic UI update
  document.body.dataset.theme = theme;

  // Update chip states
  els.themeChips.forEach(chip => {
    chip.classList.toggle('active', chip.dataset.theme === theme);
  });

  // Animate transition
  document.body.style.transition = 'background 0.5s ease, color 0.5s ease';
  setTimeout(() => {
    document.body.style.transition = '';
  }, 600);

  try {
    await updateProfile(currentProfile.id, { theme });
    currentProfile.theme = theme;

    // Update session cache
    updateSessionField('theme', theme);

    showToast(`Theme gwächslet: ${getThemeName(theme)} ✨`, 'success', 1500);
  } catch (e) {
    console.error('Theme change error:', e);
    // Revert on error
    document.body.dataset.theme = currentProfile.theme || 'cardboard';
    renderThemeSelector();
    showToast('Fehler bim Theme wächsle.', 'error');
  }
}

function getThemeName(theme) {
  switch (theme) {
    case 'cardboard': return '📦 Cardboard';
    case 'ocean': return '🌊 Ocean';
    case 'grunge': return '🖤 Grunge';
    case 'piggy': return '🐷 Piggy';
    default: return theme;
  }
}

// ============================================
// BADGES SHOWCASE
// ============================================

async function loadBadges() {
  if (!currentProfile) return;

  try {
    // Fetch all badges and user's badges in parallel
    const [badges, userBadges] = await Promise.all([
      getAllBadges(),
      getUserBadges(currentProfile.id)
    ]);

    allBadges = badges;
    userBadgeIds = userBadges.map(ub => ub.badge_id);

    renderBadges();
  } catch (e) {
    console.error('Error loading badges:', e);
  }
}

function renderBadges() {
  if (!els.badgeShowcase) return;
  els.badgeShowcase.innerHTML = '';

  if (allBadges.length === 0) {
    els.badgeShowcase.innerHTML = '<p style="grid-column:1/-1;font-size:0.85rem;color:var(--text-light);text-align:center;">Kei Badges verfügbar.</p>';
    return;
  }

  allBadges.forEach(badge => {
    const earned = userBadgeIds.includes(badge.id);
    const item = document.createElement('div');
    item.className = `badge-item ${earned ? 'earned' : 'locked'}`;

    item.innerHTML = `
      <span class="badge-icon">${badge.icon || '🏅'}</span>
      <span class="badge-name">${escapeHtml(badge.name)}</span>
    `;

    // Tooltip with description
    if (badge.description) {
      item.title = badge.description;
    }

    // Tap animation
    item.addEventListener('click', () => {
      if (earned) {
        showBadgeDetail(badge);
      } else {
        // Locked feedback
        item.style.animation = 'none';
        item.offsetHeight;
        item.style.animation = 'badge-shake 0.4s ease';
        showToast(`🔒 ${badge.name}: ${badge.description || 'Nonig freigschalte.'}`, 'info', 2000);
      }
    });

    els.badgeShowcase.appendChild(item);
  });

  // Inject badge shake animation
  injectBadgeAnimations();
}

function showBadgeDetail(badge) {
  // Simple toast with badge info
  showToast(`${badge.icon} ${badge.name} – ${badge.description || 'Errungeschaft!'}`, 'success', 2500);
}

let badgeAnimationsInjected = false;

function injectBadgeAnimations() {
  if (badgeAnimationsInjected) return;
  badgeAnimationsInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes badge-shake {
      0%, 100% { transform: translateX(0) rotate(0); }
      20% { transform: translateX(-3px) rotate(-2deg); }
      40% { transform: translateX(3px) rotate(2deg); }
      60% { transform: translateX(-2px) rotate(-1deg); }
      80% { transform: translateX(2px) rotate(1deg); }
    }

    @keyframes badge-earn {
      0% { transform: scale(0) rotate(-180deg); opacity: 0; }
      60% { transform: scale(1.2) rotate(10deg); opacity: 1; }
      80% { transform: scale(0.9) rotate(-5deg); }
      100% { transform: scale(1) rotate(0); }
    }

    .badge-item.just-earned {
      animation: badge-earn 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }
  `;
  document.head.appendChild(style);
}

// ---- PUBLIC: Award badge with animation ----

export function showBadgeEarned(badge) {
  if (!els.badgeShowcase) return;

  // Find the badge item and animate it
  const items = els.badgeShowcase.querySelectorAll('.badge-item');
  items.forEach(item => {
    const name = item.querySelector('.badge-name');
    if (name && name.textContent === badge.name) {
      item.classList.remove('locked');
      item.classList.add('earned', 'just-earned');
      setTimeout(() => item.classList.remove('just-earned'), 700);
    }
  });

  showToast(`🎉 Neus Badge: ${badge.icon} ${badge.name}!`, 'success', 3000);
}

// ============================================
// SIGNATURE SOUND
// ============================================

function setupSound() {
  if (!currentProfile) return;

  // Cleanup old audio
  if (signatureAudio) {
    signatureAudio.pause();
    signatureAudio = null;
  }

  if (currentProfile.signature_sound_url) {
    signatureAudio = new Audio(currentProfile.signature_sound_url);
    signatureAudio.volume = 0.7;
    els.soundPlay.disabled = false;
    els.soundPlay.textContent = '▶ Abspiilä';
  } else {
    els.soundPlay.disabled = true;
    els.soundPlay.textContent = '▶ Kei Sound';
  }
}

async function handleSoundUpload(file) {
  if (!file || !currentProfile) return;

  // Validate type
  if (!file.type.includes('audio') && !file.name.endsWith('.mp3')) {
    showToast('Nur MP3-Dateie erlaubt!', 'warn');
    return;
  }

  // Validate size (max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    showToast('Sound isch z gross (max 2MB)', 'warn');
    return;
  }

  els.soundPlay.disabled = true;
  els.soundPlay.textContent = 'Lade ufe...';

  try {
    const url = await uploadSound(currentProfile.id, file);
    currentProfile.signature_sound_url = url;

    // Setup new audio
    setupSound();

    showToast('Signature Sound gsetzt! 🔊', 'success');
  } catch (e) {
    console.error('Sound upload error:', e);
    showToast('Fehler bim Upload.', 'error');
    els.soundPlay.disabled = false;
    els.soundPlay.textContent = '▶ Abspiilä';
  }

  // Reset input
  els.soundUpload.value = '';
}

function handleSoundPlay() {
  if (!signatureAudio) return;

  if (signatureAudio.paused) {
    signatureAudio.currentTime = 0;
    signatureAudio.play()
      .then(() => {
        els.soundPlay.textContent = '⏹ Stopp';
      })
      .catch(e => {
        console.error('Audio play error:', e);
        showToast('Sound chan nöd abgspillt werde.', 'error');
      });
  } else {
    signatureAudio.pause();
    signatureAudio.currentTime = 0;
    els.soundPlay.textContent = '▶ Abspiilä';
  }
}

// Listen for audio end
function onSoundEnded() {
  if (els.soundPlay) {
    els.soundPlay.textContent = '▶ Abspiilä';
  }
}

// ---- PUBLIC: Play someone's entrance sound ----

export function playEntranceSound(soundUrl) {
  if (!soundUrl) return;

  try {
    const audio = new Audio(soundUrl);
    audio.volume = 0.6;
    audio.play().catch(e => console.warn('Could not play entrance sound:', e));
  } catch (e) {
    console.warn('Entrance sound error:', e);
  }
}

// ============================================
// PROFILE STATS SUMMARY
// ============================================

export async function getProfileStats(userId) {
  try {
    const [profile, badges, transactions] = await Promise.all([
      getProfileById(userId),
      getUserBadges(userId),
      getUserTransactions(userId)
    ]);

    return {
      batzen: parseFloat(profile?.batzen || 0),
      badgeCount: badges.length,
      totalTransactions: transactions.length,
      totalSpent: transactions
        .filter(t => parseFloat(t.amount) < 0)
        .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0),
      totalPaid: transactions
        .filter(t => parseFloat(t.amount) > 0)
        .reduce((sum, t) => sum + parseFloat(t.amount), 0)
    };
  } catch (e) {
    console.error('Error getting profile stats:', e);
    return { batzen: 0, badgeCount: 0, totalTransactions: 0, totalSpent: 0, totalPaid: 0 };
  }
}

// ============================================
// LOGOUT
// ============================================

let logoutCallback = null;

export function setLogoutCallback(callback) {
  logoutCallback = callback;
}

function handleLogout() {
  // Confirm
  const confirmed = confirm('Würkli usälogge?');
  if (!confirmed) return;

  // Cleanup
  if (signatureAudio) {
    signatureAudio.pause();
    signatureAudio = null;
  }

  currentProfile = null;
  allBadges = [];
  userBadgeIds = [];

  showToast('Tschüss! 👋', 'info', 1500);

  // Callback
  if (logoutCallback) {
    setTimeout(() => logoutCallback(), 500);
  }
}

// ============================================
// EVENT BINDINGS
// ============================================

function bindEvents() {
  // Avatar upload
  if (els.avatarUpload) {
    els.avatarUpload.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleAvatarUpload(e.target.files[0]);
      }
    });
  }

  // Theme chips
  els.themeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      // Tap animation
      chip.style.transform = 'scale(0.92)';
      setTimeout(() => {
        chip.style.transform = '';
      }, 150);

      handleThemeChange(chip.dataset.theme);
    });
  });

  // Sound upload
  if (els.soundUpload) {
    els.soundUpload.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleSoundUpload(e.target.files[0]);
      }
    });
  }

  // Sound play
  if (els.soundPlay) {
    els.soundPlay.addEventListener('click', handleSoundPlay);
  }

  // Logout
  if (els.logoutBtn) {
    els.logoutBtn.addEventListener('click', handleLogout);
  }
}

// ============================================
// UTILITIES
// ============================================

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- CLEANUP ----

export function destroyProfile() {
  if (signatureAudio) {
    signatureAudio.pause();
    signatureAudio = null;
  }
  currentProfile = null;
  allBadges = [];
  userBadgeIds = [];
}
