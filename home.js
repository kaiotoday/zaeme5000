// ============================================
// ZÄME 5000 – Home Module
// ============================================

import {
  getSession,
  getProfileById,
  getNextEvent,
  getUpcomingEvents,
  getPastEvents,
  getEvents,
  getUserBadges,
  getIdeas,
  createIdea,
  getHallOfFame,
  formatDate,
  formatDateTime,
  getCountdown,
  eventEmoji
} from './supabase.js';

import {
  openEventModal,
  openIdeaModal,
  closeIdeaModal,
  showToast,
  onViewChange
} from './router.js';

// ---- STATE ----
let countdownInterval = null;
let nextEvent = null;
let allEvents = [];

// ---- DOM REFS ----
const els = {};

function cacheDom() {
  // Stats
  els.statBatzen = document.getElementById('stat-batzen');
  els.statBadges = document.getElementById('stat-badges');
  els.statNextOrga = document.getElementById('stat-next-orga');

  // Hero
  els.heroBanner = document.getElementById('hero-event');
  els.heroTitle = document.getElementById('hero-title');
  els.heroDate = document.getElementById('hero-date');
  els.heroLocation = document.getElementById('hero-location');
  els.heroCost = document.getElementById('hero-cost');
  els.heroCountdown = document.getElementById('hero-countdown');

  // Event Feed
  els.eventList = document.getElementById('event-list');

  // Hall of Fame
  els.hofList = document.getElementById('hof-list');

  // Idea Modal
  els.ideaText = document.getElementById('idea-text');
  els.ideaSubmit = document.getElementById('idea-submit');
  els.ideaList = document.getElementById('idea-list');
}

// ---- INIT ----

export async function initHome(onEventClick) {
  cacheDom();

  // Store callback for event clicks
  els._onEventClick = onEventClick;

  // Bind events
  bindEvents();

  // Load all data
  await refreshHome();

  // Listen for view changes to pause/resume countdown
  onViewChange((view) => {
    if (view === 'home') {
      startCountdown();
    } else {
      stopCountdown();
    }
  });
}

export async function refreshHome() {
  const session = getSession();
  if (!session) return;

  await Promise.all([
    loadStats(session),
    loadHeroEvent(),
    loadEventFeed(),
    loadHallOfFame()
  ]);

  startCountdown();
}

// ============================================
// PERSONAL STATS CARD
// ============================================

async function loadStats(session) {
  try {
    // Get fresh profile data
    const profile = await getProfileById(session.id);
    if (!profile) return;

    // Batzen
    const batzen = parseFloat(profile.batzen || 0);
    animateNumber(els.statBatzen, batzen, 'CHF');

    // Badges
    const badges = await getUserBadges(session.id);
    animateNumber(els.statBadges, badges.length);

    // Next event organizer
    const next = await getNextEvent();
    if (next && next.organizer) {
      els.statNextOrga.textContent = next.organizer.display_name || '—';
      els.statNextOrga.style.fontSize = '0.85rem';
    } else {
      els.statNextOrga.textContent = '—';
    }
  } catch (e) {
    console.error('Error loading stats:', e);
  }
}

function animateNumber(el, target, suffix = '') {
  if (!el) return;

  const current = parseFloat(el.textContent) || 0;
  const diff = target - current;
  const steps = 20;
  const stepTime = 30;
  let step = 0;

  if (Math.abs(diff) < 0.1) {
    el.textContent = formatNumber(target, suffix);
    return;
  }

  const timer = setInterval(() => {
    step++;
    const progress = easeOutCubic(step / steps);
    const val = current + diff * progress;
    el.textContent = formatNumber(val, suffix);

    if (step >= steps) {
      clearInterval(timer);
      el.textContent = formatNumber(target, suffix);
    }
  }, stepTime);
}

function formatNumber(val, suffix = '') {
  if (suffix === 'CHF') {
    return `${val.toFixed(0)}`;
  }
  return `${Math.round(val)}`;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// ============================================
// HERO BANNER (Next Event)
// ============================================

async function loadHeroEvent() {
  try {
    nextEvent = await getNextEvent();

    if (!nextEvent) {
      renderNoEvent();
      return;
    }

    renderHeroEvent(nextEvent);
  } catch (e) {
    console.error('Error loading hero event:', e);
    renderNoEvent();
  }
}

function renderHeroEvent(event) {
  els.heroTitle.textContent = event.title;
  els.heroDate.textContent = `📅 ${formatDate(event.event_date)}`;
  els.heroLocation.textContent = event.location ? `📍 ${event.location}` : '';
  els.heroCost.textContent = event.cost > 0 ? `💰 ${event.cost} CHF` : '💰 Gratis';
  els.heroCountdown.textContent = `⏱️ ${getCountdown(event.event_date)}`;

  // Click opens event modal
  els.heroBanner.onclick = () => {
    if (els._onEventClick) {
      els._onEventClick(event.id);
    }
  };

  els.heroBanner.style.display = '';
  els.heroBanner.classList.remove('hidden');
}

function renderNoEvent() {
  els.heroTitle.textContent = 'Kei Event planed';
  els.heroDate.textContent = '🤷 Nüt los momentan...';
  els.heroLocation.textContent = '';
  els.heroCost.textContent = '';
  els.heroCountdown.textContent = '';
  els.heroBanner.onclick = null;
}

// ---- COUNTDOWN TIMER ----

function startCountdown() {
  stopCountdown();

  if (!nextEvent) return;

  countdownInterval = setInterval(() => {
    const countdown = getCountdown(nextEvent.event_date);
    if (els.heroCountdown) {
      els.heroCountdown.textContent = `⏱️ ${countdown}`;
    }

    // If event has started, refresh
    if (countdown === 'Jetzt!') {
      stopCountdown();
      // Refresh after short delay
      setTimeout(() => refreshHome(), 2000);
    }
  }, 30000); // Update every 30 seconds
}

function stopCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}

