// ═══════════════════════════════════════════════════════════
//  CARO SWEET MUA — Script principal
// ═══════════════════════════════════════════════════════════

// ── Firebase init (graceful: si no está configurado, funciona igual) ──
let db = null;
try {
  const ok = typeof FIREBASE_CONFIG !== 'undefined' && FIREBASE_CONFIG.apiKey !== 'PEGA_AQUI';
  if (ok) {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.firestore();
  }
} catch (e) { console.warn('Firebase no disponible:', e); }

// Número de WhatsApp (se actualiza desde Firebase al cargar)
let WHATSAPP_PHONE = '528137459614';
let phoneLoadPromise = null;  // guardamos la promesa para esperarla al enviar

async function loadPhoneFromFirebase() {
  if (!db) return;
  try {
    const doc = await db.collection('configuracion').doc('ajustes').get();
    if (doc.exists && doc.data().telefono) {
      let tel = doc.data().telefono.replace(/\D/g, '');
      // Si solo son 10 dígitos (sin prefijo de México), agregarlo automáticamente
      if (tel.length === 10) tel = '52' + tel;
      WHATSAPP_PHONE = tel;
    }
  } catch (e) { console.warn('No se pudo cargar teléfono:', e); }
}
phoneLoadPromise = loadPhoneFromFirebase();

// ── NAV scroll ─────────────────────────────────────────────
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);
});

// ── HAMBURGER ──────────────────────────────────────────────
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
hamburger.addEventListener('click', () => mobileMenu.classList.toggle('open'));
function closeMobile() { mobileMenu.classList.remove('open'); }

// ── SERVICE TABS ───────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    document.querySelectorAll('.services__grid').forEach(g => g.classList.add('hidden'));
    document.getElementById('tab-' + target).classList.remove('hidden');
  });
});

// ─────────────────────────────────────────────────────────
//  MODAL DE RESERVA
// ─────────────────────────────────────────────────────────
const backdrop       = document.getElementById('modalBackdrop');
const modal          = document.getElementById('modal');
const select         = document.getElementById('servicioSelect');
const modalFecha     = document.getElementById('modalFecha');
const slotGroup      = document.getElementById('slotPickerGroup');
const slotPicker     = document.getElementById('slotPicker');
const selectedHora   = document.getElementById('selectedHora');
const slotHint       = document.getElementById('slotHint');

function openModal() {
  backdrop.classList.add('open');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function openModalWith(servicio) {
  openModal();
  select.querySelectorAll('option').forEach(opt => {
    if (opt.text.startsWith(servicio)) opt.selected = true;
  });
}
function closeModal() {
  backdrop.classList.remove('open');
  modal.classList.remove('open');
  document.body.style.overflow = '';
  // Reset slot picker
  if (slotGroup)   slotGroup.classList.add('hidden');
  if (slotPicker)  slotPicker.innerHTML = '';
  if (selectedHora) selectedHora.value = '';
  if (slotHint)    slotHint.textContent = '';
}

// Min date = hoy
const dateInput = document.getElementById('modalFecha');
if (dateInput) dateInput.setAttribute('min', new Date().toISOString().split('T')[0]);

// Cuando cambia la fecha → cargar slots disponibles
if (modalFecha) {
  modalFecha.addEventListener('change', () => {
    if (modalFecha.value) loadAvailableSlots(modalFecha.value);
    else {
      slotGroup.classList.add('hidden');
      selectedHora.value = '';
    }
  });
}

// Cerrar con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeLightbox(); }
});

