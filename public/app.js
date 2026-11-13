
// ================================================================
// CLIENTE API ANTI-CACHÉ EN TIEMPO REAL (TIMESTAMP + NO-STORE)
// ================================================================
let ordenPacientesActual = "recent";

async function apiFetch(url, options = {}) {
  const sep = url.includes("?") ? "&" : "?";
  const noCacheUrl = `${url}${sep}_t=${Date.now()}`;
  
  const headers = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    ...(options.headers || {})
  };

  return fetch(noCacheUrl, {
    ...options,
    headers,
    cache: "no-store"
  });
}

function cambiarOrdenPacientes(orden) {
  ordenPacientesActual = orden;
  const btns = {
    recent: document.getElementById("btn-orden-pac-recent"),
    oldest: document.getElementById("btn-orden-pac-oldest"),
    alpha: document.getElementById("btn-orden-pac-alpha"),
    alphadesc: document.getElementById("btn-orden-pac-alphadesc")
  };

  Object.entries(btns).forEach(([k, btn]) => {
    if (!btn) return;
    if (k === orden) {
      btn.className = "px-2 py-1 rounded font-bold text-[11px] bg-white text-slate-800 shadow-xs transition flex items-center gap-1 border border-slate-200";
      const icon = btn.querySelector("i");
      if (icon) {
        icon.className = icon.className.replace("text-slate-400", "text-brand-600");
        if (!icon.className.includes("text-brand-600")) icon.classList.add("text-brand-600");
      }
    } else {
      btn.className = "px-2 py-1 rounded font-medium text-[11px] text-slate-500 hover:text-slate-800 transition flex items-center gap-1";
      const icon = btn.querySelector("i");
      if (icon) {
        icon.classList.remove("text-brand-600");
        if (!icon.className.includes("text-slate-400")) icon.classList.add("text-slate-400");
      }
    }
  });

  actualizarVistaPacientes();
}

async function sincronizarTodoEnVivo(notify = false) {
  const icon = document.getElementById("icon-sync-global");
  if (icon) icon.classList.add("animate-spin");
  try {
    await Promise.all([
      cargarMedicamentos(),
      cargarPacientes(),
      cargarHistorial(),
      cargarEstadisticas(),
    ]);
    const hora = new Date().toLocaleTimeString('es-EC');
    const txt = document.getElementById("txt-sync-global");
    if (txt) txt.textContent = `Sincronizado ${hora}`;
    if (notify) {
      showToast("Datos Sincronizados", `Base de datos actualizada al instante (${hora}).`, "success");
    }
  } catch(e) {
    console.warn("Error en sincronización en vivo:", e);
  } finally {
    if (icon) icon.classList.remove("animate-spin");
  }
}

// Auto-sincronización reactiva al enfocar ventana o pestaña
window.addEventListener("focus", () => {
  sincronizarTodoEnVivo(false);
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    sincronizarTodoEnVivo(false);
  }
});

// Auto-sincronización periódica cada 25 segundos
setInterval(() => {
  if (!document.hidden) {
    sincronizarTodoEnVivo(false);
  }
}, 25000);

// Dispensario Médico FYDI - Frontend JavaScript con Control de Roles
function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

let medicamentosCache = [];
let pacientesCache = [];
let atencionesCache = [];
let pacienteHistorialCache = [];
let renglonesReceta = [];
let renglonIdCounter = 0;
let atencionPendiente = null;
let permisosCache = [];


// Estado de sesión activa (Exige autenticación corporativa real y posterior al cambio de credenciales)
const MIN_VALID_SESSION_TIME = 1794578860000;
let currentUser = JSON.parse(localStorage.getItem("fydi_user")) || null;
if (currentUser && (!currentUser.auth_timestamp || currentUser.auth_timestamp < MIN_VALID_SESSION_TIME)) {
  console.warn("[SEGURIDAD FYDI] Sesión revocada por actualización general de credenciales.");
  localStorage.removeItem("fydi_user");
  currentUser = null;
}

document.addEventListener("DOMContentLoaded", () => {
 initIdioma();
 initReloj();
 initFechaHoy();
 sincronizarPermisos();

 // Verificar si hay sesión activa:
 // Si NO hay sesión, el personal de operaciones ve la Landing Page de Bienestar & Salud
 // Si HAY sesión clínica, se muestra el sistema hospitalario y se activa el polling de pisos
 if (!currentUser || !currentUser.usuario) {
 mostrarPortalPublico();
 } else {
 mostrarAppClinica();
 aplicarPermisosRol();
 }

 cargarMedicamentos();
  cargarPacientes();
  cargarEstadisticas();
  cargarHistorial();
 
 // Agregar primer renglón de medicina por defecto
 agregarRenglonReceta();
 
 // Inicializar iconos de Lucide
 if (window.lucide) {
 lucide.createIcons();
 }

 // Keep-Alive para evitar suspensión por inactividad en Render Cloud
 iniciarHeartbeatKeepAlive();
});

// Keep-Alive: envía un ping ligero cada 3 minutos para mantener el servidor despierto
function iniciarHeartbeatKeepAlive() {
 setInterval(async () => {
  try {
   await fetch(`/api/ping?_t=${Date.now()}`, { cache: "no-store" });
  } catch (_) {
   // Silencioso
  }
 }, 3 * 60 * 1000);
}

// Reloj en vivo
function initReloj() {
 const el = document.getElementById("reloj-vivo");
 const update = () => {
 const d = new Date();
 el.textContent = d.toLocaleTimeString('es-EC', { hour12: false });
 };
 update();
 setInterval(update, 1000);
}

// Fecha por defecto hoy (usando hora local del navegador)
function getFechaHoyLocal() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initFechaHoy() {
  const f = document.getElementById("atencion-fecha");
  const f_ent = document.getElementById("entrada-fecha");
  const hoy = getFechaHoyLocal();
  if (f) f.value = hoy;
  if (f_ent) f_ent.value = hoy;
}

// ================================================================
// GESTIÓN DE ROLES Y AUTENTICACIÓN
// ================================================================
function aplicarPermisosRol() {
 const nameEl = document.getElementById("user-display-name");
 const badgeEl = document.getElementById("user-role-badge");
 const iconEl = document.getElementById("user-role-icon");
 const bannerBadge = document.getElementById("role-banner-badge");
 const bannerDesc = document.getElementById("role-banner-desc");
 const bannerContainer = document.getElementById("role-info-banner");

 const btnNuevoProd = document.getElementById("btn-admin-nuevo-producto");
 const btnIngresoBodega = document.getElementById("btn-ingreso-bodega");
 const btnDownloadExcel = document.getElementById("btn-download-excel");
 const readonlyNotice = document.getElementById("atencion-readonly-notice");
 const formAtencion = document.getElementById("form-atencion");
 const tabPermisosBtn = document.getElementById("tab-btn-permisos");

 if (!currentUser) {
 if (nameEl) nameEl.textContent = "Sin autenticar";
 if (badgeEl) badgeEl.textContent = "ACCESO RESTRINGIDO";
 if (formAtencion) formAtencion.querySelectorAll("input, select, textarea, button").forEach(el => el.disabled = true);
 return;
 }

 nameEl.textContent = currentUser.nombre_completo;
 badgeEl.textContent = currentUser.rol;

 if (currentUser.rol === "ADMINISTRADOR") {
 iconEl.innerHTML = `<i data-lucide="shield-check" class="w-3.5 h-3.5 text-purple-300"></i>`;
 badgeEl.className = "text-[10px] font-bold text-purple-300 uppercase tracking-wider";
 bannerContainer.className = "hidden";
 bannerBadge.className = "font-bold px-2.5 py-0.5 rounded-full text-[10px] bg-purple-200 text-purple-900";
 bannerBadge.textContent = typeof t === "function" ? t("role_admin_banner") : "ROL: ADMINISTRADOR / SUPERVISOR";
 bannerDesc.textContent = typeof t === "function" ? t("role_admin_desc") : "Tienes control total del dispensario: puedes editar el catálogo, ajustar stock físico, anular consultas y configurar permisos.";
 } else if (currentUser.rol === "ENFERMERIA") {
  iconEl.innerHTML = `<i data-lucide="stethoscope" class="w-3.5 h-3.5 text-sky-300"></i>`;
  badgeEl.className = "text-[10px] font-bold text-sky-300 uppercase tracking-wider";
  bannerContainer.className = "hidden";
  bannerBadge.className = "font-bold px-2.5 py-0.5 rounded-full text-[10px] bg-sky-200 text-sky-900";
  bannerBadge.textContent = "ROL: ENFERMERÍA TITULAR (PATRICIA PILATAXI)";
  bannerDesc.textContent = "Turno 9:30 - 18:30. Gestión de atención clínica y consulta de inventario.";
 } else if (currentUser.rol === "AUXILIAR_ENFERMERIA") {
  iconEl.innerHTML = `<i data-lucide="user-check" class="w-3.5 h-3.5 text-amber-300"></i>`;
  badgeEl.className = "text-[10px] font-bold text-amber-300 uppercase tracking-wider";
  bannerContainer.className = "hidden";
  bannerBadge.className = "font-bold px-2.5 py-0.5 rounded-full text-[10px] bg-amber-200 text-amber-900";
  bannerBadge.textContent = "ROL: AUXILIAR DE ENFERMERÍA (TURNO MAÑANA 7:30 - 9:30)";
  bannerDesc.textContent = "Acceso exclusivo para registrar y atender pacientes. Inventario, bodega y reportes restringidos.";
 } else { // AUDITOR
  iconEl.innerHTML = `<i data-lucide="eye" class="w-3.5 h-3.5 text-slate-300"></i>`;
  badgeEl.className = "text-[10px] font-bold text-slate-300 uppercase tracking-wider";
  bannerContainer.className = "hidden";
  bannerBadge.className = "font-bold px-2.5 py-0.5 rounded-full text-[10px] bg-slate-300 text-slate-900";
  bannerBadge.textContent = typeof t === "function" ? t("role_aud_banner") : "ROL: AUDITORÍA (SOLO CONSULTA)";
  bannerDesc.textContent = typeof t === "function" ? t("role_aud_desc") : "Acceso de supervisión de Kardex, bitácora de atenciones y descarga de balances según permisos.";
 }

 // Restringir pestañas completas según el rol
 const tabInventarioBtn = document.getElementById("tab-btn-inventario");
 const tabEstadisticasBtn = document.getElementById("tab-btn-estadisticas");

 const avisoAux = document.getElementById("aviso-auxiliar-prescripcion");
 if (currentUser.rol === "AUXILIAR_ENFERMERIA") {
   // La auxiliar de la mañana NO debe tener acceso a Inventario ni Estadísticas
   if (tabInventarioBtn) tabInventarioBtn.classList.add("hidden");
   if (tabEstadisticasBtn) tabEstadisticasBtn.classList.add("hidden");
   if (avisoAux) avisoAux.classList.remove("hidden");
 } else {
   if (tabInventarioBtn) tabInventarioBtn.classList.remove("hidden");
   if (tabEstadisticasBtn) tabEstadisticasBtn.classList.remove("hidden");
   if (avisoAux) avisoAux.classList.add("hidden");
 }

 // --- CONTROLES DINÁMICOS BASADOS EN MATRIZ DE PERMISOS ---
 // 1. Crear medicamentos en catálogo (+ Registrar Nuevo Medicamento)
 const puedeCrearMed = tienePermiso("gestionar_medicamentos");
 if (btnNuevoProd) {
  if (puedeCrearMed) btnNuevoProd.classList.remove("hidden");
  else btnNuevoProd.classList.add("hidden");
 }

 // 2. Ingreso a bodega (+ Entrada de Mercadería)
 const puedeIngresarBodega = tienePermiso("registrar_entradas");
 if (btnIngresoBodega) {
  if (puedeIngresarBodega) btnIngresoBodega.classList.remove("hidden");
  else btnIngresoBodega.classList.add("hidden");
 }

 // 3. Descarga de balances en Excel Maestro
 const puedeDescargarExcel = tienePermiso("descargar_excel");
 if (btnDownloadExcel) {
  if (puedeDescargarExcel) btnDownloadExcel.classList.remove("hidden");
  else btnDownloadExcel.classList.add("hidden");
 }

 // 4. Registro y atención de pacientes
 const puedeAtender = tienePermiso("registrar_atenciones");
 if (readonlyNotice) {
  if (puedeAtender) readonlyNotice.classList.add("hidden");
  else readonlyNotice.classList.remove("hidden");
 }
 if (formAtencion) {
  formAtencion.querySelectorAll("input, select, textarea, button").forEach(el => {
   el.disabled = !puedeAtender;
  });
 }

 // 5. Configurar matriz de permisos de roles
 const puedePermisos = currentUser.rol === "ADMINISTRADOR" || tienePermiso("gestionar_permisos");
 if (tabPermisosBtn) {
  if (puedePermisos) tabPermisosBtn.classList.remove("hidden");
  else tabPermisosBtn.classList.add("hidden");
 }

 // 6. Botón de Emergencia para Intrusos (Exclusivo Administrador / TI)
 const btnLockEmergency = document.getElementById("btn-lock-emergency-admin");
 if (btnLockEmergency) {
  if (currentUser.rol === "ADMINISTRADOR") btnLockEmergency.classList.remove("hidden");
  else btnLockEmergency.classList.add("hidden");
 }

 if (window.lucide) lucide.createIcons();
}

function tienePermiso(accion) {
 if (!currentUser) return false;
 if (currentUser.rol === "ADMINISTRADOR") return true;
 const p = permisosCache.find(x => x.rol === currentUser.rol);
 if (!p) return false;
 return p[accion] === 1 || p[accion] === true || p[accion] === "1";
}

async function sincronizarPermisos() {
 try {
 const res = await fetch("/api/permisos");
 permisosCache = await res.json();
 } catch (e) {
 console.warn("No se pudo precargar permisos:", e);
 }
}

function abrirModalLogin() {
 const modal = document.getElementById("modal-login");
 if (!modal) return;
 modal.classList.remove("hidden");

 // Limpiar mensajes y contraseña siempre
 const errBox = document.getElementById("login-error-msg");
 if (errBox) errBox.classList.add("hidden");

 const pInput = document.getElementById("login-password");
 if (pInput) { pInput.value = ""; pInput.placeholder = "••••••••"; }

 // Recordar el último usuario/rol utilizado sin guardar contraseñas
 const savedUser = localStorage.getItem("fydi_remembered_user") || "enfermeria";
 seleccionarPerfil(savedUser);

 if (window.lucide) lucide.createIcons();
}

function cerrarModalLogin() {
 const modal = document.getElementById("modal-login");
 if (modal) modal.classList.add("hidden");
 if (!currentUser || !currentUser.usuario) {
 mostrarPortalPublico();
 }
}

function seleccionarPerfil(usuario) {
 const uInput = document.getElementById("login-usuario");
 const pInput = document.getElementById("login-password");
 const hint = document.getElementById("role-quick-hint");
 const errBox = document.getElementById("login-error-msg");

 if (errBox) errBox.classList.add("hidden");
 if (uInput) uInput.value = usuario;

 // SEGURIDAD: La contraseña NUNCA se autocompleta por código; el usuario debe ingresar su clave personal
 if (pInput) {
    pInput.value = "";
    pInput.placeholder = "••••••••";
    setTimeout(() => pInput.focus(), 50);
  }

 // Actualizar tarjetas de rol visuales
  // Actualizar tarjetas de rol visuales (estilo FIDI 2x2)
  document.querySelectorAll(".role-card-fidi").forEach(el => el.classList.remove("active-fidi-role"));
  document.querySelectorAll(".role-smart-card").forEach(el => el.classList.remove("active-role"));
  const cardFidi = document.getElementById(`card-role-${usuario}`);
  if (cardFidi) {
    cardFidi.classList.add("active-fidi-role", "active-role");
  } else if (usuario === "patricia.pilataxi" || usuario === "enfermeria") {
    const c1 = document.getElementById("card-role-patricia.pilataxi") || document.getElementById("card-role-enfermeria");
    if (c1) c1.classList.add("active-fidi-role", "active-role");
  }

 if (hint) {
 const rolNombres = {
 "patricia.pilataxi": "Lic. Patricia Pilataxi (Titular 9:30-18:30)",
 "enfermeria": "Lic. Patricia Pilataxi (Titular 9:30-18:30)",
 "asistente.manana": "Enfermería Apoyo (Turno Mañana 7:30-9:30)",
 "admin": "Administrador Central (Sistemas)",
 "auditor": "Auditoría Médica"
 };
 hint.textContent = `Puesto: ${rolNombres[usuario] || usuario.toUpperCase()}`;
 hint.classList.remove("hidden");
 }

 if (window.lucide) lucide.createIcons();
}

function checkCapsLock(e) {
 const capsWarning = document.getElementById("caps-warning");
 if (!capsWarning) return;
 if (e.getModifierState && e.getModifierState("CapsLock")) {
 capsWarning.classList.remove("hidden");
 } else {
 capsWarning.classList.add("hidden");
 }
}

function togglePasswordVisibility(inputId, btn) {
 const input = document.getElementById(inputId);
 if (!input) return;
 const isPass = input.type === "password";
 input.type = isPass ? "text" : "password";
 btn.innerHTML = `<i data-lucide="${isPass ? 'eye-off' : 'eye'}" class="w-4 h-4"></i>`;
 if (window.lucide) lucide.createIcons();
}

function cerrarSesion() {
 localStorage.removeItem("fydi_user");
 currentUser = null;
 showToast("Sesión Finalizada", "Has salido del sistema de manera segura.", "warning");
 aplicarPermisosRol();
 mostrarPortalPublico();
}