// ============================================
// EVENT FEED
// ============================================

async function loadEventFeed() {
  try {
    const [upcoming, past] = await Promise.all([
      getUpcomingEvents(),
      getPastEvents()
    ]);

    allEvents = [...upcoming, ...past];

    renderEventFeed(upcoming, past);
  } catch (e) {
    console.error('Error loading events:', e);
    els.eventList.innerHTML = '<p style="padding:16px;color:var(--text-light);">Events chönd nöd glade werde.</p>';
  }
}

function renderEventFeed(upcoming, past) {
  els.eventList.innerHTML = '';

  // Upcoming (skip first one since it's in the hero)
  const upcomingRest = nextEvent
    ? upcoming.filter(e => e.id !== nextEvent.id)
    : upcoming;

  if (upcomingRest.length > 0) {
    const upLabel = createFeedLabel('📅 Kommend');
    els.eventList.appendChild(upLabel);

    upcomingRest.forEach(event => {
      els.eventList.appendChild(createEventCard(event, false));
    });
  }

  // Past events
  if (past.length > 0) {
    const pastLabel = createFeedLabel('📖 Vergange');
    els.eventList.appendChild(pastLabel);

    past.forEach(event => {
      els.eventList.appendChild(createEventCard(event, true));
    });
  }

  // Empty state
  if (upcoming.length === 0 && past.length === 0) {
    els.eventList.innerHTML = `
      <div style="text-align:center;padding:32px 16px;color:var(--text-light);">
        <div style="font-size:2.5rem;margin-bottom:8px;">📭</div>
        <p>No kei Events. Wirf doch e Idee i d Dropbox! 💡</p>
      </div>
    `;
  }
}

function createFeedLabel(text) {
  const label = document.createElement('div');
  label.className = 'feed-label';
  label.innerHTML = `<span>${text}</span>`;
  label.style.cssText = `
    padding: 8px 16px;
    font-family: var(--font-marker);
    font-size: 0.85rem;
    color: var(--text-light);
    margin-top: 8px;
  `;
  return label;
}

function createEventCard(event, isPast) {
  const card = document.createElement('div');
  card.className = `event-card${isPast ? ' past' : ''}`;
  card.dataset.eventId = event.id;

  const emoji = eventEmoji(event.title);
  const dateStr = formatDate(event.event_date);
  const costStr = event.cost > 0 ? ` · ${event.cost} CHF` : '';
  const locationStr = event.location ? ` · ${event.location}` : '';
  const tourneyBadge = event.is_tournament ? ' 🏆' : '';
  const mandatoryBadge = event.is_mandatory ? ' ⚠️' : '';

  card.innerHTML = `
    <span class="event-emoji">${emoji}</span>
    <div class="event-info">
      <div class="event-title">${escapeHtml(event.title)}${tourneyBadge}${mandatoryBadge}</div>
      <div class="event-date">${dateStr}${locationStr}${costStr}</div>
    </div>
    <span class="event-arrow">›</span>
  `;

  card.addEventListener('click', () => {
    // Tap animation
    card.style.transform = 'scale(0.96)';
    setTimeout(() => {
      card.style.transform = '';
      if (els._onEventClick) {
        els._onEventClick(event.id);
      }
    }, 100);
  });

  return card;
}

// ============================================
// IDEA DROPBOX
// ============================================

async function loadIdeas() {
  try {
    const ideas = await getIdeas();
    renderIdeas(ideas);
  } catch (e) {
    console.error('Error loading ideas:', e);
  }
}

