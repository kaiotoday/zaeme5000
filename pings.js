// ============================================
// ZÄME 5000 – Ping / Buzzer Module (Updated)
// ============================================

import {
  getSession,
  getProfileById,
  getActivePings,
  createPing,
  deactivatePing,
  getPingJoins,
  joinPing,
  getDurationText,
  getLanguageFlag,
  timeAgo
} from './supabase.js';

import {
  showToast,
  onViewChange,
  onVisibilityChange,
  isPageVisible
} from './router.js';

// ---- STATE ----
let pollingInterval = null;
let lastPingIds = new Set();
let selectedActivity = null;
let selectedLocation = null;
let selectedDuration = null;
let customActivityActive = false;
let customLocationActive = false;
let isFirstPoll = true;
let notificationQueue = [];
let isShowingNotification = false;
let currentNotifPingId = null;

const POLL_INTERVAL = 10000;
const PING_MAX_AGE = 2 * 60 * 60 * 1000;

// ---- DOM REFS ----
const els = {};

function cacheDom() {
  els.activityChips = document.getElementById('ping-activity-chips');
  els.activityCustom = document.getElementById('ping-activity-custom');
  els.locationChips = document.getElementById('ping-location-chips');
  els.locationCustom = document.getElementById('ping-location-custom');
  els.durationChips = document.getElementById('ping-duration-chips');
  els.sendBtn = document.getElementById('ping-send');
  els.pingList = document.getElementById('ping-list');
  els.notification = document.getElementById('ping-notification');
  els.notifAvatar = document.getElementById('ping-notif-avatar');
  els.notifSender = document.getElementById('ping-notif-sender');
  els.notifText = document.getElementById('ping-notif-text');
  els.notifJoin = document.getElementById('ping-notif-join');
  els.notifDismiss = document.getElementById('ping-notif-dismiss');
}

// ---- INIT ----

export function initPings() {
  cacheDom();
  bindComposerEvents();
  bindNotificationEvents();
  startPolling();

  onVisibilityChange((visible) => {
    if (visible) startPolling();
    else stopPolling();
  });

  onViewChange((view) => {
    if (view === 'profile') fetchAndRenderPings();
  });
}

// ============================================
// COMPOSER
// ============================================

function bindComposerEvents() {
  if (els.activityChips) {
    els.activityChips.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => handleActivityChip(chip));
    });
  }

  if (els.locationChips) {
    els.locationChips.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => handleLocationChip(chip));
    });
  }

  if (els.durationChips) {
    els.durationChips.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => handleDurationChip(chip));
    });
  }

  if (els.activityCustom) {
    els.activityCustom.addEventListener('input', () => {
      if (customActivityActive) {
        selectedActivity = els.activityCustom.value.trim() || null;
        validateComposer();
      }
    });
  }

  if (els.locationCustom) {
    els.locationCustom.addEventListener('input', () => {
      if (customLocationActive) {
        selectedLocation = els.locationCustom.value.trim() || null;
        validateComposer();
      }
    });
  }

  if (els.sendBtn) {
    els.sendBtn.addEventListener('click', handleSendPing);
  }
}

function handleActivityChip(chip) {
  const value = chip.dataset.value;
  els.activityChips.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));

  if (value === 'custom') {
    customActivityActive = true;
    els.activityCustom.classList.remove('hidden');
    els.activityCustom.style.display = '';
    els.activityCustom.focus();
    chip.classList.add('selected');
    selectedActivity = els.activityCustom.value.trim() || null;
  } else {
    customActivityActive = false;
    els.activityCustom.classList.add('hidden');
    els.activityCustom.style.display = 'none';
    els.activityCustom.value = '';
    if (selectedActivity === value) {
      selectedActivity = null;
    } else {
      selectedActivity = value;
      chip.classList.add('selected');
    }
  }
  animateChip(chip);
  validateComposer();
}