function cerrarSesionForzada(motivo) {
 localStorage.removeItem("fydi_user");
 currentUser = null;
 aplicarPermisosRol();
 mostrarPortalPublico();
 abrirModalLogin();
 const errBox = document.getElementById("login-error-msg");
 const errTxt = document.getElementById("login-error-text");
 if (errBox && errTxt) {
   errBox.classList.remove("hidden");
   errTxt.textContent = motivo || "Su sesión ha expirado por actualización de credenciales. Ingrese con sus nuevas credenciales.";
 }
 showToast("Seguridad FYDI", motivo || "Sesión cerrada por actualización de credenciales.", "warning");
}

// Comprobación de seguridad en segundo plano cada 4 segundos
async function verificarSesionActiva() {
 if (!currentUser || !currentUser.usuario) return;
 try {
   const ts = currentUser.auth_timestamp || 0;
   const res = await fetch(`/api/auth/session-check?usuario=${encodeURIComponent(currentUser.usuario)}&auth_time=${ts}&_t=${Date.now()}`);
   if (res.ok) {
     const d = await res.json();
     if (d.valid === false || d.revoked === true) {
       cerrarSesionForzada(d.motivo);
     }
   }
 } catch (e) {
   // Silencioso en caso de pérdida momentánea de conexión
 }
}
setInterval(verificarSesionActiva, 4000);

async function handleLoginSubmit(e) {
 e.preventDefault();
 const u = document.getElementById("login-usuario").value.trim();
 const p = document.getElementById("login-password").value.trim();
 const remember = document.getElementById("login-remember")?.checked;
 const errBox = document.getElementById("login-error-msg");
 const errTxt = document.getElementById("login-error-text");
 const btnSubmit = document.getElementById("btn-login-submit");
 const btnTxt = document.getElementById("btn-login-text");

 if (!u || !p) {
 if (errBox) {
 errBox.classList.remove("hidden");
 errTxt.textContent = "Debe ingresar usuario y contraseña.";
 }
 return;
 }

 if (btnSubmit) {
 btnSubmit.disabled = true;
 if (btnTxt) btnTxt.textContent = "Autenticando en Servidor FYDI...";
 btnSubmit.classList.add("opacity-80", "cursor-wait");
 if (window.lucide) lucide.createIcons();
 }

 try {
 const res = await fetch("/api/auth/login", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ usuario: u, password: p })
 });
 const data = await res.json();

 if (!res.ok) {
 if (errBox) {
 errBox.classList.remove("hidden");
 errTxt.textContent = data.error || "Credenciales incorrectas. Verifique usuario o contraseña.";
 }
 showToast("Error de Acceso", data.error || "Credenciales incorrectas.", "error");
 } else {
 currentUser = {
 usuario: data.usuario,
 nombre_completo: data.nombre_completo,
 rol: data.rol,
 token: data.token,
 auth_timestamp: data.auth_timestamp || Date.now()
 };
 localStorage.setItem("fydi_user", JSON.stringify(currentUser));

 // Guarda el rol para recordarlo en la siguiente sesión, sin contraseñas
 localStorage.setItem("fydi_remembered_user", data.usuario);

 document.getElementById("modal-login").classList.add("hidden");
 mostrarAppClinica();
 await sincronizarPermisos();
 aplicarPermisosRol();
 renderInventarioTabla(medicamentosCache);
 cargarHistorial();
 cargarPacientes();
 showToast("Acceso Autorizado", `Bienvenido(a), ${data.nombre_completo} (${data.rol})`, "success");
 }
 } catch (err) {
 if (errBox) {
 errBox.classList.remove("hidden");
 errTxt.textContent = "Error de conexión con el servidor: " + err.message;
 }
 } finally {
 if (btnSubmit) {
 btnSubmit.disabled = false;
 btnSubmit.classList.remove("opacity-80", "cursor-wait");
 if (btnTxt) btnTxt.textContent = "Verificar e Ingresar al Sistema";
 if (window.lucide) lucide.createIcons();
 }
 }
}

// Cambiar de Pestaña
function cambiarTab(tabName) {
 if (currentUser && currentUser.rol === "AUXILIAR_ENFERMERIA" && (tabName === "inventario" || tabName === "estadisticas" || tabName === "permisos")) {
  showToast("Acceso Restringido", "Tu perfil de Auxiliar no tiene autorización para acceder a este módulo.", "warning");
  return;
 }

 document.querySelectorAll(".tab-pane").forEach(el => el.classList.add("hidden"));
 document.querySelectorAll(".nav-tab").forEach(el => el.classList.remove("active-tab"));

 const targetPane = document.getElementById(`tab-${tabName}`);
 const targetBtn = document.getElementById(`tab-btn-${tabName}`);
 if (targetPane) targetPane.classList.remove("hidden");
 if (targetBtn) targetBtn.classList.add("active-tab");

 if (tabName === "atencion") {
  initFechaHoy();
 cargarMedicamentos();
 } else if (tabName === "pacientes") {
 cargarPacientes();
 } else if (tabName === "estadisticas") {
 cargarEstadisticas();
 } else if (tabName === "historial") {
 cargarHistorial();
 } else if (tabName === "permisos") {
 cargarMatrizPermisos();
 }

 if (window.lucide) {
 lucide.createIcons();
 }
}

// Toast Notificaciones
function showToast(titulo, mensaje, tipo = "success") {
 const banner = document.getElementById("toast-banner");
 const tTitle = document.getElementById("toast-title");
 const tMsg = document.getElementById("toast-msg");
 const tIcon = document.getElementById("toast-icon");

 banner.className = "mb-6 p-4 rounded-xl border shadow-md flex items-start justify-between transition-all";
 if (tipo === "success") {
 banner.classList.add("bg-emerald-50", "border-emerald-200", "text-emerald-900");
 tIcon.innerHTML = `<i data-lucide="check-circle" class="w-5 h-5 text-emerald-600"></i>`;
 } else if (tipo === "warning") {
 banner.classList.add("bg-amber-50", "border-amber-200", "text-amber-900");
 tIcon.innerHTML = `<i data-lucide="alert-triangle" class="w-5 h-5 text-amber-600"></i>`;
 } else {
 banner.classList.add("bg-rose-50", "border-rose-200", "text-rose-900");
 tIcon.innerHTML = `<i data-lucide="alert-octagon" class="w-5 h-5 text-rose-600"></i>`;
 }

 tTitle.textContent = titulo;
 tMsg.textContent = mensaje;
 banner.classList.remove("hidden");

 if (window.lucide) lucide.createIcons();

 setTimeout(() => {
 cerrarToast();
 }, 6000);
}

function cerrarToast() {
 document.getElementById("toast-banner").classList.add("hidden");
}

// ================================================================
// 1. CARGA DE MEDICAMENTOS E INVENTARIO
// ================================================================
async function cargarMedicamentos() {
 try {
 const res = await fetch("/api/medicamentos");
 medicamentosCache = await res.json();
 renderInventarioTabla(medicamentosCache);
 renderAlertasPanel(medicamentosCache);
 actualizarSelectorEntradaModal(medicamentosCache);
 actualizarSelectoresReceta();
 } catch (err) {
 console.error("Error al cargar medicamentos:", err);
 }
}

function renderInventarioTabla(lista) {
 const tbody = document.getElementById("tabla-inventario-body");
 if (!tbody) return;

 if (lista.length === 0) {
 tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-slate-400 font-medium">No se encontraron productos coincidentes en el inventario.</td></tr>`;
 return;
 }

 let totUnidades = 0;
 let disponibles = 0;
 let bajos = 0;
 let agotados = 0;
 let vigentes = 0;
 let porVencer = 0;
 let caducados = 0;
 let sinFecha = 0;

 const puedeEditar = currentUser && (currentUser.rol === "ADMINISTRADOR" || tienePermiso("gestionar_medicamentos"));
 const puedeAjustar = currentUser && (currentUser.rol === "ADMINISTRADOR" || tienePermiso("ajustar_stock"));

 tbody.innerHTML = lista.map(m => {
    totUnidades += (m.stock_actual || 0);
    if (m.stock_actual === 0) {
      agotados++;
    } else if (m.stock_actual <= m.stock_minimo) {
      bajos++;
    } else {
      disponibles++;
    }

    // Contadores de caducidad
    if (m.estado_vencimiento === "VENCIDO") {
      caducados++;
    } else if (m.estado_vencimiento === "POR_VENCER") {
      porVencer++;
    } else if (m.estado_vencimiento === "VIGENTE") {
      vigentes++;
    } else {
      sinFecha++;
    }

    // Badge semáforo compacto y anti-tontos para Estado Stock
    let badgeHtml = "";
    if (m.estado === "DISPONIBLE") {
      badgeHtml = `
        <span class="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200/90 font-bold px-2 py-1 rounded-lg text-[10px] cursor-help transition hover:bg-emerald-100"
          title="DISPONIBLE: Stock óptimo en bodega para despachar">
          <i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-emerald-600"></i>
          <span class="hidden xl:inline">Disponible</span>
        </span>
      `;
    } else if (m.estado === "STOCK BAJO") {
      badgeHtml = `
        <span class="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-300 font-bold px-2 py-1 rounded-lg text-[10px] cursor-help transition hover:bg-amber-100"
          title="STOCK BAJO: Stock menor o igual al mínimo. Priorizar reposición">
          <i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-amber-600"></i>
          <span class="hidden xl:inline">Stock Bajo</span>
        </span>
      `;
    } else {
      badgeHtml = `
        <span class="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-300 font-bold px-2 py-1 rounded-lg text-[10px] cursor-help transition hover:bg-rose-100"
          title="AGOTADO: 0 unidades en bodega. No disponible para recetar">
          <i data-lucide="ban" class="w-3.5 h-3.5 text-rose-600"></i>
          <span class="hidden xl:inline">Agotado</span>
        </span>
      `;
    }

    // Badge semaforizado FEFO para Lote y Caducidad
    let caducidadHtml = "";
    const loteDisplay = m.lote
      ? `<span class="font-mono text-[10px] font-bold text-slate-600 tracking-wider">LT: ${m.lote}</span>`
      : `<span class="font-mono text-[10px] text-slate-400">LT: S/N</span>`;

    if (m.estado_vencimiento === "VENCIDO") {
      const diasTxt = m.dias_restantes !== null ? `(${Math.abs(m.dias_restantes)}d atrás)` : '';
      caducidadHtml = `
        <div class="flex flex-col items-center gap-0.5">
          ${loteDisplay}
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs" title="CADUCADO: Retirar de bodega. Venció: ${m.fecha_vencimiento || 'No registrada'}">
            <i data-lucide="shield-alert" class="w-3 h-3 text-rose-600"></i> CADUCADO ${diasTxt}
          </span>
        </div>
      `;
    } else if (m.estado_vencimiento === "POR_VENCER") {
      caducidadHtml = `
        <div class="flex flex-col items-center gap-0.5">
          ${loteDisplay}
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs" title="POR VENCER: Priorizar rotación. Vence: ${m.fecha_vencimiento || ''}">
            <i data-lucide="clock" class="w-3 h-3 text-amber-600"></i> ${m.dias_restantes}d por vencer
          </span>
        </div>
      `;
    } else if (m.estado_vencimiento === "VIGENTE") {
      caducidadHtml = `
        <div class="flex flex-col items-center gap-0.5">
          ${loteDisplay}
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title="VIGENTE: Apto hasta ${m.fecha_vencimiento}">
            <i data-lucide="calendar-check" class="w-3 h-3 text-emerald-600"></i> ${m.fecha_vencimiento}
          </span>
        </div>
      `;
    } else {
      caducidadHtml = `
        <div class="flex flex-col items-center gap-0.5">
          ${loteDisplay}
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-normal bg-slate-50 text-slate-500 border border-slate-200" title="Sin fecha de vencimiento registrada">
            <i data-lucide="help-circle" class="w-3 h-3 text-slate-400"></i> Sin registrar
          </span>
        </div>
      `;
    }

    // Subtítulo descriptivo integrado (Presentación • Concentración • Marcas)
    let detallesExtra = [];
    if (m.presentacion) detallesExtra.push(m.presentacion);
    if (m.concentracion) detallesExtra.push(m.concentracion);
    const subTxt = detallesExtra.join(" • ");
    const marcasTxt = m.marcas_comerciales ? `<span class="italic text-sky-700 font-medium font-sans">(${m.marcas_comerciales})</span>` : "";

    // Botones de acción semánticos de alta visibilidad (Anti-tontos)
    let botonesAcciones = `
      <button type="button" onclick="abrirModalKardex(${m.id}, '${m.nombre}', '${m.presentacion || ''}')"
        class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 hover:border-blue-600 transition shadow-2xs group"
        title="KÁRDEX: Ver historial detallado de movimientos, entradas y salidas de bodega"
        aria-label="Ver Kárdex de ${m.nombre}">
        <i data-lucide="clipboard-list" class="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:scale-110"></i>
      </button>
    `;

    if (puedeEditar) {
      botonesAcciones += `
        <button type="button" onclick="abrirModalEditarMed(${m.id})"
          class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-purple-50 hover:bg-purple-600 text-purple-700 hover:text-white border border-purple-200 hover:border-purple-600 transition shadow-2xs group"
          title="EDITAR: Modificar nombre, presentación, lote o datos de catálogo"
          aria-label="Editar producto ${m.nombre}">
          <i data-lucide="pencil" class="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:scale-110"></i>
        </button>
      `;
    }

    if (puedeAjustar) {
      botonesAcciones += `
        <button type="button" onclick="abrirModalAjusteStock(${m.id})"
          class="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center bg-amber-50 hover:bg-amber-600 text-amber-700 hover:text-white border border-amber-200 hover:border-amber-600 transition shadow-2xs group"
          title="AJUSTE FÍSICO: Corregir cantidad real existente en bodega por conteo físico"
          aria-label="Ajustar stock de ${m.nombre}">
          <i data-lucide="sliders-horizontal" class="w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform group-hover:scale-110"></i>
        </button>
      `;
    }

    const rowVencidaClass = m.estado_vencimiento === "VENCIDO" ? "bg-rose-50/40" : "";

    return `
      <tr class="hover:bg-slate-50/80 transition ${rowVencidaClass}">
        <!-- 1. Código -->
        <td class="py-2.5 px-3">
          <span class="font-mono font-bold text-slate-700 text-xs bg-slate-100 px-2 py-1 rounded-md border border-slate-200/80 whitespace-nowrap">
            ${m.codigo}
          </span>
        </td>

        <!-- 2. Medicamento & Detalles Integrados -->
        <td class="py-2.5 px-3">
          <div class="font-bold text-slate-800 text-xs leading-tight">${m.nombre}</div>
          <div class="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5 mt-0.5">
            ${subTxt ? `<span>${subTxt}</span>` : ''}
            ${marcasTxt ? `<span>${marcasTxt}</span>` : ''}
          </div>
        </td>

        <!-- 3. Lote & Vencimiento -->
        <td class="py-2.5 px-3 text-center whitespace-nowrap">${caducidadHtml}</td>

        <!-- 4. Stock Bodega -->
        <td class="py-2.5 px-3 text-center">
          <span class="text-sm font-black ${m.stock_actual === 0 ? 'text-rose-600' : m.stock_actual <= m.stock_minimo ? 'text-amber-600' : 'text-slate-800'}">
            ${m.stock_actual}
          </span>
        </td>

        <!-- 5. Mínimo -->
        <td class="py-2.5 px-3 text-center font-mono font-semibold text-slate-500 text-xs">${m.stock_minimo}</td>

        <!-- 6. Estado Stock -->
        <td class="py-2.5 px-3 text-center whitespace-nowrap">${badgeHtml}</td>

        <!-- 7. Acciones Semánticas (Iconografía Anti-tontos) -->
        <td class="py-2.5 px-3 text-center whitespace-nowrap">
          <div class="inline-flex items-center gap-1.5 p-1 bg-slate-50/80 rounded-xl border border-slate-200/80 shadow-2xs">
            ${botonesAcciones}
          </div>
        </td>
      </tr>
    `;
  }).join("");

 const setEl = (id, val) => {
 const el = document.getElementById(id);
 if (el) el.textContent = val;
 };
 setEl("metric-inv-total-unidades", totUnidades);
 setEl("metric-inv-disponibles", disponibles);
 setEl("metric-inv-bajos", bajos);
 setEl("metric-inv-agotados", agotados);
 setEl("metric-inv-vigentes", vigentes);
 setEl("metric-inv-porvencer", porVencer);
 setEl("metric-inv-caducados", caducados);
 setEl("metric-inv-sinfecha", sinFecha);

  if (window.lucide) lucide.createIcons();

 const badgeAlertas = document.getElementById("badge-alertas");
 if (badgeAlertas) {
 const totAlertas = bajos + agotados + caducados + porVencer;
 if (totAlertas > 0) {
 badgeAlertas.textContent = totAlertas;
 badgeAlertas.classList.remove("hidden");
 } else {
 badgeAlertas.classList.add("hidden");
 }
 }


 if (window.lucide) lucide.createIcons();
}

