/* ─────────────────────────────────────────────────────────────
   MapExtract Pro — app.js
   OpenStreetMap + Overpass API + Supabase backend
   No Google API key required.
───────────────────────────────────────────────────────────── */

// ── Supabase config (hardcoded — change via Settings modal too) ──
const DEFAULT_SB_URL = 'https://axcrulivfqlpeyukicag.supabase.co';
const DEFAULT_SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4Y3J1bGl2ZnFscGV5dWtpY2FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NjQ5NzMsImV4cCI6MjA4OTE0MDk3M30.QX0HWPcvxE5OFUnPQUmc_A034aD_9aioV6imYz59h4M';

let sbClient = null;

function initSupabase() {
  const url = localStorage.getItem('sb_url') || DEFAULT_SB_URL;
  const key = localStorage.getItem('sb_key') || DEFAULT_SB_KEY;
  if (url && key) {
    sbClient = window.supabase.createClient(url, key);
    loadSavedSearches();
  }
}

// ── State ────────────────────────────────────────────────────
let allResults   = [];
let filtered     = [];
let sortCol      = null;
let sortDir      = 'asc';
let activeFilter = 'all';
let pickedLat    = null;
let pickedLng    = null;
let leafletMap   = null;
let pinMarker    = null;
let radiusCircle = null;

// ── Column definitions ────────────────────────────────────────
const COLUMNS = [
  { key: 'name',       label: 'Name',            default: true  },
  { key: 'category',   label: 'Category',         default: true  },
  { key: 'address',    label: 'Address',          default: true  },
  { key: 'phone',      label: 'Phone',            default: true  },
  { key: 'website',    label: 'Website',          default: true  },
  { key: 'hasWebsite', label: 'Has Website',      default: true  },
  { key: 'hours',      label: 'Opening Hours',    default: false },
  { key: 'lat',        label: 'Latitude',         default: false },
  { key: 'lng',        label: 'Longitude',        default: false },
  { key: 'mapsUrl',    label: 'Google Maps Link', default: true  },
];

// ── DOM refs ─────────────────────────────────────────────────
const categoryInput  = document.getElementById('categoryInput');
const radiusInput    = document.getElementById('radiusInput');
const radiusLabel    = document.getElementById('radiusLabel');
const searchBtn      = document.getElementById('searchBtn');
const searchBtnText  = document.getElementById('searchBtnText');
const searchBtnIcon  = document.getElementById('searchBtnIcon');
const searchStatus   = document.getElementById('searchStatus');
const loadingBar     = document.getElementById('loadingBar');
const loadingFill    = document.getElementById('loadingFill');
const filterBar      = document.getElementById('filterBar');
const filterAll      = document.getElementById('filterAll');
const filterHas      = document.getElementById('filterHas');
const filterNo       = document.getElementById('filterNo');
const tableWrap      = document.getElementById('tableWrap');
const tableHead      = document.getElementById('tableHead');
const tableBody      = document.getElementById('tableBody');
const emptyState     = document.getElementById('emptyState');
const noResults      = document.getElementById('noResults');
const resultCount    = document.getElementById('resultCount');
const columnCard     = document.getElementById('columnCard');
const columnChecks   = document.getElementById('columnChecks');
const exportCard     = document.getElementById('exportCard');
const exportBtn      = document.getElementById('exportBtn');
const selectAllBtn   = document.getElementById('selectAllBtn');
const clearSelBtn    = document.getElementById('clearSelBtn');
const selectedCount  = document.getElementById('selectedCount');
const totalCount     = document.getElementById('totalCount');
const toastEl        = document.getElementById('toast');
const presetGrid     = document.getElementById('presetGrid');
const coordsRow      = document.getElementById('coordsRow');
const coordsHint     = document.getElementById('coordsHint');
const coordsText     = document.getElementById('coordsText');
const clearPinBtn    = document.getElementById('clearPinBtn');
const geocoderInput  = document.getElementById('geocoderInput');
const geocoderBtn    = document.getElementById('geocoderBtn');
const settingsBtn    = document.getElementById('settingsBtn');
const settingsModal  = document.getElementById('settingsModal');
const closeSettings  = document.getElementById('closeSettings');
const sbUrlInput     = document.getElementById('sbUrl');
const sbKeyInput     = document.getElementById('sbKey');
const dbStatus       = document.getElementById('dbStatus');
const saveSettingsBtn= document.getElementById('saveSettingsBtn');
const saveCard       = document.getElementById('saveCard');
const searchNameInput= document.getElementById('searchNameInput');
const saveDbBtn      = document.getElementById('saveDbBtn');
const saveStatus     = document.getElementById('saveStatus');
const savedList      = document.getElementById('savedList');

