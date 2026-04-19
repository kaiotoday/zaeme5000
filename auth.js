// ============================================
// ZÄME 5000 – Auth Module (Bouncer Login)
// ============================================

import {
  getApprovedProfiles,
  getProfileByUsername,
  createProfile,
  validateBouncer,
  saveSession,
  BOUNCER_WORDS
} from './supabase.js';

// ---- STATE ----
let authMode = 'login'; // 'login' | 'register'
let selectedWords = [];
let allProfiles = [];
let shuffledWords = [];

// ---- DOM REFS ----
const els = {};

function cacheDom() {
  els.view = document.getElementById('view-auth');
  els.nameInput = document.getElementById('auth-name');
  els.suggestions = document.getElementById('auth-suggestions');
  els.registerFields = document.getElementById('register-fields');
  els.displayNameInput = document.getElementById('auth-display-name');
  els.bouncerGrid = document.getElementById('bouncer-grid');
  els.bouncerSelected = document.getElementById('bouncer-selected');
  els.submitBtn = document.getElementById('auth-submit');
  els.errorMsg = document.getElementById('auth-error');
  els.successMsg = document.getElementById('auth-success');
  els.toggleBtns = document.querySelectorAll('.auth-toggle-btn');
}

// ---- INIT ----

export async function initAuth(onLoginSuccess) {
  cacheDom();

  // Store callback
  els._onLoginSuccess = onLoginSuccess;

  // Load profiles for autocomplete
  try {
    allProfiles = await getApprovedProfiles();
  } catch (e) {
    console.warn('Could not load profiles for autocomplete:', e);
    allProfiles = [];
  }

  // Shuffle bouncer words
  shuffledWords = shuffleArray([...BOUNCER_WORDS]);

  // Render bouncer grid
  renderBouncerGrid();

  // Bind events
  bindEvents();

  // Show auth view
  els.view.classList.remove('hidden');
}

// ---- RENDER BOUNCER GRID ----

function renderBouncerGrid() {
  els.bouncerGrid.innerHTML = '';
  shuffledWords.forEach(word => {
    const btn = document.createElement('button');
    btn.className = 'bouncer-word';
    btn.textContent = word;
    btn.dataset.word = word;
    btn.addEventListener('click', () => handleWordClick(word, btn));
    els.bouncerGrid.appendChild(btn);
  });
}

function handleWordClick(word, btn) {
  const idx = selectedWords.indexOf(word);

  if (idx > -1) {
    // Deselect
    selectedWords.splice(idx, 1);
    btn.classList.remove('selected');
  } else if (selectedWords.length < 3) {
    // Select
    selectedWords.push(word);
    btn.classList.add('selected');
  } else {
    // Already 3 selected – shake feedback
    btn.style.animation = 'none';
    btn.offsetHeight; // trigger reflow
    btn.style.animation = 'shake 0.3s ease';
    return;
  }

  renderSelectedTags();
  validateForm();
}

function renderSelectedTags() {
  els.bouncerSelected.innerHTML = '';
  selectedWords.forEach(word => {
    const tag = document.createElement('span');
    tag.className = 'bouncer-tag';
    tag.textContent = word;
    els.bouncerSelected.appendChild(tag);
  });

  // Placeholder if empty
  if (selectedWords.length === 0) {
    els.bouncerSelected.innerHTML = '<span style="color:var(--text-light);font-size:0.8rem;">Wähl 3 Wörter...</span>';
  }
}

// ---- AUTOCOMPLETE ----

function handleNameInput() {
  const val = els.nameInput.value.trim().toLowerCase();
  hideMessages();

  if (authMode === 'login' && val.length >= 1) {
    const matches = allProfiles.filter(p =>
      p.username.toLowerCase().includes(val) ||
      p.display_name.toLowerCase().includes(val)
    );
    showSuggestions(matches);
  } else {
    hideSuggestions();
  }

  validateForm();
}

function showSuggestions(profiles) {
  if (profiles.length === 0) {
    hideSuggestions();
    return;
  }

  els.suggestions.innerHTML = '';
  els.suggestions.classList.remove('hidden');

  profiles.forEach(p => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.textContent = p.display_name || p.username;
    item.addEventListener('click', () => {
      els.nameInput.value = p.username;
      hideSuggestions();
      validateForm();
    });
    els.suggestions.appendChild(item);
  });
}

function hideSuggestions() {
  els.suggestions.classList.add('hidden');
  els.suggestions.innerHTML = '';
}

// ---- MODE TOGGLE ----

function setAuthMode(mode) {
  authMode = mode;
  selectedWords = [];
  hideMessages();

  // Reset bouncer grid selection
  els.bouncerGrid.querySelectorAll('.bouncer-word').forEach(b => b.classList.remove('selected'));
  renderSelectedTags();

  // Toggle buttons
  els.toggleBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Show/hide register fields
  if (mode === 'register') {
    els.registerFields.classList.remove('hidden');
    els.submitBtn.querySelector('.btn-text').textContent = 'Registriere';
    els.submitBtn.querySelector('.btn-icon').textContent = '📝';
    els.nameInput.placeholder = 'Wähl en Username...';
  } else {
    els.registerFields.classList.add('hidden');
    els.submitBtn.querySelector('.btn-text').textContent = 'Iine cho';
    els.submitBtn.querySelector('.btn-icon').textContent = '🚪';
    els.nameInput.placeholder = 'Name iitippä...';
  }

  // Re-shuffle for register (new secret code)
  if (mode === 'register') {
    shuffledWords = shuffleArray([...BOUNCER_WORDS]);
    renderBouncerGrid();
  }

  validateForm();
}

