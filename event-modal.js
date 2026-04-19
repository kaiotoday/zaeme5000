// ============================================
// ZÄME 5000 – Event Modal Module
// ============================================

import {
  getSession,
  getEventById,
  getRsvpsForEvent,
  upsertRsvp,
  getTransactionsForEvent,
  createTransaction,
  uploadReceipt,
  getRatingsForEvent,
  upsertRating,
  getAverageRating,
  getMatchesForEvent,
  createMatch,
  updateMatch,
  clearTournament,
  getMediaForEvent,
  uploadMedia,
  getQuotesForEvent,
  createQuote,
  formatDate,
  formatDateTime,
  formatTime,
  eventEmoji
} from './supabase.js';

import {
  openEventModal,
  closeEventModal,
  switchTab,
  showTournamentTab,
  hideTournamentTab,
  showToast
} from './router.js';

// ---- STATE ----
let currentEvent = null;
let currentEventId = null;
let rsvps = [];
let transactions = [];
let matches = [];
let mediaItems = [];
let quotes = [];
let userRating = 0;

// ---- DOM REFS ----
const els = {};

function cacheDom() {
  // Header
  els.modalTitle = document.getElementById('modal-event-title');

  // Info Tab
  els.modalDate = document.getElementById('modal-date');
  els.modalLocation = document.getElementById('modal-location');
  els.modalCost = document.getElementById('modal-cost');
  els.modalOrganizer = document.getElementById('modal-organizer');
  els.modalDescription = document.getElementById('modal-description');
  els.mandatoryWarn = document.getElementById('modal-mandatory-warn');
  els.rsvpPlusOne = document.getElementById('rsvp-plus-one');
  els.rsvpNotes = document.getElementById('rsvp-notes');
  els.rsvpList = document.getElementById('rsvp-list');
  els.ratingSection = document.getElementById('rating-section');
  els.starRating = document.getElementById('star-rating');
  els.avgRating = document.getElementById('avg-rating');

  // Batzen Tab
  els.transactionList = document.getElementById('transaction-list');
  els.txAmount = document.getElementById('tx-amount');
  els.txDesc = document.getElementById('tx-desc');
  els.txReceipt = document.getElementById('tx-receipt');
  els.txReceiptWrap = document.getElementById('tx-receipt-wrap');
  els.txSave = document.getElementById('tx-save');

  // Tournament Tab
  els.tournamentContainer = document.getElementById('tournament-container');
  els.generateBracket = document.getElementById('generate-bracket');
  els.bracketView = document.getElementById('bracket-view');

  // Media Tab
  els.mediaUploadInput = document.getElementById('media-upload-input');
  els.mediaGrid = document.getElementById('media-grid');
  els.quotesList = document.getElementById('quotes-list');
  els.quoteInput = document.getElementById('quote-input');
  els.quoteSave = document.getElementById('quote-save');
}

// ---- INIT ----

export function initEventModal() {
  cacheDom();
  bindEvents();
}

// ---- OPEN EVENT ----

export async function openEvent(eventId) {
  currentEventId = eventId;

  // Reset state
  resetModal();

  // Open modal immediately with loading state
  openEventModal();
  els.modalTitle.textContent = 'Lade...';

  try {
    // Fetch event data
    currentEvent = await getEventById(eventId);

    if (!currentEvent) {
      showToast('Event nöd gfunde.', 'error');
      closeEventModal();
      return;
    }

    // Render header info
    renderEventInfo();

    // Handle tournament tab visibility
    if (currentEvent.is_tournament) {
      showTournamentTab();
    } else {
      hideTournamentTab();
    }

    // Show rating section only for past events
    const isPast = new Date(currentEvent.event_date) < new Date();
    if (isPast) {
      els.ratingSection.classList.remove('hidden');
    } else {
      els.ratingSection.classList.add('hidden');
    }

    // Show mandatory warning
    if (currentEvent.is_mandatory) {
      els.mandatoryWarn.classList.remove('hidden');
    } else {
      els.mandatoryWarn.classList.add('hidden');
    }

    // Show receipt upload for organizers
    const session = getSession();
    const isOrga = session && (
      session.role === 'admin' ||
      session.role === 'organizer' ||
      (currentEvent.organizer_id === session.id)
    );
    if (isOrga) {
      els.txReceiptWrap.classList.remove('hidden');
    } else {
      els.txReceiptWrap.classList.add('hidden');
    }

    // Load tab data in parallel
    await Promise.all([
      loadRsvps(),
      loadRating(),
      loadTransactions(),
      currentEvent.is_tournament ? loadTournament() : Promise.resolve(),
      loadMedia(),
      loadQuotes()
    ]);

    // Switch to info tab
    switchTab('info');

  } catch (e) {
    console.error('Error opening event:', e);
    showToast('Fehler bim Lade.', 'error');
  }
}