function filtrarInventario() {
 const q = document.getElementById("filtro-inv-busqueda") ? document.getElementById("filtro-inv-busqueda").value.toLowerCase().trim() : "";
 const cat = document.getElementById("filtro-inv-categoria") ? document.getElementById("filtro-inv-categoria").value : "";
 const cad = document.getElementById("filtro-inv-caducidad") ? document.getElementById("filtro-inv-caducidad").value : "";

 const filtrados = medicamentosCache.filter(m => {
 const matchQ = !q || m.nombre.toLowerCase().includes(q) || 
 m.codigo.toLowerCase().includes(q) || 
 (m.lote && m.lote.toLowerCase().includes(q)) ||
 (m.marcas_comerciales && m.marcas_comerciales.toLowerCase().includes(q));
 let matchCat = true;
 if (cat === "ALERTAS") {
 matchCat = m.stock_actual <= m.stock_minimo || m.estado_vencimiento === "VENCIDO" || m.estado_vencimiento === "POR_VENCER";
 } else if (cat) {
 matchCat = m.categoria === cat;
 }

 let matchCad = true;
 if (cad) {
 matchCad = m.estado_vencimiento === cad;
 }

 return matchQ && matchCat && matchCad;
 });

 renderInventarioTabla(filtrados);
}

function renderAlertasPanel(lista) {
 const container = document.getElementById("panel-alertas-stock");
 if (!container) return;

 const alertas = lista.filter(m => m.stock_actual <= m.stock_minimo);

 if (alertas.length === 0) {
 container.innerHTML = `<div class="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-800 text-center font-medium flex items-center justify-center gap-2"><i data-lucide="check-check" class="w-4 h-4 text-emerald-600"></i> Todos los medicamentos cuentan con stock óptimo y fechas vigentes.</div>`;
 return;
 }

 container.innerHTML = alertas.map(m => {
 const esAgotado = m.stock_actual === 0;
 return `
 <div class="p-2.5 rounded-xl border ${esAgotado ? 'bg-rose-50/80 border-rose-200 text-rose-900' : 'bg-amber-50/80 border-amber-200 text-amber-900'} flex items-center justify-between">
 <div>
 <div class="font-bold text-xs">${m.nombre} <span class="font-normal text-[11px]">(${m.presentacion || ''})</span></div>
 <div class="text-[11px] opacity-80">${esAgotado ? 'Agotado en percha' : `Quedan solo ${m.stock_actual} unid (Mín: ${m.stock_minimo})`}</div>
 </div>
 <span class="px-2 py-0.5 rounded-full font-bold text-[10px] ${esAgotado ? 'bg-rose-200 text-rose-800' : 'bg-amber-200 text-amber-800'}">
 ${esAgotado ? '0 UNID' : `${m.stock_actual} UNID`}
 </span>
 </div>
 `;
 }).join("");
}

// ================================================================
// 2. EDICIÓN Y AJUSTES DE STOCK (ADMINISTRADOR)
// ================================================================
function abrirModalNuevoMedicamento() {
 if (!tienePermiso("gestionar_medicamentos")) {
 showToast("Permiso Denegado", typeof t === "function" ? t("role_admin_banner") : "Solo el Administrador puede agregar nuevos productos.", "error");
 return;
 }
 const titleEl = document.getElementById("modal-editar-med-title");
 if (titleEl) {
 const titleText = typeof t === "function" ? t("modal_new_title") : "Registrar Nuevo Medicamento / Insumo";
 titleEl.innerHTML = `<i data-lucide="package-plus" class="w-5 h-5 text-purple-600"></i> ${titleText}`;
 }
 const setVal = (id, val) => {
 const el = document.getElementById(id);
 if (el) el.value = val;
 };
 setVal("edit-med-id", "");
 setVal("edit-med-codigo", "AUTO-GENERADO");
 setVal("edit-med-nombre", "");
 setVal("edit-med-presentacion", "");
 setVal("edit-med-concentracion", "");
 setVal("edit-med-marcas", "");
 setVal("edit-med-stockmin", "10");
 setVal("edit-med-stock-inicial", "0");
 setVal("edit-med-lote", "");
 setVal("edit-med-vencimiento", "");

 // Mostrar selector de stock inicial para producto nuevo
 const wNuevo = document.getElementById("wrapper-stock-nuevo-prod");
 if (wNuevo) wNuevo.classList.remove("hidden");

 // Ocultar bloque de stock existente
 const wEdit = document.getElementById("wrapper-stock-info-edit");
 if (wEdit) wEdit.classList.add("hidden");

 const modal = document.getElementById("modal-editar-med");
 if (modal) modal.classList.remove("hidden");
 if (window.lucide) lucide.createIcons();
}

function abrirModalEditarMed(medId) {
 try {
 if (!tienePermiso("gestionar_medicamentos")) {
 showToast("Permiso Denegado", "Solo el Administrador puede modificar los datos del medicamento.", "error");
 return;
 }
 const med = medicamentosCache.find(m => m.id === medId);
 if (!med) {
 console.warn("Medicamento no encontrado con ID:", medId);
 return;
 }

 const titleEl = document.getElementById("modal-editar-med-title");
 if (titleEl) {
 const editLabel = typeof t === "function" ? t("modal_edit_title") : "Editar Ficha Técnica";
 titleEl.innerHTML = `<i data-lucide="edit-3" class="w-5 h-5 text-purple-600"></i> ${editLabel}: ${med.nombre}`;
 }

 const setVal = (id, val) => {
 const el = document.getElementById(id);
 if (el) el.value = val !== undefined && val !== null ? val : "";
 };

 setVal("edit-med-id", med.id);
 setVal("edit-med-codigo", med.codigo);
 setVal("edit-med-categoria", med.categoria);
 setVal("edit-med-nombre", med.nombre);
 setVal("edit-med-presentacion", med.presentacion || "");
 setVal("edit-med-concentracion", med.concentracion || "");
 setVal("edit-med-marcas", med.marcas_comerciales || "");
 setVal("edit-med-stockmin", med.stock_minimo);
 setVal("edit-med-stock-ref", `${med.stock_actual} unid`);
 setVal("edit-med-lote", med.lote || "");
 setVal("edit-med-vencimiento", med.fecha_vencimiento || "");

 // Guardar referencia del ID actual en el botón para ir a Ajuste
 const wEdit = document.getElementById("wrapper-stock-info-edit");
 if (wEdit) {
 wEdit.classList.remove("hidden");
 wEdit.setAttribute("data-med-id", med.id);
 }

 // Ocultar bloque de stock inicial de alta nueva
 const wNuevo = document.getElementById("wrapper-stock-nuevo-prod");
 if (wNuevo) wNuevo.classList.add("hidden");

 const modal = document.getElementById("modal-editar-med");
 if (modal) modal.classList.remove("hidden");
 if (window.lucide) lucide.createIcons();
 } catch (err) {
 console.error("Error al abrir modal de edición:", err);
 showToast("Error", "No se pudo abrir el editor: " + err.message, "error");
 }
}

function irAAjusteDesdeEdit() {
 const wEdit = document.getElementById("wrapper-stock-info-edit");
 const mid = wEdit ? parseInt(wEdit.getAttribute("data-med-id")) : null;
 cerrarModalEditarMed();
 if (mid) {
 abrirModalAjusteStock(mid);
 }
}

function cerrarModalEditarMed() {
 document.getElementById("modal-editar-med").classList.add("hidden");
}

async function guardarMedicamentoAdmin(e) {
 e.preventDefault();
 const mid = document.getElementById("edit-med-id").value;
 const stockInicial = document.getElementById("edit-med-stock-inicial") 
 ? parseInt(document.getElementById("edit-med-stock-inicial").value || 0) 
 : 0;

 const payload = {
 user_role: currentUser.rol,
 usuario_registro: currentUser.usuario,
 admin_nombre: currentUser.nombre_completo,
 id: mid ? parseInt(mid) : null,
 categoria: document.getElementById("edit-med-categoria").value,
 nombre: document.getElementById("edit-med-nombre").value.trim().toUpperCase(),
 presentacion: document.getElementById("edit-med-presentacion").value.trim(),
 concentracion: document.getElementById("edit-med-concentracion").value.trim(),
 marcas_comerciales: document.getElementById("edit-med-marcas").value.trim(),
 stock_minimo: parseInt(document.getElementById("edit-med-stockmin").value || 10),
 stock_inicial: stockInicial,
 lote: document.getElementById("edit-med-lote") ? document.getElementById("edit-med-lote").value.trim().toUpperCase() : null,
 fecha_vencimiento: document.getElementById("edit-med-vencimiento") ? document.getElementById("edit-med-vencimiento").value.trim() : null
 };

 try {
 const res = await fetch("/api/medicamentos/guardar", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(payload)
 });
 const data = await res.json();
 if (!res.ok) {
 showToast("Error", data.error || "No se pudo guardar el medicamento.", "error");
 } else {
 showToast("Guardado con Éxito", data.mensaje, "success");
 cerrarModalEditarMed();
 cargarMedicamentos();
 cargarEstadisticas();
 }
 } catch (err) {
 showToast("Error de Red", err.message, "error");
 }
}

// Modal Ajuste de Stock
function abrirModalAjusteStock(medId) {
 if (!tienePermiso("ajustar_stock")) {
 showToast("Permiso Denegado", "Solo el Administrador puede realizar ajustes manuales de stock.", "error");
 return;
 }
 const med = medicamentosCache.find(m => m.id === medId);
 if (!med) return;

 document.getElementById("ajuste-med-id").value = med.id;
 document.getElementById("ajuste-med-nombre").textContent = `${med.codigo} - ${med.nombre}`;
 document.getElementById("ajuste-med-sub").textContent = `${med.presentacion || ''} ${med.concentracion || ''}`;
 document.getElementById("ajuste-stock-actual").value = `${med.stock_actual} unid`;
 document.getElementById("ajuste-nuevo-stock").value = med.stock_actual;
 document.getElementById("ajuste-motivo").value = "";
 document.getElementById("modal-ajuste-stock").classList.remove("hidden");
 if (window.lucide) lucide.createIcons();
}

function cerrarModalAjusteStock() {
 document.getElementById("modal-ajuste-stock").classList.add("hidden");
}

async function guardarAjusteStockAdmin(e) {
 e.preventDefault();
 const mid = parseInt(document.getElementById("ajuste-med-id").value);
 const nuevoStock = parseInt(document.getElementById("ajuste-nuevo-stock").value);
 const motivo = document.getElementById("ajuste-motivo").value.trim();

 if (!motivo) {
 showToast("Motivo Obligatorio", "Debe justificar el motivo del ajuste para la auditoría de bodega.", "warning");
 return;
 }

 try {
 const res = await fetch("/api/medicamentos/ajuste-stock", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 user_role: currentUser.rol,
 medicamento_id: mid,
 nuevo_stock: nuevoStock,
 motivo: motivo,
 admin_nombre: currentUser.nombre_completo,
 usuario_registro: currentUser.usuario
 })
 });
 const data = await res.json();
 if (!res.ok) {
 showToast("Error en Ajuste", data.error || "No se pudo realizar el ajuste.", "error");
 } else {
 showToast("Ajuste Aplicado", data.mensaje, "success");
 cerrarModalAjusteStock();
 cargarMedicamentos();
 cargarEstadisticas();
 }
 } catch (err) {
 showToast("Error de Red", err.message, "error");
 }
}

// ================================================================
// 3. ATENCIÓN Y RECETA (DESPACHO MULTI-MEDICINA)
// ================================================================
function agregarRenglonReceta() {
 const container = document.getElementById("receta-items");
 if (!container) return;

 const renglonId = ++renglonIdCounter;
 renglonesReceta.push(renglonId);

 const div = document.createElement("div");
 div.id = `renglon-${renglonId}`;
 div.className = "flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl transition";
 div.innerHTML = `
 <div class="flex-1">
 <select id="med-select-${renglonId}" required onchange="actualizarInfoRenglon(${renglonId})" class="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs focus:ring-2 focus:ring-brand-500 focus:outline-none bg-white">
 <option value="">Selecciona medicina o insumo...</option>
 ${medicamentosCache.map(m => {
 const esVencido = m.estado_vencimiento === "VENCIDO";
 const vencTag = esVencido ? " [CADUCADO - NO DISPENSAR]" : (m.estado_vencimiento === "POR_VENCER" ? " [POR VENCER]" : "");
 return `
 <option value="${m.id}" data-stock="${m.stock_actual}" data-smin="${m.stock_minimo}" data-estado-venc="${m.estado_vencimiento || ''}" ${esVencido ? 'disabled class="text-rose-500 bg-rose-50"' : ''}>
 ${m.nombre} (${m.presentacion || ''} ${m.concentracion || ''}) - [Stock: ${m.stock_actual}]${vencTag} ${m.marcas_comerciales ? `| ${m.marcas_comerciales}` : ''}
 </option>
 `;
 }).join("")}
 </select>
 </div>

 <div class="w-full sm:w-28 flex items-center gap-1.5">
 <input type="number" id="med-cant-${renglonId}" required min="1" max="99" value="1" oninput="validarCantRenglon(${renglonId})" class="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-center font-bold focus:ring-2 focus:ring-brand-500 focus:outline-none bg-white">
 <span class="text-[11px] text-slate-500">unid</span>
 </div>

 <div id="med-info-${renglonId}" class="w-full sm:w-32 text-center text-[11px] font-semibold text-slate-500">
 -
 </div>

 <button type="button" onclick="eliminarRenglonReceta(${renglonId})" class="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition" title="Eliminar renglón">
 <i data-lucide="trash-2" class="w-4 h-4"></i>
 </button>
 `;

 container.appendChild(div);
 if (window.lucide) lucide.createIcons();
}

function eliminarRenglonReceta(renglonId) {
 if (renglonesReceta.length <= 1) {
 showToast("Atención", "Debe incluir al menos un medicamento en la consulta.", "warning");
 return;
 }
 const el = document.getElementById(`renglon-${renglonId}`);
 if (el) el.remove();
 renglonesReceta = renglonesReceta.filter(id => id !== renglonId);
}

function actualizarInfoRenglon(renglonId) {
 const sel = document.getElementById(`med-select-${renglonId}`);
 const info = document.getElementById(`med-info-${renglonId}`);
 const cantInput = document.getElementById(`med-cant-${renglonId}`);
 if (!sel || !info) return;

 const opt = sel.options[sel.selectedIndex];
 if (!opt || !opt.value) {
 info.innerHTML = "-";
 return;
 }

 const stock = parseInt(opt.getAttribute("data-stock") || 0);
 cantInput.max = stock > 0 ? stock : 1;

 const estadoVenc = opt.getAttribute("data-estado-venc");
 if (estadoVenc === "VENCIDO") {
 info.innerHTML = `<span class="text-rose-700 font-bold bg-rose-100 border border-rose-300 px-2 py-1 rounded inline-flex items-center gap-1"><i data-lucide="shield-alert" class="w-3.5 h-3.5"></i> CADUCADO</span>`;
 } else if (estadoVenc === "POR_VENCER") {
 info.innerHTML = `<span class="text-amber-700 font-bold bg-amber-100 border border-amber-300 px-2 py-1 rounded inline-flex items-center gap-1"><i data-lucide="clock" class="w-3.5 h-3.5"></i> POR VENCER (${stock})</span>`;
 } else if (stock === 0) {
 info.innerHTML = `<span class="text-rose-600 font-bold bg-rose-50 px-2 py-1 rounded inline-flex items-center gap-1"><i data-lucide="slash" class="w-3.5 h-3.5"></i> Agotado (0)</span>`;
 } else if (stock <= 5) {
 info.innerHTML = `<span class="text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded inline-flex items-center gap-1"><i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i> Stock: ${stock}</span>`;
 } else {
 info.innerHTML = `<span class="text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded inline-flex items-center gap-1"><i data-lucide="check" class="w-3.5 h-3.5"></i> Stock: ${stock}</span>`;
 }
 if (window.lucide) lucide.createIcons();
}

function validarCantRenglon(renglonId) {
 const sel = document.getElementById(`med-select-${renglonId}`);
 const cantInput = document.getElementById(`med-cant-${renglonId}`);
 if (!sel || !cantInput) return;

 const opt = sel.options[sel.selectedIndex];
 if (!opt || !opt.value) return;

 const stock = parseInt(opt.getAttribute("data-stock") || 0);
 const val = parseInt(cantInput.value || 0);

 if (val > stock) {
 showToast("Stock Insuficiente", `Solo hay ${stock} unidades disponibles en bodega para este producto.`, "warning");
 cantInput.value = stock > 0 ? stock : 1;
 }
}

function actualizarSelectoresReceta() {
 renglonesReceta.forEach(renglonId => {
 const sel = document.getElementById(`med-select-${renglonId}`);
 if (!sel) return;
 const currentVal = sel.value;
 sel.innerHTML = `
 <option value="">Selecciona medicina o insumo...</option>
 ${medicamentosCache.map(m => {
 const esVencido = m.estado_vencimiento === "VENCIDO";
 const vencTag = esVencido ? " [CADUCADO - NO DISPENSAR]" : (m.estado_vencimiento === "POR_VENCER" ? " [POR VENCER]" : "");
 return `
 <option value="${m.id}" data-stock="${m.stock_actual}" data-smin="${m.stock_minimo}" data-estado-venc="${m.estado_vencimiento || ''}" ${m.id == currentVal ? 'selected' : ''} ${esVencido ? 'disabled class="text-rose-500 bg-rose-50"' : ''}>
 ${m.nombre} (${m.presentacion || ''} ${m.concentracion || ''}) - [Stock: ${m.stock_actual}]${vencTag} ${m.marcas_comerciales ? `| ${m.marcas_comerciales}` : ''}
 </option>
 `;
 }).join("")}
 `;
 actualizarInfoRenglon(renglonId);
 });
}

function setDiag(texto) {
 const inp = document.getElementById("atencion-diagnostico");
 if (inp) inp.value = texto;
}

