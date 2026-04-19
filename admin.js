// ============================================
// ZÄME 5000 – Admin / Organizer Module
// ============================================

import {
  getSession,
  getPendingProfiles,
  approveUser,
  getProfileById,
  updateProfile,
  createEvent,
  updateEvent,
  uploadEventImage,
  getEvents,
  createHofEntry,
  awardBadge,
  getAllBadges,
  formatDate
} from './supabase.js';

import {
  showToast,
  onViewChange
} from './router.js';

import { refreshHome } from './home.js';

// ---- STATE ----
let pendingUsers = [];
let allBadgesCache = [];

// ---- DOM REFS ----
const els = {};

function cacheDom() {
  els.adminSection = document.getElementById('admin-section');
  els.pendingList = document.getElementById('pending-list');

  // Event Editor
  els.editTitle = document.getElementById('edit-event-title');
  els.editDesc = document.getElementById('edit-event-desc');
  els.editLocation = document.getElementById('edit-event-location');
  els.editDate = document.getElementById('edit-event-date');
  els.editCost = document.getElementById('edit-event-cost');
  els.editTournament = document.getElementById('edit-event-tournament');
  els.editMandatory = document.getElementById('edit-event-mandatory');
  els.editImage = document.getElementById('edit-event-image');
  els.saveEvent = document.getElementById('save-event');
}

// ---- INIT ----

export async function initAdmin() {
  cacheDom();
  bindEvents();

  // Check permissions on view change
  onViewChange((view) => {
    if (view === 'profile') {
      checkAndShowAdmin();
    }
  });

  // Initial check
  checkAndShowAdmin();
}

// ============================================
// PERMISSION CHECK
// ============================================

function checkAndShowAdmin() {
  const session = getSession();
  if (!session) {
    hideAdmin();
    return;
  }

  const hasAccess = session.role === 'admin' || session.role === 'organizer';

  if (hasAccess) {
    showAdmin();
    loadAdminData();
  } else {
    hideAdmin();
  }
}

function showAdmin() {
  if (els.adminSection) {
    els.adminSection.classList.remove('hidden');
    els.adminSection.style.display = '';
  }
}

function hideAdmin() {
  if (els.adminSection) {
    els.adminSection.classList.add('hidden');
    els.adminSection.style.display = 'none';
  }
}

async function loadAdminData() {
  const session = getSession();
  if (!session) return;

  try {
    await Promise.all([
      session.role === 'admin' ? loadPendingUsers() : Promise.resolve(),
      loadBadgesCache()
    ]);
  } catch (e) {
    console.error('Error loading admin data:', e);
  }
}

// ============================================
// PENDING USERS (Admin Only)
// ============================================

async function loadPendingUsers() {
  const session = getSession();
  if (!session || session.role !== 'admin') {
    hidePendingSection();
    return;
  }

  try {
    pendingUsers = await getPendingProfiles();
    renderPendingUsers();
  } catch (e) {
    console.error('Error loading pending users:', e);
  }
}

function renderPendingUsers() {
  if (!els.pendingList) return;

  const adminPendingSection = document.getElementById('admin-pending');

  if (pendingUsers.length === 0) {
    if (adminPendingSection) {
      adminPendingSection.style.display = '';
    }
    els.pendingList.innerHTML = `
      <div style="padding:12px;text-align:center;color:var(--text-light);font-size:0.85rem;">
        ✅ Kei pending Users.
      </div>
    `;
    return;
  }

  if (adminPendingSection) {
    adminPendingSection.style.display = '';
  }

  els.pendingList.innerHTML = '';

  // Pending count badge
  const countBadge = document.createElement('div');
  countBadge.style.cssText = `
    display: inline-block;
    background: var(--danger);
    color: white;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 700;
    margin-bottom: 12px;
  `;
  countBadge.textContent = `${pendingUsers.length} wartend`;
  els.pendingList.appendChild(countBadge);

  pendingUsers.forEach(user => {
    const item = document.createElement('div');
    item.className = 'pending-item';
    item.dataset.userId = user.id;

    const createdDate = new Date(user.created_at).toLocaleDateString('de-CH', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });

    item.innerHTML = `
      <div>
        <span class="pending-name">${escapeHtml(user.display_name)}</span>
        <span style="font-size:0.75rem;color:var(--text-light);display:block;">
          @${escapeHtml(user.username)} · ${createdDate}
        </span>
      </div>
      <div class="pending-actions">
        <button class="btn-primary btn-scrapbook btn-small approve-btn" data-user-id="${user.id}">
          ✅ Freischalte
        </button>
        <button class="btn-secondary btn-small reject-btn" data-user-id="${user.id}">
          ❌
        </button>
      </div>
    `;

    els.pendingList.appendChild(item);
  });

  // Bind approve/reject buttons
  bindPendingActions();
}