// ── Tabs & DB View DOM refs ───────────────────────────────────
const navTabs        = document.querySelectorAll('.nav-tab');
const tabContents    = document.querySelectorAll('.tab-content');
const dbSavedList    = document.getElementById('dbSavedList');
const dbFilterBar    = document.getElementById('dbFilterBar');
const dbViewTitle    = document.getElementById('dbViewTitle');
const dbTableWrap    = document.getElementById('dbTableWrap');
const dbTableHead    = document.getElementById('dbTableHead');
const dbTableBody    = document.getElementById('dbTableBody');
const dbEmptyState   = document.getElementById('dbEmptyState');
const dbExportBtn    = document.getElementById('dbExportBtn');
const dbDeleteBtn    = document.getElementById('dbDeleteBtn');

let currentDbSearch  = null;
let currentDbData    = [];

// ── Tabs Logic ───────────────────────────────────────────────
navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    navTabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'dbTab' && !dbSavedList.innerHTML.includes('btn-load')) {
       loadSavedSearches(); // refresh list when entering db tab
    }
  });
});

// ── Settings Modal ────────────────────────────────────────────
settingsBtn.addEventListener('click', () => {
  sbUrlInput.value = localStorage.getItem('sb_url') || DEFAULT_SB_URL;
  sbKeyInput.value = localStorage.getItem('sb_key') || DEFAULT_SB_KEY;
  dbStatus.className = 'db-status';
  settingsModal.style.display = 'flex';
});

closeSettings.addEventListener('click', () => settingsModal.style.display = 'none');
settingsModal.addEventListener('click', e => { if (e.target === settingsModal) settingsModal.style.display = 'none'; });

saveSettingsBtn.addEventListener('click', async () => {
  const url = sbUrlInput.value.trim();
  const key = sbKeyInput.value.trim();
  if (!url || !key) { showDbStatus('error', '⚠️ Both fields are required.'); return; }

  localStorage.setItem('sb_url', url);
  localStorage.setItem('sb_key', key);
  sbClient = window.supabase.createClient(url, key);

  // Test connection
  try {
    const { error } = await sbClient.from('places').select('id').limit(1);
    if (error) throw error;
    showDbStatus('ok', '✅ Connected successfully!');
    loadSavedSearches();
  } catch (e) {
    showDbStatus('error', '❌ Connection failed: ' + (e.message || 'Check URL and key'));
  }
});

function showDbStatus(type, msg) {
  dbStatus.className = 'db-status ' + type;
  dbStatus.textContent = msg;
}

// ── Geocoder ──────────────────────────────────────────────────
geocoderBtn.addEventListener('click', geocodeAndFly);
geocoderInput.addEventListener('keydown', e => { if (e.key === 'Enter') geocodeAndFly(); });

async function geocodeAndFly() {
  const query = geocoderInput.value.trim();
  if (!query) return;
  geocoderBtn.disabled = true;
  geocoderBtn.textContent = '⏳';
  try {
    const url  = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    const data = await res.json();
    if (!data.length) { showToast('❌ Location not found.'); return; }
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    leafletMap.flyTo([lat, lng], 12, { duration: 1.2 });
    setTimeout(() => setPin(lat, lng), 400);
    showToast('📍 ' + data[0].display_name.split(',').slice(0, 2).join(','));
  } catch { showToast('❌ Geocoding failed.'); }
  finally {
    geocoderBtn.disabled = false;
    geocoderBtn.textContent = '🔎';
  }
}