// Variables de Estado Clínico
let pacienteAlertaCache = null;
let pacienteSeleccionadoId = null;
let expedienteActualCache = null;

// Cargar Alerta Clínica y Recurrencia por Cédula o ID
async function cargarAlertaClinicaPaciente(cedula, pacienteIdOpt) {
  const cardAlerta = document.getElementById("card-alerta-clinica-paciente");
  const badgeNivel = document.getElementById("badge-alerta-nivel");
  const resumenVisitas = document.getElementById("alerta-resumen-visitas");
  const msgContainer = document.getElementById("alerta-mensajes-container");
  const boxAlergias = document.getElementById("alerta-alergias-box");
  const txtAlergias = document.getElementById("alerta-alergias-texto");

  if (!cedula && !pacienteIdOpt) {
    if (cardAlerta) cardAlerta.classList.add("hidden");
    pacienteAlertaCache = null;
    return;
  }

  try {
    const url = pacienteIdOpt 
      ? `/api/pacientes/alerta-clinica?id=${encodeURIComponent(pacienteIdOpt)}`
      : `/api/pacientes/alerta-clinica?cedula=${encodeURIComponent(cedula)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.existe) {
      if (cardAlerta) cardAlerta.classList.add("hidden");
      pacienteAlertaCache = null;
      pacienteSeleccionadoId = null;
      return;
    }

    pacienteAlertaCache = data;
    pacienteSeleccionadoId = data.paciente.id;

    // Autocompletar antecedentes en el formulario si están vacíos
    const inpAlergias = document.getElementById("pac-alergias");
    const inpApp = document.getElementById("pac-app");
    const inpApf = document.getElementById("pac-apf");
    const inpMedHab = document.getElementById("pac-med-habitual");

    if (inpAlergias && (!inpAlergias.value || inpAlergias.value === "NIEGA") && data.paciente.alergias) {
      inpAlergias.value = data.paciente.alergias;
    }
    if (inpApp && !inpApp.value && data.paciente.antecedentes_personales) {
      inpApp.value = data.paciente.antecedentes_personales;
    }
    if (inpApf && !inpApf.value && data.paciente.antecedentes_familiares) {
      inpApf.value = data.paciente.antecedentes_familiares;
    }
    if (inpMedHab && !inpMedHab.value && data.paciente.medicacion_habitual) {
      inpMedHab.value = data.paciente.medicacion_habitual;
    }

    // Configurar Estilos según Nivel de Alerta
    if (data.alerta_nivel === "CRITICA") {
      cardAlerta.className = "mt-3 p-4 rounded-xl border border-rose-400 bg-rose-50/80 text-xs transition-all animate-fade-in shadow-sm";
      badgeNivel.className = "px-2.5 py-1 rounded-full font-black text-[10px] uppercase tracking-wider bg-rose-600 text-white shadow-sm flex items-center gap-1";
      badgeNivel.innerHTML = `<i data-lucide="alert-octagon" class="w-3.5 h-3.5 inline"></i> ALERTA CLÍNICA CRÍTICA`;
    } else if (data.alerta_nivel === "PRECAUCION") {
      cardAlerta.className = "mt-3 p-4 rounded-xl border border-amber-400 bg-amber-50/80 text-xs transition-all animate-fade-in shadow-sm";
      badgeNivel.className = "px-2.5 py-1 rounded-full font-black text-[10px] uppercase tracking-wider bg-amber-500 text-white shadow-sm flex items-center gap-1";
      badgeNivel.innerHTML = `<i data-lucide="alert-triangle" class="w-3.5 h-3.5 inline"></i> ATENCIÓN: PACIENTE FRECUENTE`;
    } else {
      cardAlerta.className = "mt-3 p-4 rounded-xl border border-emerald-300 bg-emerald-50/50 text-xs transition-all animate-fade-in";
      badgeNivel.className = "px-2.5 py-1 rounded-full font-black text-[10px] uppercase tracking-wider bg-emerald-600 text-white shadow-sm flex items-center gap-1";
      badgeNivel.innerHTML = `<i data-lucide="check" class="w-3.5 h-3.5 inline"></i> ESTADO HABITUAL`;
    }

    resumenVisitas.textContent = `${data.visitas_ultimos_30_dias} consultas en los últimos 30 días (${data.total_visitas} visitas históricas)`;

    // Renderizar Mensajes de Alerta
    msgContainer.innerHTML = (data.alertas || []).map(msg => `
      <div class="flex items-start gap-2 text-slate-800 font-medium">
        <i data-lucide="alert-circle" class="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5"></i>
        <span>${msg}</span>
      </div>
    `).join("");

    // Banner de Alergias
    const alergiaStr = (data.paciente.alergias || "").trim().toUpperCase();
    if (alergiaStr && !["NO", "NO REFIERE", "NINGUNA", "NINGUNO", "NIEGA"].includes(alergiaStr)) {
      boxAlergias.classList.remove("hidden");
      txtAlergias.textContent = `ALERGIA CRÍTICA REPORTADA: ${data.paciente.alergias}. Verifique contraindicaciones antes de prescribir fármacos.`;
    } else {
      boxAlergias.classList.add("hidden");
    }

    cardAlerta.classList.remove("hidden");
    if (window.lucide) lucide.createIcons();
  } catch (err) {
    console.warn("Error al consultar alerta clínica:", err);
  }
}

// Búsqueda predictiva de pacientes
function buscarSugerenciaPaciente(texto) {
 const sugDiv = document.getElementById("pac-sugerencias");
 const q = texto.toLowerCase().trim();
 
 // Si la cédula tiene al menos 8 dígitos, consultar alerta en tiempo real
 if (/^\d{8,10}$/.test(q)) {
   cargarAlertaClinicaPaciente(q);
 }

 if (q.length < 2) {
  sugDiv.classList.add("hidden");
  return;
 }

 const matches = pacientesCache.filter(p => {
  return (p.cedula && p.cedula.includes(q)) || 
  p.nombres.toLowerCase().includes(q) || 
  p.apellidos.toLowerCase().includes(q);
 }).slice(0, 6);

 if (matches.length === 0) {
  sugDiv.classList.add("hidden");
  return;
 }

 sugDiv.innerHTML = matches.map(p => `
  <div onclick='seleccionarSugerenciaPaciente(${JSON.stringify(p)})' class="p-2.5 hover:bg-brand-50 cursor-pointer flex justify-between items-center">
  <div>
  <span class="font-bold text-slate-800">${p.nombres} ${p.apellidos}</span>
  <span class="text-slate-400 ml-1">(${p.cedula || 'Sin cédula'})</span>
  </div>
  <span class="text-[11px] text-brand-600 font-medium">${p.piso_area || ''}</span>
  </div>
 `).join("");

 sugDiv.classList.remove("hidden");
}

function seleccionarSugerenciaPaciente(p) {
 document.getElementById("pac-cedula").value = p.cedula || "";
 document.getElementById("pac-nombres").value = p.nombres || "";
 document.getElementById("pac-apellidos").value = p.apellidos || "";
 document.getElementById("pac-edad").value = p.edad || "";
 document.getElementById("pac-celular").value = p.celular || "";
 document.getElementById("pac-piso").value = p.piso_area || "";
 document.getElementById("pac-sugerencias").classList.add("hidden");

 // Cargar alerta clínica inmediata
 cargarAlertaClinicaPaciente(p.cedula, p.id);
}

// Cálculo automático de IMC con semaforización clínica
function calcularIMCColectivo() {
  const pInput = document.getElementById("atencion-peso");
  const tInput = document.getElementById("atencion-talla");
  const imcInput = document.getElementById("atencion-imc");
  const badgeImc = document.getElementById("badge-imc-resultado");
  const clasifHidden = document.getElementById("atencion-clasificacion-imc");

  if (!pInput || !tInput || !imcInput || !badgeImc) return;

  const peso = parseFloat(pInput.value);
  const talla = parseFloat(tInput.value);

  if (peso > 0 && talla > 50) {
    const alturaM = talla / 100;
    const imc = peso / (alturaM * alturaM);
    const imcRedondeado = imc.toFixed(1);
    imcInput.value = imcRedondeado;

    let clasif = "";
    let badgeClass = "";

    if (imc < 18.5) {
      clasif = "Bajo peso";
      badgeClass = "bg-sky-100 text-sky-800 font-bold border border-sky-300";
    } else if (imc < 25.0) {
      clasif = "Peso normal";
      badgeClass = "bg-emerald-100 text-emerald-800 font-bold border border-emerald-300";
    } else if (imc < 30.0) {
      clasif = "Sobrepeso";
      badgeClass = "bg-amber-100 text-amber-800 font-bold border border-amber-300";
    } else if (imc < 35.0) {
      clasif = "Obesidad Grado I";
      badgeClass = "bg-rose-100 text-rose-800 font-bold border border-rose-300";
    } else {
      clasif = "Obesidad Grado II/III";
      badgeClass = "bg-rose-200 text-rose-950 font-black border border-rose-400";
    }

    badgeImc.textContent = clasif;
    badgeImc.className = `text-[10px] px-2 py-1 rounded-md font-bold truncate flex-1 text-center ${badgeClass}`;
    if (clasifHidden) clasifHidden.value = clasif;
  } else {
    imcInput.value = "";
    badgeImc.textContent = "-";
    badgeImc.className = "text-[10px] px-2 py-1 rounded-md font-bold bg-slate-200 text-slate-600 truncate flex-1 text-center";
    if (clasifHidden) clasifHidden.value = "";
  }
}

// Helpers de Interrogatorio y Rutina
function setTiempoEvolucion(txt) {
  const el = document.getElementById("atencion-tiempo-evolucion");
  if (el) el.value = txt;
}

function setAlergia(txt) {
  const el = document.getElementById("pac-alergias");
  if (el) el.value = txt;
}

function addAPP(txt) {
  const el = document.getElementById("pac-app");
  if (!el) return;
  if (!el.value.trim() || el.value.includes("Aparentemente sano")) {
    el.value = txt;
  } else if (!el.value.includes(txt)) {
    el.value += `, ${txt}`;
  }
}

function setAPP(txt) {
  const el = document.getElementById("pac-app");
  if (el) el.value = txt;
}

function addAPF(txt) {
  const el = document.getElementById("pac-apf");
  if (!el) return;
  if (!el.value.trim() || el.value.includes("No refiere")) {
    el.value = txt;
  } else if (!el.value.includes(txt)) {
    el.value += `, ${txt}`;
  }
}

function setAPF(txt) {
  const el = document.getElementById("pac-apf");
  if (el) el.value = txt;
}

// Acciones desde la tarjeta de Alerta
function abrirModalInformeDesdeAlerta() {
  if (pacienteAlertaCache && pacienteAlertaCache.paciente) {
    abrirModalInformeClinico(pacienteAlertaCache.paciente.id);
  } else {
    showToast("Seleccione Paciente", "Ingrese la cédula de un paciente para emitir el informe.", "warning");
  }
}

function verExpedienteDesdeAlerta() {
  if (pacienteAlertaCache && pacienteAlertaCache.paciente) {
    abrirModalExpediente(pacienteAlertaCache.paciente.id);
  } else {
    showToast("Seleccione Paciente", "Ingrese la cédula de un paciente para ver su expediente.", "warning");
  }
}

// DOBLE VERIFICACIÓN PREVIA AL DESPACHO
function prepararConfirmacionAtencion(e) {
 e.preventDefault();

 if (!tienePermiso("registrar_atenciones")) {
 showToast("Rol de Auditoría", "No tienes permisos para registrar atenciones.", "warning");
 return;
 }

 const fecha = document.getElementById("atencion-fecha").value;
 const cedula = document.getElementById("pac-cedula").value.trim();
 const nombres = document.getElementById("pac-nombres").value.trim();
 const apellidos = document.getElementById("pac-apellidos").value.trim();
 const edad = document.getElementById("pac-edad").value ? parseInt(document.getElementById("pac-edad").value) : null;
 const celular = document.getElementById("pac-celular").value.trim();
 const piso_area = document.getElementById("pac-piso").value.trim();
 const diagnostico = document.getElementById("atencion-diagnostico").value.trim();
 const observaciones = document.getElementById("atencion-obs").value.trim();

 // Datos de Triaje y Signos Vitales
 const pa = document.getElementById("atencion-pa")?.value.trim() || "";
 const fc = document.getElementById("atencion-fc")?.value ? parseInt(document.getElementById("atencion-fc").value) : null;
 const fr = document.getElementById("atencion-fr")?.value ? parseInt(document.getElementById("atencion-fr").value) : null;
 const temp = document.getElementById("atencion-temperatura")?.value ? parseFloat(document.getElementById("atencion-temperatura").value) : null;
 const spo2 = document.getElementById("atencion-spo2")?.value ? parseInt(document.getElementById("atencion-spo2").value) : null;
 const peso = document.getElementById("atencion-peso")?.value ? parseFloat(document.getElementById("atencion-peso").value) : null;
 const talla = document.getElementById("atencion-talla")?.value ? parseFloat(document.getElementById("atencion-talla").value) : null;
 const imc = document.getElementById("atencion-imc")?.value ? parseFloat(document.getElementById("atencion-imc").value) : null;
 const clasificacion_imc = document.getElementById("atencion-clasificacion-imc")?.value.trim() || "";
 const tiempo_evolucion = document.getElementById("atencion-tiempo-evolucion")?.value.trim() || "";
 const examen_fisico = document.getElementById("atencion-examen-fisico")?.value.trim() || "";

 // Antecedentes
 const alergias = document.getElementById("pac-alergias")?.value.trim() || "";
 const ant_personales = document.getElementById("pac-app")?.value.trim() || "";
 const ant_familiares = document.getElementById("pac-apf")?.value.trim() || "";
 const med_habitual = document.getElementById("pac-med-habitual")?.value.trim() || "";

 const medItems = [];
 const medSummaryList = [];

 for (let rId of renglonesReceta) {
 const sel = document.getElementById(`med-select-${rId}`);
 const cantInput = document.getElementById(`med-cant-${rId}`);
 if (sel && sel.value) {
 const mid = parseInt(sel.value);
 const cant = parseInt(cantInput.value || 1);
 const med = medicamentosCache.find(m => m.id === mid);
 const nombreMed = med ? med.nombre : "Medicina";
 const presMed = med ? (med.presentacion || "") : "";
 const stockActual = med ? med.stock_actual : 0;

 // Validación preventiva de caducidad y stock en cliente
 if (med && med.estado_vencimiento === "VENCIDO") {
  showToast("Medicamento Caducado", `El producto '${nombreMed}' (${presMed}) se encuentra caducado y no puede ser dispensado por norma sanitaria.`, "error");
  return;
 }

 if (cant > stockActual) {
  showToast("Stock Insuficiente", `Solo hay ${stockActual} unidades disponibles en bodega de '${nombreMed}'.`, "warning");
  return;
 }

 medItems.push({
 medicamento_id: mid,
 cantidad: cant
 });

 medSummaryList.push(`
 <div class="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg">
 <div>
 <span class="font-bold text-slate-800">${nombreMed}</span>
 <span class="text-slate-500 ml-1">(${presMed})</span>
 </div>
 <div class="text-right">
 <span class="font-black text-brand-700 bg-brand-50 px-2 py-0.5 rounded">${cant} unid</span>
 <span class="text-[10px] text-slate-400 block">Stock queda: ${Math.max(0, stockActual - cant)}</span>
 </div>
 </div>
 `);
 }
 }

 // RESTRICCIÓN ASISTENCIAL PARA AUXILIAR DE ENFERMERÍA (PREVENCIÓN DE NEGLIGENCIA)
 if (currentUser.rol === "AUXILIAR_ENFERMERIA" && medItems.length > 0) {
   showToast("Prescripción Restringida", "El rol Auxiliar de Enfermería no está facultado legalmente para recetar ni entregar medicamentos por su cuenta. Guarde la consulta como triaje/toma de signos vitales para validación de la Licenciada Titular.", "warning");
   return;
 }

 // Si no hay medicamentos, se permite guardar como atención de triaje o valoración clínica
 if (medItems.length === 0) {
   if (currentUser.rol === "AUXILIAR_ENFERMERIA") {
     medSummaryList.push(`
       <div class="p-3 bg-sky-50 border border-sky-200 rounded-lg text-sky-800 text-xs font-semibold text-center">
         <i data-lucide="shield-check" class="w-4 h-4 inline mr-1 text-sky-600"></i>
         Atención registrada como Triaje y Toma de Signos Vitales (Sin despacho de fármacos).
       </div>
     `);
   } else {
     medSummaryList.push(`
       <div class="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-xs font-semibold text-center">
         <i data-lucide="stethoscope" class="w-4 h-4 inline mr-1 text-brand-600"></i>
         Consulta médica / Curación / Derivación sin entrega de medicamentos.
       </div>
     `);
   }
 }

 atencionPendiente = {
 fecha,
 paciente: { 
   id: pacienteSeleccionadoId || null,
   cedula, 
   nombres, 
   apellidos, 
   edad, 
   celular, 
   piso_area,
   alergias,
   antecedentes_personales: ant_personales,
   antecedentes_familiares: ant_familiares,
   medicacion_habitual: med_habitual
 },
 diagnostico,
 observaciones,
 presion_arterial: pa,
 frecuencia_cardiaca: fc,
 frecuencia_respiratoria: fr,
 temperatura: temp,
 saturacion_oxigeno: spo2,
 peso,
 talla,
 imc,
 clasificacion_imc,
 tiempo_evolucion,
 examen_fisico,
 alergias,
 antecedentes_personales: ant_personales,
 antecedentes_familiares: ant_familiares,
 medicacion_habitual: med_habitual,
 medicamentos: medItems,
 usuario_registro: currentUser.usuario,
 user_role: currentUser.rol,
 usuario_nombre: currentUser.nombre_completo
 };

 document.getElementById("confirm-paciente-nombre").textContent = `${nombres} ${apellidos}`;
 document.getElementById("confirm-paciente-detalle").textContent = `C.I: ${cedula || 'S/C'} • Área: ${piso_area || 'General'}`;
 document.getElementById("confirm-diagnostico").textContent = diagnostico;

 // Resumen de signos vitales en el modal de confirmación
 const signosListHtml = [];
 if (pa) signosListHtml.push(`PA: ${pa}`);
 if (fc) signosListHtml.push(`FC: ${fc} lpm`);
 if (temp) signosListHtml.push(`Temp: ${temp}°C`);
 if (spo2) signosListHtml.push(`SpO2: ${spo2}%`);
 if (imc) signosListHtml.push(`IMC: ${imc} (${clasificacion_imc})`);

 const signosPreview = signosListHtml.length > 0 
   ? `<div class="mb-2 p-2 bg-brand-50/60 border border-brand-200 rounded-lg text-[11px] text-brand-900 font-medium"><strong>Signos vitales registrados:</strong> ${signosListHtml.join(" • ")}</div>` 
   : '';

 document.getElementById("confirm-meds-list").innerHTML = signosPreview + medSummaryList.join("");

 document.getElementById("modal-confirmar-despacho").classList.remove("hidden");
 if (window.lucide) lucide.createIcons();
}

function cerrarModalConfirmacion() {
 document.getElementById("modal-confirmar-despacho").classList.add("hidden");
 const errBox = document.getElementById("confirm-despacho-error");
 if (errBox) errBox.classList.add("hidden");
 atencionPendiente = null;
}

async function ejecutarGuardadoAtencion() {
 if (!atencionPendiente) return;

 const btn = document.getElementById("btn-confirmar-definitivo");
 const errBox = document.getElementById("confirm-despacho-error");
 const errTxt = document.getElementById("confirm-despacho-error-msg");
 if (errBox) errBox.classList.add("hidden");

 btn.disabled = true;
 btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Descontando de bodega...`;
 if (window.lucide) lucide.createIcons();

 try {
 const res = await fetch("/api/atenciones", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(atencionPendiente)
 });

 const data = await res.json();
 if (!res.ok) {
  const msg = data.error || "No se pudo registrar la atención.";
  if (errBox && errTxt) {
   errBox.classList.remove("hidden");
   errTxt.textContent = msg;
  }
  showToast("Error en Despacho", msg, "error");
  if (window.lucide) lucide.createIcons();
 } else {
 showToast("¡Atención y Despacho Registrados!", `${data.mensaje} Paciente: ${data.paciente}.`, "success");
 
 // Si la atención provino de un ticket de piso, marcarlo automáticamente como ATENDIDO
 

 cerrarModalConfirmacion();
 resetFormAtencion();
 cargarMedicamentos();
 cargarPacientes();
 cargarEstadisticas();
 cargarHistorial();
 }
 } catch (err) {
  const errMsg = err.message || "Error de conexión con el servidor.";
  if (errBox && errTxt) {
   errBox.classList.remove("hidden");
   errTxt.textContent = errMsg;
  }
  showToast("Error de Conexión", errMsg, "error");
  if (window.lucide) lucide.createIcons();
 } finally {
 btn.disabled = false;
 btn.innerHTML = `Confirmar y Despachar`;
 if (window.lucide) lucide.createIcons();
 }
}