function resetModal() {
  currentEvent = null;
  rsvps = [];
  transactions = [];
  matches = [];
  mediaItems = [];
  quotes = [];
  userRating = 0;

  // Clear dynamic content
  if (els.rsvpList) els.rsvpList.innerHTML = '';
  if (els.transactionList) els.transactionList.innerHTML = '';
  if (els.bracketView) els.bracketView.innerHTML = '';
  if (els.mediaGrid) els.mediaGrid.innerHTML = '';
  if (els.quotesList) els.quotesList.innerHTML = '';
  if (els.txAmount) els.txAmount.value = '';
  if (els.txDesc) els.txDesc.value = '';
  if (els.quoteInput) els.quoteInput.value = '';
  if (els.rsvpNotes) els.rsvpNotes.value = '';
  if (els.rsvpPlusOne) els.rsvpPlusOne.checked = false;

  // Reset stars
  if (els.starRating) {
    els.starRating.querySelectorAll('.star').forEach(s => s.classList.remove('active'));
  }
  if (els.avgRating) els.avgRating.textContent = '';
}

// ============================================
// TAB 1: INFO & RSVP
// ============================================

function renderEventInfo() {
  if (!currentEvent) return;

  els.modalTitle.textContent = `${eventEmoji(currentEvent.title)} ${currentEvent.title}`;
  els.modalDate.textContent = formatDateTime(currentEvent.event_date);
  els.modalLocation.textContent = currentEvent.location || 'TBD';
  els.modalCost.textContent = currentEvent.cost > 0 ? `${currentEvent.cost} CHF` : 'Gratis';
  els.modalOrganizer.textContent = currentEvent.organizer?.display_name || '—';
  els.modalDescription.textContent = currentEvent.description || '';
}

// ---- RSVP ----

async function loadRsvps() {
  try {
    rsvps = await getRsvpsForEvent(currentEventId);
    renderRsvps();
    highlightUserRsvp();
  } catch (e) {
    console.error('Error loading RSVPs:', e);
  }
}

function renderRsvps() {
  if (!els.rsvpList) return;
  els.rsvpList.innerHTML = '';

  if (rsvps.length === 0) {
    els.rsvpList.innerHTML = '<span style="font-size:0.8rem;color:var(--text-light);">Nonig het sich agmäldet.</span>';
    return;
  }

  rsvps.forEach(rsvp => {
    const chip = document.createElement('div');
    chip.className = `rsvp-chip ${rsvp.status}`;

    const avatarUrl = rsvp.user?.avatar_url || getDefaultAvatar(rsvp.user?.display_name);
    const name = rsvp.user?.display_name || 'Unbekannt';
    const plusOne = rsvp.plus_one ? ' +1' : '';
    const icon = rsvp.status === 'confirmed' ? '✅' : rsvp.status === 'declined' ? '❌' : '⏳';

    chip.innerHTML = `
      <img src="${avatarUrl}" alt="${escapeHtml(name)}" onerror="this.src='${getDefaultAvatar(name)}'" />
      <span>${escapeHtml(name)}${plusOne}</span>
      <span>${icon}</span>
    `;

    // Tooltip for notes
    if (rsvp.notes) {
      chip.title = rsvp.notes;
    }

    els.rsvpList.appendChild(chip);
  });
}

