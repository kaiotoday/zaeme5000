// ============================================
// ZÄME 5000 – Supabase Client & DB Helpers
// ============================================

const SUPABASE_URL = 'https://DEIN-PROJEKT.supabase.co';
const SUPABASE_ANON_KEY = 'DEIN-ANON-KEY';

// Lightweight Supabase REST wrapper (kein SDK nötig)
const headers = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

// ---- GENERIC REST HELPERS ----

async function query(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers });
  if (!res.ok) throw new Error(`GET ${table} failed: ${res.status}`);
  return res.json();
}

async function insert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `INSERT ${table} failed: ${res.status}`);
  }
  return res.json();
}

async function update(table, match, data) {
  // match = 'id=eq.xxx' or 'user_id=eq.xxx&event_id=eq.yyy'
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${match}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`UPDATE ${table} failed: ${res.status}`);
  return res.json();
}

async function remove(table, match) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${match}`, {
    method: 'DELETE',
    headers: { ...headers, 'Prefer': 'return=minimal' }
  });
  if (!res.ok) throw new Error(`DELETE ${table} failed: ${res.status}`);
  return true;
}

async function rpc(fnName, params = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params)
  });
  if (!res.ok) throw new Error(`RPC ${fnName} failed: ${res.status}`);
  return res.json();
}

// ---- STORAGE HELPERS ----

async function uploadFile(bucket, path, file) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': file.type,
      'x-upsert': 'true'
    },
    body: file
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

function getPublicUrl(bucket, path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}

// ============================================
// DOMAIN-SPECIFIC DB FUNCTIONS
// ============================================

// ---- PROFILES ----

export async function getProfiles() {
  return query('profiles', 'select=*&order=display_name.asc');
}

export async function getApprovedProfiles() {
  return query('profiles', 'select=*&approved=eq.true&order=display_name.asc');
}

export async function getPendingProfiles() {
  return query('profiles', 'select=*&approved=eq.false&order=created_at.asc');
}

export async function getProfileByUsername(username) {
  const rows = await query('profiles', `select=*&username=eq.${encodeURIComponent(username)}`);
  return rows[0] || null;
}

export async function getProfileById(id) {
  const rows = await query('profiles', `select=*&id=eq.${id}`);
  return rows[0] || null;
}

export async function createProfile(data) {
  // data: { username, display_name, bouncer_words }
  const rows = await insert('profiles', data);
  return rows[0];
}

export async function updateProfile(id, data) {
  const rows = await update('profiles', `id=eq.${id}`, data);
  return rows[0];
}

export async function approveUser(id) {
  return updateProfile(id, { approved: true });
}

export async function searchProfiles(term) {
  return query('profiles', `select=*&approved=eq.true&username=ilike.*${encodeURIComponent(term)}*&limit=5`);
}

// ---- AVATAR UPLOAD ----

export async function uploadAvatar(userId, file) {
  const ext = file.name.split('.').pop();
  const path = `avatars/${userId}.${ext}`;
  const url = await uploadFile('media', path, file);
  await updateProfile(userId, { avatar_url: url });
  return url;
}

// ---- EVENTS ----

export async function getEvents() {
  return query('events', 'select=*,organizer:profiles!organizer_id(id,display_name,avatar_url)&order=event_date.desc');
}

export async function getUpcomingEvents() {
  const now = new Date().toISOString();
  return query('events', `select=*,organizer:profiles!organizer_id(id,display_name,avatar_url)&event_date=gte.${now}&order=event_date.asc`);
}

export async function getPastEvents() {
  const now = new Date().toISOString();
  return query('events', `select=*,organizer:profiles!organizer_id(id,display_name,avatar_url)&event_date=lt.${now}&order=event_date.desc`);
}

export async function getNextEvent() {
  const now = new Date().toISOString();
  const rows = await query('events', `select=*,organizer:profiles!organizer_id(id,display_name,avatar_url)&event_date=gte.${now}&order=event_date.asc&limit=1`);
  return rows[0] || null;
}

export async function getEventById(id) {
  const rows = await query('events', `select=*,organizer:profiles!organizer_id(id,display_name,avatar_url)&id=eq.${id}`);
  return rows[0] || null;
}

export async function createEvent(data) {
  const rows = await insert('events', data);
  return rows[0];
}

export async function updateEvent(id, data) {
  const rows = await update('events', `id=eq.${id}`, data);
  return rows[0];
}

export async function uploadEventImage(eventId, file) {
  const ext = file.name.split('.').pop();
  const path = `events/${eventId}.${ext}`;
  const url = await uploadFile('media', path, file);
  await updateEvent(eventId, { hero_image_url: url });
  return url;
}

// ---- RSVPS ----

export async function getRsvpsForEvent(eventId) {
  return query('rsvps', `select=*,user:profiles!user_id(id,display_name,avatar_url)&event_id=eq.${eventId}&order=created_at.asc`);
}

export async function getUserRsvp(eventId, userId) {
  const rows = await query('rsvps', `select=*&event_id=eq.${eventId}&user_id=eq.${userId}`);
  return rows[0] || null;
}

export async function upsertRsvp(eventId, userId, data) {
  // Check if exists
  const existing = await getUserRsvp(eventId, userId);
  if (existing) {
    const rows = await update('rsvps', `id=eq.${existing.id}`, data);
    return rows[0];
  } else {
    const rows = await insert('rsvps', { event_id: eventId, user_id: userId, ...data });
    return rows[0];
  }
}

// ---- TRANSACTIONS (Batzenkonto) ----

export async function getTransactionsForEvent(eventId) {
  return query('transactions', `select=*,user:profiles!user_id(id,display_name)&event_id=eq.${eventId}&order=created_at.desc`);
}

export async function getUserTransactions(userId) {
  return query('transactions', `select=*&user_id=eq.${userId}&order=created_at.desc`);
}

export async function createTransaction(data) {
  // data: { event_id, user_id, amount, description, receipt_url? }
  const rows = await insert('transactions', data);

  // Update batzen on profile
  const profile = await getProfileById(data.user_id);
  if (profile) {
    const newBatzen = parseFloat(profile.batzen || 0) + parseFloat(data.amount);
    await updateProfile(data.user_id, { batzen: newBatzen });
  }

  return rows[0];
}

export async function uploadReceipt(eventId, file) {
  const ext = file.name.split('.').pop();
  const ts = Date.now();
  const path = `receipts/${eventId}_${ts}.${ext}`;
  return uploadFile('media', path, file);
}

// ---- RATINGS ----

export async function getRatingsForEvent(eventId) {
  return query('ratings', `select=*&event_id=eq.${eventId}`);
}

export async function upsertRating(eventId, userId, stars) {
  const existing = await query('ratings', `select=*&event_id=eq.${eventId}&user_id=eq.${userId}`);
  if (existing.length > 0) {
    const rows = await update('ratings', `id=eq.${existing[0].id}`, { stars });
    return rows[0];
  }
  const rows = await insert('ratings', { event_id: eventId, user_id: userId, stars });
  return rows[0];
}

export async function getAverageRating(eventId) {
  const ratings = await getRatingsForEvent(eventId);
  if (ratings.length === 0) return null;
  const sum = ratings.reduce((s, r) => s + r.stars, 0);
  return {
    average: (sum / ratings.length).toFixed(1),
    count: ratings.length
  };
}

// ---- IDEAS ----

export async function getIdeas() {
  return query('ideas', 'select=*&order=created_at.desc&limit=30');
}

export async function createIdea(text) {
  const rows = await insert('ideas', { text });
  return rows[0];
}

// ---- TOURNAMENT ----

export async function getMatchesForEvent(eventId) {
  return query('tournament_matches', `select=*,player1:profiles!player1_id(id,display_name),player2:profiles!player2_id(id,display_name)&event_id=eq.${eventId}&order=round.asc,match_number.asc`);
}

export async function createMatch(data) {
  const rows = await insert('tournament_matches', data);
  return rows[0];
}

export async function updateMatch(matchId, data) {
  const rows = await update('tournament_matches', `id=eq.${matchId}`, data);
  return rows[0];
}

export async function clearTournament(eventId) {
  return remove('tournament_matches', `event_id=eq.${eventId}`);
}

// ---- MEDIA ----

export async function getMediaForEvent(eventId) {
  return query('media', `select=*,user:profiles!user_id(id,display_name)&event_id=eq.${eventId}&order=created_at.desc`);
}

export async function uploadMedia(eventId, userId, file, mediaType = 'photo') {
  const ext = file.name.split('.').pop();
  const ts = Date.now();
  const path = `photos/${eventId}/${ts}_${Math.random().toString(36).slice(2,6)}.${ext}`;
  const url = await uploadFile('media', path, file);
  const rows = await insert('media', {
    event_id: eventId,
    user_id: userId,
    url,
    media_type: mediaType
  });
  return rows[0];
}

// ---- QUOTES ----

export async function getQuotesForEvent(eventId) {
  return query('quotes', `select=*,user:profiles!user_id(id,display_name)&event_id=eq.${eventId}&order=created_at.desc`);
}

export async function createQuote(eventId, userId, text) {
  const rows = await insert('quotes', { event_id: eventId, user_id: userId, text });
  return rows[0];
}

// ---- BADGES ----

export async function getAllBadges() {
  return query('badges', 'select=*&order=name.asc');
}

export async function getUserBadges(userId) {
  return query('user_badges', `select=*,badge:badges!badge_id(*)&user_id=eq.${userId}`);
}

export async function awardBadge(userId, badgeId) {
  try {
    const rows = await insert('user_badges', { user_id: userId, badge_id: badgeId });
    return rows[0];
  } catch (e) {
    // Unique constraint = already has badge
    console.warn('Badge already awarded:', e.message);
    return null;
  }
}

// ---- PINGS ----

export async function getActivePings() {
  return query('pings', `select=*,sender:profiles!sender_id(id,display_name,avatar_url)&active=eq.true&order=created_at.desc&limit=20`);
}

export async function createPing(data) {
  // data: { sender_id, activity, location, time_text }
  const rows = await insert('pings', data);
  return rows[0];
}

export async function deactivatePing(pingId) {
  return update('pings', `id=eq.${pingId}`, { active: false });
}

export async function getPingJoins(pingId) {
  return query('ping_joins', `select=*,user:profiles!user_id(id,display_name,avatar_url)&ping_id=eq.${pingId}`);
}

export async function joinPing(pingId, userId) {
  try {
    const rows = await insert('ping_joins', { ping_id: pingId, user_id: userId });
    return rows[0];
  } catch (e) {
    console.warn('Already joined:', e.message);
    return null;
  }
}

// ---- HALL OF FAME ----

export async function getHallOfFame() {
  return query('hall_of_fame', 'select=*&order=year.desc,category.asc');
}

export async function createHofEntry(data) {
  const rows = await insert('hall_of_fame', data);
  return rows[0];
}

// ---- SIGNATURE SOUND ----

export async function uploadSound(userId, file) {
  const path = `sounds/${userId}.mp3`;
  const url = await uploadFile('media', path, file);
  await updateProfile(userId, { signature_sound_url: url });
  return url;
}

// ---- AUTH HELPER (Bouncer Code Validation) ----

export async function validateBouncer(username, selectedWords) {
  const profile = await getProfileByUsername(username);
  if (!profile) return { success: false, error: 'User nöd gfunde.' };
  if (!profile.approved) return { success: false, error: 'Din Account isch nonig freigschalte.' };

  const stored = profile.bouncer_words || [];
  const match =
    stored.length === selectedWords.length &&
    stored.every((w, i) => w === selectedWords[i]);

  if (!match) return { success: false, error: 'Falscher Bouncer Code!' };

  return { success: true, profile };
}

// ---- BOUNCER WORD POOL ----

export const BOUNCER_WORDS = [
  'Fondue', 'Gletscher', 'Raclette', 'Bünzli', 'Cervelat',
  'Schoggi', 'Alpenhorn', 'Réduit', 'Grüezi', 'Müntschi',
  'Znüni', 'Zvieri', 'Chuchichäschtli', 'Gipfeli', 'Rösti',
  'Edelweiss', 'Rivella', 'Sennhund', 'Zopf', 'Böögg'
];

// ============================================
// SESSION (Local Storage based)
// ============================================

const SESSION_KEY = 'zaeme5000_session';

export function saveSession(profile) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    role: profile.role,
    theme: profile.theme,
    avatar_url: profile.avatar_url,
    timestamp: Date.now()
  }));
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    // Session expires after 30 days
    if (Date.now() - session.timestamp > 30 * 24 * 60 * 60 * 1000) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function updateSessionField(key, value) {
  const session = getSession();
  if (session) {
    session[key] = value;
    session.timestamp = Date.now();
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}

// ---- HELPERS ----

export function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-CH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

export function formatTime(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(dateStr) {
  return `${formatDate(dateStr)}, ${formatTime(dateStr)}`;
}

export function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'grad ebe';
  if (mins < 60) return `vor ${mins} Min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std`;
  const days = Math.floor(hours / 24);
  return `vor ${days} Täg`;
}

export function getCountdown(dateStr) {
  const now = Date.now();
  const target = new Date(dateStr).getTime();
  const diff = target - now;

  if (diff <= 0) return 'Jetzt!';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function eventEmoji(title = '') {
  const t = title.toLowerCase();
  if (t.includes('grill') || t.includes('bbq')) return '🔥';
  if (t.includes('beer') || t.includes('pong')) return '🍺';
  if (t.includes('ausflug') || t.includes('trip')) return '🚗';
  if (t.includes('turnier') || t.includes('tournament')) return '🏆';
  if (t.includes('weihnacht') || t.includes('xmas')) return '🎄';
  if (t.includes('party') || t.includes('feier')) return '🎉';
  if (t.includes('wandern') || t.includes('hike')) return '🥾';
  if (t.includes('ski') || t.includes('snow')) return '🎿';
  if (t.includes('schwimm') || t.includes('see') || t.includes('badi')) return '🏊';
  if (t.includes('film') || t.includes('movie') || t.includes('kino')) return '🎬';
  if (t.includes('essen') || t.includes('dinner') || t.includes('food')) return '🍕';
  if (t.includes('game') || t.includes('zock') || t.includes('spiel')) return '🎮';
  return '📅';
}