function handleLocationChip(chip) {
  const value = chip.dataset.value;
  els.locationChips.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));

  if (value === 'custom') {
    customLocationActive = true;
    els.locationCustom.classList.remove('hidden');
    els.locationCustom.style.display = '';
    els.locationCustom.focus();
    chip.classList.add('selected');
    selectedLocation = els.locationCustom.value.trim() || null;
  } else {
    customLocationActive = false;
    els.locationCustom.classList.add('hidden');
    els.locationCustom.style.display = 'none';
    els.locationCustom.value = '';
    if (selectedLocation === value) {
      selectedLocation = null;
    } else {
      selectedLocation = value;
      chip.classList.add('selected');
    }
  }
  animateChip(chip);
  validateComposer();
}

function handleDurationChip(chip) {
  const value = chip.dataset.value;
  els.durationChips.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));

  if (selectedDuration === value) {
    selectedDuration = null;
  } else {
    selectedDuration = value;
    chip.classList.add('selected');
  }
  animateChip(chip);
  validateComposer();
}

function animateChip(chip) {
  chip.style.transform = 'scale(0.9)';
  setTimeout(() => { chip.style.transform = ''; }, 120);
}

function validateComposer() {
  const valid = selectedActivity && selectedDuration;
  if (els.sendBtn) els.sendBtn.disabled = !valid;
}

function resetComposer() {
  selectedActivity = null;
  selectedLocation = null;
  selectedDuration = null;
  customActivityActive = false;
  customLocationActive = false;

  [els.activityChips, els.locationChips, els.durationChips].forEach(group => {
    if (group) group.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
  });

  if (els.activityCustom) {
    els.activityCustom.classList.add('hidden');
    els.activityCustom.style.display = 'none';
    els.activityCustom.value = '';
  }
  if (els.locationCustom) {
    els.locationCustom.classList.add('hidden');
    els.locationCustom.style.display = 'none';
    els.locationCustom.value = '';
  }
  validateComposer();
}

// ============================================
// SEND PING
// ============================================

async function handleSendPing() {
  const session = getSession();
  if (!session) return;

  if (!selectedActivity || !selectedDuration) {
    showToast('Wähl Aktivität und Duur!', 'warn');
    return;
  }

  els.sendBtn.disabled = true;
  els.sendBtn.textContent = '📡 Wird gsendet...';

  try {
    await createPing({
      sender_id: session.id,
      activity: selectedActivity,
      location: selectedLocation || null,
      time_text: selectedDuration // Store duration value (15/30/60/120/999)
    });

    els.sendBtn.textContent = '✅ Gsendet!';
    els.sendBtn.style.background = 'var(--success)';
    showToast('Ping gsendet! 📡', 'success', 2000);

    // Also send push notification to others
    await sendPushToOthers(session, selectedActivity, selectedLocation, selectedDuration);

    setTimeout(() => {
      els.sendBtn.style.background = '';
      els.sendBtn.textContent = '📡 PING SÄNDÄ';
      resetComposer();
    }, 1500);

    await fetchAndRenderPings();

  } catch (e) {
    console.error('Send ping error:', e);
    showToast('Fehler bim Sändä.', 'error');
    els.sendBtn.disabled = false;
    els.sendBtn.textContent = '📡 PING SÄNDÄ';
  }
}

// ============================================
// PUSH NOTIFICATIONS
// ============================================

async function sendPushToOthers(session, activity, location, duration) {
  // This will be handled by service worker + subscription
  // For now, in-app notifications are the primary mechanism
  // Push will be added via sw.js
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported');
    return false;
  }

  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function showNativeNotification(title, body, icon) {
  if (Notification.permission !== 'granted') return;

  try {
    const notif = new Notification(title, {
      body,
      icon: icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [100, 50, 100],
      tag: 'zaeme-ping',
      renotify: true
    });

    notif.onclick = () => {
      window.focus();
      notif.close();
    };

    setTimeout(() => notif.close(), 8000);
  } catch (e) {
    console.warn('Native notification error:', e);
  }
}

// ============================================
// POLLING
// ============================================

export function startPolling() {
  stopPolling();
  fetchAndRenderPings();
  pollingInterval = setInterval(() => {
    if (isPageVisible()) fetchAndRenderPings();
  }, POLL_INTERVAL);
}

export function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