function highlightUserRsvp() {
  const session = getSession();
  if (!session) return;

  const userRsvp = rsvps.find(r => r.user_id === session.id);

  // Highlight correct RSVP button
  const rsvpBtns = document.querySelectorAll('.rsvp-btn');
  rsvpBtns.forEach(btn => {
    btn.style.outline = '';
    btn.style.outlineOffset = '';
    if (userRsvp && btn.dataset.status === userRsvp.status) {
      btn.style.outline = '3px solid var(--accent)';
      btn.style.outlineOffset = '2px';
    }
  });

  // Set plus-one and notes if existing
  if (userRsvp) {
    els.rsvpPlusOne.checked = userRsvp.plus_one || false;
    els.rsvpNotes.value = userRsvp.notes || '';
  }
}

async function handleRsvp(status) {
  const session = getSession();
  if (!session) {
    showToast('Bitte zerscht ilogge.', 'warn');
    return;
  }

  const btn = document.querySelector(`.rsvp-btn[data-status="${status}"]`);
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.6';
  }

  try {
    await upsertRsvp(currentEventId, session.id, {
      status,
      plus_one: els.rsvpPlusOne.checked,
      notes: els.rsvpNotes.value.trim() || null
    });

    showToast(
      status === 'confirmed' ? 'Agmäldet! ✅' : 'Abgmäldet.',
      status === 'confirmed' ? 'success' : 'info'
    );

    await loadRsvps();
  } catch (e) {
    console.error('RSVP error:', e);
    showToast('Fehler bi de Aamäldig.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = '';
    }
  }
}

// ---- STAR RATING ----

async function loadRating() {
  const session = getSession();
  if (!session) return;

  try {
    // Get user's rating
    const ratings = await getRatingsForEvent(currentEventId);
    const mine = ratings.find(r => r.user_id === session.id);

    if (mine) {
      userRating = mine.stars;
      renderStars(mine.stars);
    }

    // Get average
    const avg = await getAverageRating(currentEventId);
    if (avg) {
      els.avgRating.textContent = `⌀ ${avg.average} ★ (${avg.count} Stimme${avg.count !== 1 ? 'n' : ''})`;
    } else {
      els.avgRating.textContent = 'Nonig bewertet.';
    }
  } catch (e) {
    console.error('Error loading ratings:', e);
  }
}

function renderStars(count) {
  if (!els.starRating) return;

  els.starRating.querySelectorAll('.star').forEach(star => {
    const val = parseInt(star.dataset.star);
    star.classList.toggle('active', val <= count);
  });
}

async function handleStarClick(starValue) {
  const session = getSession();
  if (!session) return;

  // Optimistic UI
  userRating = starValue;
  renderStars(starValue);

  try {
    await upsertRating(currentEventId, session.id, starValue);
    showToast(`${starValue} ★ geh!`, 'success', 1500);

    // Refresh average
    const avg = await getAverageRating(currentEventId);
    if (avg) {
      els.avgRating.textContent = `⌀ ${avg.average} ★ (${avg.count} Stimme${avg.count !== 1 ? 'n' : ''})`;
    }
  } catch (e) {
    console.error('Rating error:', e);
    showToast('Fehler bim Bewerte.', 'error');
  }
}

// ============================================
// TAB 2: BATZENKONTO (Finanzen)
// ============================================

async function loadTransactions() {
  try {
    transactions = await getTransactionsForEvent(currentEventId);
    renderTransactions();
  } catch (e) {
    console.error('Error loading transactions:', e);
  }
}

