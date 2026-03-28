// ════════════════════════════════════════════════════════════
//  CARO SWEET MUA — Configuración Firebase
//  Edita este archivo con tus propias credenciales
// ════════════════════════════════════════════════════════════
//
//  📋 INSTRUCCIONES PASO A PASO:
//
//  1. Ve a https://console.firebase.google.com
//  2. Haz clic en "Agregar proyecto"
//     → Pon nombre: caro-sweet-mua → Continuar → Crear proyecto
//
//  3. En el menú lateral → "Firestore Database"
//     → "Crear base de datos" → "Modo de prueba" → Siguiente
//     → Elige región "us-central1" → Listo
//
//  4. Ve a ⚙️ (rueda) → "Configuración del proyecto"
//     → pestaña "General" → sección "Tus apps"
//     → haz clic en "</>" (Web)
//     → Pon nombre: caro-web → Registrar app
//     → Copia los valores del objeto firebaseConfig
//
//  5. Reemplaza los "PEGA_AQUI" de abajo con tus valores
//
//  6. En Firestore → "Reglas" → pega esto y publica:
//  ────────────────────────────────────────────────
//  rules_version = '2';
//  service cloud.firestore {
//    match /databases/{database}/documents {
//      match /{document=**} {
//        allow read, write: if true;
//      }
//    }
//  }
//  ────────────────────────────────────────────────
//
// ════════════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCD6Vrna_iW6n8R2z5iI7W3Wb5oBLKTNZA",
  authDomain:        "caro-sweet-mua.firebaseapp.com",
  projectId:         "caro-sweet-mua",
  storageBucket:     "caro-sweet-mua.firebasestorage.app",
  messagingSenderId: "477036655022",
  appId:             "1:477036655022:web:886a57c558250078c9983f",
  measurementId:     "G-V7XC9S0SF7"
};

// ── Contraseña del panel de administración ───────────────────
// ⚠️ Cámbiala por algo seguro que solo tú sepas
const ADMIN_PASSWORD = "caro2024";

// ── Horarios de trabajo disponibles ─────────────────────────
const TIME_SLOTS = [
  "09:00", "10:00", "11:00", "12:00", "13:00",
  "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"
];

// ── Días laborales: 1=Lun 2=Mar 3=Mié 4=Jue 5=Vie 6=Sáb 0=Dom
const WORKING_DAYS = [1, 2, 3, 4, 5, 6]; // Lun–Sáb
