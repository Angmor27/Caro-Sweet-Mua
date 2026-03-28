// ═══════════════════════════════════════════════════════════
//  ADMIN PANEL — Caro Sweet Mua
// ═══════════════════════════════════════════════════════════

// ── Firebase init ───────────────────────────────────────────
let db = null;
try {
  const isConfigured = FIREBASE_CONFIG.apiKey !== "PEGA_AQUI";
  if (isConfigured) {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
  }
} catch (e) { console.warn('Firebase no iniciado:', e); }

const CITAS_COL    = 'citas';
const BLOQUEOS_COL = 'bloqueos';
const CONFIG_COL   = 'configuracion';
const CONFIG_DOC   = 'ajustes';

// ── State ───────────────────────────────────────────────────
let currentView = 'hoy';
let currentDay  = todayStr();
let allCitas    = [];
let citaFilter  = 'todas';
let searchQuery = '';

// ── DOM refs ────────────────────────────────────────────────
const loginScreen = () => document.getElementById('loginScreen');
const appEl       = () => document.getElementById('app');

// ═══════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════
document.getElementById('loginForm').addEventListener('submit', e => {
  e.preventDefault();
  const pwd = document.getElementById('loginPwd').value;
  const err = document.getElementById('loginError');
  if (pwd === ADMIN_PASSWORD) {
    sessionStorage.setItem('csm_admin', '1');
    err.classList.add('hidden');
    startApp();
  } else {
    err.classList.remove('hidden');
    document.getElementById('loginPwd').value = '';
    setTimeout(() => err.classList.add('hidden'), 3500);
  }
});

function togglePwd() {
  const i = document.getElementById('loginPwd');
  i.type = i.type === 'password' ? 'text' : 'password';
}

function logout() {
  sessionStorage.removeItem('csm_admin');
  appEl().classList.add('hidden');
  loginScreen().classList.remove('hidden');
}

function startApp() {
  loginScreen().classList.add('hidden');
  appEl().classList.remove('hidden');
  initApp();
}

// On load
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('topbarDate').textContent = formatDateLong(new Date());
  if (sessionStorage.getItem('csm_admin') === '1') startApp();
});

// ═══════════════════════════════════════════════════════════
//  NAV
// ═══════════════════════════════════════════════════════════
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchView(btn.dataset.view);
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('sidebar').classList.remove('open');
  });
});

function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const el = document.getElementById('view-' + view);
  if (el) el.classList.remove('hidden');
  currentView = view;
  const titles = { hoy:'Hoy', citas:'Todas las citas', bloquear:'Bloquear horarios', config:'Configuración' };
  document.getElementById('topbarTitle').textContent = titles[view] || view;
  if (view === 'hoy')     loadHoyView();
  if (view === 'citas')   loadCitasView();
  if (view === 'bloquear') loadBloquearView();
  if (view === 'config')  loadConfigView();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
function initApp() {
  // Day picker
  const dp = document.getElementById('dayPicker');
  dp.value = todayStr();
  dp.addEventListener('change', () => {
    currentDay = dp.value;
    loadHoyView();
  });

  document.getElementById('prevDay').addEventListener('click', () => {
    currentDay = offsetDay(currentDay, -1);
    dp.value = currentDay;
    loadHoyView();
  });
  document.getElementById('nextDay').addEventListener('click', () => {
    currentDay = offsetDay(currentDay, 1);
    dp.value = currentDay;
    loadHoyView();
  });

  // Citas search + filter
  document.getElementById('searchCitas').addEventListener('input', e => {
    searchQuery = e.target.value.toLowerCase();
    renderCitasList();
  });
  document.querySelectorAll('.ftab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      citaFilter = btn.dataset.status;
      renderCitasList();
    });
  });

  // Teléfono form
  document.getElementById('telefonoForm').addEventListener('submit', saveTelefono);
  loadTelefono();

  // Bloquear form
  document.getElementById('bloquearForm').addEventListener('submit', submitBloqueo);
  const horaSelect = document.getElementById('bloquearHora');
  TIME_SLOTS.forEach(s => {
    const o = document.createElement('option');
    o.value = s; o.textContent = s; horaSelect.appendChild(o);
  });
  document.getElementById('bloquearFecha').min = todayStr();

  loadHoyView();
}