function renderTransactions() {
  if (!els.transactionList) return;
  els.transactionList.innerHTML = '';

  if (transactions.length === 0) {
    els.transactionList.innerHTML = '<p style="font-size:0.85rem;color:var(--text-light);padding:12px;">Kei Transaktione.</p>';
    return;
  }

  transactions.forEach(tx => {
    const item = document.createElement('div');
    item.className = 'tx-item';

    const amount = parseFloat(tx.amount);
    const isPositive = amount >= 0;
    const amountClass = isPositive ? 'positive' : 'negative';
    const sign = isPositive ? '+' : '';
    const userName = tx.user?.display_name || 'Unbekannt';

    const date = new Date(tx.created_at);
    const dateStr = date.toLocaleDateString('de-CH', { day: 'numeric', month: 'short' });

    item.innerHTML = `
      <div class="tx-desc">
        <strong>${escapeHtml(userName)}</strong>
        ${tx.description ? ` – ${escapeHtml(tx.description)}` : ''}
        ${tx.receipt_url ? ' 🧾' : ''}
      </div>
      <span class="tx-amount ${amountClass}">${sign}${amount.toFixed(2)}</span>
      <span class="tx-date">${dateStr}</span>
    `;

    // Click receipt to view
    if (tx.receipt_url) {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        window.open(tx.receipt_url, '_blank');
      });
    }

    els.transactionList.appendChild(item);
  });

  // Total
  const total = transactions.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
  const totalEl = document.createElement('div');
  totalEl.className = 'tx-item';
  totalEl.style.cssText = 'font-weight:700;border-top:2px solid var(--border);margin-top:4px;padding-top:12px;';
  totalEl.innerHTML = `
    <div class="tx-desc"><strong>Total</strong></div>
    <span class="tx-amount ${total >= 0 ? 'positive' : 'negative'}">${total >= 0 ? '+' : ''}${total.toFixed(2)} CHF</span>
    <span class="tx-date"></span>
  `;
  els.transactionList.appendChild(totalEl);
}

async function handleSaveTransaction() {
  const session = getSession();
  if (!session) return;

  const amount = parseFloat(els.txAmount.value);
  const desc = els.txDesc.value.trim();

  if (isNaN(amount) || amount === 0) {
    showToast('Gib en gültige Betrag i.', 'warn');
    return;
  }

  els.txSave.disabled = true;
  els.txSave.textContent = 'Speichere...';

  try {
    // Handle receipt upload
    let receiptUrl = null;
    if (els.txReceipt && els.txReceipt.files.length > 0) {
      receiptUrl = await uploadReceipt(currentEventId, els.txReceipt.files[0]);
    }

    await createTransaction({
      event_id: currentEventId,
      user_id: session.id,
      amount,
      description: desc || null,
      receipt_url: receiptUrl
    });

    showToast('Transaktion gbuecht! 💰', 'success');

    // Reset form
    els.txAmount.value = '';
    els.txDesc.value = '';
    if (els.txReceipt) els.txReceipt.value = '';

    // Refresh
    await loadTransactions();
  } catch (e) {
    console.error('Transaction error:', e);
    showToast('Fehler bim Buechä.', 'error');
  } finally {
    els.txSave.disabled = false;
    els.txSave.textContent = '💸 Buechä';
  }
}

// ============================================
// TAB 3: TURNIER
// ============================================

async function loadTournament() {
  try {
    matches = await getMatchesForEvent(currentEventId);
    renderBracket();
  } catch (e) {
    console.error('Error loading tournament:', e);
  }
}

function renderBracket() {
  if (!els.bracketView) return;
  els.bracketView.innerHTML = '';

  if (matches.length === 0) {
    // Show generate button only for admin/orga
    const session = getSession();
    const canGenerate = session && (
      session.role === 'admin' ||
      session.role === 'organizer' ||
      (currentEvent && currentEvent.organizer_id === session.id)
    );

    if (canGenerate) {
      els.generateBracket.classList.remove('hidden');
      els.generateBracket.style.display = '';
    } else {
      els.generateBracket.classList.add('hidden');
      els.generateBracket.style.display = 'none';
      els.bracketView.innerHTML = '<p style="font-size:0.85rem;color:var(--text-light);">Turnier isch nonig erstellt.</p>';
    }
    return;
  }

  // Hide generate button
  els.generateBracket.classList.add('hidden');
  els.generateBracket.style.display = 'none';

  // Group matches by round
  const rounds = {};
  matches.forEach(m => {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  });

  const bracketContainer = document.createElement('div');
  bracketContainer.style.cssText = 'display:flex;overflow-x:auto;gap:0;padding-bottom:12px;-webkit-overflow-scrolling:touch;';

  Object.keys(rounds).sort((a, b) => a - b).forEach(round => {
    const roundEl = document.createElement('div');
    roundEl.className = 'bracket-round';

    const roundNum = parseInt(round);
    const totalRounds = Object.keys(rounds).length;
    let roundName;

    if (roundNum === totalRounds) {
      roundName = '🏆 Final';
    } else if (roundNum === totalRounds - 1) {
      roundName = 'Halbfinal';
    } else {
      roundName = `Runde ${roundNum}`;
    }

    roundEl.innerHTML = `<div class="bracket-round-title">${roundName}</div>`;

    rounds[round].sort((a, b) => a.match_number - b.match_number).forEach(match => {
      roundEl.appendChild(createMatchCard(match));
    });

    bracketContainer.appendChild(roundEl);
  });

  els.bracketView.appendChild(bracketContainer);
}