// ─────────────────────────────────────────────────────────
//  SLOT PICKER — carga horarios disponibles de Firebase
// ─────────────────────────────────────────────────────────
async function loadAvailableSlots(fecha) {
  slotGroup.classList.remove('hidden');
  slotPicker.innerHTML = '<p class="slot-loading">⏳ Cargando horarios disponibles...</p>';
  selectedHora.value = '';
  slotHint.textContent = '';

  // Verificar día laboral
  const date = new Date(fecha + 'T12:00:00');
  const slotsConfig = (typeof TIME_SLOTS !== 'undefined') ? TIME_SLOTS
    : ["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"];
  const workDays = (typeof WORKING_DAYS !== 'undefined') ? WORKING_DAYS : [1,2,3,4,5,6];

  if (!workDays.includes(date.getDay())) {
    slotPicker.innerHTML = '<p class="slot-no-disp">⛔ No trabajamos ese día. Por favor elige otro.</p>';
    return;
  }

  // Si Firebase no está configurado → mostrar todos los slots disponibles
  if (!db) {
    renderSlotButtons(slotsConfig, new Set(), fecha);
    slotHint.textContent = '✅ Todos los horarios disponibles (sin sincronización en tiempo real)';
    return;
  }

  try {
    // Consultar citas y bloqueos para ese día
    const [citasSnap, bloqueosSnap] = await Promise.all([
      db.collection('citas').where('fecha', '==', fecha).get(),
      db.collection('bloqueos').where('fecha', '==', fecha).get()
    ]);

    const takenSlots = new Set();

    // Citas confirmadas o pendientes bloquean el horario
    citasSnap.forEach(d => {
      const c = d.data();
      if (c.estado !== 'cancelada' && c.hora) takenSlots.add(c.hora);
    });

    // Bloqueos manuales
    const bloqueos = bloqueosSnap.docs.map(d => d.data());
    const fullDayBlock = bloqueos.some(b => !b.hora);
    if (fullDayBlock) {
      slotPicker.innerHTML = '<p class="slot-no-disp">⛔ No hay disponibilidad para este día. Por favor elige otra fecha.</p>';
      return;
    }
    bloqueos.forEach(b => { if (b.hora) takenSlots.add(b.hora); });

    renderSlotButtons(slotsConfig, takenSlots, fecha);

  } catch (err) {
    console.error('Error al cargar slots:', err);
    renderSlotButtons(slotsConfig, new Set(), fecha);
    slotHint.textContent = 'No se pudo verificar disponibilidad en tiempo real';
  }
}

function renderSlotButtons(slots, takenSlots, fecha) {
  slotPicker.innerHTML = '';
  let anyAvailable = false;

  // Para hoy, bloquear horas ya pasadas
  const isToday = fecha === new Date().toISOString().split('T')[0];

  slots.forEach(slot => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot-btn';
    btn.textContent = slot;

    let isTaken = takenSlots.has(slot);
    let isPast  = false;
    if (isToday) {
      const [h, m] = slot.split(':').map(Number);
      const slotTime = new Date();
      slotTime.setHours(h, m, 0, 0);
      isPast = slotTime <= new Date();
    }

    if (isTaken || isPast) {
      btn.disabled = true;
      btn.title = isTaken ? 'No disponible' : 'Horario ya pasado';
    } else {
      anyAvailable = true;
      btn.addEventListener('click', () => selectSlot(btn, slot));
    }

    slotPicker.appendChild(btn);
  });

  if (!anyAvailable) {
    slotPicker.innerHTML = '<p class="slot-no-disp">⛔ No quedan horarios disponibles para este día. Por favor elige otra fecha.</p>';
  } else {
    slotHint.textContent = 'Selecciona el horario que prefieras';
  }
}

function selectSlot(btn, time) {
  document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedHora.value = time;
  slotHint.textContent = `✅ Horario seleccionado: ${time}`;
}