// ── Leaflet Map ───────────────────────────────────────────────
function initMap() {
  leafletMap = L.map('pickerMap', { center: [20.5937, 78.9629], zoom: 4 });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(leafletMap);
  leafletMap.on('click', e => setPin(e.latlng.lat, e.latlng.lng));
}

function setPin(lat, lng) {
  pickedLat = lat; pickedLng = lng;
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;background:linear-gradient(135deg,#6c63ff,#a78bfa);border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(108,99,255,0.7);"></div>`,
    iconSize: [26, 26], iconAnchor: [13, 26],
  });
  if (pinMarker)    leafletMap.removeLayer(pinMarker);
  if (radiusCircle) leafletMap.removeLayer(radiusCircle);
  pinMarker = L.marker([lat, lng], { icon }).addTo(leafletMap);
  drawCircle();
  coordsRow.style.display  = 'flex';
  coordsHint.style.display = 'none';
  coordsText.textContent   = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function drawCircle() {
  if (!pickedLat) return;
  if (radiusCircle) leafletMap.removeLayer(radiusCircle);
  radiusCircle = L.circle([pickedLat, pickedLng], {
    radius: radiusInput.value * 1000,
    color: '#6c63ff', fillColor: '#6c63ff',
    fillOpacity: 0.10, weight: 2, dashArray: '6 4',
  }).addTo(leafletMap);
  leafletMap.fitBounds(radiusCircle.getBounds(), { padding: [10, 10] });
}

clearPinBtn.addEventListener('click', () => {
  if (pinMarker)    leafletMap.removeLayer(pinMarker);
  if (radiusCircle) leafletMap.removeLayer(radiusCircle);
  pinMarker = radiusCircle = null;
  pickedLat = pickedLng = null;
  coordsRow.style.display  = 'none';
  coordsHint.style.display = 'flex';
  leafletMap.setView([20.5937, 78.9629], 4);
});

// ── Radius Slider ─────────────────────────────────────────────
radiusInput.addEventListener('input', () => {
  const v = radiusInput.value;
  radiusLabel.textContent = v + ' km';
  const pct = ((v - 1) / 499) * 100;
  radiusInput.style.background =
    `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, rgba(255,255,255,0.08) ${pct}%)`;
  drawCircle();
});
(function initSlider() {
  const v = radiusInput.value;
  const pct = ((v - 1) / 499) * 100;
  radiusInput.style.background =
    `linear-gradient(to right, var(--accent) 0%, var(--accent) ${pct}%, rgba(255,255,255,0.08) ${pct}%)`;
})();

// ── Presets ───────────────────────────────────────────────────
presetGrid.addEventListener('click', e => {
  const btn = e.target.closest('.preset-btn');
  if (!btn) return;
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  categoryInput.value = btn.dataset.cat;
});

// ── Column Checks ─────────────────────────────────────────────
function buildColumnChecks() {
  columnChecks.innerHTML = '';
  COLUMNS.forEach(col => {
    const label = document.createElement('label');
    label.className = 'col-check-item';
    label.innerHTML = `<input type="checkbox" id="col_${col.key}" ${col.default ? 'checked' : ''} />${col.label}`;
    columnChecks.appendChild(label);
  });
}
buildColumnChecks();
function getEnabledCols() { return COLUMNS.filter(c => document.getElementById('col_' + c.key)?.checked); }

// ── Search ────────────────────────────────────────────────────
searchBtn.addEventListener('click', doSearch);
categoryInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

