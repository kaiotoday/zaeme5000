// ============================================
// ZÄME 5000 – Ping / Buzzer Module
// ============================================

import {
  getSession,
  getProfileById,
  getActivePings,
  createPing,
  deactivatePing,
  getPingJoins,
  joinPing,
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
let selectedTime = null;
let customActivityActive = false;
let customLocationActive = false;
let isFirstPoll = true;
let notificationQueue = [];
let isShowingNotification = false;
let currentNotifPingId = null;

// Polling config
const POLL_INTERVAL = 10000; // 10 seconds
const PING_MAX_AGE = 2 * 60 * 60 * 1000; // 2 hours

// ---- DOM REFS ----
const els = {};

function cacheDom() {
  // Composer
  els.activityChips = document.getElementById('ping-activity-chips');
  els.activityCustom = document.getElementById('ping-activity-custom');
  els.locationChips = document.getElementById('ping-location-chips');
  els.locationCustom = document.getElementById('ping-location-custom');
  els.timeChips = document.getElementById('ping-time-chips');
  els.sendBtn = document.getElementById('ping-send');

  // Feed
  els.pingList = document.getElementById('ping-list');

  // Notification
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

  // Start polling
  startPolling();

  // Pause/resume on visibility
  onVisibilityChange((visible) => {
    if (visible) {
      startPolling();
    } else {
      stopPolling();
    }
  });

  // Refresh feed when profile view opens
  onViewChange((view) => {
    if (view === 'profile') {
      fetchAndRenderPings();
    }
  });
}

// ============================================
// COMPOSER (Activity, Location, Time Selection)
// ============================================

function bindComposerEvents() {
  // Activity chips
  if (els.activityChips) {
    els.activityChips.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => handleActivityChip(chip));
    });
  }

  // Location chips
  if (els.locationChips) {
    els.locationChips.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => handleLocationChip(chip));
    });
  }

  // Time chips
  if (els.timeChips) {
    els.timeChips.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => handleTimeChip(chip));
    });
  }

  // Custom inputs change
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

  // Send button
  if (els.sendBtn) {
    els.sendBtn.addEventListener('click', handleSendPing);
  }
}

function handleActivityChip(chip) {
  const value = chip.dataset.value;

  // Deselect all in group
  els.activityChips.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));

  if (value === 'custom') {
    // Show custom input
    customActivityActive = true;
    els.activityCustom.classList.remove('hidden');
    els.activityCustom.style.display = '';
    els.activityCustom.focus();
    chip.classList.add('selected');
    selectedActivity = els.activityCustom.value.trim() || null;
  } else {
    // Hide custom input
    customActivityActive = false;
    els.activityCustom.classList.add('hidden');
    els.activityCustom.style.display = 'none';
    els.activityCustom.value = '';

    // Toggle selection
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

function handleTimeChip(chip) {
  const value = chip.dataset.value;

  els.timeChips.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));

  if (selectedTime === value) {
    selectedTime = null;
  } else {
    selectedTime = value;
    chip.classList.add('selected');
  }

  animateChip(chip);
  validateComposer();
}

function animateChip(chip) {
  chip.style.transform = 'scale(0.9)';
  setTimeout(() => {
    chip.style.transform = '';
  }, 120);
}

function validateComposer() {
  const valid = selectedActivity && selectedTime;
  if (els.sendBtn) {
    els.sendBtn.disabled = !valid;
  }
}

function resetComposer() {
  selectedActivity = null;
  selectedLocation = null;
  selectedTime = null;
  customActivityActive = false;
  customLocationActive = false;

  // Reset all chips
  [els.activityChips, els.locationChips, els.timeChips].forEach(group => {
    if (group) {
      group.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
    }
  });

  // Hide custom inputs
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
  if (!session) {
    showToast('Bitte zerscht ilogge.', 'warn');
    return;
  }

  if (!selectedActivity || !selectedTime) {
    showToast('Wähl mindestens Aktivität und Ziit!', 'warn');
    return;
  }

  // Disable button with animation
  els.sendBtn.disabled = true;
  els.sendBtn.textContent = '📡 Wird gsendet...';
  els.sendBtn.style.transform = 'scale(0.96)';

  try {
    await createPing({
      sender_id: session.id,
      activity: selectedActivity,
      location: selectedLocation || null,
      time_text: selectedTime
    });

    // Success animation
    els.sendBtn.textContent = '✅ Gsendet!';
    els.sendBtn.style.background = 'var(--success)';
    pulseElement(els.sendBtn);

    showToast('Ping gsendet! 📡', 'success', 2000);

    // Reset after delay
    setTimeout(() => {
      els.sendBtn.style.background = '';
      els.sendBtn.textContent = '📡 PING SÄNDÄ';
      resetComposer();
    }, 1500);

    // Refresh feed
    await fetchAndRenderPings();

  } catch (e) {
    console.error('Send ping error:', e);
    showToast('Fehler bim Sändä.', 'error');
    els.sendBtn.disabled = false;
    els.sendBtn.textContent = '📡 PING SÄNDÄ';
    els.sendBtn.style.transform = '';
  }
}