// ANULACIÓN DE ATENCIÓN Y REVERSIÓN DE STOCK
function abrirModalAnulacion(atencionId, pacienteNombreOpt, medsSummaryOpt) {
 if (!tienePermiso("anular_atenciones")) {
  showToast("Acceso Denegado", "Tu rol no tiene autorización para anular atenciones médicas.", "error");
  return;
 }



 // Buscar en atencionesCache o pacienteHistorialCache
 let at = atencionesCache.find(a => a.id === atencionId);
 if (!at && pacienteHistorialCache) {
 at = pacienteHistorialCache.find(a => a.id === atencionId);
 }

 let pacNombre = pacienteNombreOpt;
 let medsHtml = medsSummaryOpt;

 if (at) {
 if (!pacNombre) pacNombre = `${at.nombres || ''} ${at.apellidos || ''}`.trim() || "Trabajador";
 if (!medsHtml) {
 if (at.medicamentos && at.medicamentos.length > 0) {
 medsHtml = at.medicamentos.map(m => `&bull; ${m.nombre} (${m.presentacion || ''}) x${m.cantidad} unidades`).join("<br>");
 } else {
 medsHtml = "Sin medicinas registradas";
 }
 }
 }

 document.getElementById("anular-atencion-id").value = atencionId;
 document.getElementById("anular-info-id").textContent = `#${atencionId}`;
 document.getElementById("anular-info-paciente").textContent = pacNombre || `#${atencionId}`;
 document.getElementById("anular-info-meds").innerHTML = medsHtml || "Sin medicinas";
 document.getElementById("anular-motivo").value = "";

 document.getElementById("modal-anular-atencion").classList.remove("hidden");
 if (window.lucide) lucide.createIcons();
}

function cerrarModalAnulacion() {
 document.getElementById("modal-anular-atencion").classList.add("hidden");
}

async function ejecutarAnulacionAtencion(e) {
 e.preventDefault();
 const atencionId = parseInt(document.getElementById("anular-atencion-id").value);
 const motivo = document.getElementById("anular-motivo").value.trim();

 if (!motivo) {
 showToast("Motivo Obligatorio", "Debe ingresar una justificación para revertir la consulta y devolver el stock.", "warning");
 return;
 }

 const btn = document.getElementById("btn-confirmar-anulacion");
 btn.disabled = true;
 btn.innerHTML = `<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Reversando stock...`;

 try {
 const res = await fetch("/api/atenciones/anular", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 atencion_id: atencionId,
 motivo_anulacion: motivo,
 motivo: motivo,
 usuario_nombre: currentUser.nombre_completo,
 usuario_anula: currentUser.usuario,
 user_role: currentUser.rol,
 rol: currentUser.rol
 })
 });

 const data = await res.json();
 if (!res.ok) {
 showToast("Error al Anular", data.error || "No se pudo anular la atención.", "error");
 } else {
 showToast("Consulta Reversada", data.mensaje, "warning");
 cerrarModalAnulacion();
 cerrarModalExpediente();
 cargarMedicamentos();
 cargarPacientes();
 cargarEstadisticas();
 cargarHistorial();
 }
 } catch (err) {
 showToast("Error de Red", err.message, "error");
 } finally {
 btn.disabled = false;
 btn.innerHTML = `Confirmar Anulación y Devolver`;
 if (window.lucide) lucide.createIcons();
 }
}

function resetFormAtencion() {
 document.getElementById("form-atencion").reset();
 initFechaHoy();
 document.getElementById("pac-sugerencias").classList.add("hidden");
 const cardAlerta = document.getElementById("card-alerta-clinica-paciente");
 if (cardAlerta) cardAlerta.classList.add("hidden");
 const badgeImc = document.getElementById("badge-imc-resultado");
 if (badgeImc) {
   badgeImc.textContent = "-";
   badgeImc.className = "text-[10px] px-2 py-1 rounded-md font-bold bg-slate-200 text-slate-600 truncate flex-1 text-center";
 }
 pacienteAlertaCache = null;
 pacienteSeleccionadoId = null;
 const container = document.getElementById("receta-items");
 container.innerHTML = "";
 renglonesReceta = [];
 renglonIdCounter = 0;
 agregarRenglonReceta();
}

// ================================================================
// 4. ENTRADA A BODEGA (KARDEX REPOSICIÓN)
// ================================================================
function actualizarSelectorEntradaModal(lista) {
 const sel = document.getElementById("entrada-med-id");
 if (!sel) return;
 sel.innerHTML = `
 <option value="">Seleccione el producto...</option>
 ${lista.map(m => `
 <option value="${m.id}">${m.nombre} (${m.presentacion || ''}) [Stock actual: ${m.stock_actual}]</option>
 `).join("")}
 `;
}

function abrirModalEntrada() {
 if (!tienePermiso("registrar_entradas")) {
 showToast("Rol de Auditoría", "No tienes permisos para registrar entradas.", "warning");
 return;
 }
 initFechaHoy();
 document.getElementById("modal-entrada").classList.remove("hidden");
 if (window.lucide) lucide.createIcons();
}

function cerrarModalEntrada() {
 document.getElementById("modal-entrada").classList.add("hidden");
 document.getElementById("form-entrada").reset();
}

async function guardarEntradaBodega(e) {
 e.preventDefault();
 const mid = parseInt(document.getElementById("entrada-med-id").value);
 const cant = parseInt(document.getElementById("entrada-cantidad").value);
 const fecha = document.getElementById("entrada-fecha").value;
 const proveedor = document.getElementById("entrada-proveedor").value;
 const factura = document.getElementById("entrada-factura").value;
 const lote = document.getElementById("entrada-lote") ? document.getElementById("entrada-lote").value.trim().toUpperCase() : "";
 const fechaVencimiento = document.getElementById("entrada-vencimiento") ? document.getElementById("entrada-vencimiento").value.trim() : null;
 const observaciones = document.getElementById("entrada-obs").value;

 try {
 const res = await fetch("/api/entradas", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 user_role: currentUser.rol,
 usuario_nombre: currentUser.nombre_completo,
 usuario_registro: currentUser.usuario,
 medicamento_id: mid,
 cantidad: cant,
 fecha,
 proveedor,
 factura,
 lote,
 fecha_vencimiento: fechaVencimiento,
 observaciones
 })
 });
 const data = await res.json();
 if (!res.ok) {
 showToast("Error", data.error || "No se pudo registrar la entrada.", "error");
 } else {
 showToast("Ingreso a Bodega Exitoso", data.mensaje, "success");
 cerrarModalEntrada();
 cargarMedicamentos();
 cargarEstadisticas();
 }
 } catch (err) {
 showToast("Error de Red", err.message, "error");
 }
}

// ================================================================
// 5. KARDEX MOVIMIENTOS DETALLADOS
// ================================================================
async function abrirModalKardex(medId, medNombre, medPres) {
 document.getElementById("kardex-med-titulo").textContent = `Kardex: ${medNombre}`;
 document.getElementById("kardex-med-sub").textContent = `Presentación: ${medPres || 'N/A'} - Movimientos cronológicos`;

 const tbody = document.getElementById("tabla-kardex-modal-body");
 tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-slate-400">Cargando movimientos...</td></tr>`;
 document.getElementById("modal-kardex").classList.remove("hidden");
 if (window.lucide) lucide.createIcons();

 try {
 const res = await fetch(`/api/kardex?medicamento_id=${medId}`);
 const list = await res.json();

 if (list.length === 0) {
 tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-slate-400">Sin movimientos registrados.</td></tr>`;
 return;
 }

 tbody.innerHTML = list.map(k => {
 let badge = "";
 if (k.tipo_movimiento === "ENTRADA" || k.tipo_movimiento === "INVENTARIO_INICIAL") {
 badge = `<span class="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">+ ENTRADA</span>`;
 } else if (k.tipo_movimiento === "AJUSTE_AUDITORIA") {
 badge = `<span class="bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded text-[10px] inline-flex items-center gap-1"><i data-lucide="sliders" class="w-3 h-3 text-purple-600"></i> AJUSTE</span>`;
 } else if (k.tipo_movimiento === "REVERSION_ANULACION") {
 badge = `<span class="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded text-[10px]">↩️ REVERSIÓN</span>`;
 } else {
 badge = `<span class="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded text-[10px]">- SALIDA</span>`;
 }

 return `
 <tr class="hover:bg-slate-50">
 <td class="py-2 px-3 font-mono text-slate-600">${k.fecha}</td>
 <td class="py-2 px-3">${badge}</td>
 <td class="py-2 px-3 text-slate-700 font-medium">${k.concepto}</td>
 <td class="py-2 px-3 text-center font-bold ${k.tipo_movimiento.includes('SALIDA') ? 'text-rose-600' : 'text-emerald-600'}">
 ${k.tipo_movimiento.includes('SALIDA') ? `-${k.cantidad}` : `+${k.cantidad}`}
 </td>
 <td class="py-2 px-3 text-center text-slate-400">${k.stock_anterior}</td>
 <td class="py-2 px-3 text-center font-bold text-slate-800 bg-slate-50">${k.stock_nuevo}</td>
 <td class="py-2 px-3 text-slate-600 font-mono text-[11px]">${k.usuario_registro || 'sistema'}</td>
 </tr>
 `;
 }).join("");
 } catch (err) {
 tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-rose-500">Error al cargar Kardex: ${err.message}</td></tr>`;
 }
}

function cerrarModalKardex() {
 document.getElementById("modal-kardex").classList.add("hidden");
}

// ================================================================
// 6. EXPEDIENTE DE PACIENTES
// ================================================================
function getPacientesFiltradosYOrdenados() {
  let lista = [...pacientesCache];
  const q = (document.getElementById("filtro-pac-busqueda")?.value || "").toLowerCase().trim();
  if (q) {
    lista = lista.filter(p => {
      const nom = (p.nombres || "").toLowerCase();
      const ape = (p.apellidos || "").toLowerCase();
      const pacCompleto = `${nom} ${ape}`;
      const ced = (p.cedula || "").toLowerCase();
      const area = (p.piso_area || "").toLowerCase();
      return nom.includes(q) || ape.includes(q) || pacCompleto.includes(q) || ced.includes(q) || area.includes(q);
    });
  }

  if (ordenPacientesActual === "alpha") {
    lista.sort((a, b) => `${a.nombres} ${a.apellidos}`.localeCompare(`${b.nombres} ${b.apellidos}`));
  } else if (ordenPacientesActual === "alphadesc") {
    lista.sort((a, b) => `${b.nombres} ${b.apellidos}`.localeCompare(`${a.nombres} ${a.apellidos}`));
  } else if (ordenPacientesActual === "oldest") {
    // Más antiguos primero (ID menor o fecha de creación)
    lista.sort((a, b) => (a.id || 0) - (b.id || 0));
  } else {
    // Recientes primero: por ID descendente (últimos registrados / atendidos)
    lista.sort((a, b) => (b.id || 0) - (a.id || 0));
  }

  return lista;
}

function actualizarVistaPacientes() {
  const filtrados = getPacientesFiltradosYOrdenados();
  renderPacientesTabla(filtrados);
}

async function cargarPacientes() {
  try {
    const res = await apiFetch("/api/pacientes");
    pacientesCache = await res.json();
    actualizarVistaPacientes();
  } catch (err) {
    console.error("Error al cargar pacientes:", err);
  }
}

function renderPacientesTabla(lista) {
  const tbody = document.getElementById("tabla-pacientes-body");
  if (!tbody) return;

  if (lista.length === 0) {
    const q = (document.getElementById("filtro-pac-busqueda")?.value || "").trim();
    if (q) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400">
        <div class="flex flex-col items-center gap-1">
          <i data-lucide="search-x" class="w-7 h-7 text-slate-300 mb-1"></i>
          <span class="font-semibold text-slate-600">No se encontró ningún paciente que coincida con "${q}"</span>
          <span class="text-[11px] text-slate-400">Verifica el nombre o número de cédula.</span>
        </div>
      </td></tr>`;
    } else {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">No se encontraron pacientes registrados.</td></tr>`;
    }
    if (window.lucide) lucide.createIcons();
    return;
  }

  tbody.innerHTML = lista.map(p => `
    <tr class="hover:bg-slate-50/80 transition">
      <td class="py-2.5 px-4 font-mono font-medium text-slate-700">${p.cedula || '<span class="text-slate-300">S/C</span>'}</td>
      <td class="py-2.5 px-4 font-bold text-slate-800">${p.nombres} ${p.apellidos}</td>
      <td class="py-2.5 px-4 text-center text-slate-600">${p.edad || '-'}</td>
      <td class="py-2.5 px-4 text-slate-600">${p.celular || '-'}</td>
      <td class="py-2.5 px-4 text-slate-600">${p.piso_area || '-'}</td>
      <td class="py-2.5 px-4 text-center">
        <span class="bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full text-[11px]">${p.total_atenciones} visitas</span>
      </td>
      <td class="py-2.5 px-4 text-center font-mono text-slate-500">${p.ultima_visita || '-'}</td>
      <td class="py-2.5 px-4 text-center whitespace-nowrap">
        <div class="inline-flex items-center gap-1.5">
          <button onclick="abrirModalExpediente(${p.id})" class="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded-lg transition" title="Ver Historial Clínico">
            <i data-lucide="folder-open" class="w-3.5 h-3.5"></i> ${typeof t === "function" ? t("btn_ver_expediente") : "Historial"}
          </button>
          <button onclick="abrirModalEditarPaciente(${p.id})" class="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg transition" title="Editar Datos del Paciente">
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> ${typeof t === "function" ? t("btn_editar_paciente") : "Editar"}
          </button>
        </div>
      </td>
    </tr>
  `).join("");

  if (window.lucide) lucide.createIcons();
}

function buscarPacientes(texto) {
  actualizarVistaPacientes();
}

