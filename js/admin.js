const CATEGORIES = {
  cafe:  { label: 'Кафе',    emoji: '☕', color: '#FF6B6B' },
  park:  { label: 'Парки',   emoji: '🌿', color: '#51CF66' },
  place: { label: 'Місця',   emoji: '📍', color: '#339AF0' },
  food:  { label: 'Їжа',     emoji: '🍽', color: '#FFD43B' },
  wall:  { label: 'Стіна',   emoji: '🧱', color: '#F06595' },
  door:  { label: 'Двері',   emoji: '🚪', color: '#FF922B' },
  other: { label: 'Інше',    emoji: '⭐', color: '#CC5DE8' },
};

const TAG_PALETTE = ['#FF6B6B','#FF922B','#FFD43B','#51CF66','#339AF0','#748FFC','#CC5DE8','#F06595','#20C997','#74C0FC'];
function tagColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

let currentTags = [];

function addTag(label) {
  label = label.trim().replace(/,/g, '');
  if (!label || currentTags.includes(label)) return;
  currentTags.push(label);
  renderTagPills();
}

function removeTag(idx) {
  currentTags.splice(idx, 1);
  renderTagPills();
}

function renderTagPills() {
  const wrap  = document.getElementById('tag-input-wrap');
  const field = document.getElementById('tag-input-field');
  if (!wrap) return;
  wrap.querySelectorAll('.tag-pill').forEach(p => p.remove());
  currentTags.forEach((label, i) => {
    const c    = tagColor(label);
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.style.cssText = `background:${c}22;border-color:${c}55;color:${c}`;
    pill.innerHTML = `${escapeHtml(label)}<button type="button" class="tag-remove" onclick="removeTag(${i})">×</button>`;
    wrap.insertBefore(pill, field);
  });
}

let adminMap, pinMarker, currentSha = null;
let selectedPhotoFile = null;

// ── Change password (uses appSha256 / appLoadConfig from auth.js) ─────────────

async function changePassword() {
  const current = document.getElementById('pw-current').value;
  const newPw   = document.getElementById('pw-new').value;
  const confirm = document.getElementById('pw-confirm').value;

  if (!current || !newPw) {
    setStatus('pw-change-status', 'error', 'Заповніть всі поля');
    return;
  }
  if (newPw !== confirm) {
    setStatus('pw-change-status', 'error', 'Паролі не співпадають');
    return;
  }
  if (newPw.length < 4) {
    setStatus('pw-change-status', 'error', 'Мінімум 4 символи');
    return;
  }

  setStatus('pw-change-status', 'loading', 'Перевірка...');

  try {
    const currentHash = await appSha256(current);
    const config      = await appLoadConfig();
    if (currentHash !== config.passwordHash) {
      setStatus('pw-change-status', 'error', 'Невірний поточний пароль');
      return;
    }
    const newHash = await appSha256(newPw);
    await apiPutFile('config.json', { passwordHash: newHash }, 'Update password');
    setStatus('pw-change-status', 'success', '✓ Пароль змінено!');
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value     = '';
    document.getElementById('pw-confirm').value = '';
  } catch (e) {
    setStatus('pw-change-status', 'error', e.message);
  }
}

// ── Photo upload ──────────────────────────────────────────────────────────────

async function handlePhotoSelect(file) {
  if (!file || !file.type.startsWith('image/')) return;
  selectedPhotoFile = file;

  // Show local preview immediately
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('photo-preview-img').src = e.target.result;
    document.getElementById('photo-drop-hint').style.display  = 'none';
    document.getElementById('photo-preview-wrap').style.display = 'flex';
    document.getElementById('loc-photo').value = '';
  };
  reader.readAsDataURL(file);

  // Read EXIF GPS
  const exifInfo = document.getElementById('photo-exif-info');
  exifInfo.innerHTML = '<span style="color:var(--text-muted);font-size:12px">Читаю метадані...</span>';
  try {
    const gps = await exifr.gps(file);
    if (gps?.latitude && gps?.longitude) {
      const lat = gps.latitude, lng = gps.longitude;
      document.getElementById('loc-lat').value = lat.toFixed(6);
      document.getElementById('loc-lng').value = lng.toFixed(6);
      exifInfo.innerHTML = '<span class="exif-badge exif-found">📍 GPS знайдено в метаданих</span>';
      adminMap.setView([lat, lng], 17);
      if (pinMarker) adminMap.removeLayer(pinMarker);
      pinMarker = L.circleMarker([lat, lng], {
        radius: 8, fillColor: '#7c3aed', fillOpacity: 1, color: '#fff', weight: 2,
      }).addTo(adminMap);
    } else {
      exifInfo.innerHTML = '<span class="exif-badge exif-none">GPS не знайдено — введіть координати вручну</span>';
    }
  } catch {
    exifInfo.innerHTML = '<span class="exif-badge exif-none">Метадані відсутні</span>';
  }
}