// ---- FORM VALIDATION ----

function validateForm() {
  const name = els.nameInput.value.trim();
  let valid = false;

  if (authMode === 'login') {
    valid = name.length >= 2 && selectedWords.length === 3;
  } else {
    const displayName = els.displayNameInput.value.trim();
    valid = name.length >= 2 && displayName.length >= 2 && selectedWords.length === 3;
  }

  els.submitBtn.disabled = !valid;
}

// ---- SUBMIT ----

async function handleSubmit() {
  const username = els.nameInput.value.trim().toLowerCase();

  hideMessages();
  setLoading(true);

  try {
    if (authMode === 'login') {
      await handleLogin(username);
    } else {
      await handleRegister(username);
    }
  } catch (e) {
    showError(e.message || 'Öppis isch schiefglaufe.');
    console.error('Auth error:', e);
  } finally {
    setLoading(false);
  }
}

async function handleLogin(username) {
  const result = await validateBouncer(username, selectedWords);

  if (!result.success) {
    showError(result.error);
    return;
  }

  // Save session
  saveSession(result.profile);

  // Apply theme
  document.body.dataset.theme = result.profile.theme || 'cardboard';

  // Success animation
  els.submitBtn.style.background = 'var(--success)';
  els.submitBtn.querySelector('.btn-text').textContent = 'Willkomme! 🎉';

  // Callback after short delay
  setTimeout(() => {
    if (els._onLoginSuccess) {
      els._onLoginSuccess(result.profile);
    }
  }, 600);
}

async function handleRegister(username) {
  const displayName = els.displayNameInput.value.trim();

  // Check if username taken
  const existing = await getProfileByUsername(username);
  if (existing) {
    showError('De Username isch scho vergeh!');
    return;
  }

  // Validate username format
  if (!/^[a-z0-9_]{2,20}$/.test(username)) {
    showError('Username: nur Kleinbuechstabe, Zahle, _ (2-20 Zeiche)');
    return;
  }

  // Create profile (pending approval)
  await createProfile({
    username,
    display_name: displayName,
    bouncer_words: selectedWords,
    role: 'member',
    approved: false
  });

  showSuccess('Account erstellt! ✅ Wart bis en Admin di freischaltet.');

  // Reset form
  els.nameInput.value = '';
  els.displayNameInput.value = '';
  selectedWords = [];
  els.bouncerGrid.querySelectorAll('.bouncer-word').forEach(b => b.classList.remove('selected'));
  renderSelectedTags();
  validateForm();

  // Switch to login after delay
  setTimeout(() => setAuthMode('login'), 3000);
}

// ---- UI HELPERS ----

function setLoading(loading) {
  els.submitBtn.disabled = loading;
  if (loading) {
    els.submitBtn.querySelector('.btn-text').textContent = 'Lade...';
    els.submitBtn.style.opacity = '0.7';
  } else {
    els.submitBtn.style.opacity = '1';
    // Reset text based on mode
    if (authMode === 'login') {
      els.submitBtn.querySelector('.btn-text').textContent = 'Iine cho';
    } else {
      els.submitBtn.querySelector('.btn-text').textContent = 'Registriere';
    }
    // Reset success color
    els.submitBtn.style.background = '';
  }
}

function showError(msg) {
  els.errorMsg.textContent = msg;
  els.errorMsg.classList.remove('hidden');
  els.successMsg.classList.add('hidden');
}

function showSuccess(msg) {
  els.successMsg.textContent = msg;
  els.successMsg.classList.remove('hidden');
  els.errorMsg.classList.add('hidden');
}

function hideMessages() {
  els.errorMsg.classList.add('hidden');
  els.successMsg.classList.add('hidden');
}

// ---- EVENT BINDINGS ----

function bindEvents() {
  // Name input
  els.nameInput.addEventListener('input', handleNameInput);

  // Click outside to close suggestions
  document.addEventListener('click', (e) => {
    if (!els.nameInput.contains(e.target) && !els.suggestions.contains(e.target)) {
      hideSuggestions();
    }
  });

  // Display name input (register)
  els.displayNameInput.addEventListener('input', validateForm);

  // Mode toggle
  els.toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => setAuthMode(btn.dataset.mode));
  });

  // Submit
  els.submitBtn.addEventListener('click', handleSubmit);

  // Enter key
  els.nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !els.submitBtn.disabled) handleSubmit();
  });

  els.displayNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !els.submitBtn.disabled) handleSubmit();
  });
}

// ---- UTILITIES ----

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---- CLEANUP (when leaving auth view) ----

export function destroyAuth() {
  els.nameInput?.removeEventListener('input', handleNameInput);
  selectedWords = [];
  allProfiles = [];
}

// ---- ADD SHAKE ANIMATION (inline, since it's tiny) ----
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    50% { transform: translateX(4px); }
    75% { transform: translateX(-4px); }
  }
`;
document.head.appendChild(shakeStyle);