async function doSearch() {
  const cat = categoryInput.value.trim();
  if (!cat)      { showToast('⚠️ Please enter a category.'); return; }
  if (!pickedLat){ showToast('📍 Click the map to pick a location first.'); return; }

  setSearching(true);
  setProgress(20);
  setStatus(`Scanning ${radiusInput.value} km for "${cat}"…`);

  try {
    const places = await queryOverpass(cat, pickedLat, pickedLng, radiusInput.value * 1000);
    setProgress(90);
    allResults = places;
    activeFilter = 'all';
    applyFilter();

    if (!allResults.length) {
      showNoResults();
      showToast('😔 No results found. Try a bigger radius or different category.');
    } else {
      showTable();
      // Pre-fill save name
      searchNameInput.value = `${cat.charAt(0).toUpperCase() + cat.slice(1)} — ${new Date().toLocaleDateString('en-IN')}`;
      showToast(`✅ Found ${allResults.length} places!`);
    }
    setProgress(100);
    setStatus(`Done — ${allResults.length} places found.`);
  } catch (err) {
    console.error(err);
    showToast('❌ Search failed. Check your internet connection.');
    setStatus('Search failed.');
  } finally {
    setSearching(false);
    setTimeout(() => loadingBar.classList.remove('active'), 600);
  }
}

// ── Overpass Query ────────────────────────────────────────────
async function queryOverpass(category, lat, lng, radius) {
  const tags = ['amenity','shop','tourism','leisure','office','healthcare'];
  const unionParts = tags.map(t =>
    `node["${t}"="${category}"](around:${radius},${lat},${lng});
     way["${t}"="${category}"](around:${radius},${lat},${lng});
     relation["${t}"="${category}"](around:${radius},${lat},${lng});`
  ).join('\n');

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method:  'POST',
    body:    'data=' + encodeURIComponent(`[out:json][timeout:60];(${unionParts});out center tags 200;`),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (!res.ok) throw new Error('Overpass error ' + res.status);
  const data = await res.json();

  return data.elements.filter(el => el.tags?.name).map(el => {
    const t   = el.tags;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const website = t.website || t['contact:website'] || t['url'] || '';
    const phone   = t.phone   || t['contact:phone']   || t['contact:mobile'] || '';
    const cat     = t.amenity || t.shop || t.tourism || t.leisure || t.office || t.healthcare || '';
    const addr    = [t['addr:housenumber'], t['addr:street'], t['addr:suburb'], t['addr:city'] || t['addr:town'], t['addr:postcode']].filter(Boolean).join(', ');
    return {
      id: el.id, name: t.name||'', category: cat, address: addr,
      phone, website, hasWebsite: website ? 'Yes' : 'No',
      hours: t.opening_hours||'',
      lat: lat ? lat.toFixed(6) : '', lng: lng ? lng.toFixed(6) : '',
      mapsUrl: lat ? `https://www.google.com/maps?q=${lat},${lng}` : '',
      _selected: true,
    };
  });
}

// ── Save to Supabase ──────────────────────────────────────────
saveDbBtn.addEventListener('click', async () => {
  const searchName = searchNameInput.value.trim();
  if (!searchName) { showToast('⚠️ Enter a name for this search.'); return; }
  if (!sbClient)   { showToast('⚠️ Configure Supabase in ⚙️ Settings first.'); return; }
  if (!allResults.length) { showToast('⚠️ No results to save.'); return; }

  saveDbBtn.disabled = true;
  saveStatus.textContent = '⏳ Saving…';

  const rows = allResults.map(r => ({
    osm_id:      r.id,
    search_name: searchName,
    category:    r.category,
    name:        r.name,
    address:     r.address,
    phone:       r.phone,
    website:     r.website,
    has_website: r.hasWebsite,
    hours:       r.hours,
    lat:         r.lat,
    lng:         r.lng,
    maps_url:    r.mapsUrl,
    saved_at:    new Date().toISOString(),
  }));

  try {
    const { error } = await sbClient
      .from('places')
      .upsert(rows, { onConflict: 'osm_id,search_name' });
    if (error) throw error;
    saveStatus.textContent = `✅ Saved ${rows.length} places!`;
    showToast(`☁️ "${searchName}" saved to Supabase!`);
    loadSavedSearches();
  } catch (err) {
    saveStatus.textContent = '❌ Save failed: ' + err.message;
    showToast('❌ Save failed — check Settings.');
  } finally {
    saveDbBtn.disabled = false;
  }
});