async function abrirModalExpediente(pid) {
  document.getElementById("modal-expediente").classList.remove("hidden");
  if (window.lucide) lucide.createIcons();

  try {
    const res = await fetch(`/api/pacientes/${pid}/historial`);
    const pac = await res.json();
    expedienteActualCache = pac;
    pacienteHistorialCache = pac.historial || [];

    document.getElementById("exp-pac-nombre").textContent = `${pac.nombres} ${pac.apellidos}`;
    document.getElementById("exp-pac-sub").textContent = `Expediente Clínico Ocupacional • C.I: ${pac.cedula || 'S/C'}`;
    document.getElementById("exp-pac-cedula").textContent = pac.cedula || "No registrada";
    document.getElementById("exp-pac-contacto").textContent = `${pac.edad ? pac.edad + ' años' : 'Edad N/D'} • Cel: ${pac.celular || 'N/D'}`;
    document.getElementById("exp-pac-piso").textContent = pac.piso_area || "No especificado";
    document.getElementById("exp-pac-total-visitas").textContent = `${pac.historial ? pac.historial.length : 0} atenciones`;

    // Alergias y antecedentes
    const expAlergias = document.getElementById("exp-pac-alergias");
    const alergiaStr = (pac.alergias || "").trim().toUpperCase();
    if (alergiaStr && !["NO", "NO REFIERE", "NINGUNA", "NINGUNO", "NIEGA"].includes(alergiaStr)) {
      expAlergias.textContent = pac.alergias;
      expAlergias.className = "font-black text-rose-700 text-xs mt-0.5 block";
    } else {
      expAlergias.textContent = "Niega alergias medicamentosas";
      expAlergias.className = "font-semibold text-emerald-700 text-xs mt-0.5 block";
    }

    document.getElementById("exp-pac-app").textContent = pac.antecedentes_personales || "Sin antecedentes patológicos declarados";
    document.getElementById("exp-pac-med-habitual").textContent = `Medicación: ${pac.medicacion_habitual || 'Ninguna'} • Familiares: ${pac.antecedentes_familiares || 'No refiere'}`;

    // Conteo de informes
    const numInformes = (pac.informes || []).length;
    document.getElementById("exp-conteo-informes").textContent = numInformes;

    // Renderizar Consultas
    const atListDiv = document.getElementById("exp-atenciones-list");
    if (!pac.historial || pac.historial.length === 0) {
      atListDiv.innerHTML = `<div class="p-4 text-center text-slate-400 bg-slate-50 rounded-xl">Sin consultas registradas para este paciente.</div>`;
    } else {
      const puedeAnular = currentUser.rol === "ADMINISTRADOR" || tienePermiso("anular_atenciones");

      atListDiv.innerHTML = pac.historial.map(at => {
        const esAnulada = at.estado === "ANULADA";
        const medListHtml = at.medicamentos && at.medicamentos.length > 0 
          ? at.medicamentos.map(m => `<span class="bg-white border ${esAnulada ? 'border-slate-200 text-slate-400 line-through' : 'border-slate-200 text-slate-700'} px-2 py-0.5 rounded text-[11px] font-medium">${m.nombre} (${m.presentacion || ''}) x${m.cantidad}</span>`).join(" ")
          : `<span class="text-slate-500 italic text-[11px] bg-white border border-slate-200 px-2 py-0.5 rounded">Consulta / Triaje / Sin medicamentos</span>`;

        let anularBtnHtml = "";
        if (!esAnulada && puedeAnular) {
          anularBtnHtml = `
            <button onclick="abrirModalAnulacion(${at.id})" class="text-[10px] font-bold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-lg border border-rose-200 transition" title="Anular consulta y devolver stock a bodega">
              Anular
            </button>
          `;
        }

        // Construir badges de signos vitales
        const svBadges = [];
        if (at.presion_arterial) svBadges.push(`<span class="bg-sky-50 text-sky-800 border border-sky-200 px-2 py-0.5 rounded text-[10px] font-mono font-bold">PA: ${at.presion_arterial}</span>`);
        if (at.frecuencia_cardiaca) svBadges.push(`<span class="bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 rounded text-[10px] font-medium">FC: ${at.frecuencia_cardiaca} lpm</span>`);
        if (at.temperatura) svBadges.push(`<span class="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[10px] font-medium">Temp: ${at.temperatura}°C</span>`);
        if (at.saturacion_oxigeno) svBadges.push(`<span class="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-[10px] font-medium">SpO2: ${at.saturacion_oxigeno}%</span>`);
        if (at.imc) svBadges.push(`<span class="bg-purple-50 text-purple-800 border border-purple-200 px-2 py-0.5 rounded text-[10px] font-medium">IMC: ${at.imc} (${at.clasificacion_imc || ''})</span>`);

        return `
          <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 ${esAnulada ? 'opacity-70 bg-slate-100/60' : ''}">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="font-mono font-bold text-slate-800 text-xs">${at.fecha}</span>
                ${esAnulada 
                  ? `<span class="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded text-[10px]" title="${at.motivo_anulacion || ''}">ANULADA</span>`
                  : `<span class="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">ACTIVA</span>`}
                <span class="text-[10px] text-slate-500">Atendido por: <strong>${at.usuario_registro || 'Enfermería'}</strong></span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-[11px] text-brand-600 font-semibold bg-brand-50 px-2 py-0.5 rounded">Atención #${at.id}</span>
                ${anularBtnHtml}
              </div>
            </div>

            <!-- Signos Vitales de la Consulta -->
            ${svBadges.length > 0 ? `
              <div class="flex flex-wrap gap-1.5 pt-0.5">
                ${svBadges.join("")}
              </div>
            ` : ''}

            <!-- Diagnóstico y Tiempo Evolución -->
            <div class="text-slate-800 text-xs">
              <strong>Motivo / Diagnóstico:</strong> <span class="font-medium ${esAnulada ? 'line-through text-slate-400' : 'text-slate-900'}">${at.diagnostico}</span>
              ${at.tiempo_evolucion ? `<span class="ml-2 text-slate-500 text-[11px]">(Evolución: ${at.tiempo_evolucion})</span>` : ''}
            </div>

            <!-- Observaciones / Indicaciones Clínicas de la Enfermera -->
            <div class="bg-white p-2.5 rounded-lg border border-slate-200 text-xs text-slate-700">
              <strong class="text-brand-900 flex items-center gap-1 mb-0.5 text-[11px]">
                <i data-lucide="clipboard-check" class="w-3.5 h-3.5 text-brand-600"></i>
                Observaciones e Indicaciones Médicas:
              </strong>
              <p class="leading-relaxed whitespace-pre-wrap">${at.observaciones ? at.observaciones : '<span class="text-slate-400 italic">Sin observaciones adicionales.</span>'}</p>
            </div>

            <!-- Medicinas Prescritas -->
            <div class="pt-1 flex flex-wrap gap-1 items-center">
              <span class="text-[10px] uppercase font-bold text-slate-400">Medicamentos Despachados:</span>
              ${medListHtml}
            </div>

            ${esAnulada && at.motivo_anulacion ? `
              <div class="text-[11px] text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200">
                <strong>Motivo de anulación:</strong> ${at.motivo_anulacion} (por ${at.anulado_por || 'admin'})
              </div>
            ` : ''}
          </div>
        `;
      }).join("");
    }

    // Renderizar Informes y Derivaciones
    const infListDiv = document.getElementById("exp-informes-list");
    if (!pac.informes || pac.informes.length === 0) {
      infListDiv.innerHTML = `<div class="p-4 text-center text-slate-400 bg-slate-50 rounded-xl">No registra informes clínicos ni derivaciones formalmente emitidas.</div>`;
    } else {
      infListDiv.innerHTML = pac.informes.map(inf => `
        <div class="p-3.5 bg-rose-50/50 border border-rose-200 rounded-xl flex items-center justify-between text-xs">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="font-mono font-bold text-slate-800 text-xs">${inf.fecha}</span>
              <span class="px-2 py-0.5 bg-rose-200 text-rose-900 font-bold text-[10px] rounded uppercase">${inf.tipo_informe}</span>
              <span class="text-[11px] text-slate-500">Emisor: ${inf.profesional_nombre}</span>
            </div>
            <p class="font-bold text-slate-900 text-xs">${inf.motivo_derivacion}</p>
            <p class="text-[11px] text-slate-600 line-clamp-1">${inf.detalles_informe}</p>
          </div>
          <button onclick="verInformeClinico(${inf.id})" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-300 hover:bg-rose-50 text-rose-700 font-bold rounded-lg text-xs transition shadow-sm shrink-0 ml-3">
            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
            Ver / Imprimir
          </button>
        </div>
      `).join("");
    }

    cambiarVistaExpediente("consultas");
    if (window.lucide) lucide.createIcons();

  } catch (err) {
    console.error("Error al cargar expediente:", err);
  }
}

function cambiarVistaExpediente(vista) {
  const btnCons = document.getElementById("tab-exp-btn-consultas");
  const btnInf = document.getElementById("tab-exp-btn-informes");
  const secCons = document.getElementById("exp-seccion-consultas");
  const secInf = document.getElementById("exp-seccion-informes");

  if (!btnCons || !btnInf || !secCons || !secInf) return;

  if (vista === "informes") {
    btnCons.className = "px-3 py-1.5 rounded-lg font-semibold text-xs bg-slate-100 hover:bg-slate-200 text-slate-700";
    btnInf.className = "px-3 py-1.5 rounded-lg font-bold text-xs bg-rose-700 text-white shadow-sm";
    secCons.classList.add("hidden");
    secInf.classList.remove("hidden");
  } else {
    btnCons.className = "px-3 py-1.5 rounded-lg font-bold text-xs bg-brand-600 text-white shadow-sm";
    btnInf.className = "px-3 py-1.5 rounded-lg font-semibold text-xs bg-slate-100 hover:bg-slate-200 text-slate-700";
    secCons.classList.remove("hidden");
    secInf.classList.add("hidden");
  }
  if (window.lucide) lucide.createIcons();
}

function cerrarModalExpediente() {
  document.getElementById("modal-expediente").classList.add("hidden");
}

function imprimirExpedienteCompleto() {
  window.print();
}

// ----------------------------------------------------------------
// GESTIÓN DE INFORMES CLÍNICOS, DERIVACIÓN Y DESLINDE
// ----------------------------------------------------------------
function abrirModalInformeDesdeExpediente() {
  if (expedienteActualCache && expedienteActualCache.id) {
    abrirModalInformeClinico(expedienteActualCache.id);
  }
}

function abrirModalInformeClinico(pacienteId, atencionIdOpt) {
  const p = (expedienteActualCache && expedienteActualCache.id === pacienteId) 
    ? expedienteActualCache 
    : (pacienteAlertaCache && pacienteAlertaCache.paciente && pacienteAlertaCache.paciente.id === pacienteId)
      ? pacienteAlertaCache.paciente
      : pacientesCache.find(x => x.id === pacienteId);

  if (!p) {
    showToast("Error", "No se encontró información del paciente.", "error");
    return;
  }

  document.getElementById("inf-paciente-id").value = p.id;
  document.getElementById("inf-atencion-id").value = atencionIdOpt || "";
  document.getElementById("inf-pac-nombre").textContent = `${p.nombres} ${p.apellidos}`;
  document.getElementById("inf-pac-detalles").textContent = `C.I: ${p.cedula || 'S/C'} • Área: ${p.piso_area || 'General'} • Edad: ${p.edad || 'N/D'}`;
  document.getElementById("inf-fecha").value = new Date().toISOString().split("T")[0];
  document.getElementById("inf-motivo").value = "";
  document.getElementById("inf-detalles").value = "";
  document.getElementById("inf-recomendaciones").value = "Se recomienda acudir a consulta médica externa o de especialidad de manera obligatoria y prioritaria. Suspender automedicación analgésica repetitiva.";
  document.getElementById("inf-prof-nombre").value = currentUser?.nombre_completo || "Lic. Patricia Pilataxi";
  document.getElementById("inf-prof-rol").value = currentUser?.rol === "ADMINISTRADOR" ? "Médico / Director Técnico" : "Enfermera Titular FYDI";

  document.getElementById("modal-informe-clinico").classList.remove("hidden");
  if (window.lucide) lucide.createIcons();
}

function cerrarModalInformeClinico() {
  document.getElementById("modal-informe-clinico").classList.add("hidden");
}

async function guardarInformeClinico(e) {
  e.preventDefault();

  const paciente_id = parseInt(document.getElementById("inf-paciente-id").value);
  const atencion_id = document.getElementById("inf-atencion-id").value ? parseInt(document.getElementById("inf-atencion-id").value) : null;
  const fecha = document.getElementById("inf-fecha").value;
  const tipo_informe = document.getElementById("inf-tipo").value;
  const motivo_derivacion = document.getElementById("inf-motivo").value.trim();
  const detalles_informe = document.getElementById("inf-detalles").value.trim();
  const recomendaciones = document.getElementById("inf-recomendaciones").value.trim();
  const profesional_nombre = document.getElementById("inf-prof-nombre").value.trim();
  const profesional_rol = document.getElementById("inf-prof-rol").value.trim();

  try {
    const res = await fetch("/api/informes-clinicos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        paciente_id,
        atencion_id,
        fecha,
        tipo_informe,
        motivo_derivacion,
        detalles_informe,
        recomendaciones,
        profesional_nombre,
        profesional_rol,
        usuario_registro: currentUser?.usuario || "enfermeria",
        user_role: currentUser?.rol || "ENFERMERIA"
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast("Error", data.error || "No se pudo registrar el informe.", "error");
      return;
    }

    showToast("Informe Registrado", "El informe clínico formal se registró con éxito.", "success");
    cerrarModalInformeClinico();

    // Actualizar expediente si estaba abierto
    if (expedienteActualCache && expedienteActualCache.id === paciente_id) {
      abrirModalExpediente(paciente_id);
    }
    // Abrir visor de impresión de inmediato
    verInformeClinico(data.id);

  } catch (err) {
    showToast("Error de Conexión", err.message, "error");
  }
}

async function verInformeClinico(informeId) {
  try {
    const res = await fetch(`/api/informes-clinicos/${informeId}`);
    const inf = await res.json();
    if (!res.ok) {
      showToast("Error", "No se pudo cargar el documento.", "error");
      return;
    }

    document.getElementById("doc-inf-codigo").textContent = `INF-${inf.fecha.slice(0, 4)}-${String(inf.id).padStart(4, '0')}`;
    document.getElementById("doc-inf-fecha").textContent = `Fecha de Emisión: ${inf.fecha}`;
    document.getElementById("doc-inf-titulo").textContent = inf.tipo_informe.replace(/_/g, " ");

    document.getElementById("doc-inf-pac-nombre").textContent = `${inf.nombres} ${inf.apellidos}`;
    document.getElementById("doc-inf-pac-cedula").textContent = inf.cedula || "No registrada";
    document.getElementById("doc-inf-pac-edad").textContent = inf.edad ? `${inf.edad} años` : "N/D";
    document.getElementById("doc-inf-pac-piso").textContent = inf.piso_area || "General";
    document.getElementById("doc-inf-pac-alergias").textContent = inf.alergias || "Niega alergias";
    document.getElementById("doc-inf-pac-meds").textContent = inf.medicacion_habitual || "Ninguna";

    document.getElementById("doc-inf-motivo").textContent = inf.motivo_derivacion;
    document.getElementById("doc-inf-detalles").textContent = inf.detalles_informe;
    document.getElementById("doc-inf-recomendaciones").textContent = inf.recomendaciones;

    document.getElementById("doc-inf-firma-prof").textContent = inf.profesional_nombre;
    document.getElementById("doc-inf-cargo-prof").textContent = `${inf.profesional_rol} • Dispensario FYDI`;
    document.getElementById("doc-inf-firma-pac").textContent = `${inf.nombres} ${inf.apellidos} (C.I: ${inf.cedula || 'S/C'})`;

    document.getElementById("modal-visor-informe").classList.remove("hidden");
    if (window.lucide) lucide.createIcons();

  } catch (err) {
    showToast("Error", "Error al visualizar el informe: " + err.message, "error");
  }
}

function cerrarModalVisorInforme() {
  document.getElementById("modal-visor-informe").classList.add("hidden");
}

// ----------------------------------------------------------------
// GESTIÓN DE PACIENTES: ALTA INDEPENDIENTE Y EDICIÓN DE DATOS
// ----------------------------------------------------------------
function abrirModalNuevoPaciente() {
 if (!tienePermiso("registrar_atenciones")) {
  showToast("Acceso Denegado", "No tienes permisos para registrar pacientes.", "error");
  return;
 }
 document.getElementById("nuevo-pac-cedula").value = "";
 document.getElementById("nuevo-pac-nombres").value = "";
 document.getElementById("nuevo-pac-apellidos").value = "";
 document.getElementById("nuevo-pac-edad").value = "";
 document.getElementById("nuevo-pac-celular").value = "";
 document.getElementById("nuevo-pac-piso").value = "";

 document.getElementById("modal-nuevo-paciente").classList.remove("hidden");
 if (window.lucide) lucide.createIcons();
}

function cerrarModalNuevoPaciente() {
 document.getElementById("modal-nuevo-paciente").classList.add("hidden");
}