// ─────────────────────────────────────────────────────────
//  FORM SUBMIT → Firebase + WhatsApp
// ─────────────────────────────────────────────────────────
async function submitForm(e) {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);

  const nombre   = data.get('nombre')   || '';
  const telefono = data.get('telefono') || '';
  const servicio = data.get('servicio') || '';
  const fecha    = data.get('fecha')    || '';
  const hora     = selectedHora?.value  || '';
  const notas    = data.get('notas')    || '';

  // Validar hora
  if (!hora) {
    if (slotHint) slotHint.textContent = '⚠️ Por favor selecciona un horario';
    slotHint.style.color = 'var(--rose-dark)';
    return;
  }

  // Guardar en Firebase (si está configurado)
  if (db) {
    try {
      await db.collection('citas').add({
        nombre, telefono, servicio, fecha, hora, notas,
        estado: 'pendiente',
        creadoEn: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (err) {
      console.warn('No se pudo guardar en Firebase:', err);
      // Continúa igual — el WhatsApp sigue funcionando
    }
  }

  // Asegurarse de que el número ya cargó de Firebase antes de continuar
  if (phoneLoadPromise) await phoneLoadPromise;

  // Armar mensaje WhatsApp (sin emojis para evitar problemas de codificaci\u00F3n)
  const msg = [
    `Hola Caro! Quisiera reservar una cita :)`,
    ``,
    `*Nombre:* ${nombre}`,
    `*Tel\u00E9fono:* ${telefono}`,
    `*Servicio:* ${servicio}`,
    `*Fecha:* ${formatDate(fecha)}`,
    `*Hora:* ${hora}`,
    notas ? `*Notas:* ${notas}` : '',
  ].filter(Boolean).join('\n');

  const phone = WHATSAPP_PHONE;
  showToast();
  setTimeout(() => {
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    closeModal();
    form.reset();
  }, 800);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const meses = ['enero','febrero','marzo','abril','mayo','junio',
                 'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parseInt(d)} de ${meses[parseInt(m)-1]} de ${y}`;
}

function showToast() {
  const t = document.getElementById('toast');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ─────────────────────────────────────────────────────────
//  SMOOTH ANCHOR
// ─────────────────────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) {
      e.preventDefault();
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 80, behavior: 'smooth' });
    }
  });
});