// ── Load Saved Searches List ──────────────────────────────────
async function loadSavedSearches() {
  if (!sbClient) return;
  try {
    const { data, error } = await sbClient
      .from('places')
      .select('search_name, category, saved_at')
      .order('saved_at', { ascending: false });

    if (error) throw error;
    if (!data?.length) {
      savedList.innerHTML = '<p class="coords-hint" style="text-align:center;padding:8px 0">No saved searches yet</p>';
      return;
    }

    // Group by search_name (keep latest saved_at + count)
    const map = new Map();
    data.forEach(r => {
      if (!map.has(r.search_name)) {
        map.set(r.search_name, { count: 1, saved_at: r.saved_at, category: r.category });
      } else {
        map.get(r.search_name).count++;
      }
    });

    savedList.innerHTML   = '';
    dbSavedList.innerHTML = '';
    map.forEach((info, name) => {
      const date = new Date(info.saved_at).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
      
      const div1 = document.createElement('div');
      div1.className = 'saved-item';
      div1.innerHTML = `
        <div class="saved-item-info">
          <div class="saved-item-name" title="${name}">${name}</div>
          <div class="saved-item-meta">${info.count} places · ${date}</div>
        </div>
        <button class="btn-load" data-name="${name}">⬆️ Load</button>
        <button class="btn-del"  data-name="${name}">🗑️</button>
      `;
      savedList.appendChild(div1);

      const div2 = document.createElement('div');
      div2.className = 'saved-item';
      div2.style.cursor = 'pointer';
      div2.innerHTML = `
        <div class="saved-item-info">
          <div class="saved-item-name" title="${name}">${name}</div>
          <div class="saved-item-meta">${info.count} places · ${date}</div>
        </div>
      `;
      div2.addEventListener('click', () => viewSearchInDb(name));
      dbSavedList.appendChild(div2);
    });

    savedList.addEventListener('click', handleSavedClick);
  } catch (err) {
    savedList.innerHTML = '<p class="coords-hint" style="text-align:center;color:var(--red)">⚠️ Could not load data</p>';
    if (dbSavedList) dbSavedList.innerHTML = '<p class="coords-hint" style="text-align:center;color:var(--red)">⚠️ Could not load data</p>';
  }
}

function handleSavedClick(e) {
  const loadBtn = e.target.closest('.btn-load');
  const delBtn  = e.target.closest('.btn-del');
  if (loadBtn) loadSearch(loadBtn.dataset.name);
  if (delBtn)  deleteSearch(delBtn.dataset.name);
}

// ── Load a Saved Search ───────────────────────────────────────
async function loadSearch(searchName) {
  if (!sbClient) return;
  showToast('⏳ Loading "' + searchName + '"…');
  try {
    const { data, error } = await sbClient
      .from('places')
      .select('*')
      .eq('search_name', searchName)
      .order('name');
    if (error) throw error;

    allResults = data.map(r => ({
      id:         r.osm_id,
      name:       r.name        || '',
      category:   r.category    || '',
      address:    r.address     || '',
      phone:      r.phone       || '',
      website:    r.website     || '',
      hasWebsite: r.has_website || 'No',
      hours:      r.hours       || '',
      lat:        r.lat         || '',
      lng:        r.lng         || '',
      mapsUrl:    r.maps_url    || '',
      _selected:  true,
    }));

    activeFilter = 'all';
    applyFilter();
    showTable();
    searchNameInput.value = searchName;
    showToast(`📂 Loaded "${searchName}" (${allResults.length} places)`);
  } catch (err) {
    showToast('❌ Load failed: ' + err.message);
  }
}