async function guardarNuevoPaciente(e) {
 e.preventDefault();
 const cedula = document.getElementById("nuevo-pac-cedula").value.trim();
 const nombres = document.getElementById("nuevo-pac-nombres").value.trim().toUpperCase();
 const apellidos = document.getElementById("nuevo-pac-apellidos").value.trim().toUpperCase();
 const edad = document.getElementById("nuevo-pac-edad").value ? parseInt(document.getElementById("nuevo-pac-edad").value) : null;
 const celular = document.getElementById("nuevo-pac-celular").value.trim();
 const piso_area = document.getElementById("nuevo-pac-piso").value.trim();

 if (!nombres || !apellidos) {
 showToast("Datos Incompletos", "Los nombres y apellidos son obligatorios.", "warning");
 return;
 }

 const btn = document.getElementById("btn-guardar-nuevo-pac");
 btn.disabled = true;
 btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Guardando...`;

 try {
 const res = await fetch("/api/pacientes", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 cedula,
 nombres,
 apellidos,
 edad,
 celular,
 piso_area,
 user_role: currentUser.rol,
 usuario_nombre: currentUser.nombre_completo
 })
 });

 const data = await res.json();
 if (!res.ok) {
 showToast("Error", data.error || "No se pudo registrar al paciente.", "error");
 } else {
 showToast("¡Paciente Registrado!", data.mensaje, "success");
 cerrarModalNuevoPaciente();
 cargarPacientes();
 cargarEstadisticas();
 }
 } catch (err) {
 showToast("Error de Conexión", err.message, "error");
 } finally {
 btn.disabled = false;
 btn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i> <span>Guardar Paciente</span>`;
 if (window.lucide) lucide.createIcons();
 }
}

function abrirModalEditarPaciente(pid) {
 if (!tienePermiso("registrar_atenciones")) {
  showToast("Acceso Denegado", "No tienes permisos para editar pacientes.", "error");
  return;
 }

 const pac = pacientesCache.find(p => p.id === pid);
 if (!pac) {
 showToast("No encontrado", "No se encontró la información del paciente.", "error");
 return;
 }

 document.getElementById("edit-pac-id").value = pac.id;
 document.getElementById("edit-pac-cedula").value = pac.cedula || "";
 document.getElementById("edit-pac-nombres").value = pac.nombres || "";
 document.getElementById("edit-pac-apellidos").value = pac.apellidos || "";
 document.getElementById("edit-pac-edad").value = pac.edad || "";
 document.getElementById("edit-pac-celular").value = pac.celular || "";
 document.getElementById("edit-pac-piso").value = pac.piso_area || "";

 document.getElementById("modal-editar-paciente").classList.remove("hidden");
 if (window.lucide) lucide.createIcons();
}

function cerrarModalEditarPaciente() {
 document.getElementById("modal-editar-paciente").classList.add("hidden");
}

async function guardarEdicionPaciente(e) {
 e.preventDefault();
 const pid = parseInt(document.getElementById("edit-pac-id").value);
 const cedula = document.getElementById("edit-pac-cedula").value.trim();
 const nombres = document.getElementById("edit-pac-nombres").value.trim().toUpperCase();
 const apellidos = document.getElementById("edit-pac-apellidos").value.trim().toUpperCase();
 const edad = document.getElementById("edit-pac-edad").value ? parseInt(document.getElementById("edit-pac-edad").value) : null;
 const celular = document.getElementById("edit-pac-celular").value.trim();
 const piso_area = document.getElementById("edit-pac-piso").value.trim();

 if (!nombres || !apellidos) {
 showToast("Datos Incompletos", "Los nombres y apellidos son obligatorios.", "warning");
 return;
 }

 const btn = document.getElementById("btn-guardar-edit-pac");
 btn.disabled = true;
 btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Actualizando...`;

 try {
 const res = await fetch("/api/pacientes/editar", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 id: pid,
 cedula,
 nombres,
 apellidos,
 edad,
 celular,
 piso_area,
 user_role: currentUser.rol,
 usuario_nombre: currentUser.nombre_completo
 })
 });

 const data = await res.json();
 if (!res.ok) {
 showToast("Error al Actualizar", data.error || "No se pudo actualizar el paciente.", "error");
 } else {
 showToast("Paciente Actualizado", data.mensaje, "success");
 cerrarModalEditarPaciente();
 cargarPacientes();
 cargarHistorial();
 }
 } catch (err) {
 showToast("Error de Conexión", err.message, "error");
 } finally {
 btn.disabled = false;
 btn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> <span>Actualizar Paciente</span>`;
 if (window.lucide) lucide.createIcons();
 }
}

// ================================================================
// 7. ESTADÍSTICAS Y TENDENCIAS
// ================================================================
async function cargarEstadisticas() {
 try {
 const res = await apiFetch("/api/estadisticas");
 const st = await res.json();

 document.getElementById("stat-tot-atenciones").textContent = st.totales.atenciones;
 document.getElementById("stat-tot-pacientes").textContent = st.totales.pacientes;
 document.getElementById("stat-tot-unidades").textContent = st.totales.unidades_bodega;
 document.getElementById("stat-tot-alertas").textContent = st.totales.agotados + st.totales.stock_bajo;

 // Top Más Consumidos
 const maxConsumo = st.mas_consumidos.length > 0 ? st.mas_consumidos[0].total_consumido : 1;
 document.getElementById("chart-mas-consumidos").innerHTML = st.mas_consumidos.map((m, idx) => {
 const pct = Math.round((m.total_consumido / maxConsumo) * 100);
 return `
 <div>
 <div class="flex justify-between font-medium mb-1">
 <span class="text-slate-800">${idx + 1}. ${m.nombre} <span class="text-slate-400 font-normal">(${m.presentacion || ''})</span></span>
 <span class="font-bold text-brand-600">${m.total_consumido} unidades</span>
 </div>
 <div class="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
 <div class="bg-gradient-to-r from-amber-400 to-brand-600 h-2.5 rounded-full" style="width: ${pct}%"></div>
 </div>
 </div>
 `;
 }).join("");

 // Top Menos Consumidos
 document.getElementById("chart-menos-consumidos").innerHTML = st.menos_consumidos.map((m, idx) => {
 return `
 <div class="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100">
 <div class="flex items-center gap-2">
 <span class="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold">${idx + 1}</span>
 <div>
 <span class="font-semibold text-slate-800">${m.nombre}</span>
 <span class="text-[11px] text-slate-400 block">${m.presentacion || ''} &bull; Stock en bodega: ${m.stock_actual}</span>
 </div>
 </div>
 <span class="text-xs font-bold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded">
 ${m.total_consumido} despachados
 </span>
 </div>
 `;
 }).join("");

 // Top Diagnósticos
 document.getElementById("chart-top-diagnosticos").innerHTML = st.top_diagnosticos.map((d, idx) => `
 <div class="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200/60">
 <span class="font-semibold text-slate-700">${idx + 1}. ${d.diagnostico}</span>
 <span class="font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full text-[11px]">${d.cantidad} casos</span>
 </div>
 `).join("");

 // Evolución Mensual
 document.getElementById("chart-mensual").innerHTML = st.atenciones_mensuales.map(mes => {
 let nombreMes = mes.mes;
 if (mes.mes === "2026-07") nombreMes = "Julio 2026";
 else if (mes.mes === "2026-08") nombreMes = "Agosto 2026";
 else if (mes.mes === "2026-09") nombreMes = "Septiembre 2026";

 return `
 <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
 <div>
 <span class="font-bold text-slate-800 text-sm">${nombreMes}</span>
 <span class="text-[11px] text-slate-400 block">Consultas atendidas</span>
 </div>
 <span class="text-lg font-black text-brand-600">${mes.atenciones}</span>
 </div>
 `;
 }).join("");

 } catch (err) {
 console.error("Error al cargar estadísticas:", err);
 }
}

// ================================================================
// 8. HISTORIAL GENERAL (CON BÚSQUEDA EN VIVO, ORDENAMIENTO Y TRAZABILIDAD)
// ================================================================
let ordenHistorialActual = "recent";
let busquedaHistorialTexto = "";

function getHistorialFiltradoYOrdenado() {
  let lista = [...atencionesCache];
  const q = busquedaHistorialTexto.toLowerCase().trim();
  if (q) {
    lista = lista.filter(a => {
      const nom = (a.nombres || "").toLowerCase();
      const ape = (a.apellidos || "").toLowerCase();
      const pacCompleto = `${nom} ${ape}`;
      const ced = (a.cedula || "").toLowerCase();
      const diag = (a.diagnostico || "").toLowerCase();
      const obs = (a.observaciones || "").toLowerCase();
      const area = (a.piso_area || "").toLowerCase();
      const user = (a.usuario_registro || "").toLowerCase();
      const idStr = `#${a.id}`;
      const meds = (a.medicamentos || []).map(m => `${m.nombre || ""} ${m.presentacion || ""}`).join(" ").toLowerCase();

      return pacCompleto.includes(q) || 
             ced.includes(q) || 
             diag.includes(q) || 
             obs.includes(q) || 
             area.includes(q) || 
             user.includes(q) || 
             idStr.includes(q) || 
             meds.includes(q);
    });
  }

  if (ordenHistorialActual === "oldest") {
    // Del más antiguo al más reciente (cronológico ascendente por ID)
    lista.sort((a, b) => (a.id || 0) - (b.id || 0));
  } else if (ordenHistorialActual === "alpha_asc") {
    // Alfabético A - Z por nombres y apellidos
    lista.sort((a, b) => {
      const nomA = `${a.nombres || ""} ${a.apellidos || ""}`.trim();
      const nomB = `${b.nombres || ""} ${b.apellidos || ""}`.trim();
      return nomA.localeCompare(nomB);
    });
  } else if (ordenHistorialActual === "alpha_desc") {
    // Alfabético Z - A por nombres y apellidos
    lista.sort((a, b) => {
      const nomA = `${a.nombres || ""} ${a.apellidos || ""}`.trim();
      const nomB = `${b.nombres || ""} ${b.apellidos || ""}`.trim();
      return nomB.localeCompare(nomA);
    });
  } else {
    // Recent (default): Del más reciente al más antiguo (últimos registros primero)
    lista.sort((a, b) => (b.id || 0) - (a.id || 0));
  }

  return lista;
}

function buscarHistorial(texto) {
  busquedaHistorialTexto = texto || "";
  const btnLimpiar = document.getElementById("btn-limpiar-historial");
  if (btnLimpiar) {
    if (busquedaHistorialTexto) {
      btnLimpiar.classList.remove("hidden");
    } else {
      btnLimpiar.classList.add("hidden");
    }
  }
  actualizarVistaHistorial();
}

function limpiarBusquedaHistorial() {
  const inp = document.getElementById("filtro-historial-busqueda");
  if (inp) inp.value = "";
  buscarHistorial("");
  if (inp) inp.focus();
}

function cambiarOrdenHistorial(orden) {
  ordenHistorialActual = orden;
  const btns = {
    recent: document.getElementById("btn-orden-hist-recent"),
    oldest: document.getElementById("btn-orden-hist-oldest"),
    alpha_asc: document.getElementById("btn-orden-hist-alpha"),
    alpha_desc: document.getElementById("btn-orden-hist-alphadesc")
  };

  Object.entries(btns).forEach(([k, btn]) => {
    if (!btn) return;
    if (k === orden) {
      btn.className = "px-2 py-1 rounded font-bold text-[11px] bg-white text-slate-800 shadow-xs transition flex items-center gap-1 border border-slate-200";
      const icon = btn.querySelector("i");
      if (icon) {
        icon.className = icon.className.replace("text-slate-400", "text-brand-600");
        if (!icon.className.includes("text-brand-600")) icon.classList.add("text-brand-600");
      }
    } else {
      btn.className = "px-2 py-1 rounded font-medium text-[11px] text-slate-500 hover:text-slate-800 transition flex items-center gap-1";
      const icon = btn.querySelector("i");
      if (icon) {
        icon.classList.remove("text-brand-600");
        if (!icon.className.includes("text-slate-400")) icon.classList.add("text-slate-400");
      }
    }
  });

  actualizarVistaHistorial();
}

function actualizarVistaHistorial() {
  const filtrados = getHistorialFiltradoYOrdenado();
  renderHistorialTabla(filtrados);

  // Actualizar indicador contador
  const contador = document.getElementById("contador-historial-filtro");
  if (contador) {
    if (busquedaHistorialTexto) {
      contador.textContent = `${filtrados.length} de ${atencionesCache.length}`;
      contador.className = "text-[11px] font-bold text-brand-700 bg-brand-50 px-2.5 py-1.5 rounded-lg border border-brand-200 whitespace-nowrap";
    } else {
      contador.textContent = `${filtrados.length} registros`;
      contador.className = "text-[11px] font-medium text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 whitespace-nowrap";
    }
  }
}

function renderHistorialTabla(atenciones) {
  const tbody = document.getElementById("tabla-historial-body");
  if (!tbody) return;

  if (atenciones.length === 0) {
    if (busquedaHistorialTexto) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-10 text-slate-400">
        <div class="flex flex-col items-center gap-1">
          <i data-lucide="search-x" class="w-8 h-8 text-slate-300 mb-1"></i>
          <span class="font-semibold text-slate-700 text-xs">No se encontró ninguna atención médica para "${busquedaHistorialTexto}"</span>
          <span class="text-[11px] text-slate-400">Intenta buscar por cédula, apellido o nombre del paciente.</span>
          <button onclick="limpiarBusquedaHistorial()" class="mt-2 text-[11px] font-bold text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded-lg transition border border-brand-200">
            Limpiar búsqueda
          </button>
        </div>
      </td></tr>`;
    } else {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400">Sin atenciones registradas.</td></tr>`;
    }
    if (window.lucide) lucide.createIcons();
    return;
  }

  const puedeAnular = currentUser && (currentUser.rol === "ADMINISTRADOR" || tienePermiso("anular_atenciones"));

  tbody.innerHTML = atenciones.map(a => {
    const esAnulada = a.estado === "ANULADA";

    let medList = "";
    if (a.medicamentos && a.medicamentos.length > 0) {
      medList = a.medicamentos.map(m => `
        <span class="px-2 py-0.5 rounded text-[11px] font-medium border ${esAnulada ? 'bg-slate-100 text-slate-400 line-through border-slate-200' : 'bg-brand-50 text-brand-800 border-brand-200'}">
          ${m.nombre} (${m.presentacion || ''}) x${m.cantidad}
        </span>
      `).join(" ");
    } else {
      medList = `<span class="text-slate-400 italic">Procedimiento</span>`;
    }

    const txtAnulada = typeof t === "function" ? t("badge_anulada") : "ANULADA";
    const txtActiva = typeof t === "function" ? t("badge_activa") : "ACTIVA";
    const txtReversada = typeof t === "function" ? t("lbl_reversada") : "Reversada";
    const txtBtnAnular = typeof t === "function" ? t("btn_anular") : "Anular";

    const estadoBadge = esAnulada
      ? `<span class="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded-full text-[10px] inline-flex items-center gap-1" title="${a.motivo_anulacion || 'Consulta anulada'}">
          <i data-lucide="ban" class="w-3 h-3"></i> ${txtAnulada}
        </span>`
      : `<span class="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[10px] inline-flex items-center gap-1">
          <i data-lucide="check" class="w-3 h-3"></i> ${txtActiva}
        </span>`;

    let accionesHtml = "";
    if (esAnulada) {
      accionesHtml = `<span class="text-slate-400 text-[11px] italic" title="${a.motivo_anulacion || ''}">${txtReversada}</span>`;
    } else if (puedeAnular) {
      accionesHtml = `
        <button onclick="abrirModalAnulacion(${a.id})" class="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-200 transition" title="Anular consulta y devolver stock a bodega">
          <i data-lucide="rotate-ccw" class="w-3 h-3"></i> ${txtBtnAnular}
        </button>
      `;
    } else {
      accionesHtml = `<span class="text-slate-300 text-[11px]">-</span>`;
    }

    return `
      <tr class="hover:bg-slate-50/80 transition ${esAnulada ? 'bg-slate-50/40 opacity-75' : ''}">
        <td class="py-2.5 px-3">
          <span class="font-mono font-bold text-slate-800 text-xs">#${a.id}</span>
          <span class="block font-mono text-[11px] text-slate-400">${a.fecha}</span>
        </td>
        <td class="py-2.5 px-3 text-center">${estadoBadge}</td>
        <td class="py-2.5 px-3">
          <div class="font-bold text-slate-800 ${esAnulada ? 'line-through text-slate-400' : ''}">${a.nombres} ${a.apellidos}</div>
          <div class="text-[11px] font-mono text-slate-400">${a.cedula || 'Sin Cédula'}</div>
        </td>
        <td class="py-2.5 px-3 text-slate-600">${a.piso_area || '-'}</td>
        <td class="py-2.5 px-3 font-medium text-slate-700 ${esAnulada ? 'line-through text-slate-400' : ''}">${a.diagnostico}</td>
        <td class="py-2.5 px-3 flex flex-wrap gap-1 items-center">${medList}</td>
        <td class="py-2.5 px-3">
          <span class="font-semibold text-slate-700 capitalize text-xs">${a.usuario_registro || 'sistema'}</span>
          ${esAnulada && a.anulado_por ? `<div class="text-[10px] text-rose-600 font-medium">Anuló: ${a.anulado_por}</div>` : ''}
        </td>
        <td class="py-2.5 px-3 text-center whitespace-nowrap">${accionesHtml}</td>
      </tr>
    `;
  }).join("");

  if (window.lucide) lucide.createIcons();
}

async function cargarHistorial() {
  try {
    const res = await apiFetch("/api/atenciones?limit=300");
    const atenciones = await res.json();
    atencionesCache = atenciones;
    actualizarVistaHistorial();
  } catch (err) {
    console.error("Error al cargar historial:", err);
  }
}