function createMatchCard(match) {
  const card = document.createElement('div');
  card.className = 'bracket-match';
  card.dataset.matchId = match.id;

  const session = getSession();
  const canEdit = session && (
    session.role === 'admin' ||
    session.role === 'organizer' ||
    (currentEvent && currentEvent.organizer_id === session.id)
  );

  const p1Name = match.player1?.display_name || 'TBD';
  const p2Name = match.player2?.display_name || 'TBD';
  const p1Winner = match.winner_id === match.player1_id;
  const p2Winner = match.winner_id === match.player2_id;

  card.innerHTML = `
    <div class="bracket-player ${p1Winner ? 'winner' : ''}" data-player="1">
      <span>${escapeHtml(p1Name)}</span>
      ${canEdit
        ? `<input type="number" class="bracket-score-input" value="${match.score1}" min="0" data-field="score1" />`
        : `<span style="font-weight:700;">${match.score1}</span>`
      }
    </div>
    <div class="bracket-player ${p2Winner ? 'winner' : ''}" data-player="2">
      <span>${escapeHtml(p2Name)}</span>
      ${canEdit
        ? `<input type="number" class="bracket-score-input" value="${match.score2}" min="0" data-field="score2" />`
        : `<span style="font-weight:700;">${match.score2}</span>`
      }
    </div>
    ${canEdit ? `<button class="btn-primary btn-scrapbook btn-small bracket-save-btn" data-match-id="${match.id}">💾 Save Score</button>` : ''}
  `;

  // Bind save button
  if (canEdit) {
    const saveBtn = card.querySelector('.bracket-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => handleSaveScore(match.id, card));
    }
  }

  return card;
}

async function handleSaveScore(matchId, cardEl) {
  const score1Input = cardEl.querySelector('[data-field="score1"]');
  const score2Input = cardEl.querySelector('[data-field="score2"]');

  if (!score1Input || !score2Input) return;

  const score1 = parseInt(score1Input.value) || 0;
  const score2 = parseInt(score2Input.value) || 0;

  // Determine winner
  let winnerId = null;
  const match = matches.find(m => m.id === matchId);
  if (match) {
    if (score1 > score2 && match.player1_id) winnerId = match.player1_id;
    else if (score2 > score1 && match.player2_id) winnerId = match.player2_id;
  }

  const saveBtn = cardEl.querySelector('.bracket-save-btn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Speichere...';
  }

  try {
    await updateMatch(matchId, {
      score1,
      score2,
      winner_id: winnerId
    });

    showToast('Score gspeichert! 🏆', 'success', 1500);

    // Refresh bracket
    await loadTournament();
  } catch (e) {
    console.error('Save score error:', e);
    showToast('Fehler bim Speichere.', 'error');
  }
}