function renderIdeas(ideas) {
  if (!els.ideaList) return;

  els.ideaList.innerHTML = '';

  if (ideas.length === 0) {
    els.ideaList.innerHTML = '<p style="color:var(--text-light);font-size:0.85rem;text-align:center;">No kei Idee. Bis de Erst! 🚀</p>';
    return;
  }

  ideas.forEach(idea => {
    const item = document.createElement('div');
    item.className = 'idea-item';

    const date = new Date(idea.created_at);
    const dateStr = date.toLocaleDateString('de-CH', { day: 'numeric', month: 'short' });

    item.innerHTML = `
      ${escapeHtml(idea.text)}
      <span class="idea-item-date">${dateStr}</span>
    `;

    els.ideaList.appendChild(item);
  });
}

async function handleIdeaSubmit() {
  const text = els.ideaText.value.trim();

  if (!text) {
    showToast('Schriib öppis ine!', 'warn');
    return;
  }

  if (text.length > 300) {
    showToast('Maximal 300 Zeiche!', 'warn');
    return;
  }

  els.ideaSubmit.disabled = true;
  els.ideaSubmit.textContent = 'Wird gschickt...';

  try {
    await createIdea(text);

    els.ideaText.value = '';
    showToast('Idee abgschickt! 💡', 'success');

    // Refresh ideas list
    await loadIdeas();
  } catch (e) {
    console.error('Error submitting idea:', e);
    showToast('Fehler bim Abschicke.', 'error');
  } finally {
    els.ideaSubmit.disabled = false;
    els.ideaSubmit.textContent = '📮 Abschickä';
  }
}

// Called when idea modal opens
export async function onIdeaModalOpen() {
  await loadIdeas();
}

// ============================================
// HALL OF FAME
// ============================================

async function loadHallOfFame() {
  try {
    const entries = await getHallOfFame();
    renderHallOfFame(entries);
  } catch (e) {
    console.error('Error loading Hall of Fame:', e);
  }
}

function renderHallOfFame(entries) {
  if (!els.hofList) return;

  els.hofList.innerHTML = '';

  if (entries.length === 0) {
    els.hofList.innerHTML = `
      <div class="hof-item">
        <span class="hof-icon">🏗️</span>
        <div class="hof-title">Coming soon...</div>
        <div class="hof-desc">D Hall of Fame wird nach em erste Jahr befüllt.</div>
      </div>
    `;
    return;
  }

  // Group by year
  const byYear = {};
  entries.forEach(entry => {
    if (!byYear[entry.year]) byYear[entry.year] = [];
    byYear[entry.year].push(entry);
  });

  // Render by year (newest first)
  Object.keys(byYear).sort((a, b) => b - a).forEach(year => {
    const yearLabel = document.createElement('div');
    yearLabel.style.cssText = `
      font-family: var(--font-marker);
      font-size: 0.9rem;
      color: var(--text-light);
      padding: 4px 0;
      text-align: center;
    `;
    yearLabel.textContent = `— ${year} —`;
    els.hofList.appendChild(yearLabel);

    byYear[year].forEach(entry => {
      const item = document.createElement('div');
      item.className = 'hof-item';

      const icon = getCategoryIcon(entry.category);

      item.innerHTML = `
        <span class="hof-icon">${icon}</span>
        <div class="hof-title">${escapeHtml(entry.title)}</div>
        ${entry.description ? `<div class="hof-desc">${escapeHtml(entry.description)}</div>` : ''}
      `;

      // If has image, show as polaroid
      if (entry.image_url) {
        const img = document.createElement('img');
        img.src = entry.image_url;
        img.alt = entry.title;
        img.className = 'polaroid';
        img.style.cssText = 'width:80px;height:80px;object-fit:cover;margin:8px auto 0;';
        item.appendChild(img);
      }

      els.hofList.appendChild(item);
    });
  });
}

function getCategoryIcon(category) {
  switch (category) {
    case 'sticker_of_year': return '🏅';
    case 'quote_of_year': return '💬';
    case 'schnappsidee': return '💡';
    default: return '🏆';
  }
}

// ============================================
// EVENT BINDINGS
// ============================================

function bindEvents() {
  // Idea submit
  if (els.ideaSubmit) {
    els.ideaSubmit.addEventListener('click', handleIdeaSubmit);
  }

  // Idea textarea: enter = submit, shift+enter = newline
  if (els.ideaText) {
    els.ideaText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleIdeaSubmit();
      }
    });
  }

  // Load ideas when idea modal opens
  // We observe the idea modal for visibility
  const ideaModal = document.getElementById('idea-modal');
  if (ideaModal) {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        if (m.attributeName === 'class' || m.attributeName === 'style') {
          if (!ideaModal.classList.contains('hidden')) {
            onIdeaModalOpen();
          }
        }
      });
    });
    observer.observe(ideaModal, { attributes: true });
  }
}

// ============================================
// GET EVENT BY ID (for modal)
// ============================================

export function getEventFromCache(eventId) {
  return allEvents.find(e => e.id === eventId) || null;
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

export function destroyHome() {
  stopCountdown();
  allEvents = [];
  nextEvent = null;
}
