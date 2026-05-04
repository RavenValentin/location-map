const CATEGORIES = {
  cafe:  { label: 'Кафе',    emoji: '☕', color: '#FF6B6B' },
  park:  { label: 'Парки',   emoji: '🌿', color: '#51CF66', hideFilter: true },
  place: { label: 'Місця',   emoji: '📍', color: '#339AF0', hideFilter: true },
  food:  { label: 'Їжа',     emoji: '🍽', color: '#FFD43B', hideFilter: true },
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

function buildTagPills(tags, size = 'normal') {
  if (!tags?.length) return '';
  const cls = size === 'sm' ? 'tag-pill tag-pill-sm' : 'tag-pill';
  return `<div class="tag-row">${tags.map(t => {
    const c = tagColor(t);
    return `<span class="${cls}" style="background:${c}22;border-color:${c}55;color:${c}">${escapeHtml(t)}</span>`;
  }).join('')}</div>`;
}

let map, markersLayer, allLocations = [], activeFilter = 'all';
let currentTileLayer = null;

const TILE_LAYERS = {
  voyager: {
    label: '🗺 Карта',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    options: { attribution: '&copy; CARTO &copy; OSM', subdomains: 'abcd', maxZoom: 20 },
  },
  satellite: {
    label: '🛰 Супутник',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    options: { attribution: '&copy; Esri', maxZoom: 19 },
  },
  terrain: {
    label: '🏔 Рельєф',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: { attribution: '&copy; OpenTopoMap', subdomains: 'abc', maxZoom: 17 },
  },
};

function switchLayer(key) {
  if (currentTileLayer) map.removeLayer(currentTileLayer);
  const { url, options } = TILE_LAYERS[key];
  currentTileLayer = L.tileLayer(url, options).addTo(map);
  currentTileLayer.bringToBack();

  document.querySelectorAll('.layer-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.layer === key);
  });
}

function buildLayerSwitcher() {
  const control = L.control({ position: 'topright' });
  control.onAdd = () => {
    const div = L.DomUtil.create('div', 'layer-switcher');
    div.innerHTML = Object.entries(TILE_LAYERS).map(([key, val]) =>
      `<button class="layer-btn${key === 'voyager' ? ' active' : ''}" data-layer="${key}">${val.label}</button>`
    ).join('');
    L.DomEvent.disableClickPropagation(div);
    div.addEventListener('click', e => {
      const btn = e.target.closest('.layer-btn');
      if (btn) switchLayer(btn.dataset.layer);
    });
    return div;
  };
  control.addTo(map);
}

function initMap() {
  map = L.map('map', {
    center: [50.0647, 19.9450],
    zoom: 14,
    zoomControl: false,
  });

  switchLayer('voyager');
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  buildLayerSwitcher();
  markersLayer = L.layerGroup().addTo(map);
}