// ═══════════════════════════════════════════════════════════
//  HOY VIEW
// ═══════════════════════════════════════════════════════════
async function loadHoyView() {
  const isToday = currentDay === todayStr();
  document.getElementById('dayTitle').textContent =
    isToday ? '📅 Hoy — ' + formatDateMid(currentDay) : formatDateMid(currentDay);
  document.getElementById('dayPicker').value = currentDay;

  if (!db) {
    document.getElementById('timeline').innerHTML =
      '<div class="loading-msg">⚠️ Firebase no configurado. <a href="firebase-config.js">Configura firebase-config.js</a></div>';
    return;
  }

  document.getElementById('timeline').innerHTML = '<div class="loading-msg">Cargando...</div>';

  const [citas, bloqueos] = await Promise.all([
    getCitasForDate(currentDay),
    getBloqueos(currentDay)
  ]);

  renderDaySummary(citas);
  renderTimeline(citas, bloqueos);
}

function renderDaySummary(citas) {
  const total = citas.length;
  const conf  = citas.filter(c => c.estado === 'confirmada').length;
  const pend  = citas.filter(c => c.estado === 'pendiente').length;
  document.getElementById('daySummary').innerHTML = `
    <div class="summary-chip"><strong>${total}</strong><span>Total</span></div>
    <div class="summary-chip"><strong>${conf}</strong><span>Confirmadas</span></div>
    <div class="summary-chip"><strong>${pend}</strong><span>Pendientes</span></div>
  `;
}

function renderTimeline(citas, bloqueos) {
  const container = document.getElementById('timeline');
  container.innerHTML = '';

  // Index citas by time
  const byTime = {};
  citas.forEach(c => { if (c.hora) byTime[c.hora] = c; });

  // Build blocked set
  const fullDay = bloqueos.some(b => !b.hora);
  const blockedTimes = new Set(bloqueos.filter(b => b.hora).map(b => b.hora));

  TIME_SLOTS.forEach(slot => {
    const row = document.createElement('div');
    row.className = 'tslot';

    const timeDiv = document.createElement('div');
    timeDiv.className = 'tslot__time';
    timeDiv.textContent = slot;

    const body = document.createElement('div');
    body.className = 'tslot__body';

    const cita = byTime[slot];
    const isBlocked = fullDay || blockedTimes.has(slot);
    const bloqueoDoc = bloqueos.find(b => b.hora === slot || (!b.hora && fullDay));

    if (cita) {
      row.classList.add('tslot--cita', `tslot--${cita.estado}`);
      body.innerHTML = `
        <div class="tslot__info">
          <div class="tslot__name">${escHtml(cita.nombre)}</div>
          <div class="tslot__service">💄 ${escHtml(cita.servicio)}</div>
          <div class="tslot__phone">📞 ${escHtml(cita.telefono)}</div>
        </div>
        <span class="badge-estado badge-${cita.estado}">${estadoLabel(cita.estado)}</span>
        <div class="tslot__actions">
          ${cita.estado !== 'confirmada'
            ? `<button class="action-btn action-btn--confirm" onclick="updateEstado('${cita.id}','confirmada')">✓ Confirmar</button>` : ''}
          ${cita.estado !== 'cancelada'
            ? `<button class="action-btn action-btn--cancel" onclick="updateEstado('${cita.id}','cancelada')">✗ Cancelar</button>` : ''}
          <button class="action-btn action-btn--view" onclick="openModal('${cita.id}')">Ver más</button>
        </div>
      `;
    } else if (isBlocked) {
      row.classList.add('tslot--bloqueado');
      body.innerHTML = `
        <span style="font-size:.82rem;font-weight:600;color:var(--rose-dark)">🔒 BLOQUEADO</span>
        ${bloqueoDoc?.motivo ? `<span style="font-size:.76rem;color:var(--muted)">${escHtml(bloqueoDoc.motivo)}</span>` : ''}
        <span style="flex:1"></span>
        ${bloqueoDoc ? `<button class="action-btn action-btn--unlock" onclick="delBloqueo('${bloqueoDoc.id}')">🔓 Desbloquear</button>` : ''}
      `;
    } else {
      row.classList.add('tslot--libre');
      body.innerHTML = `
        <span style="color:var(--muted);font-size:.82rem">Libre</span>
        <span style="flex:1"></span>
        <button class="action-btn action-btn--block" onclick="quickBlock('${currentDay}','${slot}')">+ Bloquear</button>
      `;
    }

    row.appendChild(timeDiv);
    row.appendChild(body);
    container.appendChild(row);
  });
}