async function handleGenerateBracket() {
  // Get confirmed RSVPs as participants
  if (rsvps.length === 0) {
    await loadRsvps();
  }

  const participants = rsvps
    .filter(r => r.status === 'confirmed')
    .map(r => ({
      id: r.user_id,
      name: r.user?.display_name || 'Unknown'
    }));

  if (participants.length < 2) {
    showToast('Mindestens 2 Teilnehmer bruucht!', 'warn');
    return;
  }

  els.generateBracket.disabled = true;
  els.generateBracket.textContent = 'Generiere...';

  try {
    // Clear existing matches
    await clearTournament(currentEventId);

    // Shuffle participants
    const shuffled = shuffleArray([...participants]);

    // Pad to power of 2
    const size = nextPowerOf2(shuffled.length);
    while (shuffled.length < size) {
      shuffled.push(null); // BYE
    }

    // Generate round 1 matches
    const numMatches = size / 2;
    const totalRounds = Math.log2(size);

    // Create all rounds
    for (let round = 1; round <= totalRounds; round++) {
      const matchesInRound = size / Math.pow(2, round);

      for (let i = 0; i < matchesInRound; i++) {
        const matchData = {
          event_id: currentEventId,
          round,
          match_number: i + 1,
          player1_id: null,
          player2_id: null,
          score1: 0,
          score2: 0
        };

        // Only set players for round 1
        if (round === 1) {
          const p1 = shuffled[i * 2];
          const p2 = shuffled[i * 2 + 1];
          matchData.player1_id = p1 ? p1.id : null;
          matchData.player2_id = p2 ? p2.id : null;

          // Auto-advance BYE
          if (p1 && !p2) matchData.winner_id = p1.id;
          if (!p1 && p2) matchData.winner_id = p2.id;
        }

        await createMatch(matchData);
      }
    }

    showToast('Bracket generiert! 🎲', 'success');

    // Refresh
    await loadTournament();
  } catch (e) {
    console.error('Generate bracket error:', e);
    showToast('Fehler bim Generiere.', 'error');
  } finally {
    els.generateBracket.disabled = false;
    els.generateBracket.textContent = '🎲 Bracket generiere';
  }
}

// ============================================
// TAB 4: MEDIEN & MEMORIES
// ============================================

async function loadMedia() {
  try {
    mediaItems = await getMediaForEvent(currentEventId);
    renderMedia();
  } catch (e) {
    console.error('Error loading media:', e);
  }
}

function renderMedia() {
  if (!els.mediaGrid) return;
  els.mediaGrid.innerHTML = '';

  if (mediaItems.length === 0) {
    els.mediaGrid.innerHTML = '<p style="grid-column:1/-1;font-size:0.85rem;color:var(--text-light);text-align:center;">No kei Fotos. Lad s\'erschte ufe! 📸</p>';
    return;
  }

  mediaItems.forEach((item, index) => {
    const el = document.createElement('div');
    el.className = 'media-item polaroid-style';

    // Random slight rotation for scrapbook feel
    const rotation = (Math.random() - 0.5) * 6;
    el.style.setProperty('--rotate', `${rotation}deg`);

    el.innerHTML = `<img src="${item.url}" alt="Foto" loading="lazy" />`;

    // Click to view fullscreen
    el.addEventListener('click', () => openLightbox(item.url));

    els.mediaGrid.appendChild(el);
  });
}

async function handleMediaUpload(files) {
  const session = getSession();
  if (!session) return;

  if (!files || files.length === 0) return;

  const maxFiles = 10;
  const filesToUpload = Array.from(files).slice(0, maxFiles);

  showToast(`${filesToUpload.length} Foto(s) wird ufegladen...`, 'info', 2000);

  let successCount = 0;

  for (const file of filesToUpload) {
    // Validate size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      showToast(`${file.name} isch z gross (max 10MB)`, 'warn');
      continue;
    }

    try {
      await uploadMedia(currentEventId, session.id, file, 'photo');
      successCount++;
    } catch (e) {
      console.error('Upload error:', e);
    }
  }

  if (successCount > 0) {
    showToast(`${successCount} Foto(s) ufegladen! 📸`, 'success');
    await loadMedia();
  } else {
    showToast('Kei Fotos chönne ufelade werde.', 'error');
  }

  // Reset input
  if (els.mediaUploadInput) els.mediaUploadInput.value = '';
}

// ---- LIGHTBOX ----

function openLightbox(imageUrl) {
  // Create fullscreen lightbox
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.9);
    z-index: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: fade-in 0.2s ease;
    cursor: pointer;
  `;

  const img = document.createElement('img');
  img.src = imageUrl;
  img.style.cssText = `
    max-width: 100%;
    max-height: 90vh;
    object-fit: contain;
    border-radius: 4px;
    box-shadow: 0 0 40px rgba(0,0,0,0.5);
  `;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    position: absolute;
    top: 16px;
    right: 16px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(255,255,255,0.2);
    color: white;
    font-size: 1.2rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
  `;

  overlay.appendChild(img);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);

  // Prevent body scroll
  document.body.style.overflow = 'hidden';

  // Close handlers
  const closeLightbox = () => {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.2s';
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = '';
    }, 200);
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target === closeBtn) {
      closeLightbox();
    }
  });

  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      closeLightbox();
      document.removeEventListener('keydown', escHandler);
    }
  });
}

