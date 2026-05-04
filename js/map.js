const CATEGORIES = {
  cafe:  { label: 'Кафе',    emoji: '☕', color: '#FF6B6B' },
  park:  { label: 'Парки',   emoji: '🌿', color: '#51CF66' },
  place: { label: 'Місця',   emoji: '📍', color: '#339AF0' },
  food:  { label: 'Їжа',     emoji: '🍽', color: '#FFD43B' },
  other: { label: 'Інше',    emoji: '⭐', color: '#CC5DE8' },
};

let map, markersLayer, allLocations = [], activeFilter = 'all';

function initMap() {
  map = L.map('map', {
    center: [49.8397, 24.0297],
    zoom: 14,
    zoomControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(map);

  L.control.zoom({ position: 'bottomright' }).addTo(map);
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
    ? `<img class="popup-photo" src="${escapeHtml(loc.photo)}" alt="${escapeHtml(loc.name)}" onerror="this.style.display='none'">`
    : '';
  return `
    ${photo}
    <div class="popup-inner">
      <div class="popup-category" style="color:${cat.color}">${cat.emoji} ${cat.label}</div>
      <div class="popup-name">${escapeHtml(loc.name)}</div>
      ${loc.description ? `<div class="popup-desc">${escapeHtml(loc.description)}</div>` : ''}
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
    return `
      <div class="loc-item" data-lat="${loc.lat}" data-lng="${loc.lng}" data-id="${loc.id}">
        <div class="loc-dot" style="background:${cat.color}"></div>
        <div class="loc-info">
          <div class="loc-name">${escapeHtml(loc.name)}</div>
          <div class="loc-cat">${cat.emoji} ${cat.label}</div>
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
  try {
    const res = await fetch('locations.json?t=' + Date.now());
    const data = await res.json();
    allLocations = data.locations || [];
    applyFilter();
  } catch (e) {
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

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  buildFilters();
  loadLocations();
});