async function quickBlock(fecha, hora) {
  if (!db) return;
  await db.collection(BLOQUEOS_COL).add({ fecha, hora, motivo: 'Bloqueado manualmente' });
  toast('🔒 Horario bloqueado');
  loadHoyView();
}

// ═══════════════════════════════════════════════════════════
//  CITAS VIEW
// ═══════════════════════════════════════════════════════════
async function loadCitasView() {
  const list = document.getElementById('citasList');
  list.innerHTML = '<div class="loading-msg">Cargando...</div>';

  if (!db) {
    list.innerHTML = '<div class="loading-msg">⚠️ Firebase no configurado.</div>';
    return;
  }

  const snap = await db.collection(CITAS_COL).get();
  allCitas = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Sort by fecha asc, hora asc
  allCitas.sort((a, b) => {
    const fd = (a.fecha || '').localeCompare(b.fecha || '');
    return fd !== 0 ? fd : (a.hora || '').localeCompare(b.hora || '');
  });

  renderCitasList();
}

function renderCitasList() {
  const container = document.getElementById('citasList');
  let list = [...allCitas];

  if (citaFilter !== 'todas') list = list.filter(c => c.estado === citaFilter);
  if (searchQuery) {
    list = list.filter(c =>
      (c.nombre || '').toLowerCase().includes(searchQuery) ||
      (c.telefono || '').includes(searchQuery) ||
      (c.servicio || '').toLowerCase().includes(searchQuery)
    );
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">📭</div>
        <p>No hay citas que mostrar</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(c => `
    <div class="cita-card" data-status="${c.estado || 'pendiente'}">
      <div>
        <div class="cita-card__name">${escHtml(c.nombre)}</div>
        <div class="cita-card__details">
          <span class="cita-card__detail">💄 ${escHtml(c.servicio)}</span>
          <span class="cita-card__detail">📅 ${formatDateMid(c.fecha)}</span>
          <span class="cita-card__detail">🕐 ${c.hora || '–'}</span>
          <span class="cita-card__detail">📞 ${escHtml(c.telefono)}</span>
        </div>
      </div>
      <div class="cita-card__right">
        <span class="badge-estado badge-${c.estado || 'pendiente'}">${estadoLabel(c.estado)}</span>
        <div class="cita-card__actions">
          <button class="action-btn action-btn--view" onclick="openModal('${c.id}')">Ver</button>
          ${c.estado !== 'confirmada'
            ? `<button class="action-btn action-btn--confirm" onclick="updateEstado('${c.id}','confirmada')">✓</button>` : ''}
          ${c.estado !== 'cancelada'
            ? `<button class="action-btn action-btn--cancel" onclick="updateEstado('${c.id}','cancelada')">✗</button>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════════════
//  BLOQUEAR VIEW
// ═══════════════════════════════════════════════════════════
async function loadBloquearView() {
  const container = document.getElementById('bloqueosList');
  if (!db) {
    container.innerHTML = '<p class="empty-txt">⚠️ Firebase no configurado.</p>';
    return;
  }

  const snap = await db.collection(BLOQUEOS_COL).where('fecha', '>=', todayStr()).get();
  const items = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => {
      const fd = a.fecha.localeCompare(b.fecha);
      return fd !== 0 ? fd : (a.hora || '').localeCompare(b.hora || '');
    });

  if (items.length === 0) {
    container.innerHTML = '<p class="empty-txt">No hay bloqueos activos</p>';
    return;
  }

  container.innerHTML = items.map(b => `
    <div class="bloqueo-item">
      <div>
        <div class="bloqueo-item__info">
          📅 ${formatDateMid(b.fecha)}
          ${b.hora ? ' · 🕐 ' + b.hora : ' · <strong>Todo el día</strong>'}
        </div>
        ${b.motivo ? `<div class="bloqueo-item__motivo">📌 ${escHtml(b.motivo)}</div>` : ''}
      </div>
      <button class="bloqueo-item__del" onclick="delBloqueo('${b.id}')" title="Eliminar bloqueo">🗑</button>
    </div>
  `).join('');
}

async function submitBloqueo(e) {
  e.preventDefault();
  if (!db) { toast('⚠️ Firebase no configurado'); return; }
  const fecha  = document.getElementById('bloquearFecha').value;
  const hora   = document.getElementById('bloquearHora').value || null;
  const motivo = document.getElementById('bloquearMotivo').value || null;
  if (!fecha) { toast('⚠️ Selecciona una fecha'); return; }

  await db.collection(BLOQUEOS_COL).add({ fecha, hora, motivo });
  toast('✅ Horario bloqueado');
  document.getElementById('bloquearForm').reset();
  document.getElementById('bloquearFecha').min = todayStr();
  loadBloquearView();
  if (fecha === currentDay) loadHoyView();
}

async function delBloqueo(id) {
  if (!db) return;
  await db.collection(BLOQUEOS_COL).doc(id).delete();
  toast('🔓 Bloqueo eliminado');
  loadBloquearView();
  loadHoyView();
}

// ═══════════════════════════════════════════════════════════
//  TELÉFONO WHATSAPP
// ═══════════════════════════════════════════════════════════
async function loadTelefono() {
  if (!db) return;
  try {
    const doc = await db.collection(CONFIG_COL).doc(CONFIG_DOC).get();
    if (doc.exists && doc.data().telefono) {
      document.getElementById('telefonoInput').value = doc.data().telefono;
    } else {
      document.getElementById('telefonoInput').value = '528137459614';
    }
  } catch (e) { console.warn('No se pudo cargar teléfono:', e); }
}

async function saveTelefono(e) {
  e.preventDefault();
  if (!db) { toast('⚠️ Firebase no configurado'); return; }
  let num = document.getElementById('telefonoInput').value.trim().replace(/\D/g,'');
  if (num.length < 10) { toast('⚠️ Número muy corto'); return; }
  // Si solo son 10 dígitos (sin código de México), se agrega el 52 automáticamente
  if (num.length === 10) num = '52' + num;
  // Actualizar también el campo para que se vea el número completo
  document.getElementById('telefonoInput').value = num;
  await db.collection(CONFIG_COL).doc(CONFIG_DOC).set({ telefono: num }, { merge: true });
  const ok = document.getElementById('telefonoGuardado');
  ok.style.display = 'block';
  setTimeout(() => ok.style.display = 'none', 3000);
  toast('✅ Número de WhatsApp actualizado');
}

// ═══════════════════════════════════════════════════════════
//  CONFIG VIEW
// ═══════════════════════════════════════════════════════════
async function loadConfigView() {
  // Slots preview
  document.getElementById('currentSlots').innerHTML =
    TIME_SLOTS.map(s => `<span class="slot-chip">${s}</span>`).join('');

  // Firebase status
  const fbStatus = document.getElementById('firebaseStatus');
  if (db) {
    fbStatus.innerHTML = '<p class="firebase-ok">✅ Firebase conectado correctamente</p>';
    // Stats
    try {
      const snap = await db.collection(CITAS_COL).get();
      const todas = snap.docs.map(d => d.data());
      const conf  = todas.filter(c => c.estado === 'confirmada').length;
      const pend  = todas.filter(c => c.estado === 'pendiente').length;
      const canc  = todas.filter(c => c.estado === 'cancelada').length;
      document.getElementById('statsGrid').innerHTML = `
        <div class="stats-grid">
          <div class="stat-item"><strong>${todas.length}</strong><span>Total</span></div>
          <div class="stat-item"><strong>${conf}</strong><span>Confirmadas</span></div>
          <div class="stat-item"><strong>${pend}</strong><span>Pendientes</span></div>
          <div class="stat-item"><strong>${canc}</strong><span>Canceladas</span></div>
        </div>`;
    } catch (e) { document.getElementById('statsGrid').innerHTML = '<p class="empty-txt">Error al cargar stats</p>'; }
  } else {
    fbStatus.innerHTML = `
      <p class="firebase-warn">
        ⚠️ Firebase no está configurado.<br>
        Edita <strong>firebase-config.js</strong> con tus credenciales para activar la sincronización en tiempo real.
      </p>`;
    document.getElementById('statsGrid').innerHTML = '<p class="empty-txt">Firebase requerido</p>';
  }
}

// ═══════════════════════════════════════════════════════════
//  MODAL DETALLE
// ═══════════════════════════════════════════════════════════
async function openModal(id) {
  if (!db) return;
  const doc = await db.collection(CITAS_COL).doc(id).get();
  if (!doc.exists) return;
  const c = { id: doc.id, ...doc.data() };

  const waMsg = encodeURIComponent(
    `Hola ${c.nombre}! 🌸 Te confirmo tu cita el ${formatDateMid(c.fecha)} a las ${c.hora} en Caro Sweet Mua.`
  );
  const waPhone = '52' + c.telefono.replace(/\D/g,'');

  document.getElementById('citaModalContent').innerHTML = `
    <div class="cita-detail__title">${escHtml(c.nombre)}</div>
    <span class="badge-estado badge-${c.estado || 'pendiente'}" style="margin-bottom:16px;display:inline-block">
      ${estadoLabel(c.estado)}
    </span>
    <div class="cita-detail__row"><strong>💄 Servicio</strong><span>${escHtml(c.servicio)}</span></div>
    <div class="cita-detail__row"><strong>📅 Fecha</strong><span>${formatDateMid(c.fecha)}</span></div>
    <div class="cita-detail__row"><strong>🕐 Hora</strong><span>${c.hora || '–'}</span></div>
    <div class="cita-detail__row"><strong>📞 Teléfono</strong><a href="tel:${c.telefono}">${escHtml(c.telefono)}</a></div>
    ${c.notas ? `<div class="cita-detail__row"><strong>📝 Notas</strong><span>${escHtml(c.notas)}</span></div>` : ''}
    <div class="cita-detail__actions">
      ${c.estado !== 'confirmada'
        ? `<button class="btn-primary" onclick="updateEstado('${c.id}','confirmada');closeCitaModal()">✅ Confirmar</button>` : ''}
      ${c.estado !== 'cancelada'
        ? `<button class="btn-secondary btn-danger" onclick="updateEstado('${c.id}','cancelada');closeCitaModal()">✗ Cancelar</button>` : ''}
      <a href="https://wa.me/${waPhone}?text=${waMsg}"
         target="_blank" class="btn-secondary" style="text-align:center">📲 WhatsApp</a>
    </div>
  `;

  document.getElementById('citaModalBg').classList.remove('hidden');
  document.getElementById('citaModal').classList.remove('hidden');
}

function closeCitaModal() {
  document.getElementById('citaModalBg').classList.add('hidden');
  document.getElementById('citaModal').classList.add('hidden');
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCitaModal(); });

// ═══════════════════════════════════════════════════════════
//  FIRESTORE HELPERS
// ═══════════════════════════════════════════════════════════
async function getCitasForDate(fecha) {
  const snap = await db.collection(CITAS_COL).where('fecha', '==', fecha).get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.estado !== 'cancelada');
}