// ─────────────────────────────────────────────────────────
//  INTERSECTION ANIMATIONS
// ─────────────────────────────────────────────────────────
const io = new IntersectionObserver(entries => {
  entries.forEach(en => {
    if (en.isIntersecting) {
      en.target.style.opacity = '1';
      en.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll('.service-card, .review-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity .5s ease, transform .5s ease';
  io.observe(el);
});

// ═══════════════════════════════════════════════════════════
//  GALERÍA CON ARCHIVOS REALES
// ═══════════════════════════════════════════════════════════
const GALLERY = [
  // ── MAQUILLAJE SOCIAL ──────────────────────────────────
  { cat:'social', type:'img',   src:'img/Maquillaje social/Snapinta.App_482147208_17938466078993815_7832259801652692973_n.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/Snapinta.App_482680344_17939105516993815_3442890068061636768_n.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/Snapinta.App_482981430_17939342714993815_1655182446372137913_n.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/Snapinta.App_485207701_674278921722499_558666821854801512_n.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/Snapinta.App_491456623_17944236191993815_2022741664039154392_n.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/Snapinta.App_495995498_1224852589199071_9207464624794294971_n.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/Snapinta.App_497190620_698786583096642_7297968881033514886_n.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/Snapinta.App_502953248_695282353106100_991346016717631972_n.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/Snapinta.App_503248581_1212350623896444_4520136992856863622_n.jpg' },
  { cat:'social', type:'video', src:'img/Maquillaje social/Snapinta.App_AQMN3Oq38pQilUuACDCQ_FqWYo_Y5VPhHVyYMbyDSXutoYPH4Mp29MWkYcs1JY-aAQf_PHx0FQh7ef845KlewTj6mCgup6TiHtNmNjg.mp4' },
  { cat:'social', type:'video', src:'img/Maquillaje social/Snapinta.App_AQMfCsLQuGMSXgaGbRhzE4ucKuz0SSAmkNGfNFluIbtGgbMZO3xjAdzuKe9AgyjxqRGJ_IxW-HePnoV_lHzd21eAHiL9XAtn6ZowYCQ.mp4' },
  { cat:'social', type:'video', src:'img/Maquillaje social/Snapinta.App_AQNzQCI1KABl1W612gV1fc53B5NAajnBpv72jEiSCxDb-SlpsuIA_sMntWbrFRygGPZCEM42yqugxwEZNY6ywVMGcfXbzWwwbiPyFEI.mp4' },
  { cat:'social', type:'video', src:'img/Maquillaje social/Snapinta.App_AQP4nigPPtVHBEXV_zBodok-IIcckomJ6W9f-VKT9OZQJKImMIiT2px2gfRynmKuNFF-KY6aneX7yAL7bCjIIvlhXgjETHf1ZyrI-IE.mp4' },
  // ── MAQUILLAJE NATURAL ─────────────────────────────────
  { cat:'natural', type:'img',   src:'img/Maquillaje Natural/Snapinta.App_487409222_17942014193993815_4349719202150650176_n.jpg' },
  { cat:'natural', type:'img',   src:'img/Maquillaje Natural/Snapinta.App_503034552_718927433909493_3377671723436425109_n.jpg' },
  { cat:'natural', type:'img',   src:'img/Maquillaje Natural/Snapinta.App_506012529_17951154836993815_6343832128159944056_n.jpg' },
  { cat:'natural', type:'img',   src:'img/Maquillaje Natural/Snapinta.App_506031263_17951154884993815_8945817747937648959_n.jpg' },
  { cat:'natural', type:'img',   src:'img/Maquillaje Natural/Snapinta.App_526346762_2249550048809228_8965796332766045396_n.jpg' },
  { cat:'natural', type:'video', src:'img/Maquillaje Natural/Snapinta.App_AQMzXsQntOV-7ZxnrnmjA5jECX9B-Xnv7ZlO2bSC8rsVBqBgZ67_GseDzVRU79Kkgj5s2WtXEL9YOfEgQTdpLiPNUCGn3q6fhLQvVU0.mp4' },
  { cat:'natural', type:'video', src:'img/Maquillaje Natural/Snapinta.App_AQNUfXEggqNX8BxN1baaJmJqdOd6vXsbvt85-y17xNIJR0nXcAW6Mfq8IlEP0K1gz-OHNzIhToB9JfTtw6mpfJFAi0jfU_87H1y_TEA.mp4' },
  { cat:'natural', type:'video', src:'img/Maquillaje Natural/Snapinta.App_AQONNvuB3tiabusgJQphjyJX_TQ2BUP4xyLJZkh0u0Tg6w8PgJ7mMSixPL3cqbV_tFJAwCwU5z3Fnxrt5mc7M5DNdzhjgMHBZf14wGg.mp4' },
  { cat:'natural', type:'video', src:'img/Maquillaje Natural/Snapinta.App_AQOi9sIF-REmrRBZrOCrwLe5OjedEmUecw3QEmIL0OI-owoSPjjCFtISDpkJdfxhFHuv5hRLXEKbOJ0j-t5BWVgkqcW4iFAB9ygwuH4.mp4' },
  { cat:'natural', type:'video', src:'img/Maquillaje Natural/Snapinta.App_AQPrkwb4PMMg-zWNVR0xpZj9TRZZlZXW2dKXhhlGydqFmAWVOG84qFVG483Szn2hZzl9NyQJp8TqLLpSjLguzNX6b4veq647ELoYHuE.mp4' },
  // ── ARTÍSTICO ──────────────────────────────────────────
  { cat:'artistico', type:'img',   src:'img/Maquillaje Artistico/Snapinta.App_534930444_17958678221993815_7971669749227158391_n.jpg' },
  { cat:'artistico', type:'img',   src:'img/Maquillaje Artistico/Snapinta.App_622694651_875559665391938_7662432781330966393_n.jpg' },
  { cat:'artistico', type:'img',   src:'img/Maquillaje Artistico/Snapinta.App_656266515_18091094216156940_7168803048376053698_n.jpg' },
  { cat:'artistico', type:'video', src:'img/Maquillaje Artistico/Snapinta.App_AQMT2045rwSYGFDKVE5GWqf2_G_EqyibRjuS_fqpRN0DawpF8RGUuvQ7kyu0gcg_prKZr6O1d21eRmFxKlOdkoBg.mp4' },
  { cat:'artistico', type:'video', src:'img/Maquillaje Artistico/Snapinta.App_AQN45hH9gbhmu7OKL5SfO33y5k6MoUB3OYt8SIR7mPRLU1gcRZOqAYHZsjwO0qCgCzBIv_lohk9OKjfRAPT2FXUCb4fluallxrSlmaU.mp4' },
  { cat:'artistico', type:'video', src:'img/Maquillaje Artistico/Snapinta.App_AQNHO8R4894aB4pu8C-5IUtkw6ZPp4x6RI-vwz_UAG3sm53-WSeGfJQCW0zIb2oduYKtoQ8ssE1IgRseqMHp5kgQ9q9OnYHJVyd-_ag.mp4' },
  // ── QUINCEAÑERA ────────────────────────────────────────
  { cat:'xv', type:'img', src:'img/Maquillaje XV/Snapinta.App_627049873_17978538911993815_7890760067813440844_n.jpg' },
  { cat:'xv', type:'img', src:'img/Maquillaje XV/Snapinta.App_628727414_17978538899993815_6293730326751963083_n.jpg' },
  { cat:'xv', type:'img', src:'img/Maquillaje XV/Snapinta.App_629471652_17978530481993815_6623644472806078447_n.jpg' },
  { cat:'xv', type:'img', src:'img/Maquillaje XV/Snapinta.App_632966163_17978530490993815_1795760146738421151_n.jpg' },
  // ── CABELLO ────────────────────────────────────────────
  { cat:'cabello', type:'img',   src:'img/Cabello/Snapinta.App_498597256_17951685635993815_524382534185402109_n.jpg' },
  { cat:'cabello', type:'img',   src:'img/Cabello/Snapinta.App_502352735_1298618308452777_1603491212947074472_n.jpg' },
  { cat:'cabello', type:'img',   src:'img/Cabello/Snapinta.App_503543515_17951685608993815_3298461798371044922_n.jpg' },
  { cat:'cabello', type:'img',   src:'img/Cabello/Snapinta.App_510434034_1250691500037833_8127969748621701726_n (1).jpg' },
  { cat:'cabello', type:'img',   src:'img/Cabello/Snapinta.App_510434034_1250691500037833_8127969748621701726_n.jpg' },
  { cat:'cabello', type:'img',   src:'img/Cabello/Snapinta.App_525895602_17956461317993815_5245731827519907487_n.jpg' },
  { cat:'cabello', type:'video', src:'img/Cabello/Snapinta.App_AQN2djR1tYrdPT8JnWiigxwmaPUxppTYmrNV6OYKqaLylhCNmSJxIgr3Z6oLQEg2NLgdRG2bS_CCwSDxQSo2sThuPea4uGU1S3OA9tg.mp4' },
  { cat:'cabello', type:'video', src:'img/Cabello/Snapinta.App_AQNPNL5NTqpwGziTHJzSODr31j-4LYO7LwdaRwwBpA19OPDMUWXaJSrx9346dwnKENuQq-ZRmuoxuDOKn3yxthwOfnIGnysIjj-mFNk.mp4' },
  { cat:'cabello', type:'video', src:'img/Cabello/Snapinta.App_AQOabNf7ISL6APNeAtwu1tbMejP60jX28GNSClKkmppCOJKiCTY0dLq5bCOGgWklwoKWUguV0As48hsLkI6Q1AwBqBqglgrhlyzDp_w.mp4' },
  { cat:'cabello', type:'video', src:'img/Cabello/Snapinta.App_AQPQWbyY043xdqGu6SSE8V3BD6hQ8bazmDuLLk29BEFQtKoMJCE37djP43fbUWqZa-Yk7Hw4XlAf3_BGA3dRHV8LCIMOYMtqyKYuvdc.mp4' },
  { cat:'cabello', type:'video', src:'img/Cabello/Snapinta.App_AQPkhijdY2gDyQJ1BaO22TUnM1slZi7H9ooXlcej5zIvagQp0Kw87InWAGPSrJkff1fwHOdvmiVQVnV42gSGWVeflyspzQmTf9q2EFA.mp4' },
];

// ── Render ─────────────────────────────────────────────────
const grid = document.getElementById('galleryGrid');
let currentItems = [];
let currentIndex = 0;

function renderGallery(cat) {
  grid.innerHTML = '';
  currentItems = cat === 'todos' ? GALLERY : GALLERY.filter(i => i.cat === cat);
  currentItems.forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = 'gitem' + (item.type === 'video' ? ' gitem--video' : '');
    div.dataset.index = idx;

    if (item.type === 'img') {
      const img = document.createElement('img');
      img.src = item.src; img.loading = 'lazy'; img.alt = '';
      div.appendChild(img);
    } else {
      const vid = document.createElement('video');
      vid.src = item.src; vid.muted = true; vid.loop = true;
      vid.playsInline = true; vid.preload = 'metadata';
      vid.className = 'reel-vid';
      div.appendChild(vid);

      const soundBtn = document.createElement('button');
      soundBtn.className = 'reel-sound'; soundBtn.innerHTML = '🔇'; soundBtn.title = 'Sonido';
      soundBtn.addEventListener('click', e => {
        e.stopPropagation();
        vid.muted = !vid.muted;
        soundBtn.innerHTML = vid.muted ? '🔇' : '🔊';
        if (!vid.muted) {
          document.querySelectorAll('.reel-vid').forEach(v => { if (v !== vid) v.muted = true; });
          document.querySelectorAll('.reel-sound').forEach(b => { if (b !== soundBtn) b.innerHTML = '🔇'; });
        }
      });
      div.appendChild(soundBtn);
      reelObserver.observe(div);
    }

    div.addEventListener('click', () => openLightbox(idx));
    grid.appendChild(div);
  });
}

// ── Autoplay reels al hacer scroll ────────────────────────
const reelObserver = new IntersectionObserver(entries => {
  entries.forEach(en => {
    const vid = en.target.querySelector('.reel-vid');
    if (!vid) return;
    if (en.isIntersecting) { vid.play().catch(() => {}); }
    else {
      vid.pause();
      vid.muted = true;
      const btn = en.target.querySelector('.reel-sound');
      if (btn) btn.innerHTML = '🔇';
    }
  });
}, { threshold: 0.4 });

// ── Filtros galería ────────────────────────────────────────
document.querySelectorAll('.gtab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.gtab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderGallery(btn.dataset.cat);
  });
});
renderGallery('todos');

