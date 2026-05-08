// ═══════════════════════════════════════════════════════════
//  CB MUA — Script principal
// ═══════════════════════════════════════════════════════════

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
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-1.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-2.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-3.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-4.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-5.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-6.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-7.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-8.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-9.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-10.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-11.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-12.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-13.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-14.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-15.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-16.jpg' },
  { cat:'social', type:'img',   src:'img/Maquillaje social/maquillaje-social-17.jpg' },
  { cat:'social', type:'video', src:'img/Maquillaje social/maquillaje-social-1.mp4' },
  { cat:'social', type:'video', src:'img/Maquillaje social/maquillaje-social-2.mp4' },
  { cat:'social', type:'video', src:'img/Maquillaje social/maquillaje-social-3.mp4' },
  { cat:'social', type:'video', src:'img/Maquillaje social/maquillaje-social-4.mp4' },
  { cat:'social', type:'video', src:'img/Maquillaje social/maquillaje-social-18.mp4' },
  { cat:'social', type:'video', src:'img/Maquillaje social/maquillaje-social-19.mp4' },
  { cat:'social', type:'video', src:'img/Maquillaje social/maquillaje-social-20.mp4' },
  { cat:'social', type:'video', src:'img/Maquillaje social/maquillaje-social-21.mp4' },
  { cat:'social', type:'video', src:'img/Maquillaje social/maquillaje-social-22.mp4' },
  { cat:'social', type:'video', src:'img/Maquillaje social/maquillaje-social-23.mp4' },
  { cat:'social', type:'video', src:'img/Maquillaje social/maquillaje-social-24.mp4' },
  { cat:'social', type:'video', src:'img/Maquillaje social/maquillaje-social-25.mp4' },
  // ── NOVIA · QUINCEAÑERA ────────────────────────────────
  { cat:'novia', type:'img', src:'img/Maquillaje XV-novia/maquillaje-xv-1.jpg' },
  { cat:'novia', type:'img', src:'img/Maquillaje XV-novia/maquillaje-xv-3.jpg' },
  { cat:'novia', type:'img', src:'img/Maquillaje XV-novia/maquillaje-xv-4.jpg' },
  // ── CABELLO ────────────────────────────────────────────
  { cat:'cabello', type:'img',   src:'img/Cabello/cabello.jpg' },
  { cat:'cabello', type:'img',   src:'img/Cabello/Cabello-1.jpg' },
  { cat:'cabello', type:'img',   src:'img/Cabello/Cabello-2.jpg' },
  { cat:'cabello', type:'img',   src:'img/Cabello/Cabello-3.jpg' },
  { cat:'cabello', type:'video', src:'img/Cabello/Cabello-4.mp4' },
  { cat:'cabello', type:'video', src:'img/Cabello/Cabello-5.mp4' },
  { cat:'cabello', type:'video', src:'img/Cabello/Cabello-6.mp4' },
  { cat:'cabello', type:'video', src:'img/Cabello/Cabello-7.mp4' },
  // ── PEINADOS SUELTOS ───────────────────────────────────
  { cat:'peinados', type:'img', src:'img/Peinado suelto/Cabello-3.jpg' },
  // ── PAQUETE ────────────────────────────────────────────
  { cat:'paquete', type:'img', src:'img/paquete/maquillaje-social-5.jpg' },
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

// ─────────────────────────────────────────────────────────
//  ANTES & DESPUÉS — Slider interactivo
// ─────────────────────────────────────────────────────────
document.querySelectorAll('.ba-container').forEach(container => {
  const after  = container.querySelector('.ba-after');
  const handle = container.querySelector('.ba-handle');
  let dragging = false;

  function setPos(x) {
    const rect = container.getBoundingClientRect();
    let pct = ((x - rect.left) / rect.width) * 100;
    pct = Math.max(3, Math.min(97, pct));
    after.style.clipPath  = `inset(0 0 0 ${pct}%)`;
    handle.style.left     = `${pct}%`;
  }

  // Mouse
  container.addEventListener('mousedown', e => { dragging = true; setPos(e.clientX); e.preventDefault(); });
  document.addEventListener('mouseup',   () => { dragging = false; });
  document.addEventListener('mousemove', e => { if (dragging) setPos(e.clientX); });

  // Touch
  container.addEventListener('touchstart', e => { dragging = true; setPos(e.touches[0].clientX); }, { passive: true });
  document.addEventListener('touchend',    () => { dragging = false; });
  document.addEventListener('touchmove',   e => { if (dragging) setPos(e.touches[0].clientX); }, { passive: true });
});