// ── Delete a Saved Search ─────────────────────────────────────
async function deleteSearch(searchName) {
  if (!sbClient) return;
  if (!confirm(`Delete all data for "${searchName}"?`)) return;
  try {
    const { error } = await sbClient
      .from('places')
      .delete()
      .eq('search_name', searchName);
    if (error) throw error;
    showToast(`🗑️ "${searchName}" deleted.`);
    loadSavedSearches();
  } catch (err) {
    showToast('❌ Delete failed: ' + err.message);
  }
}

// ── Filters ───────────────────────────────────────────────────
filterAll.addEventListener('click', () => setFilter('all'));
filterHas.addEventListener('click', () => setFilter('has'));
filterNo.addEventListener('click',  () => setFilter('no'));

function setFilter(f) {
  activeFilter = f;
  [filterAll, filterHas, filterNo].forEach(b => b.classList.remove('active'));
  if (f === 'all') filterAll.classList.add('active');
  if (f === 'has') filterHas.classList.add('active');
  if (f === 'no')  filterNo.classList.add('active');
  applyFilter();
}

function applyFilter() {
  filtered = activeFilter === 'has' ? allResults.filter(r => r.hasWebsite === 'Yes')
           : activeFilter === 'no'  ? allResults.filter(r => r.hasWebsite === 'No')
           : [...allResults];
  if (sortCol) applySort();
  renderTable();
}

// ── Sort ──────────────────────────────────────────────────────
function applySort() {
  filtered.sort((a,b) => {
    const va = (a[sortCol]||'').toString().toLowerCase();
    const vb = (b[sortCol]||'').toString().toLowerCase();
    return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });
}
function handleSort(col) {
  sortDir = sortCol === col ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
  sortCol = col;
  applySort();
  renderTable();
}