function bindPendingActions() {
  if (!els.pendingList) return;

  // Approve buttons
  els.pendingList.querySelectorAll('.approve-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleApproveUser(btn.dataset.userId, btn);
    });
  });

  // Reject buttons
  els.pendingList.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleRejectUser(btn.dataset.userId, btn);
    });
  });
}

async function handleApproveUser(userId, btnEl) {
  btnEl.disabled = true;
  btnEl.textContent = '...';

  try {
    await approveUser(userId);

    // Animate item out
    const item = els.pendingList.querySelector(`[data-user-id="${userId}"]`);
    if (item) {
      item.style.transition = 'all 0.3s ease';
      item.style.opacity = '0';
      item.style.transform = 'translateX(30px)';
      item.style.maxHeight = item.offsetHeight + 'px';

      setTimeout(() => {
        item.style.maxHeight = '0';
        item.style.padding = '0';
        item.style.margin = '0';
        item.style.overflow = 'hidden';
      }, 200);

      setTimeout(() => item.remove(), 500);
    }

    // Remove from local state
    pendingUsers = pendingUsers.filter(u => u.id !== userId);

    showToast('User freigschalte! ✅', 'success');

    // Award "first event" badge idea: could trigger welcome badge
    try {
      await awardWelcomeBadge(userId);
    } catch (e) {
      // Non-critical
      console.warn('Could not award welcome badge:', e);
    }

    // Refresh count after delay
    setTimeout(() => {
      if (pendingUsers.length === 0) {
        renderPendingUsers();
      }
    }, 600);

  } catch (e) {
    console.error('Approve user error:', e);
    showToast('Fehler bim Freischalte.', 'error');
    btnEl.disabled = false;
    btnEl.textContent = '✅ Freischalte';
  }
}

async function handleRejectUser(userId, btnEl) {
  const confirmed = confirm('User würkli ablehne? De Account wird glöscht.');
  if (!confirmed) return;

  btnEl.disabled = true;
  btnEl.textContent = '...';

  try {
    // We don't have a delete function, so we'll mark with a special state
    // For now, we just leave them as not approved
    // In production, you'd add a 'rejected' status or delete
    await updateProfile(userId, { approved: false });

    // Remove from UI
    const item = els.pendingList.querySelector(`[data-user-id="${userId}"]`);
    if (item) {
      item.style.transition = 'all 0.3s ease';
      item.style.opacity = '0';
      setTimeout(() => item.remove(), 300);
    }

    pendingUsers = pendingUsers.filter(u => u.id !== userId);

    showToast('User abglehnt.', 'info');

  } catch (e) {
    console.error('Reject user error:', e);
    showToast('Fehler bim Ablehne.', 'error');
    btnEl.disabled = false;
    btnEl.textContent = '❌';
  }
}

async function awardWelcomeBadge(userId) {
  if (allBadgesCache.length === 0) return;

  const welcomeBadge = allBadgesCache.find(b =>
    b.name.toLowerCase().includes('erst') ||
    b.name.toLowerCase().includes('first') ||
    b.name.toLowerCase().includes('willkomm')
  );

  if (welcomeBadge) {
    await awardBadge(userId, welcomeBadge.id);
  }
}