function createMarkerIcon(color) {
  return L.divIcon({
    className: 'marker-wrapper',
    html: `<div class="custom-marker" style="background:${color}"></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -32],
  });
}

function buildPopup(loc) {
  const cat = CATEGORIES[loc.category] || CATEGORIES.other;
  const photo = loc.photo
    ? `<div class="popup-photo-wrap">
         <img class="popup-photo" src="${escapeHtml(loc.photo)}" alt="${escapeHtml(loc.name)}"
              onerror="this.closest('.popup-photo-wrap').remove()"
              onclick="window.open('${escapeHtml(loc.photo)}','_blank')">
       </div>`
    : '';
  const gmapsUrl = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
  const date = loc.createdAt ? `<span class="popup-meta-item">📅 ${loc.createdAt}</span>` : '';
  return `
    ${photo}
    <div class="popup-inner">
      <div class="popup-category" style="color:${cat.color}">${cat.emoji} ${cat.label}</div>
      <div class="popup-name">${escapeHtml(loc.name)}</div>
      ${loc.description ? `<div class="popup-desc">${escapeHtml(loc.description)}</div>` : ''}
      ${buildTagPills(loc.tags)}
      <div class="popup-meta">
        ${date}
        <a class="popup-meta-item popup-gmaps" href="${gmapsUrl}" target="_blank" rel="noopener">
          🗺 Google Maps
        </a>
      </div>
    </div>`;
}

function renderMarkers(locations) {
  markersLayer.clearLayers();
  locations.forEach((loc, i) => {
    const cat = CATEGORIES[loc.category] || CATEGORIES.other;
    const marker = L.marker([loc.lat, loc.lng], { icon: createMarkerIcon(cat.color) })
      .bindPopup(buildPopup(loc), { maxWidth: 280 });

    setTimeout(() => markersLayer.addLayer(marker), i * 40);
  });
}

function renderList(locations) {
  const list = document.getElementById('location-list');
  if (!locations.length) {
    list.innerHTML = '<div class="no-locations">Локацій не знайдено</div>';
    return;
  }
  list.innerHTML = locations.map(loc => {
    const cat = CATEGORIES[loc.category] || CATEGORIES.other;
    const thumb = loc.photo
      ? `<img class="loc-thumb" src="${escapeHtml(loc.photo)}" alt="" onerror="this.style.display='none'">`
      : `<div class="loc-dot" style="background:${cat.color}"></div>`;
    return `
      <div class="loc-item" data-lat="${loc.lat}" data-lng="${loc.lng}" data-id="${loc.id}">
        ${thumb}
        <div class="loc-info">
          <div class="loc-name">${escapeHtml(loc.name)}</div>
          <div class="loc-cat">${cat.emoji} ${cat.label}</div>
          ${buildTagPills(loc.tags, 'sm')}
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.loc-item').forEach(el => {
    el.addEventListener('click', () => {
      const lat = parseFloat(el.dataset.lat);
      const lng = parseFloat(el.dataset.lng);
      map.flyTo([lat, lng], 16, { duration: 0.8 });
      markersLayer.eachLayer(m => {
        if (Math.abs(m.getLatLng().lat - lat) < 0.0001 && Math.abs(m.getLatLng().lng - lng) < 0.0001) {
          m.openPopup();
        }
      });
    });
  });
}

function buildFilters() {
  const container = document.getElementById('filters');
  const all = document.createElement('button');
  all.className = 'filter-btn active';
  all.dataset.cat = 'all';
  all.textContent = 'Всі';
  container.appendChild(all);

  Object.entries(CATEGORIES).forEach(([key, val]) => {
    if (val.hideFilter) return;
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.cat = key;
    btn.innerHTML = `${val.emoji} ${val.label}`;
    container.appendChild(btn);
  });

  container.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.cat;
    applyFilter();
  });
}

function applyFilter() {
  const filtered = activeFilter === 'all'
    ? allLocations
    : allLocations.filter(l => l.category === activeFilter);
  renderMarkers(filtered);
  renderList(filtered);
}

async function loadLocations() {
  const list = document.getElementById('location-list');
  try {
    const res = await fetch('locations.json?t=' + Date.now());
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allLocations = data.locations || [];
    applyFilter();
  } catch (e) {
    const isFile = location.protocol === 'file:';
    list.innerHTML = `<div class="no-locations" style="padding:16px;line-height:1.6">
      ${isFile
        ? '⚠️ Відкрий через локальний сервер:<br><code style="font-size:11px;opacity:.7">python -m http.server 8080</code><br>або VS Code <b>Live Server</b>'
        : '⚠️ Не вдалось завантажити локації'}
    </div>`;
    console.error('Failed to load locations:', e);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const handle  = document.getElementById('sidebar-handle');
  const header  = sidebar.querySelector('.sidebar-header');
  if (!handle) return;

  function toggle() {
    sidebar.classList.toggle('open');
    map.invalidateSize();
  }

  handle.addEventListener('click', toggle);
  header.addEventListener('click', toggle);

  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggle);

  // Close sheet when clicking a location (flyTo handles it visually)
  document.getElementById('location-list').addEventListener('click', e => {
    if (e.target.closest('.loc-item')) {
      sidebar.classList.remove('open');
      map.invalidateSize();
    }
  });

  // Close sheet when tapping the map
  map.on('click', () => {
    if (sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      map.invalidateSize();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  buildFilters();
  loadLocations();
  initMobileSidebar();
});