// ── Render Table ──────────────────────────────────────────────
function renderTable() {
  const cols = getEnabledCols();
  resultCount.textContent = `${filtered.length} result${filtered.length !== 1 ? 's' : ''}`;
  updateSelectionCount();

  tableHead.innerHTML = '';
  const tr = document.createElement('tr');
  const thCb = document.createElement('th');
  const masterCb = document.createElement('input');
  masterCb.type = 'checkbox';
  masterCb.id   = 'masterCb';
  masterCb.checked = filtered.length > 0 && filtered.every(r => r._selected);
  masterCb.addEventListener('change', () => { filtered.forEach(r => r._selected = masterCb.checked); renderTable(); });
  thCb.appendChild(masterCb);
  tr.appendChild(thCb);

  cols.forEach(col => {
    const th   = document.createElement('th');
    th.className = 'sortable';
    const icon = document.createElement('span');
    icon.className = 'sort-icon';
    const isSorted = sortCol === col.key;
    icon.textContent = isSorted ? (sortDir === 'asc' ? '↑' : '↓') : '⇅';
    th.textContent = col.label;
    th.appendChild(icon);
    if (isSorted) th.classList.add('sort-' + sortDir);
    th.addEventListener('click', () => handleSort(col.key));
    tr.appendChild(th);
  });
  tableHead.appendChild(tr);

  tableBody.innerHTML = '';
  if (!filtered.length) {
    const tr2 = document.createElement('tr');
    const td  = document.createElement('td');
    td.colSpan = cols.length + 1;
    td.style.cssText = 'text-align:center;padding:40px;color:var(--muted)';
    td.textContent = 'No results match this filter.';
    tr2.appendChild(td); tableBody.appendChild(tr2);
    return;
  }

  filtered.forEach(row => {
    const tr2 = document.createElement('tr');
    if (row._selected) tr2.classList.add('selected');
    const tdCb = document.createElement('td');
    const cb   = document.createElement('input');
    cb.type    = 'checkbox';
    cb.checked = row._selected;
    cb.addEventListener('change', () => {
      row._selected = cb.checked;
      tr2.classList.toggle('selected', cb.checked);
      updateSelectionCount();
      document.getElementById('masterCb').checked = filtered.every(r => r._selected);
    });
    tdCb.appendChild(cb); tr2.appendChild(tdCb);

    cols.forEach(col => {
      const td  = document.createElement('td');
      const val = row[col.key] || '';
      if (col.key === 'hasWebsite') {
        const b = document.createElement('span');
        b.className = val === 'Yes' ? 'badge-yes' : 'badge-no';
        b.textContent = val === 'Yes' ? '✅ Yes' : '❌ No';
        td.appendChild(b);
      } else if ((col.key === 'website' || col.key === 'mapsUrl') && val) {
        const a = document.createElement('a');
        a.href = val.startsWith('http') ? val : 'https://' + val;
        a.target = '_blank'; a.rel = 'noopener';
        a.textContent = col.key === 'mapsUrl' ? '📍 Open' : val.replace(/^https?:\/\//,'').split('/')[0];
        td.appendChild(a);
      } else if (col.key === 'phone' && val) {
        const a = document.createElement('a');
        a.href = 'tel:' + val; a.textContent = val;
        td.appendChild(a);
      } else {
        td.textContent = val; td.title = val;
      }
      tr2.appendChild(td);
    });
    tableBody.appendChild(tr2);
  });
  updateSelectionCount();
}

function updateSelectionCount() {
  const sel = filtered.filter(r => r._selected).length;
  selectedCount.textContent = sel;
  totalCount.textContent    = filtered.length;
}

selectAllBtn.addEventListener('click', () => { filtered.forEach(r => r._selected = true);  renderTable(); });
clearSelBtn.addEventListener('click',  () => { filtered.forEach(r => r._selected = false); renderTable(); });
columnChecks.addEventListener('change', () => renderTable());

// ── Show/Hide ─────────────────────────────────────────────────
function showTable() {
  emptyState.style.display = 'none';
  noResults.style.display  = 'none';
  filterBar.style.display  = 'flex';
  tableWrap.style.display  = 'block';
  columnCard.style.display = 'flex';
  exportCard.style.display = 'flex';
  saveCard.style.display   = 'flex';
}
function showNoResults() {
  emptyState.style.display = 'none';
  tableWrap.style.display  = 'none';
  filterBar.style.display  = 'none';
  noResults.style.display  = 'flex';
  columnCard.style.display = 'none';
  exportCard.style.display = 'none';
  saveCard.style.display   = 'none';
}

// ── Export to Excel ───────────────────────────────────────────
exportBtn.addEventListener('click', () => {
  const cols = getEnabledCols();
  const rows = filtered.filter(r => r._selected);
  if (!rows.length) { showToast('⚠️ No rows selected.'); return; }

  const header = cols.map(c => c.label);
  const data   = rows.map(row => cols.map(col => row[col.key] || ''));
  const ws     = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws['!cols']  = cols.map((col, ci) => ({
    wch: Math.min(Math.max(col.label.length, ...data.map(r => String(r[ci]||'').length)) + 4, 50)
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Places');

  const name = searchNameInput.value.trim().replace(/[^a-z0-9]/gi, '_') || 'VertexSurge';
  const date = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `${name}_${date}.xlsx`);
  showToast(`✅ Exported ${rows.length} rows!`);
});

// ── Database View Logic ───────────────────────────────────────
async function viewSearchInDb(searchName) {
  if (!sbClient) return;
  dbEmptyState.style.display = 'none';
  showToast('⏳ Fetching "' + searchName + '"…');
  try {
    const { data, error } = await sbClient
      .from('places')
      .select('*')
      .eq('search_name', searchName)
      .order('name');
    if (error) throw error;
    
    currentDbSearch = searchName;
    currentDbData   = data;
    
    dbViewTitle.textContent = `${searchName} (${data.length} records)`;
    dbFilterBar.style.display = 'flex';
    dbTableWrap.style.display = 'block';
    
    renderDbTable();
    showToast(`✅ Loaded database view`);
  } catch (err) {
    showToast('❌ Fetch failed: ' + err.message);
  }
}

function renderDbTable() {
  const cols = COLUMNS.filter(c => c.default); // use default cols for db view
  
  dbTableHead.innerHTML = '';
  const trH = document.createElement('tr');
  cols.forEach(c => {
    const th = document.createElement('th');
    th.textContent = c.label;
    trH.appendChild(th);
  });
  dbTableHead.appendChild(trH);
  
  dbTableBody.innerHTML = '';
  currentDbData.forEach(row => {
    const tr = document.createElement('tr');
    
    // map DB snake_case columns to app columns
    const mappedRow = {
      name: row.name, category: row.category, address: row.address,
      phone: row.phone, website: row.website, hasWebsite: row.has_website,
      mapsUrl: row.maps_url
    };

    cols.forEach(col => {
      const td  = document.createElement('td');
      const val = mappedRow[col.key] || '';
      if (col.key === 'hasWebsite') {
        const b = document.createElement('span');
        b.className = val === 'Yes' ? 'badge-yes' : 'badge-no';
        b.textContent = val === 'Yes' ? '✅ Yes' : '❌ No';
        td.appendChild(b);
      } else if (col.key === 'website' && val) {
        const a = document.createElement('a');
        a.href = val.startsWith('http') ? val : 'https://' + val;
        a.target = '_blank'; a.textContent = val.replace(/^https?:\/\//,'').split('/')[0];
        td.appendChild(a);
      } else if (col.key === 'mapsUrl' && val) {
        const a = document.createElement('a');
        a.href = val; a.target = '_blank'; a.textContent = '📍 Open';
        td.appendChild(a);
      } else {
        td.textContent = val;
      }
      tr.appendChild(td);
    });
    dbTableBody.appendChild(tr);
  });
}

dbExportBtn.addEventListener('click', () => {
  if (!currentDbData.length) return;
  const cols = COLUMNS.filter(c => c.default);
  const header = cols.map(c => c.label);
  const data = currentDbData.map(r => [
    r.name||'', r.category||'', r.address||'', r.phone||'', 
    r.website||'', r.has_website||'', r.maps_url||''
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Places');
  XLSX.writeFile(wb, `${currentDbSearch.replace(/[^a-z0-9]/gi, '_')}_DB_Export.xlsx`);
  showToast('✅ Exported ' + data.length + ' rows from DB');
});

dbDeleteBtn.addEventListener('click', async () => {
  if (!currentDbSearch) return;
  if (!confirm(`Permanently delete all records for "${currentDbSearch}" from the database?`)) return;
  try {
    const { error } = await sbClient.from('places').delete().eq('search_name', currentDbSearch);
    if (error) throw error;
    showToast(`🗑️ "${currentDbSearch}" deleted permanently.`);
    dbTableWrap.style.display = 'none';
    dbFilterBar.style.display = 'none';
    dbEmptyState.style.display = 'flex';
    currentDbSearch = null;
    currentDbData = [];
    loadSavedSearches();
  } catch (err) {
    showToast('❌ Delete failed.');
  }
});

// ── Utilities ─────────────────────────────────────────────────
function setSearching(busy) {
  searchBtn.disabled        = busy;
  searchBtnText.textContent = busy ? 'Searching…' : 'Search Places';
  searchBtnIcon.textContent = busy ? '⏳' : '🔍';
  if (busy) loadingBar.classList.add('active');
}
function setStatus(msg) { searchStatus.textContent = msg; }
function setProgress(p) { loadingFill.style.width = p + '%'; }

let toastTimer;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3500);
}

// ── Boot ──────────────────────────────────────────────────────
initMap();
initSupabase();