function clearPhoto() {
  selectedPhotoFile = null;
  const fi = document.getElementById('loc-photo-file');
  if (fi) fi.value = '';
  document.getElementById('photo-preview-img').src = '';
  document.getElementById('photo-preview-wrap').style.display = 'none';
  document.getElementById('photo-drop-hint').style.display = '';
  document.getElementById('photo-exif-info').innerHTML = '';
}

async function uploadPhoto(file) {
  const { owner, repo, token } = getSettings();
  if (!owner || !repo || !token) throw new Error('Заповніть налаштування GitHub');

  const ext      = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const filename = `photos/${Date.now()}.${ext}`;

  const base64 = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload  = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filename}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({ message: `Add photo: ${filename}`, content: base64 }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Помилка завантаження фото: HTTP ${res.status}`);
  }

  return `https://raw.githubusercontent.com/${owner}/${repo}/main/${filename}`;
}

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

async function apiPutFile(path, payload, message) {
  const { owner, repo, token } = getSettings();
  if (!owner || !repo || !token) throw new Error('Заповніть налаштування GitHub');

  // Get current SHA of the file (if it exists)
  let sha;
  const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (getRes.ok) sha = (await getRes.json()).sha;

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))));
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({ message, content, ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
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

  const name = document.getElementById('loc-name').value.trim();
  const lat  = parseFloat(document.getElementById('loc-lat').value);
  const lng  = parseFloat(document.getElementById('loc-lng').value);

  if (!name || isNaN(lat) || isNaN(lng)) {
    setStatus('form-status', 'error', 'Назва та координати обов\'язкові');
    btn.disabled = false;
    return;
  }

  try {
    // Upload photo first if file selected
    let photoUrl = document.getElementById('loc-photo').value.trim();
    if (selectedPhotoFile) {
      setStatus('form-status', 'loading', '📷 Завантаження фото...');
      photoUrl = await uploadPhoto(selectedPhotoFile);
    }

    const loc = {
      id:          String(Date.now()),
      name,
      description: document.getElementById('loc-desc').value.trim(),
      category:    document.getElementById('loc-cat').value,
      tags:        [...currentTags],
      lat, lng,
      photo:       photoUrl,
      createdAt:   new Date().toISOString().slice(0, 10),
    };

    setStatus('form-status', 'loading', 'Збереження...');
    const data = await apiGet();
    data.locations.push(loc);
    await apiPut(data, `Add location: ${loc.name}`);
    setStatus('form-status', 'success', `✓ "${loc.name}" додано успішно!`);
    document.getElementById('add-form').reset();
    currentTags = [];
    renderTagPills();
    clearPhoto();
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
  adminMap = L.map('admin-map', { center: [50.0647, 19.9450], zoom: 13, zoomControl: true });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
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
  document.getElementById('add-form').addEventListener('reset', () => {
    currentTags = [];
    renderTagPills();
    clearPhoto();
  });

  // Photo file input
  const fileInput = document.getElementById('loc-photo-file');
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      if (e.target.files[0]) handlePhotoSelect(e.target.files[0]);
    });
  }

  document.getElementById('photo-clear-btn')?.addEventListener('click', clearPhoto);

  // Drag & drop
  const dropZone = document.getElementById('photo-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith('image/')) handlePhotoSelect(file);
    });
  }
  document.getElementById('load-list-btn').addEventListener('click', loadAdminList);
  document.getElementById('pw-change-btn').addEventListener('click', changePassword);
  document.getElementById('pw-logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('map_auth');
    location.reload();
  });

  const tagField = document.getElementById('tag-input-field');
  if (tagField) {
    tagField.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(tagField.value);
        tagField.value = '';
      }
    });
    tagField.addEventListener('blur', () => {
      if (tagField.value.trim()) { addTag(tagField.value); tagField.value = ''; }
    });
  }

  // Load list if settings are already filled
  const { owner, repo, token } = getSettings();
  if (owner && repo && token) loadAdminList();
});