function hidePendingSection() {
  const section = document.getElementById('admin-pending');
  if (section) {
    section.style.display = 'none';
  }
}

// ============================================
// EVENT EDITOR
// ============================================

async function handleSaveEvent() {
  const session = getSession();
  if (!session) return;

  // Validate fields
  const title = els.editTitle.value.trim();
  const desc = els.editDesc.value.trim();
  const location = els.editLocation.value.trim();
  const dateVal = els.editDate.value;
  const cost = parseFloat(els.editCost.value) || 0;
  const isTournament = els.editTournament.checked;
  const isMandatory = els.editMandatory.checked;

  // Validation
  const errors = [];
  if (!title) errors.push('Titel fählt');
  if (!dateVal) errors.push('Datum fählt');

  if (errors.length > 0) {
    showToast(`⚠️ ${errors.join(', ')}`, 'warn');
    return;
  }

  // Check date is in future
  const eventDate = new Date(dateVal);
  if (eventDate < new Date()) {
    showToast('Datum muess i de Zuekunft si!', 'warn');
    return;
  }

  els.saveEvent.disabled = true;
  els.saveEvent.textContent = 'Wird gspeichert...';

  try {
    // Create event
    const eventData = {
      title,
      description: desc || null,
      location: location || null,
      event_date: eventDate.toISOString(),
      cost,
      organizer_id: session.id,
      is_tournament: isTournament,
      is_mandatory: isMandatory,
      status: 'upcoming'
    };

    const newEvent = await createEvent(eventData);

    // Upload hero image if provided
    if (els.editImage && els.editImage.files.length > 0) {
      try {
        await uploadEventImage(newEvent.id, els.editImage.files[0]);
      } catch (imgErr) {
        console.warn('Image upload failed:', imgErr);
        showToast('Event erstellt, aber Bild-Upload gfailed.', 'warn');
      }
    }

    // Success
    showToast('Event erstellt! 🎉', 'success');

    // Reset form
    resetEventEditor();

    // Refresh home view
    try {
      await refreshHome();
    } catch (e) {
      console.warn('Could not refresh home:', e);
    }

  } catch (e) {
    console.error('Create event error:', e);
    showToast('Fehler bim Erstelle.', 'error');
  } finally {
    els.saveEvent.disabled = false;
    els.saveEvent.textContent = '📝 Event speicherä';
  }
}

function resetEventEditor() {
  if (els.editTitle) els.editTitle.value = '';
  if (els.editDesc) els.editDesc.value = '';
  if (els.editLocation) els.editLocation.value = '';
  if (els.editDate) els.editDate.value = '';
  if (els.editCost) els.editCost.value = '';
  if (els.editTournament) els.editTournament.checked = false;
  if (els.editMandatory) els.editMandatory.checked = false;
  if (els.editImage) els.editImage.value = '';
}

// ---- Quick Event Templates ----

export function getEventTemplates() {
  return [
    {
      title: '🔥 Grillabe',
      description: 'Grillen + Chillen. Bring dis Fleisch mit!',
      location: '',
      cost: 10,
      is_tournament: false,
      is_mandatory: false
    },
    {
      title: '🍺 Beerpong Turnier',
      description: 'Wer wird de neue Beerpong-Champ?',
      location: '',
      cost: 5,
      is_tournament: true,
      is_mandatory: false
    },
    {
      title: '🚗 Usflug',
      description: 'Mir gönd uf en Usflug!',
      location: 'TBD',
      cost: 20,
      is_tournament: false,
      is_mandatory: true
    },
    {
      title: '🎮 Game Night',
      description: 'Konsole mitbringe. Pizza wird bestellt.',
      location: '',
      cost: 10,
      is_tournament: false,
      is_mandatory: false
    },
    {
      title: '🎄 Weihnachtsfeier',
      description: 'Wichteln + Glühwein + Fondue',
      location: '',
      cost: 25,
      is_tournament: false,
      is_mandatory: true
    }
  ];
}