async function fetchAndRenderPings() {
  try {
    const pings = await getActivePings();
    const now = Date.now();
    const activePings = pings.filter(p => (now - new Date(p.created_at).getTime()) < PING_MAX_AGE);

    const session = getSession();
    const currentIds = new Set(activePings.map(p => p.id));

    if (!isFirstPoll && session) {
      activePings.forEach(ping => {
        if (!lastPingIds.has(ping.id) && ping.sender_id !== session.id) {
          queueNotification(ping);

          // Also native notification if page not visible
          if (!isPageVisible()) {
            const senderName = ping.sender?.display_name || 'Öpper';
            const senderLang = ping.sender?.language || 'de';
            const durationText = getDurationText(ping.time_text, senderLang);
            const flag = getLanguageFlag(senderLang);
            const locationStr = ping.location ? ` · ${ping.location}` : '';
            showNativeNotification(
              `📡 ${senderName}`,
              `${ping.activity}${locationStr} · ${flag} ${durationText}`
            );
          }
        }
      });
    }

    isFirstPoll = false;
    lastPingIds = currentIds;

    const pingsWithJoins = await Promise.all(
      activePings.map(async (ping) => {
        try {
          const joins = await getPingJoins(ping.id);
          return { ...ping, joins };
        } catch {
          return { ...ping, joins: [] };
        }
      })
    );

    renderPingFeed(pingsWithJoins);
    processNotificationQueue();

  } catch (e) {
    console.error('Ping polling error:', e);
  }
}

// ============================================
// PING FEED
// ============================================

function renderPingFeed(pings) {
  if (!els.pingList) return;

  if (pings.length === 0) {
    els.pingList.innerHTML = `
      <div style="text-align:center;padding:20px;color:var(--text-light);">
        <div style="font-size:2rem;margin-bottom:6px;">🦗</div>
        <p style="font-size:0.85rem;">Kei aktivi Pings. Buzz someone!</p>
      </div>
    `;
    return;
  }

  const session = getSession();
  const newContent = pings.map(p => `${p.id}-${p.joins?.length || 0}`).join(',');
  if (els.pingList.dataset.contentHash === newContent) return;
  els.pingList.dataset.contentHash = newContent;

  els.pingList.innerHTML = '';

  pings.forEach(ping => {
    const item = document.createElement('div');
    item.className = 'ping-item';
    item.dataset.pingId = ping.id;

    const senderName = ping.sender?.display_name || 'Unbekannt';
    const senderAvatar = ping.sender?.avatar_url || generateMiniAvatar(senderName);
    const senderLang = ping.sender?.language || 'de';
    const locationStr = ping.location ? ` · ${ping.location}` : '';
    const createdAgo = timeAgo(ping.created_at);

    // Duration in sender's language
    const durationText = getDurationText(ping.time_text, senderLang);
    const flag = getLanguageFlag(senderLang);

    const joins = ping.joins || [];
    let joinersHtml = '';
    if (joins.length > 0) {
      const names = joins.map(j => j.user?.display_name || '?');
      if (names.length <= 3) {
        joinersHtml = `<div class="ping-item-joiners">⚡ ${names.join(', ')} derby</div>`;
      } else {
        joinersHtml = `<div class="ping-item-joiners">⚡ ${names.slice(0, 2).join(', ')} + ${names.length - 2} witeri derby</div>`;
      }
    }

    const alreadyJoined = session && joins.some(j => j.user_id === session.id);
    const isMine = session && ping.sender_id === session.id;

    let joinBtnHtml = '';
    if (!isMine && !alreadyJoined) {
      joinBtnHtml = `<button class="btn-primary btn-scrapbook btn-small ping-item-join" data-ping-id="${ping.id}">Join ⚡</button>`;
    } else if (alreadyJoined) {
      joinBtnHtml = `<span class="ping-item-join" style="font-size:0.75rem;color:var(--success);font-weight:700;">✅ Derby</span>`;
    } else if (isMine) {
      joinBtnHtml = `<button class="btn-secondary btn-small ping-item-join" data-ping-id="${ping.id}" data-action="deactivate" style="font-size:0.7rem;">❌</button>`;
    }

    item.innerHTML = `
      <img class="ping-item-avatar" src="${senderAvatar}" alt="${escapeHtml(senderName)}" onerror="this.src='${generateMiniAvatar(senderName)}'" />
      <div class="ping-item-body">
        <span class="ping-item-sender">${escapeHtml(senderName)}</span>
        <span class="ping-item-detail">${escapeHtml(ping.activity)}${locationStr}</span>
        <span class="ping-item-duration">${flag} ${durationText}</span>
        ${joinersHtml}
      </div>
      ${joinBtnHtml}
      <span class="ping-item-time">${createdAgo}</span>
    `;

    els.pingList.appendChild(item);
  });

  bindPingActions();
}