// ============================================
// POLLING SYSTEM
// ============================================

export function startPolling() {
  stopPolling();

  // Initial fetch
  fetchAndRenderPings();

  // Poll every 10 seconds
  pollingInterval = setInterval(() => {
    if (isPageVisible()) {
      fetchAndRenderPings();
    }
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

    // Filter out expired pings (older than 2 hours)
    const now = Date.now();
    const activePings = pings.filter(p => {
      const age = now - new Date(p.created_at).getTime();
      return age < PING_MAX_AGE;
    });

    // Detect new pings for notifications
    const session = getSession();
    const currentIds = new Set(activePings.map(p => p.id));

    if (!isFirstPoll && session) {
      activePings.forEach(ping => {
        if (!lastPingIds.has(ping.id) && ping.sender_id !== session.id) {
          // New ping from someone else! Queue notification
          queueNotification(ping);
        }
      });
    }

    isFirstPoll = false;
    lastPingIds = currentIds;

    // Fetch joins for each ping
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

    // Render feed
    renderPingFeed(pingsWithJoins);

    // Process notification queue
    processNotificationQueue();

  } catch (e) {
    console.error('Ping polling error:', e);
  }
}

// ============================================
// PING FEED RENDERING
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

  // Check if content actually changed (prevent unnecessary re-renders)
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
    const locationStr = ping.location ? ` · ${ping.location}` : '';
    const timeStr = ping.time_text || '';
    const createdAgo = timeAgo(ping.created_at);

    // Build joiners text
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

    // Check if current user already joined
    const alreadyJoined = session && joins.some(j => j.user_id === session.id);
    const isMine = session && ping.sender_id === session.id;

    // Join button
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
        <span class="ping-item-detail">${escapeHtml(ping.activity)}${locationStr} · ${escapeHtml(timeStr)}</span>
        ${joinersHtml}
      </div>
      ${joinBtnHtml}
      <span class="ping-item-time">${createdAgo}</span>
    `;

    els.pingList.appendChild(item);
  });

  // Bind join/deactivate buttons
  bindPingActions();
}

function bindPingActions() {
  if (!els.pingList) return;

  els.pingList.querySelectorAll('.ping-item-join[data-ping-id]').forEach(btn => {
    // Remove old listeners by cloning
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const pingId = newBtn.dataset.pingId;
      const action = newBtn.dataset.action;

      if (action === 'deactivate') {
        await handleDeactivatePing(pingId);
      } else {
        await handleJoinPing(pingId, newBtn);
      }
    });
  });
}

// ============================================
// JOIN / DEACTIVATE PING
// ============================================

async function handleJoinPing(pingId, btnEl) {
  const session = getSession();
  if (!session) return;

  btnEl.disabled = true;
  btnEl.textContent = '...';

  try {
    await joinPing(pingId, session.id);

    // Optimistic update
    btnEl.textContent = '✅ Derby';
    btnEl.className = 'ping-item-join';
    btnEl.style.cssText = 'font-size:0.75rem;color:var(--success);font-weight:700;';
    btnEl.disabled = true;

    showToast('Bisch derby! ⚡', 'success', 1500);

    // Refresh feed
    setTimeout(() => fetchAndRenderPings(), 500);

  } catch (e) {
    console.error('Join ping error:', e);
    showToast('Fehler bim Joine.', 'error');
    btnEl.disabled = false;
    btnEl.textContent = 'Join ⚡';
  }
}

async function handleDeactivatePing(pingId) {
  try {
    await deactivatePing(pingId);
    showToast('Ping deaktiviert.', 'info', 1500);

    // Remove from feed
    const item = els.pingList?.querySelector(`[data-ping-id="${pingId}"]`);
    if (item) {
      item.style.transition = 'all 0.3s ease';
      item.style.opacity = '0';
      item.style.transform = 'translateX(50px)';
      setTimeout(() => {
        item.remove();
        // Check if feed is now empty
        if (els.pingList && els.pingList.children.length === 0) {
          renderPingFeed([]);
        }
      }, 300);
    }

    lastPingIds.delete(pingId);

  } catch (e) {
    console.error('Deactivate ping error:', e);
    showToast('Fehler bim Deaktiviere.', 'error');
  }
}

// ============================================
// IN-APP NOTIFICATION SYSTEM
// ============================================

function bindNotificationEvents() {
  // Join from notification
  if (els.notifJoin) {
    els.notifJoin.addEventListener('click', async () => {
      if (currentNotifPingId) {
        const session = getSession();
        if (session) {
          els.notifJoin.disabled = true;
          els.notifJoin.textContent = '...';

          try {
            await joinPing(currentNotifPingId, session.id);
            els.notifJoin.textContent = '✅';
            showToast('Bisch derby! ⚡', 'success', 1500);
            setTimeout(() => dismissNotification(), 800);
            fetchAndRenderPings();
          } catch (e) {
            console.error('Join from notif error:', e);
            els.notifJoin.disabled = false;
            els.notifJoin.textContent = 'Join ⚡';
          }
        }
      }
    });
  }

  // Dismiss notification
  if (els.notifDismiss) {
    els.notifDismiss.addEventListener('click', dismissNotification);
  }

  // Auto-dismiss on tap outside
  if (els.notification) {
    // Swipe up to dismiss
    setupNotifSwipe();
  }
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

  // Get sender info (might already be in ping.sender)
  let senderName = ping.sender?.display_name || 'Unbekannt';
  let senderAvatar = ping.sender?.avatar_url || generateMiniAvatar(senderName);

  // If sender info missing, fetch it
  if (!ping.sender) {
    try {
      const profile = await getProfileById(ping.sender_id);
      if (profile) {
        senderName = profile.display_name;
        senderAvatar = profile.avatar_url || generateMiniAvatar(senderName);
      }
    } catch (e) {
      console.warn('Could not fetch ping sender:', e);
    }
  }

  currentNotifPingId = ping.id;

  // Populate notification
  if (els.notifAvatar) {
    els.notifAvatar.src = senderAvatar;
    els.notifAvatar.onerror = () => {
      els.notifAvatar.src = generateMiniAvatar(senderName);
    };
  }
  if (els.notifSender) els.notifSender.textContent = senderName;

  const locationStr = ping.location ? ` · ${ping.location}` : '';
  const text = `${ping.activity}${locationStr} · ${ping.time_text || 'Jetzt'}`;
  if (els.notifText) els.notifText.textContent = text;

  // Reset join button
  if (els.notifJoin) {
    els.notifJoin.disabled = false;
    els.notifJoin.textContent = 'Join ⚡';
  }

  // Show notification
  if (els.notification) {
    els.notification.classList.remove('hidden');
    els.notification.style.display = '';
    els.notification.style.animation = 'none';
    els.notification.offsetHeight; // reflow
    els.notification.style.animation = 'notif-slide-down 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards';
  }

  // Vibrate if supported
  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100]);
  }

  // Play notification sound
  playNotifSound();

  // Auto-dismiss after 8 seconds
  setTimeout(() => {
    if (isShowingNotification && currentNotifPingId === ping.id) {
      dismissNotification();
    }
  }, 8000);
}

function dismissNotification() {
  if (!els.notification) return;

  els.notification.style.animation = 'notif-slide-up 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards';

  setTimeout(() => {
    els.notification.classList.add('hidden');
    els.notification.style.display = 'none';
    els.notification.style.animation = '';
    currentNotifPingId = null;
    isShowingNotification = false;

    // Show next in queue
    processNotificationQueue();
  }, 300);
}

function playNotifSound() {
  try {
    // Create a simple notification beep using Web Audio API
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
    oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1); // C#6

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);

    // Cleanup
    setTimeout(() => ctx.close(), 500);
  } catch (e) {
    // Audio not available, that's ok
    console.warn('Could not play notification sound:', e);
  }
}

// ---- SWIPE TO DISMISS NOTIFICATION ----

function setupNotifSwipe() {
  if (!els.notification) return;

  let startY = 0;
  let isDragging = false;

  const inner = els.notification.querySelector('.ping-notif-inner');
  if (!inner) return;

  inner.addEventListener('touchstart', (e) => {
    startY = e.touches[0].clientY;
    isDragging = true;
    inner.style.transition = 'none';
  }, { passive: true });

  inner.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const diff = e.touches[0].clientY - startY;

    // Only allow upward swipe
    if (diff < 0) {
      inner.style.transform = `translateY(${diff}px)`;
      inner.style.opacity = Math.max(0, 1 + diff / 100);
    }
  }, { passive: true });

  inner.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    isDragging = false;

    const diff = e.changedTouches[0].clientY - startY;
    inner.style.transition = '';

    if (diff < -40) {
      // Swipe up threshold met – dismiss
      dismissNotification();
    } else {
      // Snap back
      inner.style.transform = '';
      inner.style.opacity = '';
    }
  }, { passive: true });
}

// ============================================
// NOTIFICATION ANIMATIONS (inject)
// ============================================

const notifStyles = document.createElement('style');
notifStyles.textContent = `
  @keyframes notif-slide-down {
    from {
      opacity: 0;
      transform: translateY(-100%);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes notif-slide-up {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(-100%);
    }
  }

  /* Ping send button pulse */
  @keyframes ping-pulse {
    0% { box-shadow: 0 0 0 0 var(--accent); }
    70% { box-shadow: 0 0 0 15px transparent; }
    100% { box-shadow: 0 0 0 0 transparent; }
  }
`;
document.head.appendChild(notifStyles);

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
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <rect width="48" height="48" rx="24" fill="${color}"/>
      <text x="24" y="30" text-anchor="middle" fill="white" font-family="sans-serif" font-size="20" font-weight="bold">${initial}</text>
    </svg>
  `)}`;
}

function pulseElement(el) {
  el.style.animation = 'ping-pulse 0.6s ease-out';
  setTimeout(() => {
    el.style.animation = '';
  }, 600);
}

// ---- CLEANUP ----

export function destroyPings() {
  stopPolling();
  lastPingIds.clear();
  notificationQueue = [];
  isShowingNotification = false;
  currentNotifPingId = null;
  isFirstPoll = true;
  resetComposer();
}