async function getBloqueos(fecha) {
  const snap = await db.collection(BLOQUEOS_COL).where('fecha', '==', fecha).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function updateEstado(id, estado) {
  if (!db) return;
  await db.collection(CITAS_COL).doc(id).update({ estado });
  const labels = { confirmada: '✅ Cita confirmada', cancelada: '❌ Cita cancelada' };
  toast(labels[estado] || 'Actualizado');

  // Update local array
  const idx = allCitas.findIndex(c => c.id === id);
  if (idx !== -1) { allCitas[idx].estado = estado; renderCitasList(); }
  if (currentView === 'hoy') loadHoyView();
}

// ═══════════════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════════════
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function offsetDay(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatDateMid(dateStr) {
  if (!dateStr) return '–';
  const [y, m, d] = dateStr.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const days   = ['dom','lun','mar','mié','jue','vie','sáb'];
  const date   = new Date(dateStr + 'T12:00:00');
  return `${days[date.getDay()]} ${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
}

function formatDateLong(date) {
  const days   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${days[date.getDay()]} ${date.getDate()} de ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function estadoLabel(estado) {
  const map = { pendiente:'⏳ Pendiente', confirmada:'✅ Confirmada', cancelada:'❌ Cancelada' };
  return map[estado] || (estado || 'pendiente');
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg) {
  const t = document.getElementById('adminToast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}