function bindPingActions() {
  if (!els.pingList) return;
  els.pingList.querySelectorAll('.ping-item-join[data-ping-id]').forEach(btn => {
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const pingId = newBtn.dataset.pingId;
      if (newBtn.dataset.action === 'deactivate') {
        await handleDeactivatePing(pingId);
      } else {
        await handleJoinPing(pingId, newBtn);
      }
    });
  });
}

// ============================================
// JOIN / DEACTIVATE
// ============================================

async function handleJoinPing(pingId, btnEl) {
  const session = getSession();
  if (!session) return;

  btnEl.disabled = true;
  btnEl.textContent = '...';

  try {
    await joinPing(pingId, session.id);
    btnEl.textContent = '✅ Derby';
    btnEl.className = 'ping-item-join';
    btnEl.style.cssText = 'font-size:0.75rem;color:var(--success);font-weight:700;';
    btnEl.disabled = true;
    showToast('Bisch derby! ⚡', 'success', 1500);
    setTimeout(() => fetchAndRenderPings(), 500);
  } catch (e) {
    console.error('Join error:', e);
    showToast('Fehler bim Joine.', 'error');
    btnEl.disabled = false;
    btnEl.textContent = 'Join ⚡';
  }
}

async function handleDeactivatePing(pingId) {
  try {
    await deactivatePing(pingId);
    showToast('Ping deaktiviert.', 'info', 1500);
    const item = els.pingList?.querySelector(`[data-ping-id="${pingId}"]`);
    if (item) {
      item.style.transition = 'all 0.3s ease';
      item.style.opacity = '0';
      item.style.transform = 'translateX(50px)';
      setTimeout(() => {
        item.remove();
        if (els.pingList && els.pingList.children.length === 0) renderPingFeed([]);
      }, 300);
    }
    lastPingIds.delete(pingId);
  } catch (e) {
    console.error('Deactivate error:', e);
    showToast('Fehler.', 'error');
  }
}

// ============================================
// IN-APP NOTIFICATION (iOS-Style)
// ============================================

function bindNotificationEvents() {
  if (els.notifJoin) {
    els.notifJoin.addEventListener('click', async () => {
      if (!currentNotifPingId) return;
      const session = getSession();
      if (!session) return;

      els.notifJoin.disabled = true;
      els.notifJoin.textContent = '...';

      try {
        await joinPing(currentNotifPingId, session.id);
        els.notifJoin.textContent = '✅';
        showToast('Bisch derby! ⚡', 'success', 1500);
        setTimeout(() => dismissNotification(), 800);
        fetchAndRenderPings();
      } catch (e) {
        els.notifJoin.disabled = false;
        els.notifJoin.textContent = 'Join ⚡';
      }
    });
  }

  if (els.notifDismiss) {
    els.notifDismiss.addEventListener('click', dismissNotification);
  }

  if (els.notification) setupNotifSwipe();
}

function queueNotification(ping) {
  notificationQueue.push(ping);
}

function processNotificationQueue() {
  if (isShowingNotification || notificationQueue.length === 0) return;
  showNextNotification();
}