// ================================================================
// 9. CONFIGURACIÓN Y MATRIZ DE PERMISOS (ADMINISTRADOR)
// ================================================================
const FUNCIONES_SISTEMA = [
 { clave: "registrar_atenciones", nombre: "Registrar Atenciones Clínicas y Despacho", desc: "Permite atender pacientes y descontar recetas automáticamente de bodega." },
 { clave: "anular_atenciones", nombre: "Anular Atenciones y Reversar Stock", desc: "Permite cancelar consultas erróneas devolviendo los medicamentos al inventario." },
 { clave: "registrar_entradas", nombre: "Ingresar Compras / Donaciones a Bodega", desc: "Permite asentar ingresos de mercadería en el Kardex y subir stock." },
 { clave: "ajustar_stock", nombre: "Ajuste Físico de Stock (Auditoría)", desc: "Permite cambiar saldos para cuadrar con el conteo físico en perchas." },
 { clave: "gestionar_medicamentos", nombre: "Crear y Editar Medicamentos en Catálogo", desc: "Permite modificar nombres, presentaciones, marcas y agregar nuevos fármacos." },
 { clave: "gestionar_permisos", nombre: "Administrar Matriz de Permisos de Roles", desc: "Permite personalizar accesos y exclusiones para cada perfil." },
 { clave: "descargar_excel", nombre: "Descargar Reportes en Excel Maestro", desc: "Permite exportar balances en vivo, bitácora y Kardex a formato Excel." }
];

async function cargarMatrizPermisos() {
 if (currentUser.rol !== "ADMINISTRADOR" && !tienePermiso("gestionar_permisos")) {
 showToast("Permiso Denegado", "Solo el Administrador puede ver o modificar la matriz de permisos.", "error");
 return;
 }

 const tbody = document.getElementById("tabla-permisos-body");
 if (!tbody) return;
 tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-slate-400">Cargando matriz de permisos...</td></tr>`;

 try {
 const res = await fetch("/api/permisos");
 permisosCache = await res.json();

 const permMap = {};
 permisosCache.forEach(p => {
 permMap[p.rol] = p;
 });

 tbody.innerHTML = FUNCIONES_SISTEMA.map(f => {
 const adminChecked = permMap["ADMINISTRADOR"] ? (permMap["ADMINISTRADOR"][f.clave] === 1) : true;
 const enfChecked = permMap["ENFERMERIA"] ? (permMap["ENFERMERIA"][f.clave] === 1) : false;
 const auxChecked = permMap["AUXILIAR_ENFERMERIA"] ? (permMap["AUXILIAR_ENFERMERIA"][f.clave] === 1) : false;
 const audChecked = permMap["AUDITOR"] ? (permMap["AUDITOR"][f.clave] === 1) : false;

 // Administrador siempre tiene gestionar_permisos deshabilitado (bloqueado en true por seguridad)
 const adminDisabled = f.clave === "gestionar_permisos" ? "disabled" : "";

 return `
 <tr class="hover:bg-slate-50 transition">
 <td class="py-3 px-4">
 <div class="font-bold text-slate-800 text-xs">${f.nombre}</div>
 <div class="text-[11px] text-slate-500">${f.desc}</div>
 </td>
 <td class="py-3 px-4 text-center">
 <input type="checkbox" id="perm-ADMINISTRADOR-${f.clave}" ${adminChecked ? 'checked' : ''} ${adminDisabled} class="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer">
 </td>
 <td class="py-3 px-4 text-center">
 <input type="checkbox" id="perm-ENFERMERIA-${f.clave}" ${enfChecked ? 'checked' : ''} class="w-4 h-4 text-sky-600 rounded border-slate-300 focus:ring-sky-500 cursor-pointer">
 </td>
 <td class="py-3 px-4 text-center">
 <input type="checkbox" id="perm-AUXILIAR_ENFERMERIA-${f.clave}" ${auxChecked ? 'checked' : ''} class="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer">
 </td>
 <td class="py-3 px-4 text-center">
 <input type="checkbox" id="perm-AUDITOR-${f.clave}" ${audChecked ? 'checked' : ''} class="w-4 h-4 text-slate-600 rounded border-slate-300 focus:ring-slate-500 cursor-pointer">
 </td>
 </tr>
 `;
 }).join("");

 if (window.lucide) lucide.createIcons();

 } catch (err) {
 tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-rose-500">Error al cargar matriz: ${err.message}</td></tr>`;
 }
}

async function guardarMatrizPermisos() {
 if (currentUser.rol !== "ADMINISTRADOR" && !tienePermiso("gestionar_permisos")) {
 showToast("Permiso Denegado", "Solo el Administrador puede guardar la matriz de permisos.", "error");
 return;
 }

 const roles = ["ADMINISTRADOR", "ENFERMERIA", "AUXILIAR_ENFERMERIA", "AUDITOR"];
 const matrix = roles.map(rol => {
 const obj = { rol };
 FUNCIONES_SISTEMA.forEach(f => {
 const cb = document.getElementById(`perm-${rol}-${f.clave}`);
 if (rol === "ADMINISTRADOR" && f.clave === "gestionar_permisos") {
 obj[f.clave] = 1;
 } else {
 obj[f.clave] = cb && cb.checked ? 1 : 0;
 }
 });
 return obj;
 });

 try {
 const res = await fetch("/api/permisos", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 user_role: currentUser.rol,
 permisos: matrix
 })
 });

 const data = await res.json();
 if (!res.ok) {
 showToast("Error", data.error || "No se pudo actualizar los permisos.", "error");
 } else {
  permisosCache = matrix;
  await sincronizarPermisos();
  aplicarPermisosRol();
  if (medicamentosCache && medicamentosCache.length > 0) {
   renderInventarioTabla(medicamentosCache);
  }
  showToast("Permisos Actualizados", "La matriz de accesos y exclusiones se guardó correctamente.", "success");
 }
 } catch (err) {
 showToast("Error de Conexión", err.message, "error");
 }
}

// ================================================================
// 9. SOPORTE MULTI-IDIOMA (ESPAÑOL / ENGLISH / 中文)
// ================================================================
function initIdioma() {
 const savedLang = localStorage.getItem("fydi_lang") || "es";
 cambiarIdioma(savedLang, false);
}

function cambiarIdioma(lang, notify = true) {
 if (typeof I18N === "undefined" || !I18N[lang]) {
 console.warn("Idioma no disponible:", lang);
 return;
 }

 currentLang = lang;
 localStorage.setItem("fydi_lang", lang);

 // Actualizar clases activas en los botones de idioma
 const btns = {
 es: document.getElementById("lang-btn-es"),
 en: document.getElementById("lang-btn-en"),
 zh: document.getElementById("lang-btn-zh")
 };

 Object.keys(btns).forEach(k => {
 const b = btns[k];
 if (!b) return;
 if (k === lang) {
 b.className = "lang-btn px-2 py-1 rounded-lg font-bold text-[11px] transition flex items-center gap-1 bg-brand-600 text-white shadow-sm";
 } else {
 b.className = "lang-btn px-2 py-1 rounded-lg font-medium text-[11px] transition flex items-center gap-1 text-slate-300 hover:text-white";
 }
 });

 aplicarTraducciones();
 aplicarPermisosRol();

 // Re-renderizar tablas activas
 if (medicamentosCache && medicamentosCache.length > 0) {
 renderInventarioTabla(medicamentosCache);
 }
 if (pacientesCache && pacientesCache.length > 0) {
 actualizarVistaPacientes();
 }
 if (atencionesCache && atencionesCache.length > 0) {
 actualizarVistaHistorial();
 }

 if (notify) {
 const msgMap = {
 es: "Idioma cambiado a Español.",
 en: "Language switched to English.",
 zh: "界面语言已切换为中文。"
 };
 showToast(t("app_title"), msgMap[lang] || "Language updated.", "success");
 }

 if (window.lucide) lucide.createIcons();
}

function aplicarTraducciones() {
 if (typeof t !== "function") return;

 const setHtml = (id, html) => {
 const el = document.getElementById(id);
 if (el) el.innerHTML = html;
 };
 const setText = (id, txt) => {
 const el = document.getElementById(id);
 if (el) el.textContent = txt;
 };
 const setAttr = (id, attr, val) => {
 const el = document.getElementById(id);
 if (el) el.setAttribute(attr, val);
 };

 // Botón Excel Header
 setText("lbl-btn-download-excel", t("btn_download_excel"));

 // Pestañas de Navegación
 setHtml("tab-btn-atencion", `<i data-lucide="stethoscope" class="w-3.5 h-3.5"></i> <span>${t("tab_atencion")}</span>`);
 setHtml("tab-btn-inventario", `<i data-lucide="package" class="w-3.5 h-3.5"></i> <span>${t("tab_inventario")}</span> <span id="badge-alertas" class="hidden bg-rose-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold">0</span>`);
 setHtml("tab-btn-pacientes", `<i data-lucide="users" class="w-3.5 h-3.5"></i> <span>${t("tab_pacientes")}</span>`);
 setHtml("tab-btn-estadisticas", `<i data-lucide="bar-chart-3" class="w-3.5 h-3.5"></i> <span>${t("tab_estadisticas")}</span>`);
 setHtml("tab-btn-historial", `<i data-lucide="history" class="w-3.5 h-3.5"></i> <span>${t("tab_historial")}</span>`);
 setHtml("tab-btn-permisos", `<i data-lucide="shield-alert" class="w-3.5 h-3.5"></i> <span>${t("tab_permisos")}</span>`);

 // Botones de Acción de Inventario
 const btnNuevoProd = document.getElementById("btn-admin-nuevo-producto");
 if (btnNuevoProd) {
 btnNuevoProd.innerHTML = `<i data-lucide="package-plus" class="w-4 h-4"></i> ${t("btn_nueva_med")}`;
 }
 const btnIngreso = document.getElementById("btn-ingreso-bodega");
 if (btnIngreso) {
 btnIngreso.innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i> ${t("btn_entrada_bodega")}`;
 }

 // Placeholders de búsqueda
 setAttr("filtro-inv-busqueda", "placeholder", t("search_placeholder"));
 setAttr("filtro-pac-busqueda", "placeholder", t("pac_search"));
 setAttr("atencion-diagnostico", "placeholder", t("diag_placeholder"));
 setAttr("atencion-obs", "placeholder", t("obs_placeholder"));

 // Select de Categorías Inventario
 const selCat = document.getElementById("filtro-inv-categoria");
 if (selCat && selCat.options.length >= 4) {
 selCat.options[0].text = t("cat_todas");
 selCat.options[1].text = t("cat_meds");
 selCat.options[2].text = t("cat_insumos");
 selCat.options[3].text = t("cat_alertas");
 }

 // Botones de Formulario de Atención
 const btnAddRenglon = document.getElementById("btn-add-renglon");
 if (btnAddRenglon) {
 btnAddRenglon.innerHTML = `<i data-lucide="plus-circle" class="w-4 h-4"></i> ${t("btn_add_med")}`;
 }
 const btnGuardarAtencion = document.getElementById("btn-guardar-atencion");
 if (btnGuardarAtencion) {
 btnGuardarAtencion.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4"></i> ${t("btn_guardar_atencion")}`;
 }

 // Modal Login labels
 setText("lbl-modal-login-title", t("modal_login_title"));
 setText("lbl-modal-login-sub", t("modal_login_sub"));
 setText("lbl_usuario_title", t("lbl_usuario") + " *");
 setText("lbl_password_title", t("lbl_password") + " *");
 setText("btn-login-text", t("login_fast_btn"));
 setText("lbl-login-remember", t("login_remember"));

 // Directorio y Modales de Pacientes
 setText("lbl-btn-nuevo-pac", t("btn_nuevo_paciente"));
 setText("lbl-modal-nuevo-pac-title", t("modal_nuevo_pac_title"));
 setText("lbl-modal-nuevo-pac-sub", t("modal_nuevo_pac_sub"));
 setText("lbl-modal-editar-pac-title", t("modal_editar_pac_title"));
 setText("lbl-modal-editar-pac-sub", t("modal_editar_pac_sub"));

 // Landing Page y Portal de Bienestar (Call Center)
 setText("lbl-landing-brand-title", t("app_title"));
 setText("lbl-landing-brand-sub", t("landing_nav_title"));
 setText("lbl-landing-btn-consultar", t("landing_cta_consultar"));
 setText("lbl-landing-btn-login", t("landing_btn_acceso_medico"));
 setText("lbl-btn-ver-portal", t("landing_btn_ver_portal"));
 setText("lbl-landing-badge", t("landing_hero_badge"));
 setText("lbl-landing-hero-title", t("landing_hero_title"));
 setText("lbl-landing-hero-sub", t("landing_hero_sub"));
 setText("lbl-landing-cta-solicitar", t("landing_cta_solicitar"));
 setText("lbl-landing-cta-consultar", t("landing_cta_consultar"));
 setText("lbl-landing-urgencias", t("landing_banner_urgencias"));
 setText("lbl-landing-pisos-title", t("landing_sec_pisos_title"));
 setText("lbl-landing-pisos-sub", t("landing_sec_pisos_sub"));
 setText("lbl-landing-consejos-title", t("landing_sec_consejos_title"));
 setText("lbl-landing-consejos-sub", t("landing_sec_consejos_sub"));

 // Guía de Salud Ocupacional
 setText("lbl-tip-voz-title", t("tip_voz_title"));
 setText("lbl-tip-voz-desc", t("tip_voz_desc"));
 setText("lbl-tip-vision-title", t("tip_vision_title"));
 setText("lbl-tip-vision-desc", t("tip_vision_desc"));
 setText("lbl-tip-ergo-title", t("tip_ergo_title"));
 setText("lbl-tip-ergo-desc", t("tip_ergo_desc"));
 setText("lbl-tip-estres-title", t("tip_estres_title"));
 setText("lbl-tip-estres-desc", t("tip_estres_desc"));
 setText("lbl-tip-primeros-aux-title", t("tip_primeros_aux_title"));
 setText("lbl-tip-primeros-aux-desc", t("tip_primeros_aux_desc"));
 setText("lbl-tip-botiquin-title", t("tip_botiquin_title"));
 setText("lbl-tip-botiquin-desc", t("tip_botiquin_desc"));

 setText("lbl-modal-sol-sub", t("modal_sol_sub"));
}



// ================================================================
// GESTIÓN DE VISTAS: PORTAL PÚBLICO (BIENESTAR) VS CLÍNICA INTERNA
// ================================================================
function mostrarPortalPublico() {
 const landing = document.getElementById("landing-portal-salud");
 const clinica = document.getElementById("app-clinica-interna");
 if (landing) landing.classList.remove("hidden");
 if (clinica) clinica.classList.add("hidden");
 window.scrollTo({ top: 0, behavior: 'smooth' });
 if (window.lucide) lucide.createIcons();
}

function mostrarAppClinica() {
 if (!currentUser || !currentUser.usuario) {
 abrirModalLogin();
 return;
 }
 const landing = document.getElementById("landing-portal-salud");
 const clinica = document.getElementById("app-clinica-interna");
 if (landing) landing.classList.add("hidden");
 if (clinica) clinica.classList.remove("hidden");
 window.scrollTo({ top: 0, behavior: 'smooth' });
 if (window.lucide) lucide.createIcons();
}

// ================================================================
// Actualizar QR Code al dominio actual
window.addEventListener("DOMContentLoaded", () => {
  const qr = document.getElementById("qr-code-img");
  if (qr && window.location.origin) {
    qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(window.location.origin)}`;
  }
});

// ================================================================
// PROTOCOLO DE SEGURIDAD TI: BLOQUEO INMEDIATO ANTE INTRUSO
// ================================================================
function abrirModalBloqueoSeguridad() {
  const modal = document.getElementById("modal-bloqueo-seguridad");
  if (!modal) return;
  const pInput = document.getElementById("bloqueo-admin-pass");
  if (pInput) { pInput.value = ""; pInput.placeholder = "••••••••"; }
  modal.classList.remove("hidden");
  if (pInput) setTimeout(() => pInput.focus(), 50);
  if (window.lucide) lucide.createIcons();
}

function cerrarModalBloqueoSeguridad() {
  const modal = document.getElementById("modal-bloqueo-seguridad");
  if (modal) modal.classList.add("hidden");
}

async function ejecutarAccionBloqueo(e) {
  if (e) e.preventDefault();
  const password = (document.getElementById("bloqueo-admin-pass")?.value || "").trim();
  const motivo = (document.getElementById("bloqueo-admin-motivo")?.value || "Detección de intruso en red").trim();
  const btn = document.getElementById("btn-confirmar-bloqueo");

  if (!password) {
    showToast("Error de Seguridad", "Debe ingresar su contraseña de Administrador.", "error");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i> Bloqueando Sistema...`;
  }

  try {
    const res = await fetch("/api/seguridad/bloquear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usuario: currentUser?.usuario || "admin",
        password,
        motivo
      })
    });

    const data = await res.json();
    if (!res.ok) {
      showToast("Acción Denegada", data.error || "No se pudo bloquear el sistema.", "error");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="lock" class="w-4 h-4"></i> BLOQUEAR SISTEMA AHORA`;
      }
      return;
    }

    cerrarModalBloqueoSeguridad();
    showToast("SISTEMA BLOQUEADO", "Se ha activado el bloqueo general de emergencia.", "error");
    setTimeout(() => {
      window.location.reload();
    }, 1000);

  } catch (err) {
    showToast("Error", "Error al comunicarse con el servidor: " + err.message, "error");
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="lock" class="w-4 h-4"></i> BLOQUEAR SISTEMA AHORA`;
    }
  }
}