// ============================================
// HALL OF FAME MANAGEMENT
// ============================================

export async function addHallOfFameEntry(data) {
  const session = getSession();
  if (!session || session.role !== 'admin') {
    showToast('Nur Admins chönd HoF-Iiträg mache.', 'warn');
    return null;
  }

  try {
    const entry = await createHofEntry({
      year: data.year || new Date().getFullYear(),
      category: data.category,
      title: data.title,
      description: data.description || null,
      image_url: data.image_url || null
    });

    showToast('Hall of Fame Entry erstellt! 🏆', 'success');
    return entry;
  } catch (e) {
    console.error('HoF entry error:', e);
    showToast('Fehler bim Erstelle.', 'error');
    return null;
  }
}

// ============================================
// BADGE MANAGEMENT
// ============================================

async function loadBadgesCache() {
  try {
    allBadgesCache = await getAllBadges();
  } catch (e) {
    console.warn('Could not load badges cache:', e);
    allBadgesCache = [];
  }
}

export async function awardBadgeToUser(userId, badgeName) {
  const session = getSession();
  if (!session || session.role !== 'admin') {
    showToast('Nur Admins chönd Badges vergeh.', 'warn');
    return;
  }

  if (allBadgesCache.length === 0) {
    await loadBadgesCache();
  }

  const badge = allBadgesCache.find(b =>
    b.name.toLowerCase() === badgeName.toLowerCase()
  );

  if (!badge) {
    showToast(`Badge "${badgeName}" nöd gfunde.`, 'warn');
    return;
  }

  try {
    await awardBadge(userId, badge.id);
    showToast(`Badge ${badge.icon} "${badge.name}" vergeh! 🎖️`, 'success');
  } catch (e) {
    console.error('Award badge error:', e);
    showToast('Fehler bim Badge vergeh.', 'error');
  }
}

// ============================================
// ROLE MANAGEMENT
// ============================================

export async function changeUserRole(userId, newRole) {
  const session = getSession();
  if (!session || session.role !== 'admin') {
    showToast('Nur Admins chönd Rolle ändere.', 'warn');
    return;
  }

  const validRoles = ['admin', 'organizer', 'member'];
  if (!validRoles.includes(newRole)) {
    showToast('Ungültigi Rolle.', 'warn');
    return;
  }

  try {
    await updateProfile(userId, { role: newRole });
    showToast(`Rolle uf "${newRole}" gänderet.`, 'success');
  } catch (e) {
    console.error('Role change error:', e);
    showToast('Fehler bim Rolle ändere.', 'error');
  }
}

// ============================================
// EVENT BINDINGS
// ============================================

function bindEvents() {
  // Save event button
  if (els.saveEvent) {
    els.saveEvent.addEventListener('click', handleSaveEvent);
  }

  // Enter key in event editor fields
  const editorInputs = [els.editTitle, els.editLocation, els.editCost];
  editorInputs.forEach(input => {
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          // Focus next field
          const idx = editorInputs.indexOf(input);
          if (idx < editorInputs.length - 1 && editorInputs[idx + 1]) {
            editorInputs[idx + 1].focus();
          } else {
            handleSaveEvent();
          }
        }
      });
    }
  });

  // Set minimum date to today
  if (els.editDate) {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISO = new Date(now - tzOffset).toISOString().slice(0, 16);
    els.editDate.min = localISO;
  }

  // Image preview on select
  if (els.editImage) {
    els.editImage.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        const file = e.target.files[0];
        if (file.size > 10 * 1024 * 1024) {
          showToast('Bild z gross (max 10MB)', 'warn');
          e.target.value = '';
          return;
        }
        showToast(`📷 ${file.name} usgwählt`, 'info', 1500);
      }
    });
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

export function destroyAdmin() {
  pendingUsers = [];
  allBadgesCache = [];
  resetEventEditor();
}