async function showNextNotification() {
  if (notificationQueue.length === 0) {
    isShowingNotification = false;
    return;
  }

  isShowingNotification = true;
  const ping = notificationQueue.shift();

  let senderName = ping.sender?.display_name || 'Unbekannt';
  let senderAvatar = ping.sender?.avatar_url || generateMiniAvatar(senderName);
  let senderLang = ping.sender?.language || 'de';

  if (!ping.sender) {
    try {
      const profile = await getProfileById(ping.sender_id);
      if (profile) {
        senderName = profile.display_name;
        senderAvatar = profile.avatar_url || generateMiniAvatar(senderName);
        senderLang = profile.language || 'de';
      }
    } catch (e) { /* ignore */ }
  }

  currentNotifPingId = ping.id;

  const durationText = getDurationText(ping.time_text, senderLang);
  const flag = getLanguageFlag(senderLang);
  const locationStr = ping.location ? ` · ${ping.location}` : '';
  const text = `${ping.activity}${locationStr} · ${flag} ${durationText}`;

  if (els.notifAvatar) {
    els.notifAvatar.src = senderAvatar;
    els.notifAvatar.onerror = () => { els.notifAvatar.src = generateMiniAvatar(senderName); };
  }
  if (els.notifSender) els.notifSender.textContent = senderName;
  if (els.notifText) els.notifText.textContent = text;

  if (els.notifJoin) {
    els.notifJoin.disabled = false;
    els.notifJoin.textContent = 'Join ⚡';
  }

  if (els.notification) {
    els.notification.classList.remove('hidden');
    els.notification.style.display = '';
    els.notification.style.animation = 'none';
    els.notification.offsetHeight;
    els.notification.style.animation = 'notif-slide-down 0.4s cubic-bezier(0.4,0,0.2,1) forwards';
  }

  if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  playNotifSound();

  setTimeout(() => {
    if (isShowingNotification && currentNotifPingId === ping.id) dismissNotification();
  }, 8000);
}

function dismissNotification() {
  if (!els.notification) return;
  els.notification.style.animation = 'notif-slide-up 0.3s cubic-bezier(0.4,0,0.2,1) forwards';
  setTimeout(() => {
    els.notification.classList.add('hidden');
    els.notification.style.display = 'none';
    els.notification.style.animation = '';
    currentNotifPingId = null;
    isShowingNotification = false;
    processNotificationQueue();
  }, 300);
}

function playNotifSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    setTimeout(() => ctx.close(), 500);
  } catch (e) { /* ok */ }
}

function setupNotifSwipe() {
  const inner = els.notification?.querySelector('.ping-notif-inner');
  if (!inner) return;

  let startY = 0, isDragging = false;

  inner.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    isDragging = true;
    inner.style.transition = 'none';
  }, { passive: true });

  inner.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const diff = e.touches[0].clientY - startY;
    if (diff < 0) {
      inner.style.transform = `translateY(${diff}px)`;
      inner.style.opacity = Math.max(0, 1 + diff / 100);
    }
  }, { passive: true });

  inner.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;
    inner.style.transition = '';
    const diff = e.changedTouches[0].clientY - startY;
    if (diff < -40) {
      dismissNotification();
    } else {
      inner.style.transform = '';
      inner.style.opacity = '';
    }
  }, { passive: true });
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

function generateMiniAvatar(name = '') {
  const initial = (name.charAt(0) || '?').toUpperCase();
  const colors = ['#c8a06e', '#3a8fb7', '#e06080', '#6b9e5f', '#c8a050'];
  const color = colors[initial.charCodeAt(0) % colors.length];
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" rx="24" fill="${color}"/><text x="24" y="30" text-anchor="middle" fill="white" font-family="sans-serif" font-size="20" font-weight="bold">${initial}</text></svg>`)}`;
}

// Inject animations
const notifStyles = document.createElement('style');
notifStyles.textContent = `
  @keyframes notif-slide-down { from { opacity:0; transform:translateY(-100%); } to { opacity:1; transform:translateY(0); } }
  @keyframes notif-slide-up { from { opacity:1; transform:translateY(0); } to { opacity:0; transform:translateY(-100%); } }
  .ping-item-duration { font-size:0.78rem; color:var(--accent); font-weight:600; display:block; margin-top:2px; }
`;
document.head.appendChild(notifStyles);

export function destroyPings() {
  stopPolling();
  lastPingIds.clear();
  notificationQueue = [];
  isShowingNotification = false;
  currentNotifPingId = null;
  isFirstPoll = true;
  resetComposer();
}
