const CATEGORIES = {
  cafe:  { label: 'Кафе',    emoji: '☕', color: '#FF6B6B' },
  park:  { label: 'Парки',   emoji: '🌿', color: '#51CF66' },
  place: { label: 'Місця',   emoji: '📍', color: '#339AF0' },
  food:  { label: 'Їжа',     emoji: '🍽', color: '#FFD43B' },
  other: { label: 'Інше',    emoji: '⭐', color: '#CC5DE8' },
};

let adminMap, pinMarker, currentSha = null;

// ── Settings ────────────────────────────────────────────────────────────────

function getSettings() {
  return {
    owner: localStorage.getItem('gh_owner') || '',
    repo:  localStorage.getItem('gh_repo')  || '',
    token: localStorage.getItem('gh_token') || '',
  };
}

function saveSettings() {
  localStorage.setItem('gh_owner', document.getElementById('gh-owner').value.trim());
  localStorage.setItem('gh_repo',  document.getElementById('gh-repo').value.trim());
  localStorage.setItem('gh_token', document.getElementById('gh-token').value.trim());
  setStatus('settings-status', 'success', 'Налаштування збережено');
}

function loadSettingsUI() {
  const s = getSettings();
  document.getElementById('gh-owner').value = s.owner;
  document.getElementById('gh-repo').value  = s.repo;
  document.getElementById('gh-token').value  = s.token;
}

// ── GitHub API ───────────────────────────────────────────────────────────────

async function apiGet() {
  const { owner, repo, token } = getSettings();
  if (!owner || !repo || !token) throw new Error('Заповніть налаштування GitHub');

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/locations.json`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  currentSha = data.sha;

  // GitHub returns base64 with newlines — remove them before decoding
  const decoded = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
  return JSON.parse(decoded);
}

async function apiPut(payload, message) {
  const { owner, repo, token } = getSettings();
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/locations.json`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({ message, content, sha: currentSha }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }

  const data = await res.json();
  currentSha = data.content?.sha || currentSha;
  return data;
}

// ── Add location ─────────────────────────────────────────────────────────────

async function addLocation(e) {
  e.preventDefault();
  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  setStatus('form-status', 'loading', 'Збереження...');

  const loc = {
    id:          String(Date.now()),
    name:        document.getElementById('loc-name').value.trim(),
    description: document.getElementById('loc-desc').value.trim(),
    category:    document.getElementById('loc-cat').value,
    lat:         parseFloat(document.getElementById('loc-lat').value),
    lng:         parseFloat(document.getElementById('loc-lng').value),
    photo:       document.getElementById('loc-photo').value.trim(),
    createdAt:   new Date().toISOString().slice(0, 10),
  };

  if (!loc.name || isNaN(loc.lat) || isNaN(loc.lng)) {
    setStatus('form-status', 'error', 'Назва та координати обов\'язкові');
    btn.disabled = false;
    return;
  }

  try {
    const data = await apiGet();
    data.locations.push(loc);
    await apiPut(data, `Add location: ${loc.name}`);
    setStatus('form-status', 'success', `✓ "${loc.name}" додано успішно!`);
    document.getElementById('add-form').reset();
    if (pinMarker) { adminMap.removeLayer(pinMarker); pinMarker = null; }
    await loadAdminList();
  } catch (err) {
    setStatus('form-status', 'error', err.message);
  }

  btn.disabled = false;
}

// ── Delete location ───────────────────────────────────────────────────────────

async function deleteLocation(id) {
  if (!confirm('Видалити цю локацію?')) return;
  setStatus('list-status', 'loading', 'Видалення...');

  try {
    const data = await apiGet();
    const before = data.locations.length;
    data.locations = data.locations.filter(l => l.id !== id);
    if (data.locations.length === before) throw new Error('Локацію не знайдено');
    await apiPut(data, `Remove location ${id}`);
    setStatus('list-status', 'success', 'Локацію видалено');
    await loadAdminList();
  } catch (err) {
    setStatus('list-status', 'error', err.message);
  }
}

// ── Admin list ────────────────────────────────────────────────────────────────

async function loadAdminList() {
  const container = document.getElementById('admin-loc-list');
  container.innerHTML = '<div class="status-msg loading">Завантаження...</div>';

  try {
    const data = await apiGet();
    const locs = data.locations || [];

    if (!locs.length) {
      container.innerHTML = '<div class="no-locations">Немає локацій</div>';
      return;
    }

    container.innerHTML = locs.map(loc => {
      const cat = CATEGORIES[loc.category] || CATEGORIES.other;
      return `
        <div class="admin-loc-item">
          <div class="admin-loc-dot" style="background:${cat.color}"></div>
          <div class="admin-loc-name">${escapeHtml(loc.name)}</div>
          <div class="admin-loc-cat">${cat.emoji} ${cat.label}</div>
          <button class="btn btn-danger" onclick="deleteLocation('${loc.id}')">Видалити</button>
        </div>`;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="status-msg error">${err.message}</div>`;
  }
}

// ── Admin map ─────────────────────────────────────────────────────────────────

function initAdminMap() {
  adminMap = L.map('admin-map', { center: [49.8397, 24.0297], zoom: 13, zoomControl: true });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(adminMap);

  adminMap.on('click', e => {
    const { lat, lng } = e.latlng;
    document.getElementById('loc-lat').value = lat.toFixed(6);
    document.getElementById('loc-lng').value = lng.toFixed(6);

    if (pinMarker) adminMap.removeLayer(pinMarker);
    pinMarker = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: '#7c3aed',
      fillOpacity: 1,
      color: '#fff',
      weight: 2,
    }).addTo(adminMap);
  });
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function setStatus(id, type, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `status-msg ${type}`;
  el.textContent = msg;
  if (type === 'success') setTimeout(() => { el.className = 'status-msg'; el.textContent = ''; }, 4000);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadSettingsUI();
  initAdminMap();

  document.getElementById('save-settings').addEventListener('click', saveSettings);
  document.getElementById('add-form').addEventListener('submit', addLocation);
  document.getElementById('load-list-btn').addEventListener('click', loadAdminList);

  // Load list if settings are already filled
  const { owner, repo, token } = getSettings();
  if (owner && repo && token) loadAdminList();
});