// ── LIGHTBOX ───────────────────────────────────────────────
const lightbox  = document.getElementById('lightbox');
const lbMedia   = document.getElementById('lbMedia');
const lbCaption = document.getElementById('lbCaption');

function openLightbox(idx) {
  currentIndex = idx;
  showLbItem(idx);
  lightbox.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  lightbox.classList.remove('open');
  document.body.style.overflow = '';
  lbMedia.innerHTML = '';
}
function showLbItem(idx) {
  const item = currentItems[idx];
  lbMedia.innerHTML = '';
  if (item.type === 'img') {
    const img = document.createElement('img');
    img.src = item.src; lbMedia.appendChild(img);
  } else {
    const vid = document.createElement('video');
    vid.src = item.src; vid.controls = true; vid.autoplay = true;
    lbMedia.appendChild(vid);
  }
  lbCaption.textContent = `${idx + 1} / ${currentItems.length}`;
}
document.getElementById('lbClose').addEventListener('click', closeLightbox);
document.getElementById('lbPrev').addEventListener('click', () => { currentIndex=(currentIndex-1+currentItems.length)%currentItems.length; showLbItem(currentIndex); });
document.getElementById('lbNext').addEventListener('click', () => { currentIndex=(currentIndex+1)%currentItems.length; showLbItem(currentIndex); });
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', e => {
  if (!lightbox.classList.contains('open')) return;
  if (e.key === 'ArrowRight') { currentIndex=(currentIndex+1)%currentItems.length; showLbItem(currentIndex); }
  if (e.key === 'ArrowLeft')  { currentIndex=(currentIndex-1+currentItems.length)%currentItems.length; showLbItem(currentIndex); }
});