// ---- QUOTES ----

async function loadQuotes() {
  try {
    quotes = await getQuotesForEvent(currentEventId);
    renderQuotes();
  } catch (e) {
    console.error('Error loading quotes:', e);
  }
}

function renderQuotes() {
  if (!els.quotesList) return;
  els.quotesList.innerHTML = '';

  if (quotes.length === 0) {
    els.quotesList.innerHTML = '<p style="font-size:0.85rem;color:var(--text-light);">No kei Zitate. Was isch gseit worde?</p>';
    return;
  }

  quotes.forEach(q => {
    const item = document.createElement('div');
    item.className = 'quote-item';

    item.innerHTML = `
      ${escapeHtml(q.text)}
      <span class="quote-author">— ${escapeHtml(q.user?.display_name || 'Anonym')}</span>
    `;

    els.quotesList.appendChild(item);
  });
}

async function handleSaveQuote() {
  const session = getSession();
  if (!session) return;

  const text = els.quoteInput.value.trim();

  if (!text) {
    showToast('Schriib es Zitat!', 'warn');
    return;
  }

  if (text.length > 500) {
    showToast('Maximal 500 Zeiche!', 'warn');
    return;
  }

  els.quoteSave.disabled = true;
  els.quoteSave.textContent = 'Speichere...';

  try {
    await createQuote(currentEventId, session.id, text);
    els.quoteInput.value = '';
    showToast('Zitat gspeichert! 💬', 'success', 1500);
    await loadQuotes();
  } catch (e) {
    console.error('Quote save error:', e);
    showToast('Fehler bim Speichere.', 'error');
  } finally {
    els.quoteSave.disabled = false;
    els.quoteSave.textContent = '💬 Speicherä';
  }
}

// ============================================
// EVENT BINDINGS
// ============================================

function bindEvents() {
  // RSVP buttons
  document.querySelectorAll('.rsvp-btn').forEach(btn => {
    btn.addEventListener('click', () => handleRsvp(btn.dataset.status));
  });

  // Star rating
  if (els.starRating) {
    els.starRating.querySelectorAll('.star').forEach(star => {
      // Hover effect
      star.addEventListener('mouseenter', () => {
        const val = parseInt(star.dataset.star);
        els.starRating.querySelectorAll('.star').forEach(s => {
          const sVal = parseInt(s.dataset.star);
          s.classList.toggle('hover', sVal <= val);
        });
      });

      star.addEventListener('mouseleave', () => {
        els.starRating.querySelectorAll('.star').forEach(s => {
          s.classList.remove('hover');
        });
      });

      // Click
      star.addEventListener('click', () => {
        handleStarClick(parseInt(star.dataset.star));
      });
    });
  }

  // Transaction save
  if (els.txSave) {
    els.txSave.addEventListener('click', handleSaveTransaction);
  }

  // Transaction amount: enter to save
  if (els.txDesc) {
    els.txDesc.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSaveTransaction();
    });
  }

  // Generate bracket
  if (els.generateBracket) {
    els.generateBracket.addEventListener('click', handleGenerateBracket);
  }

  // Media upload
  if (els.mediaUploadInput) {
    els.mediaUploadInput.addEventListener('change', (e) => {
      handleMediaUpload(e.target.files);
    });
  }

  // Quote save
  if (els.quoteSave) {
    els.quoteSave.addEventListener('click', handleSaveQuote);
  }

  // Quote: enter to save
  if (els.quoteInput) {
    els.quoteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSaveQuote();
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

function getDefaultAvatar(name = '') {
  // Generate a simple SVG avatar placeholder
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

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function nextPowerOf2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// ---- CLEANUP ----

export function destroyEventModal() {
  currentEvent = null;
  currentEventId = null;
  rsvps = [];
  transactions = [];
  matches = [];
  mediaItems = [];
  quotes = [];
}
