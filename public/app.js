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
let solicitudesCache = [];
let filtroEstadoSolicitud = 'TODAS';
let currentSolicitudAtendiendoId = null;
let pollingSolicitudesInterval = null;
let currentChatTicketId = null;
let pollingChatColaboradorInterval = null;
let pollingChatEnfermeriaInterval = null;
let estadoEnfermeraCache = {
  ubicacion_actual: "Piso 6 - Consultorio Central",
  disponibilidad: "DISPONIBLE",
  mensaje_estado: "Atendiendo consultas en Consultorio Piso 6"
};


// Estado de sesión activa (Exige autenticación corporativa real)
let currentUser = JSON.parse(localStorage.getItem("fydi_user")) || null;

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
 iniciarPollingSolicitudes();
 }
 cargarSolicitudesPisos();

 cargarMedicamentos();
  cargarPacientes();
  cargarEstadisticas();
  cargarHistorial();
  cargarEstadoEnfermera();
  checkTicketCacheado();
  setInterval(cargarEstadoEnfermera, 20000);
 
 // Agregar primer renglón de medicina por defecto
 agregarRenglonReceta();
 
 // Inicializar iconos de Lucide
 if (window.lucide) {
 lucide.createIcons();
 }
});

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

// Fecha por defecto hoy
function initFechaHoy() {
 const f = document.getElementById("atencion-fecha");
 const f_ent = document.getElementById("entrada-fecha");
 const hoy = new Date().toISOString().split("T")[0];
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
 bannerContainer.className = "mb-5 p-3 rounded-xl border border-purple-200 bg-purple-50 text-xs flex items-center justify-between";
 bannerBadge.className = "font-bold px-2.5 py-0.5 rounded-full text-[10px] bg-purple-200 text-purple-900";
 bannerBadge.textContent = typeof t === "function" ? t("role_admin_banner") : "ROL: ADMINISTRADOR / SUPERVISOR";
 bannerDesc.textContent = typeof t === "function" ? t("role_admin_desc") : "Tienes control total del dispensario: puedes editar el catálogo, ajustar stock físico, anular consultas y configurar permisos.";
 if (btnNuevoProd) btnNuevoProd.classList.remove("hidden");
 if (readonlyNotice) readonlyNotice.classList.add("hidden");
 if (tabPermisosBtn) tabPermisosBtn.classList.remove("hidden");
 if (formAtencion) {
 formAtencion.querySelectorAll("input, select, textarea, button").forEach(el => el.disabled = false);
 }
 } else if (currentUser.rol === "ENFERMERIA") {
 iconEl.innerHTML = `<i data-lucide="stethoscope" class="w-3.5 h-3.5 text-sky-300"></i>`;
 badgeEl.className = "text-[10px] font-bold text-sky-300 uppercase tracking-wider";
 bannerContainer.className = "mb-5 p-3 rounded-xl border border-sky-200 bg-sky-50 text-xs flex items-center justify-between";
 bannerBadge.className = "font-bold px-2.5 py-0.5 rounded-full text-[10px] bg-sky-200 text-sky-900";
 bannerBadge.textContent = typeof t === "function" ? t("role_enf_banner") : "ROL: ENFERMERÍA (ATENCIÓN Y RECETA)";
 bannerDesc.textContent = typeof t === "function" ? t("role_enf_desc") : "Puedes registrar atenciones a pacientes y recetar medicinas con doble confirmación. La edición de catálogo y ajustes están restringidos.";
 if (btnNuevoProd) btnNuevoProd.classList.add("hidden");
 if (readonlyNotice) readonlyNotice.classList.add("hidden");
 if (tabPermisosBtn) tabPermisosBtn.classList.add("hidden");
 if (formAtencion) {
 formAtencion.querySelectorAll("input, select, textarea, button").forEach(el => el.disabled = false);
 }
 } else { // AUDITOR
 iconEl.innerHTML = `<i data-lucide="eye" class="w-3.5 h-3.5 text-slate-300"></i>`;
 badgeEl.className = "text-[10px] font-bold text-slate-300 uppercase tracking-wider";
 bannerContainer.className = "mb-5 p-3 rounded-xl border border-slate-200 bg-slate-100 text-xs flex items-center justify-between";
 bannerBadge.className = "font-bold px-2.5 py-0.5 rounded-full text-[10px] bg-slate-300 text-slate-900";
 bannerBadge.textContent = typeof t === "function" ? t("role_aud_banner") : "ROL: AUDITORÍA (SOLO CONSULTA)";
 bannerDesc.textContent = typeof t === "function" ? t("role_aud_desc") : "Acceso de solo lectura para supervisión de Kardex, bitácora de atenciones y descarga de balances.";
 if (btnNuevoProd) btnNuevoProd.classList.add("hidden");
 if (readonlyNotice) readonlyNotice.classList.remove("hidden");
 if (tabPermisosBtn) tabPermisosBtn.classList.add("hidden");
 if (formAtencion) {
 formAtencion.querySelectorAll("input, select, textarea, button").forEach(el => el.disabled = true);
 }
 }

 if (window.lucide) lucide.createIcons();
}

function tienePermiso(accion) {
 if (!currentUser) return false;
 if (currentUser.rol === "ADMINISTRADOR") return true;
 const p = permisosCache.find(x => x.rol === currentUser.rol);
 if (!p) return false;
 return p[accion] === 1;
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
 if (pInput) pInput.value = "";

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

 // SEGURIDAD: La contraseña NUNCA se autocompleta por código; se limpia y se pide al usuario
 if (pInput) {
 pInput.value = "";
 setTimeout(() => pInput.focus(), 50);
 }

 // Actualizar tarjetas de rol visuales
 document.querySelectorAll(".role-smart-card").forEach(el => el.classList.remove("active-role"));
 const card = document.getElementById(`card-role-${usuario}`);
 if (card) card.classList.add("active-role");

 if (hint) {
 const rolNombres = {
 enfermeria: "Enfermería Clínica",
 admin: "Administrador Central",
 auditor: "Auditoría Médica"
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
 if (pollingSolicitudesInterval) {
 clearInterval(pollingSolicitudesInterval);
 pollingSolicitudesInterval = null;
 }
 showToast("Sesión Finalizada", "Has salido del sistema de manera segura.", "warning");
 aplicarPermisosRol();
 mostrarPortalPublico();
}

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
 token: data.token
 };
 localStorage.setItem("fydi_user", JSON.stringify(currentUser));

 // Guarda el rol para recordarlo en la siguiente sesión, sin contraseñas
 localStorage.setItem("fydi_remembered_user", data.usuario);

 document.getElementById("modal-login").classList.add("hidden");
 mostrarAppClinica();
 await sincronizarPermisos();
 aplicarPermisosRol();
 iniciarPollingSolicitudes();
 cargarSolicitudesPisos();
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
 document.querySelectorAll(".tab-pane").forEach(el => el.classList.add("hidden"));
 document.querySelectorAll(".nav-tab").forEach(el => el.classList.remove("active-tab"));

 const targetPane = document.getElementById(`tab-${tabName}`);
 const targetBtn = document.getElementById(`tab-btn-${tabName}`);
 if (targetPane) targetPane.classList.remove("hidden");
 if (targetBtn) targetBtn.classList.add("active-tab");

 if (tabName === "solicitudes") {
 cargarSolicitudesPisos(true);
 } else if (tabName === "inventario") {
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
 tbody.innerHTML = `<tr><td colspan="10" class="text-center py-8 text-slate-400 font-medium">No se encontraron productos coincidentes en el inventario.</td></tr>`;
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

 const esAdmin = currentUser && currentUser.rol === "ADMINISTRADOR";

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

 // Badge vectorial elegante para stock
 let badgeHtml = "";
 if (m.estado === "DISPONIBLE") {
 badgeHtml = `<span class="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-bold px-2 py-0.5 rounded-full text-[10px]"><i data-lucide="check-circle-2" class="w-3 h-3 text-emerald-600"></i> DISPONIBLE</span>`;
 } else if (m.estado === "STOCK BAJO") {
 badgeHtml = `<span class="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200/80 font-bold px-2 py-0.5 rounded-full text-[10px]"><i data-lucide="alert-triangle" class="w-3 h-3 text-amber-600"></i> STOCK BAJO</span>`;
 } else {
 badgeHtml = `<span class="inline-flex items-center gap-1.5 bg-rose-50 text-rose-700 border border-rose-200/80 font-bold px-2 py-0.5 rounded-full text-[10px]"><i data-lucide="slash" class="w-3 h-3 text-rose-600"></i> AGOTADO</span>`;
 }

 // Badge vectorial semaforizado para Lote y Caducidad
 let caducidadHtml = "";
 const loteDisplay = m.lote ? `<span class="font-mono text-[10px] font-bold text-slate-500 tracking-wider">LT: ${m.lote}</span>` : `<span class="font-mono text-[10px] text-slate-400">LT: S/N</span>`;

 if (m.estado_vencimiento === "VENCIDO") {
 const diasTxt = m.dias_restantes !== null ? `(${Math.abs(m.dias_restantes)}d atrás)` : '';
 caducidadHtml = `
 <div class="flex flex-col items-center gap-0.5">
 ${loteDisplay}
 <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 shadow-xs" title="Fecha: ${m.fecha_vencimiento || 'No registrada'}">
 <i data-lucide="shield-alert" class="w-3 h-3 text-rose-600"></i> CADUCADO ${diasTxt}
 </span>
 </div>
 `;
 } else if (m.estado_vencimiento === "POR_VENCER") {
 caducidadHtml = `
 <div class="flex flex-col items-center gap-0.5">
 ${loteDisplay}
 <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-xs" title="Fecha: ${m.fecha_vencimiento || ''}">
 <i data-lucide="clock" class="w-3 h-3 text-amber-600"></i> ${m.dias_restantes}d por vencer
 </span>
 </div>
 `;
 } else if (m.estado_vencimiento === "VIGENTE") {
 caducidadHtml = `
 <div class="flex flex-col items-center gap-0.5">
 ${loteDisplay}
 <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" title="Vigente hasta ${m.fecha_vencimiento}">
 <i data-lucide="calendar-check" class="w-3 h-3 text-emerald-600"></i> ${m.fecha_vencimiento}
 </span>
 </div>
 `;
 } else {
 caducidadHtml = `
 <div class="flex flex-col items-center gap-0.5">
 ${loteDisplay}
 <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-normal bg-slate-50 text-slate-500 border border-slate-200">
 <i data-lucide="help-circle" class="w-3 h-3 text-slate-400"></i> Sin registrar
 </span>
 </div>
 `;
 }

 const marcasHtml = m.marcas_comerciales ? `<span class="text-slate-500 italic text-[11px]">${m.marcas_comerciales}</span>` : `<span class="text-slate-300">-</span>`;

 const lblKardex = typeof t === "function" ? t("btn_kardex") : "Kardex";
 const lblEditar = typeof t === "function" ? t("btn_editar") : "Editar";
 const lblAjustar = typeof t === "function" ? t("btn_ajustar") : "Ajustar";

 // Acciones según rol
 let accionesHtml = `
 <button onclick="abrirModalKardex(${m.id}, '${m.nombre}', '${m.presentacion || ''}')" class="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded-lg transition" title="Ver movimientos Kardex">
 <i data-lucide="list-collapse" class="w-3 h-3"></i> ${lblKardex}
 </button>
 `;

 if (esAdmin) {
 accionesHtml += `
 <button onclick="abrirModalEditarMed(${m.id})" class="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded-lg transition ml-1" title="Editar catálogo y lote">
 <i data-lucide="edit-2" class="w-3 h-3"></i> ${lblEditar}
 </button>
 <button onclick="abrirModalAjusteStock(${m.id})" class="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg transition ml-1" title="Ajuste físico de stock">
 <i data-lucide="sliders" class="w-3 h-3"></i> ${lblAjustar}
 </button>
 `;
 }

 const rowVencidaClass = m.estado_vencimiento === "VENCIDO" ? "bg-rose-50/40" : "";

 return `
 <tr class="hover:bg-slate-50/80 transition ${rowVencidaClass}">
 <td class="py-2.5 px-4 font-mono font-bold text-slate-700">${m.codigo}</td>
 <td class="py-2.5 px-4 font-semibold text-slate-800">${m.nombre}</td>
 <td class="py-2.5 px-4 text-slate-600">${m.presentacion || '-'}</td>
 <td class="py-2.5 px-4 text-slate-600">${m.concentracion || '-'}</td>
 <td class="py-2.5 px-4">${marcasHtml}</td>
 <td class="py-2.5 px-4 text-center">${caducidadHtml}</td>
 <td class="py-2.5 px-4 text-center">
 <span class="text-sm font-bold ${m.stock_actual === 0 ? 'text-rose-600' : m.stock_actual <= m.stock_minimo ? 'text-amber-600' : 'text-slate-800'}">
 ${m.stock_actual}
 </span>
 </td>
 <td class="py-2.5 px-4 text-center text-slate-500">${m.stock_minimo}</td>
 <td class="py-2.5 px-4 text-center">${badgeHtml}</td>
 <td class="py-2.5 px-4 text-center whitespace-nowrap">${accionesHtml}</td>
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
 if (currentUser.rol !== "ADMINISTRADOR") {
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
 if (currentUser.rol !== "ADMINISTRADOR") {
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
 if (currentUser.rol !== "ADMINISTRADOR") {
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

// Búsqueda predictiva de pacientes
function buscarSugerenciaPaciente(texto) {
 const sugDiv = document.getElementById("pac-sugerencias");
 const q = texto.toLowerCase().trim();
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
}

// DOBLE VERIFICACIÓN PREVIA AL DESPACHO
function prepararConfirmacionAtencion(e) {
 e.preventDefault();

 if (currentUser.rol === "AUDITOR") {
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

 if (medItems.length === 0) {
 showToast("Falta Medicamento", "Por favor selecciona al menos un producto a despachar.", "warning");
 return;
 }

 atencionPendiente = {
 fecha,
 paciente: { cedula, nombres, apellidos, edad, celular, piso_area },
 diagnostico,
 observaciones,
 medicamentos: medItems,
 usuario_registro: currentUser.usuario,
 user_role: currentUser.rol,
 usuario_nombre: currentUser.nombre_completo
 };

 document.getElementById("confirm-paciente-nombre").textContent = `${nombres} ${apellidos}`;
 document.getElementById("confirm-paciente-detalle").textContent = `C.I: ${cedula || 'S/C'} • Área: ${piso_area || 'General'}`;
 document.getElementById("confirm-diagnostico").textContent = diagnostico;
 document.getElementById("confirm-meds-list").innerHTML = medSummaryList.join("");

 document.getElementById("modal-confirmar-despacho").classList.remove("hidden");
 if (window.lucide) lucide.createIcons();
}

function cerrarModalConfirmacion() {
 document.getElementById("modal-confirmar-despacho").classList.add("hidden");
 atencionPendiente = null;
}

async function ejecutarGuardadoAtencion() {
 if (!atencionPendiente) return;

 const btn = document.getElementById("btn-confirmar-definitivo");
 btn.disabled = true;
 btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Descontando de bodega...`;

 try {
 const res = await fetch("/api/atenciones", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(atencionPendiente)
 });

 const data = await res.json();
 if (!res.ok) {
 showToast("Error en Despacho", data.error || "No se pudo registrar la atención.", "error");
 } else {
 showToast("¡Atención y Despacho Registrados!", `${data.mensaje} Paciente: ${data.paciente}.`, "success");
 
 // Si la atención provino de un ticket de piso, marcarlo automáticamente como ATENDIDO
 if (currentSolicitudAtendiendoId) {
 try {
 await fetch("/api/solicitudes/responder", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 solicitud_id: currentSolicitudAtendiendoId,
 nuevo_estado: "ATENDIDA",
 comentario: `Atención clínica y receta despachada en consultorio. Registro ID: #${data.atencion_id || ''}`,
 user_role: currentUser.rol,
 usuario_nombre: currentUser.nombre_completo
 })
 });
 currentSolicitudAtendiendoId = null;
 cargarSolicitudesPisos();
 } catch (e) {
 console.warn("No se pudo auto-finalizar solicitud:", e);
 }
 }

 cerrarModalConfirmacion();
 resetFormAtencion();
 cargarMedicamentos();
 cargarPacientes();
 cargarEstadisticas();
 cargarHistorial();
 }
 } catch (err) {
 showToast("Error de Conexión", err.message, "error");
 } finally {
 btn.disabled = false;
 btn.innerHTML = `Confirmar y Despachar`;
 if (window.lucide) lucide.createIcons();
 }
}

// ANULACIÓN DE ATENCIÓN Y REVERSIÓN DE STOCK
function abrirModalAnulacion(atencionId, pacienteNombreOpt, medsSummaryOpt) {
 if (currentUser.rol === "AUDITOR") {
 showToast("Acceso Denegado", "El rol de Auditoría no puede anular atenciones.", "error");
 return;
 }

 const puede = currentUser.rol === "ADMINISTRADOR" || tienePermiso("anular_atenciones");
 if (!puede) {
 showToast("Acceso Denegado", "Tu rol no tiene autorización para anular atenciones médicas. Solicítalo al Administrador.", "error");
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
 if (currentUser.rol === "AUDITOR") {
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
async function cargarPacientes() {
 try {
 const res = await fetch("/api/pacientes");
 pacientesCache = await res.json();
 renderPacientesTabla(pacientesCache);
 } catch (err) {
 console.error("Error al cargar pacientes:", err);
 }
}

function renderPacientesTabla(lista) {
 const tbody = document.getElementById("tabla-pacientes-body");
 if (!tbody) return;

 if (lista.length === 0) {
 tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">No se encontraron pacientes.</td></tr>`;
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
 const q = texto.toLowerCase().trim();
 const filtrados = pacientesCache.filter(p => {
 return (p.cedula && p.cedula.includes(q)) ||
 p.nombres.toLowerCase().includes(q) ||
 p.apellidos.toLowerCase().includes(q) ||
 (p.piso_area && p.piso_area.toLowerCase().includes(q));
 });
 renderPacientesTabla(filtrados);
}

async function abrirModalExpediente(pid) {
 document.getElementById("modal-expediente").classList.remove("hidden");
 if (window.lucide) lucide.createIcons();

 try {
 const res = await fetch(`/api/pacientes/${pid}/historial`);
 const pac = await res.json();
 pacienteHistorialCache = pac.historial || [];

 document.getElementById("exp-pac-nombre").textContent = `${pac.nombres} ${pac.apellidos}`;
 document.getElementById("exp-pac-sub").textContent = `Expediente Clínico Ocupacional - Total Visitas: ${pac.historial.length}`;
 document.getElementById("exp-pac-cedula").textContent = pac.cedula || "No registrada";
 document.getElementById("exp-pac-contacto").textContent = `${pac.edad ? pac.edad + ' años' : 'Edad N/D'} &bull; Cel: ${pac.celular || 'N/D'}`;
 document.getElementById("exp-pac-piso").textContent = pac.piso_area || "No especificado";

 const atListDiv = document.getElementById("exp-atenciones-list");
 if (pac.historial.length === 0) {
 atListDiv.innerHTML = `<div class="p-4 text-center text-slate-400">Sin atenciones registradas.</div>`;
 return;
 }

 const puedeAnular = currentUser.rol === "ADMINISTRADOR" || tienePermiso("anular_atenciones");

 atListDiv.innerHTML = pac.historial.map(at => {
 const esAnulada = at.estado === "ANULADA";
 const medListHtml = at.medicamentos && at.medicamentos.length > 0 
 ? at.medicamentos.map(m => `<span class="bg-white border ${esAnulada ? 'border-slate-200 text-slate-400 line-through' : 'border-slate-200 text-slate-700'} px-2 py-0.5 rounded text-[11px] font-medium">${m.nombre} (${m.presentacion || ''}) x${m.cantidad}</span>`).join(" ")
 : `<span class="text-slate-400 italic">Solo consulta / curación</span>`;

 const pacNombre = `${pac.nombres} ${pac.apellidos}`;

 let anularBtnHtml = "";
 if (!esAnulada && puedeAnular) {
 anularBtnHtml = `
 <button onclick="abrirModalAnulacion(${at.id})" class="text-[10px] font-bold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-lg border border-rose-200 transition" title="Anular consulta y devolver stock a bodega">
 Anular
 </button>
 `;
 }

 return `
 <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 ${esAnulada ? 'opacity-70 bg-slate-100/60' : ''}">
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-2">
 <span class="font-mono font-bold text-slate-800 text-xs">${at.fecha}</span>
 ${esAnulada 
 ? `<span class="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded text-[10px]" title="${at.motivo_anulacion || ''}">ANULADA</span>`
 : `<span class="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">ACTIVA</span>`}
 </div>
 <div class="flex items-center gap-2">
 <span class="text-[11px] text-brand-600 font-semibold bg-brand-50 px-2 py-0.5 rounded">Atención #${at.id}</span>
 ${anularBtnHtml}
 </div>
 </div>
 <div class="text-slate-800 font-semibold text-xs">
 Diagnóstico: <span class="font-normal ${esAnulada ? 'line-through text-slate-400' : ''}">${at.diagnostico}</span>
 </div>
 <div class="pt-1 flex flex-wrap gap-1 items-center">
 <span class="text-[10px] uppercase font-bold text-slate-400">Medicinas:</span>
 ${medListHtml}
 </div>
 ${esAnulada && at.motivo_anulacion ? `
 <div class="text-[11px] text-rose-700 bg-rose-50 p-1.5 rounded border border-rose-100">
 <strong>Motivo anulación:</strong> ${at.motivo_anulacion} (por ${at.anulado_por || 'admin'})
 </div>
 ` : ''}
 </div>
 `;
 }).join("");

 } catch (err) {
 console.error("Error al cargar expediente:", err);
 }
}

function cerrarModalExpediente() {
 document.getElementById("modal-expediente").classList.add("hidden");
}

// ----------------------------------------------------------------
// GESTIÓN DE PACIENTES: ALTA INDEPENDIENTE Y EDICIÓN DE DATOS
// ----------------------------------------------------------------
function abrirModalNuevoPaciente() {
 if (currentUser && currentUser.rol === "AUDITOR") {
 showToast("Acceso Denegado", "El rol de Auditoría no puede registrar pacientes.", "error");
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
 if (currentUser && currentUser.rol === "AUDITOR") {
 showToast("Acceso Denegado", "El rol de Auditoría no puede editar pacientes.", "error");
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
 const res = await fetch("/api/estadisticas");
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
// 8. HISTORIAL GENERAL (CON TRAZABILIDAD DE USUARIO Y ANULACIÓN)
// ================================================================
async function cargarHistorial() {
 try {
 const res = await fetch("/api/atenciones?limit=60");
 const atenciones = await res.json();
 atencionesCache = atenciones;
 const tbody = document.getElementById("tabla-historial-body");
 if (!tbody) return;

 if (atenciones.length === 0) {
 tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">Sin atenciones registradas.</td></tr>`;
 return;
 }

 const puedeAnular = currentUser.rol === "ADMINISTRADOR" || tienePermiso("anular_atenciones");

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
 if (currentUser.rol !== "ADMINISTRADOR") {
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
 <input type="checkbox" id="perm-AUDITOR-${f.clave}" ${audChecked ? 'checked' : ''} class="w-4 h-4 text-slate-600 rounded border-slate-300 focus:ring-slate-500 cursor-pointer">
 </td>
 </tr>
 `;
 }).join("");

 if (window.lucide) lucide.createIcons();

 } catch (err) {
 tbody.innerHTML = `<tr><td colspan="4" class="text-center py-6 text-rose-500">Error al cargar matriz: ${err.message}</td></tr>`;
 }
}

async function guardarMatrizPermisos() {
 if (currentUser.rol !== "ADMINISTRADOR") {
 showToast("Permiso Denegado", "Solo el Administrador puede guardar la matriz de permisos.", "error");
 return;
 }

 const roles = ["ADMINISTRADOR", "ENFERMERIA", "AUDITOR"];
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
 showToast("Permisos Actualizados", "La matriz de accesos y exclusiones se guardó correctamente.", "success");
 aplicarPermisosRol();
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
 renderPacientesTabla(pacientesCache);
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
 setHtml("tab-btn-atencion", `<i data-lucide="stethoscope" class="w-4 h-4"></i> ${t("tab_atencion")}`);
 setHtml("tab-btn-inventario", `<i data-lucide="package" class="w-4 h-4"></i> ${t("tab_inventario")} <span id="badge-alertas" class="hidden bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">0</span>`);
 setHtml("tab-btn-pacientes", `<i data-lucide="users" class="w-4 h-4"></i> ${t("tab_pacientes")}`);
 setHtml("tab-btn-estadisticas", `<i data-lucide="bar-chart-3" class="w-4 h-4"></i> ${t("tab_estadisticas")}`);
 setHtml("tab-btn-historial", `<i data-lucide="history" class="w-4 h-4"></i> ${t("tab_historial")}`);
 setHtml("tab-btn-permisos", `<i data-lucide="shield-alert" class="w-4 h-4"></i> ${t("tab_permisos")}`);

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

 // Tab y Modal de Solicitudes
 setText("lbl-nav-solicitudes", t("tab_solicitudes"));
 setText("lbl-modal-sol-title", t("modal_sol_title"));
 setText("lbl-modal-sol-sub", t("modal_sol_sub"));
 setText("lbl-sol-piso", t("sol_lbl_piso"));
 setText("lbl-sol-area", t("sol_lbl_area"));
 setText("lbl-sol-nombre", t("sol_lbl_nombre"));
 setText("lbl-sol-cedula", t("sol_lbl_cedula"));
 setText("lbl-sol-ext", t("sol_lbl_ext"));
 setText("lbl-sol-prioridad", t("sol_lbl_prioridad"));
 setText("lbl-sol-motivo", t("sol_lbl_motivo"));
 setText("lbl-sol-btn-enviar", t("sol_btn_enviar"));
 setText("lbl-sol-tracker-title", t("sol_tracker_title"));
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
// SOLICITUDES DE ASISTENCIA A PISOS (1 AL 7) - FORMULARIO PÚBLICO
// ================================================================
function abrirModalSolicitudPiso(piso = '6') {
  const modal = document.getElementById("modal-solicitar-asistencia");
  const formBox = document.getElementById("form-solicitar-piso");

  if (!modal) return;
  modal.classList.remove("hidden");

  if (formBox) formBox.classList.remove("hidden");

  // Resetear estado de búsqueda por cédula
  const cedulaInput = document.getElementById("sol-cedula");
  if (cedulaInput) {
    cedulaInput.value = "";
    buscarColaboradorPorCedula("");
    setTimeout(() => cedulaInput.focus(), 100);
  }

  const motivoInput = document.getElementById("sol-motivo");
  if (motivoInput) motivoInput.value = "";

  seleccionarPisoSolicitud(piso);
  actualizarCargosPorMacroArea();
  if (window.lucide) lucide.createIcons();
}

function actualizarCargosPorMacroArea() {
 const macro = document.getElementById("sol-macro-area")?.value || "OPERATIVA";
 const cargoSel = document.getElementById("sol-cargo");
 if (!cargoSel) return;

 const cargosOperativa = [
 "Asesor de Cobranza",
 "Auditor de Cobranza",
 "Líder de Cobranza",
 "Gerente de Cobranza"
 ];

 const cargosAdmin = [
 "Sistemas",
 "Jefe de Aplicaciones",
 "Contabilidad",
 "Recursos Humanos",
 "Gerencia General / Jefatura",
 "Seguridad (Recepción PB)",
 "Minimarket / Tiendita (Mezzanine)"
 ];

 const lista = macro === "ADMINISTRATIVA" ? cargosAdmin : cargosOperativa;
 cargoSel.innerHTML = lista.map(c => `<option value="${c}">${c}</option>`).join("");
 sincronizarAreaCampanaTexto();
}

function sincronizarAreaCampanaTexto() {
 const macro = document.getElementById("sol-macro-area")?.value || "OPERATIVA";
 const cargo = document.getElementById("sol-cargo")?.value || "Asesor de Cobranza";
 const puesto = document.getElementById("sol-ubicacion-puesto")?.value.trim() || "";

 const areaHidden = document.getElementById("sol-area");
 if (areaHidden) {
 const macroNombre = macro === "ADMINISTRATIVA" ? "Administrativa" : "Operativa";
 areaHidden.value = puesto ? `[${macroNombre} - ${cargo}] ${puesto}` : `[${macroNombre} - ${cargo}]`;
 }
}

function cerrarModalSolicitudPiso() {
 const modal = document.getElementById("modal-solicitar-asistencia");
 if (modal) modal.classList.add("hidden");
}

function seleccionarPisoSolicitud(piso) {
 const inputPiso = document.getElementById("sol-piso");
 const txtPiso = document.getElementById("sol-piso-seleccionado-txt");
 const pStr = String(piso);
 if (inputPiso) inputPiso.value = pStr;

 let desc = `Piso ${pStr}`;
 if (pStr === "PB") desc = "Planta Baja (Recepción & Seguridad)";
 else if (pStr === "Mezzanine") desc = "Mezzanine (Minimarket & Apoyo)";
 else if (pStr === "1") desc = "Piso 1 (Cobranzas • Sistemas • RRHH)";
 else if (pStr === "5") desc = "Piso 5 (Cobranzas • Gerencia)";
 else if (pStr === "6") desc = "Piso 6 (Consultorio Central de Enfermería)";
 else if (pStr === "7") desc = "Piso 7 (Call Center Cobranzas)";
 else desc = `Piso ${pStr} (Call Center Cobranzas)`;

 if (txtPiso) txtPiso.textContent = desc;

 const btns = document.querySelectorAll("#piso-selector-btns .piso-btn");
 btns.forEach(btn => {
 const val = btn.getAttribute("data-piso") || btn.textContent.trim();
 if (val.toLowerCase() === pStr.toLowerCase() || (pStr === '6' && val.startsWith('6'))) {
 btn.classList.add("active-piso");
 btn.className = "piso-btn py-1.5 rounded-xl font-bold text-xs border border-[#16325C] bg-[#16325C] text-white transition active-piso";
 } else {
 btn.classList.remove("active-piso");
 if (val === 'Mezzanine' || val === 'Mezz') {
 btn.className = "piso-btn py-1.5 rounded-xl font-bold text-xs border border-orange-200 text-[#E35205] bg-orange-50/50 hover:bg-orange-100 transition";
 } else {
 btn.className = "piso-btn py-1.5 rounded-xl font-bold text-xs border border-slate-200 hover:border-[#16325C] text-slate-700 bg-white transition";
 }
 }
 });
}

async function enviarSolicitudPiso(e) {
 e.preventDefault();
 sincronizarAreaCampanaTexto();
 const piso = document.getElementById("sol-piso") ? document.getElementById("sol-piso").value.trim() : "6";
 const area_campana = document.getElementById("sol-area").value.trim();
 const nombre_paciente = document.getElementById("sol-nombre").value.trim().toUpperCase();
 const cedula = document.getElementById("sol-cedula").value.trim();
 const telefono_extension = document.getElementById("sol-extension").value.trim();
 const prioridad = document.getElementById("sol-prioridad").value;
 const motivo = document.getElementById("sol-motivo").value.trim();

 const btnSubmit = document.getElementById("btn-submit-solicitud");
 if (btnSubmit) {
 btnSubmit.disabled = true;
 btnSubmit.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Enviando...`;
 if (window.lucide) lucide.createIcons();
 }

 try {
 const res = await fetch("/api/solicitudes", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 piso,
 area_campana,
 nombre_paciente,
 cedula,
 telefono_extension,
 prioridad,
 motivo
 })
 });

 const data = await res.json();
 if (!res.ok) {
 alert(data.error || "No se pudo registrar la solicitud.");
 return;
 }

 // Guardar ticket y abrir directamente el Chat en Vivo con Enfermería
  localStorage.setItem("fydi_colab_ticket", data.solicitud_id);
  checkTicketCacheado();

  // Resetear campos del formulario
  const puestoEl = document.getElementById("sol-ubicacion-puesto");
  if (puestoEl) puestoEl.value = "";
  document.getElementById("sol-nombre").value = "";
  document.getElementById("sol-cedula").value = "";
  const extEl = document.getElementById("sol-extension");
  if (extEl) extEl.value = "";
  document.getElementById("sol-motivo").value = "";
  sincronizarAreaCampanaTexto();

  cerrarModalSolicitudPiso();
  abrirChatColaborador(data.solicitud_id);
  cargarSolicitudesPisos();

 } catch (err) {
 alert("Error de conexión al enviar solicitud: " + err.message);
 } finally {
 if (btnSubmit) {
 btnSubmit.disabled = false;
 btnSubmit.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i> <span id="lbl-sol-btn-enviar">Enviar Alerta a Enfermería</span>`;
 if (window.lucide) lucide.createIcons();
 }
 }
}

// ================================================================
// CONSULTA PÚBLICA DE ESTADO DE TICKET (ASISTENCIA EN PISO)
// ================================================================
function abrirModalConsultarTicket() {
 const modal = document.getElementById("modal-consultar-ticket");
 if (!modal) return;
 modal.classList.remove("hidden");
 const input = document.getElementById("input-buscar-ticket");
 if (input) {
 input.value = "";
 setTimeout(() => input.focus(), 50);
 }
 const resBox = document.getElementById("ticket-resultado-box");
 if (resBox) resBox.classList.add("hidden");
 if (window.lucide) lucide.createIcons();
}

function cerrarModalConsultarTicket() {
 const modal = document.getElementById("modal-consultar-ticket");
 if (modal) modal.classList.add("hidden");
}

function consultarQuickTicket() {
 const input = document.getElementById("quick-ticket-input");
 const ticketId = input ? input.value.trim() : "";
 abrirModalConsultarTicket();
 if (ticketId) {
 const modalInput = document.getElementById("input-buscar-ticket");
 if (modalInput) {
 modalInput.value = ticketId;
 ejecutarConsultaTicket();
 }
 }
}

async function ejecutarConsultaTicket(e) {
 if (e) e.preventDefault();
 const input = document.getElementById("input-buscar-ticket");
 const ticketId = input ? input.value.trim() : "";
 const resBox = document.getElementById("ticket-resultado-box");

 if (!ticketId) return;

 resBox.classList.remove("hidden");
 resBox.innerHTML = `<div class="text-center py-4 text-slate-500"><i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto text-brand-600 mb-1"></i> Buscando ticket #${ticketId}...</div>`;
 if (window.lucide) lucide.createIcons();

 try {
 const res = await fetch(`/api/solicitudes/estado?id=${ticketId}`);
 const data = await res.json();

 if (!res.ok) {
 resBox.innerHTML = `
 <div class="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
 <i data-lucide="alert-octagon" class="w-4 h-4 shrink-0 text-rose-600"></i>
 <span>${data.error || "No se encontró ninguna solicitud con ese número de ticket."}</span>
 </div>
 `;
 if (window.lucide) lucide.createIcons();
 return;
 }

 const estadoMap = {
 PENDIENTE: { badge: "bg-amber-100 text-amber-800 border-amber-300", icon: "clock", txt: "En espera de asignación. La enfermera revisará tu alerta pronto." },
 EN_CAMINO: { badge: "bg-sky-100 text-sky-800 border-sky-300", icon: "footprints", txt: " ¡La enfermera va en camino a tu piso!" },
 PUEDE_ACERCARSE: { badge: "bg-emerald-100 text-emerald-800 border-emerald-300", icon: "door-open", txt: " Puedes acercarte al consultorio médico en el Piso 2." },
 ATENDIDA: { badge: "bg-emerald-100 text-emerald-800 border-emerald-300", icon: "check-circle-2", txt: " Solicitud atendida y registrada en el sistema." },
 CANCELADA: { badge: "bg-slate-100 text-slate-600 border-slate-300", icon: "x-circle", txt: "Solicitud descartada o cancelada." }
 };

 const est = estadoMap[data.estado] || estadoMap.PENDIENTE;

 resBox.innerHTML = `
 <div class="space-y-2.5">
 <div class="flex items-center justify-between">
 <span class="font-black text-slate-900 text-sm">Ticket #${data.id}</span>
 <span class="px-2.5 py-1 rounded-full text-[10px] font-bold border ${est.badge}">
 ${data.estado}
 </span>
 </div>
 <div class="text-xs text-slate-700">
 <span class="font-bold">Ubicación:</span> Piso ${data.piso} &bull; ${data.area_campana}
 </div>
 <div class="text-xs text-slate-700">
 <span class="font-bold">Colaborador:</span> ${data.nombre_paciente}
 </div>
 <div class="text-xs text-slate-600">
 <span class="font-bold">Motivo:</span> ${data.motivo}
 </div>
 <div class="p-3 bg-white border border-slate-200 rounded-xl mt-2 text-xs">
 <div class="font-bold text-slate-800 flex items-center gap-1.5 mb-1">
 <i data-lucide="${est.icon}" class="w-4 h-4 text-brand-600"></i>
 Respuesta de Enfermería:
 </div>
 <p class="text-slate-600">${data.respuesta_enfermeria || est.txt}</p>
 ${data.atendido_por ? `<span class="text-[10px] text-slate-400 block mt-1">Atendido por: ${data.atendido_por}</span>` : ''}
 </div>
 <span class="text-[10px] text-slate-400 block text-right">Registrado: ${data.creado_en}</span>
 </div>
 `;
 if (window.lucide) lucide.createIcons();

 } catch (err) {
 resBox.innerHTML = `
 <div class="text-rose-600 text-xs">Error al consultar ticket: ${err.message}</div>
 `;
 }
}

// ================================================================
// PANEL DE GESTIÓN CLÍNICA DE SOLICITUDES DE PISOS (ENFERMERÍA)
// ================================================================
function iniciarPollingSolicitudes() {
 if (pollingSolicitudesInterval) clearInterval(pollingSolicitudesInterval);
 pollingSolicitudesInterval = setInterval(() => {
 // Solo consultar si la pestaña del navegador está activa
 if (!document.hidden) {
 cargarSolicitudesPisos();
 }
 }, 15000);
}

async function cargarSolicitudesPisos(notify = false) {
 const icon = document.getElementById("icon-refresh-solicitudes");
 if (icon) icon.classList.add("animate-spin");

 try {
 const res = await fetch("/api/solicitudes?limit=100");
 if (!res.ok) return;
 solicitudesCache = await res.json();
 renderSolicitudesPisos();
 actualizarBadgesSolicitudes();

 if (notify) {
 showToast("Solicitudes Actualizadas", "Bandeja de pisos sincronizada en tiempo real.", "success");
 }
 } catch (e) {
 console.warn("Error al cargar solicitudes de pisos:", e);
 } finally {
 if (icon) icon.classList.remove("animate-spin");
 }
}

function actualizarBadgesSolicitudes() {
 const pendientes = solicitudesCache.filter(s => s.estado === "PENDIENTE" || s.estado === "EN_CAMINO").length;
 
 const badgeNav = document.getElementById("badge-solicitudes-pendientes");
 const badgeContador = document.getElementById("sol-contador-badge");

 if (badgeNav) {
 if (pendientes > 0) {
 badgeNav.textContent = pendientes;
 badgeNav.classList.remove("hidden");
 } else {
 badgeNav.classList.add("hidden");
 }
 }

 if (badgeContador) {
 badgeContador.textContent = `${pendientes} Activas (${solicitudesCache.length} Total)`;
 }
}

function filtrarSolicitudesEstado(estado) {
 filtroEstadoSolicitud = estado;
 
 const estados = ['TODAS', 'PENDIENTE', 'EN_CAMINO', 'PUEDE_ACERCARSE', 'ATENDIDA'];
 estados.forEach(est => {
 const btn = document.getElementById(`flt-sol-${est}`);
 if (btn) {
 if (est === estado) {
 btn.className = "px-3 py-1.5 rounded-xl font-bold bg-brand-600 text-white shadow-xs transition";
 } else {
 btn.className = "px-3 py-1.5 rounded-xl font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition";
 }
 }
 });

 renderSolicitudesPisos();
}

function renderSolicitudesPisos() {
 const contenedor = document.getElementById("contenedor-solicitudes-cards");
 if (!contenedor) return;

 // Actualizar contadores de los filtros
 const cTodas = solicitudesCache.length;
 const cPend = solicitudesCache.filter(s => s.estado === "PENDIENTE").length;
 const cCamino = solicitudesCache.filter(s => s.estado === "EN_CAMINO").length;
 const cAcer = solicitudesCache.filter(s => s.estado === "PUEDE_ACERCARSE").length;
 const cAten = solicitudesCache.filter(s => s.estado === "ATENDIDA").length;

 const setC = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
 setC("count-flt-todas", cTodas);
 setC("count-flt-pendientes", cPend);
 setC("count-flt-encamino", cCamino);
 setC("count-flt-acercarse", cAcer);
 setC("count-flt-atendidas", cAten);

 const filtroPiso = document.getElementById("filtro-piso-solicitudes")?.value || "TODOS";

 let lista = solicitudesCache;
 if (filtroEstadoSolicitud !== "TODAS") {
 lista = lista.filter(s => s.estado === filtroEstadoSolicitud);
 }
 if (filtroPiso !== "TODOS") {
 lista = lista.filter(s => String(s.piso).toLowerCase() === String(filtroPiso).toLowerCase());
 }

 if (lista.length === 0) {
 contenedor.innerHTML = `
 <div class="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
 <i data-lucide="inbox" class="w-8 h-8 mx-auto text-slate-300 mb-2"></i>
 <p class="font-medium">No hay solicitudes para los filtros seleccionados.</p>
 </div>
 `;
 if (window.lucide) lucide.createIcons();
 return;
 }

 contenedor.innerHTML = lista.map(item => {
 const isEmergencia = item.prioridad === "EMERGENCIA";
 const isUrgente = item.prioridad === "URGENTE";

 let borderClass = "border-slate-200";
 let badgePrio = `<span class="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">NORMAL</span>`;

 if (isEmergencia) {
 borderClass = "border-rose-400 ring-2 ring-rose-400/30 bg-rose-50/20";
 badgePrio = `<span class="px-2 py-0.5 rounded-md bg-rose-600 text-white border border-rose-700 text-[10px] font-black animate-pulse"> EMERGENCIA</span>`;
 } else if (isUrgente) {
 borderClass = "border-amber-300 bg-amber-50/20";
 badgePrio = `<span class="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold"> URGENTE</span>`;
 }

 const estadoMap = {
 PENDIENTE: { badge: "bg-amber-100 text-amber-900 border-amber-300", txt: "Pendiente" },
 EN_CAMINO: { badge: "bg-sky-100 text-sky-900 border-sky-300", txt: "En Camino" },
 PUEDE_ACERCARSE: { badge: "bg-emerald-100 text-emerald-900 border-emerald-300", txt: "Puede Acercarse" },
 ATENDIDA: { badge: "bg-slate-100 text-slate-700 border-slate-300", txt: "Atendida" },
 CANCELADA: { badge: "bg-slate-100 text-slate-500 border-slate-300", txt: "Cancelada" }
 };
 const est = estadoMap[item.estado] || estadoMap.PENDIENTE;

 return `
 <div class="bg-white rounded-2xl p-5 border ${borderClass} shadow-xs hover:shadow-md transition flex flex-col justify-between">
 <div>
 <!-- Header de Tarjeta -->
 <div class="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
 <div class="flex items-center gap-2">
 <span class="font-black text-slate-800 text-sm">#${item.id}</span>
 ${badgePrio}
 </div>
 <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${est.badge}">
 ${est.txt}
 </span>
 </div>

 <!-- Ubicación Destacada (Piso y Área) -->
 <div class="mb-3">
 <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-brand-50 text-brand-900 border border-brand-200 text-xs font-bold">
 <i data-lucide="building" class="w-3.5 h-3.5 text-brand-600"></i>
 <span>PISO ${item.piso}</span>
 <span class="text-brand-300">&bull;</span>
 <span class="truncate max-w-[180px]">${escapeHtml(item.area_campana)}</span>
 </div>
 </div>

 <!-- Paciente y Contacto -->
 <div class="space-y-1 text-xs mb-3">
 <div class="font-bold text-slate-800 flex items-center gap-1.5">
 <i data-lucide="user" class="w-3.5 h-3.5 text-slate-400"></i>
 <span>${escapeHtml(item.nombre_paciente)}</span>
 </div>
 ${item.telefono_extension ? `
 <div class="text-slate-500 flex items-center gap-1.5 text-[11px]">
 <i data-lucide="phone" class="w-3 h-3 text-slate-400"></i>
 <span>Contacto: ${escapeHtml(item.telefono_extension)}</span>
 </div>
 ` : ''}
 </div>

 <!-- Motivo / Síntomas -->
 <div class="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-700 mb-3">
 <span class="font-semibold text-slate-800 block text-[11px] mb-0.5">Motivo de Asistencia:</span>
 <p class="italic">"${escapeHtml(item.motivo)}"</p>
 </div>

 <!-- Respuesta previa si existe -->
 ${item.respuesta_enfermeria ? `
 <div class="p-2.5 bg-sky-50 rounded-xl border border-sky-100 text-xs text-sky-900 mb-3">
 <span class="font-bold block text-[10px] text-sky-800">Instrucción de Enfermería:</span>
 <p class="text-[11px]">${escapeHtml(item.respuesta_enfermeria)}</p>
 ${item.atendido_por ? `<span class="text-[9px] text-sky-600 block mt-0.5">Por: ${escapeHtml(item.atendido_por)}</span>` : ''}
 </div>
 ` : ''}
 </div>

 <!-- Acciones Rápidas de Triage y Chat -->
  <div class="pt-3 border-t border-slate-100 space-y-2">
    <div class="flex items-center gap-2">
      <button onclick="abrirChatEnfermeria(${item.id})" class="flex-1 px-3 py-2 bg-[#16325C] hover:bg-[#0E254A] text-white rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center gap-1.5" title="Abrir chat en vivo con el colaborador">
        <i data-lucide="message-square" class="w-3.5 h-3.5 text-[#FDBA74]"></i>
        Abrir Chat en Vivo
      </button>
      <button onclick="atenderSolicitudEnFormulario(${item.id})" class="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center gap-1.5" title="Cargar datos del paciente en Consulta Médica y recetar">
        <i data-lucide="stethoscope" class="w-3.5 h-3.5"></i>
        Atender
      </button>
    </div>

    <!-- Micro-chips de respuesta 1-clic -->
    <div class="flex items-center justify-between gap-1 pt-1">
      <button onclick="enviarChipDesdeTarjeta(${item.id}, 'Sube al Piso 6 (Consultorio Central) ahora mismo, te espero.', 'PUEDE_ACERCARSE')" class="flex-1 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[10px] transition text-center" title="Indicar al paciente que suba al consultorio">
        Sube a Piso 6
      </button>
      <button onclick="enviarChipDesdeTarjeta(${item.id}, 'Estoy con un paciente en este momento. Por favor espera 5 a 10 minutos en tu puesto y te aviso.', 'EN_ESPERA')" class="flex-1 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[10px] transition text-center" title="Pedir al paciente que espere unos minutos en su puesto">
        Espera 5 min
      </button>
      <button onclick="enviarChipDesdeTarjeta(${item.id}, 'Nos encontramos en Mezzanine (Minimarket / Cafetería) ahora mismo.', 'PUEDE_ACERCARSE')" class="flex-1 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-200 font-bold text-[10px] transition text-center" title="Coordinar en Mezzanine">
        Mezzanine
      </button>
    </div>
  </div>
</div>
`;
 }).join("");

 if (window.lucide) lucide.createIcons();
}

async function responderRapidoSolicitud(id, nuevoEstado) {
 const req = solicitudesCache.find(s => s.id === id);
 if (!req) return;

 const comentarios = {
 EN_CAMINO: `Voy subiendo en camino al Piso ${req.piso} con equipo médico básico. Llego en pocos minutos.`,
 PUEDE_ACERCARSE: "El consultorio en el Piso 2 se encuentra despejado. Puedes acercarte para tu atención presencial."
 };

 try {
 const res = await fetch("/api/solicitudes/responder", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 solicitud_id: id,
 nuevo_estado: nuevoEstado,
 comentario: comentarios[nuevoEstado] || "",
 user_role: currentUser ? currentUser.rol : "ENFERMERIA",
 usuario_nombre: currentUser ? currentUser.nombre_completo : "Personal Médico"
 })
 });

 const data = await res.json();
 if (res.ok) {
 showToast("Solicitud Actualizada", `Ticket #${id} marcado como '${nuevoEstado}'.`, "success");
 cargarSolicitudesPisos();
 } else {
 showToast("Error", data.error || "No se pudo actualizar.", "error");
 }
 } catch (e) {
 showToast("Error de conexión", e.message, "error");
 }
}

function abrirModalResponderSolicitud(id, estadoSugerido = null) {
 const req = solicitudesCache.find(s => s.id === id);
 if (!req) return;

 document.getElementById("resp-sol-id").value = req.id;
 document.getElementById("resp-sol-sub").textContent = `Ticket #${req.id} • Piso ${req.piso}`;
 document.getElementById("resp-sol-paciente").textContent = `${req.nombre_paciente} ${req.cedula ? `(C.I: ${req.cedula})` : ''}`;
 document.getElementById("resp-sol-ubicacion").textContent = `Piso ${req.piso} • ${req.area_campana} ${req.telefono_extension ? `• Ext/Tlf: ${req.telefono_extension}` : ''}`;
 document.getElementById("resp-sol-motivo").textContent = `Motivo: "${req.motivo}"`;

 const selEstado = document.getElementById("resp-sol-estado");
 if (selEstado) {
 selEstado.value = estadoSugerido || req.estado;
 }

 const txtComentario = document.getElementById("resp-sol-comentario");
 if (txtComentario) {
 txtComentario.value = req.respuesta_enfermeria || "";
 }

 document.getElementById("modal-responder-solicitud").classList.remove("hidden");
 if (window.lucide) lucide.createIcons();
}

function cerrarModalResponderSolicitud() {
 document.getElementById("modal-responder-solicitud").classList.add("hidden");
}

function setRespChip(txt) {
 const input = document.getElementById("resp-sol-comentario");
 if (input) {
 input.value = txt;
 input.focus();
 }
}

async function guardarRespuestaSolicitud(e) {
 e.preventDefault();
 const id = document.getElementById("resp-sol-id").value;
 const nuevo_estado = document.getElementById("resp-sol-estado").value;
 const comentario = document.getElementById("resp-sol-comentario").value.trim();

 try {
 const res = await fetch("/api/solicitudes/responder", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({
 solicitud_id: id,
 nuevo_estado,
 comentario,
 user_role: currentUser ? currentUser.rol : "ENFERMERIA",
 usuario_nombre: currentUser ? currentUser.nombre_completo : "Personal Médico"
 })
 });

 const data = await res.json();
 if (res.ok) {
 showToast("Solicitud Actualizada", `Ticket #${id} actualizado exitosamente.`, "success");
 cerrarModalResponderSolicitud();
 cargarSolicitudesPisos();
 } else {
 showToast("Error", data.error || "No se pudo actualizar la solicitud.", "error");
 }
 } catch (err) {
 showToast("Error de conexión", err.message, "error");
 }
}

function atenderSolicitudEnFormulario(solicitudId) {
 const req = solicitudesCache.find(s => s.id === solicitudId);
 if (!req) return;

 currentSolicitudAtendiendoId = req.id;

 // Cambiar a la pestaña de Nueva Atención
 cambiarTab("atencion");

 // Autocompletar datos del paciente en el formulario
 const parts = req.nombre_paciente.split(" ");
 let nom = parts[0] || "";
 let ape = parts.slice(1).join(" ") || "";

 document.getElementById("pac-nombres").value = nom;
 document.getElementById("pac-apellidos").value = ape;
 if (req.cedula) document.getElementById("pac-cedula").value = req.cedula;
 if (req.telefono_extension) document.getElementById("pac-celular").value = req.telefono_extension;
 document.getElementById("pac-piso").value = `Piso ${req.piso} - ${req.area_campana}`;
 document.getElementById("atencion-diagnostico").value = `[Solicitud #${req.id}] ${req.motivo}`;

 showToast(
 "Paciente Cargado desde Solicitud",
 `Datos de ${req.nombre_paciente} precargados. Al confirmar la receta se cerrará el Ticket #${req.id}.`,
 "success"
 );
}

// Cerrar modales con tecla Escape para máxima accesibilidad y excelente UX
document.addEventListener("keydown", (e) => {
 if (e.key === "Escape") {
 cerrarModalLogin();
 cerrarModalSolicitudPiso();
 cerrarModalConsultarTicket();
 cerrarModalResponderSolicitud();
 }
});



// ================================================================
// GESTIÓN DE UBICACIÓN Y DISPONIBILIDAD EN TIEMPO REAL DE ENFERMERÍA
// ================================================================
async function cargarEstadoEnfermera() {
  try {
    const res = await fetch("/api/enfermera/estado");
    if (!res.ok) return;
    const data = await res.json();
    estadoEnfermeraCache = data;
    renderEstadoEnfermeraUI(data);
  } catch (e) {
    console.warn("No se pudo cargar el estado de enfermería:", e);
  }
}

function renderEstadoEnfermeraUI(data) {
  const ub = data.ubicacion_actual || "Piso 6 - Consultorio Central";
  const disp = data.disponibilidad || "DISPONIBLE";

  // 1. Banner en el Hero de la Landing Page
  const landLoc = document.getElementById("landing-nurse-location-text");
  const landPill = document.getElementById("landing-nurse-status-pill");
  if (landLoc) landLoc.textContent = ub;
  if (landPill) {
    if (disp === "EN_CONSULTA") {
      landPill.textContent = "En Consulta (Ocupada)";
      landPill.className = "px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500 text-white uppercase";
    } else if (disp === "EN_PAUSA") {
      landPill.textContent = "En Pausa";
      landPill.className = "px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-500 text-white uppercase";
    } else {
      landPill.textContent = "Disponible";
      landPill.className = "px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500 text-white uppercase";
    }
  }

  // 2. Banner dentro del Chat del Colaborador
  const chatLoc = document.getElementById("chat-colab-nurse-location");
  const chatStatus = document.getElementById("chat-colab-nurse-status-badge");
  if (chatLoc) chatLoc.textContent = ub;
  if (chatStatus) {
    if (disp === "EN_CONSULTA") {
      chatStatus.textContent = "En Consulta con Paciente";
      chatStatus.className = "px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300";
    } else if (disp === "EN_PAUSA") {
      chatStatus.textContent = "En Receso Temporal";
      chatStatus.className = "px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-300";
    } else {
      chatStatus.textContent = "Disponible para Recibir";
      chatStatus.className = "px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300";
    }
  }

  // 3. Panel de Control de Enfermería (#tab-solicitudes)
  const adminLoc = document.getElementById("admin-nurse-location-display");
  const adminBadge = document.getElementById("admin-nurse-live-badge");
  const adminSel = document.getElementById("select-disp-enfermera");
  const btnPiso6 = document.getElementById("btn-loc-piso6");
  const btnMezz = document.getElementById("btn-loc-mezzanine");

  if (adminLoc) adminLoc.innerHTML = `<i data-lucide="stethoscope" class="w-4 h-4 text-[#FDBA74]"></i> <span>${ub}</span>`;
  if (adminBadge) {
    if (disp === "EN_CONSULTA") {
      adminBadge.textContent = "En Consulta";
      adminBadge.className = "px-2 py-0.5 rounded-md text-[10px] font-black bg-amber-500 text-white uppercase tracking-wider";
    } else if (disp === "EN_PAUSA") {
      adminBadge.textContent = "En Pausa";
      adminBadge.className = "px-2 py-0.5 rounded-md text-[10px] font-black bg-slate-500 text-white uppercase tracking-wider";
    } else {
      adminBadge.textContent = "Disponible";
      adminBadge.className = "px-2 py-0.5 rounded-md text-[10px] font-black bg-emerald-500 text-white uppercase tracking-wider";
    }
  }
  if (adminSel) adminSel.value = disp;

  if (btnPiso6 && btnMezz) {
    if (ub.includes("Mezzanine")) {
      btnMezz.className = "px-3 py-1.5 rounded-xl font-bold text-xs bg-white text-[#16325C] shadow-sm transition flex items-center gap-1.5";
      btnPiso6.className = "px-3 py-1.5 rounded-xl font-bold text-xs bg-white/10 hover:bg-white/20 text-white border border-white/20 transition flex items-center gap-1.5";
    } else {
      btnPiso6.className = "px-3 py-1.5 rounded-xl font-bold text-xs bg-white text-[#16325C] shadow-sm transition flex items-center gap-1.5";
      btnMezz.className = "px-3 py-1.5 rounded-xl font-bold text-xs bg-white/10 hover:bg-white/20 text-white border border-white/20 transition flex items-center gap-1.5";
    }
  }

  if (window.lucide) lucide.createIcons();
}

async function cambiarUbicacionEnfermera(nuevaUbicacion) {
  try {
    const res = await fetch("/api/enfermera/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ubicacion_actual: nuevaUbicacion,
        disponibilidad: estadoEnfermeraCache.disponibilidad || "DISPONIBLE",
        user_role: currentUser ? currentUser.rol : "ENFERMERIA"
      })
    });
    const data = await res.json();
    if (res.ok) {
      showToast("Ubicación Actualizada", `Ahora estás en: ${nuevaUbicacion}`, "success");
      cargarEstadoEnfermera();
    } else {
      showToast("Error", data.error || "No se pudo actualizar la ubicación.", "error");
    }
  } catch (e) {
    showToast("Error de Red", e.message, "error");
  }
}

async function cambiarDisponibilidadEnfermera(nuevaDisp) {
  try {
    const res = await fetch("/api/enfermera/estado", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ubicacion_actual: estadoEnfermeraCache.ubicacion_actual || "Piso 6 - Consultorio Central",
        disponibilidad: nuevaDisp,
        user_role: currentUser ? currentUser.rol : "ENFERMERIA"
      })
    });
    const data = await res.json();
    if (res.ok) {
      const labels = {
        DISPONIBLE: "Disponible para recibir pacientes.",
        EN_CONSULTA: "Marcada como Ocupada con paciente.",
        EN_PAUSA: "Marcada en Pausa / Almuerzo."
      };
      showToast("Estado Actualizado", labels[nuevaDisp] || nuevaDisp, "success");
      cargarEstadoEnfermera();
    } else {
      showToast("Error", data.error || "No se pudo actualizar la disponibilidad.", "error");
    }
  } catch (e) {
    showToast("Error de Red", e.message, "error");
  }
}

// ================================================================
// SISTEMA DE CHAT EN VIVO DE CONSULTA Y TRIAJE (COLABORADOR & ENFERMERÍA)
// ================================================================

function checkTicketCacheado() {
  const cached = localStorage.getItem("fydi_colab_ticket");
  const btn = document.getElementById("btn-resume-cached-ticket");
  const txt = document.getElementById("txt-resume-cached-ticket");
  if (cached && btn) {
    btn.classList.remove("hidden");
    if (txt) txt.textContent = `Mi Chat (#${cached})`;
  } else if (btn) {
    btn.classList.add("hidden");
  }
}

function abrirChatDesdeQuickInput() {
  const inp = document.getElementById("quick-ticket-input");
  const val = inp ? inp.value.trim() : "";
  if (!val) {
    alert("Por favor ingresa tu número de ticket.");
    if (inp) inp.focus();
    return;
  }
  abrirChatColaborador(val);
}

function abrirChatTicketCacheado() {
  const cached = localStorage.getItem("fydi_colab_ticket");
  if (cached) {
    abrirChatColaborador(cached);
  }
}

function abrirChatColaborador(ticketId) {
  cerrarModalSolicitudPiso();
  cerrarModalConsultarTicket();

  currentChatTicketId = parseInt(ticketId);
  localStorage.setItem("fydi_colab_ticket", currentChatTicketId);
  checkTicketCacheado();

  const modal = document.getElementById("modal-chat-colaborador");
  if (!modal) return;
  modal.classList.remove("hidden");

  const badge = document.getElementById("chat-colab-ticket-badge");
  if (badge) badge.textContent = `#${currentChatTicketId}`;

  cargarEstadoEnfermera();
  cargarMensajesChatColaborador();

  if (pollingChatColaboradorInterval) clearInterval(pollingChatColaboradorInterval);
  pollingChatColaboradorInterval = setInterval(() => {
    if (!document.getElementById("modal-chat-colaborador")?.classList.contains("hidden")) {
      cargarMensajesChatColaborador(false);
    }
  }, 3500);

  if (window.lucide) lucide.createIcons();
}

function cerrarChatColaborador() {
  if (pollingChatColaboradorInterval) {
    clearInterval(pollingChatColaboradorInterval);
    pollingChatColaboradorInterval = null;
  }
  const modal = document.getElementById("modal-chat-colaborador");
  if (modal) modal.classList.add("hidden");
}

async function cargarMensajesChatColaborador(showSpin = true) {
  if (!currentChatTicketId) return;

  const spin = document.getElementById("chat-colab-spin-icon");
  if (showSpin && spin) spin.classList.add("animate-spin");

  try {
    const [resMsgs, resTicket] = await Promise.all([
      fetch(`/api/chat/mensajes?solicitud_id=${currentChatTicketId}`),
      fetch(`/api/solicitudes/estado?id=${currentChatTicketId}`)
    ]);

    if (!resTicket.ok) {
      const err = await resTicket.json();
      document.getElementById("chat-colab-messages-container").innerHTML = `
        <div class="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-center">
          <p class="font-bold">No se encontró el ticket #${currentChatTicketId}.</p>
          <p class="text-xs text-rose-600 mt-1">${err.error || ''}</p>
        </div>
      `;
      return;
    }

    const ticket = await resTicket.json();
    const msgs = await resMsgs.json();

    const sub = document.getElementById("chat-colab-paciente-desc");
    if (sub) {
      sub.textContent = `${ticket.nombre_paciente} • Piso ${ticket.piso} • Estado: ${ticket.estado}`;
    }

    renderMensajesColaboradorUI(msgs, ticket);

  } catch (e) {
    console.warn("Error al cargar chat colaborador:", e);
  } finally {
    if (spin) spin.classList.remove("animate-spin");
  }
}

function renderMensajesColaboradorUI(msgs, ticket) {
  const container = document.getElementById("chat-colab-messages-container");
  if (!container) return;

  if (!msgs || msgs.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 text-slate-400">
        <i data-lucide="message-square" class="w-8 h-8 mx-auto text-slate-300 mb-1"></i>
        <p>Aún no hay mensajes en este chat.</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  const previousCount = container.querySelectorAll(".chat-bubble-item").length;

  container.innerHTML = msgs.map(m => {
    const isPaciente = m.remitente_tipo === "PACIENTE";
    const isSistema = m.remitente_tipo === "SISTEMA";

    if (isSistema) {
      return `
        <div class="chat-bubble-item flex justify-center my-2">
          <div class="px-3 py-1.5 rounded-full bg-sky-50 border border-sky-200 text-sky-900 text-[11px] font-medium text-center max-w-sm flex items-center gap-1.5">
            <i data-lucide="info" class="w-3.5 h-3.5 text-sky-600 shrink-0"></i>
            <span>${escapeHtml(m.mensaje)}</span>
          </div>
        </div>
      `;
    }

    if (isPaciente) {
      return `
        <div class="chat-bubble-item flex justify-end">
          <div class="max-w-[80%] sm:max-w-[70%] bg-[#16325C] text-white rounded-2xl rounded-tr-xs p-3 shadow-xs">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-bold text-[11px] text-[#FDBA74]">${escapeHtml(m.remitente_nombre || 'Tú')}</span>
              <span class="text-[9px] text-slate-300">${formatHoraChat(m.creado_en)}</span>
            </div>
            <p class="text-xs leading-relaxed whitespace-pre-wrap">${escapeHtml(m.mensaje)}</p>
          </div>
        </div>
      `;
    }

    // Enfermería
    const ubBadge = m.ubicacion_enfermera ? `<span class="text-[9px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded font-semibold ml-1">${escapeHtml(m.ubicacion_enfermera)}</span>` : '';
    return `
      <div class="chat-bubble-item flex justify-start">
        <div class="max-w-[85%] sm:max-w-[75%] bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-xs p-3 shadow-xs">
          <div class="flex items-center justify-between gap-2 mb-1">
            <div class="flex items-center gap-1">
              <span class="font-bold text-[11px] text-emerald-700 flex items-center gap-1">
                <i data-lucide="stethoscope" class="w-3.5 h-3.5"></i>
                ${escapeHtml(m.remitente_nombre || 'Lic. Enfermería')}
              </span>
              ${ubBadge}
            </div>
            <span class="text-[9px] text-slate-400">${formatHoraChat(m.creado_en)}</span>
          </div>
          <p class="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">${escapeHtml(m.mensaje)}</p>
        </div>
      </div>
    `;
  }).join("");

  if (window.lucide) lucide.createIcons();

  if (msgs.length > previousCount) {
    container.scrollTop = container.scrollHeight;
  }
}

async function enviarMensajeChatColaborador(e) {
  if (e) e.preventDefault();
  if (!currentChatTicketId) return;

  const input = document.getElementById("input-chat-colaborador");
  const msg = input ? input.value.trim() : "";
  if (!msg) return;

  const btn = document.getElementById("btn-chat-colab-send");
  if (btn) btn.disabled = true;

  try {
    const res = await fetch("/api/chat/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        solicitud_id: currentChatTicketId,
        remitente_tipo: "PACIENTE",
        mensaje: msg
      })
    });

    if (res.ok) {
      if (input) input.value = "";
      cargarMensajesChatColaborador(false);
    } else {
      const data = await res.json();
      alert("Error al enviar mensaje: " + (data.error || ""));
    }
  } catch (err) {
    alert("Error de conexión: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
    if (input) input.focus();
  }
}

// ----------------------------------------------------------------
// CHAT ENFERMERÍA (PANEL CLÍNICO)
// ----------------------------------------------------------------

function abrirChatEnfermeria(ticketId) {
  currentChatTicketId = parseInt(ticketId);

  const modal = document.getElementById("modal-chat-enfermeria");
  if (!modal) return;
  modal.classList.remove("hidden");

  const badge = document.getElementById("nurse-chat-ticket-badge");
  if (badge) badge.textContent = `#${currentChatTicketId}`;

  const selStatus = document.getElementById("select-ticket-status-chat");
  const ticket = solicitudesCache.find(s => s.id === currentChatTicketId);
  if (ticket && selStatus) {
    selStatus.value = ticket.estado;
  }

  cargarMensajesChatEnfermeria();

  if (pollingChatEnfermeriaInterval) clearInterval(pollingChatEnfermeriaInterval);
  pollingChatEnfermeriaInterval = setInterval(() => {
    if (!document.getElementById("modal-chat-enfermeria")?.classList.contains("hidden")) {
      cargarMensajesChatEnfermeria(false);
    }
  }, 3500);

  if (window.lucide) lucide.createIcons();
}

function cerrarChatEnfermeria() {
  if (pollingChatEnfermeriaInterval) {
    clearInterval(pollingChatEnfermeriaInterval);
    pollingChatEnfermeriaInterval = null;
  }
  const modal = document.getElementById("modal-chat-enfermeria");
  if (modal) modal.classList.add("hidden");
  cargarSolicitudesPisos();
}

async function cargarMensajesChatEnfermeria(showSpin = true) {
  if (!currentChatTicketId) return;

  try {
    const [resMsgs, resTicket] = await Promise.all([
      fetch(`/api/chat/mensajes?solicitud_id=${currentChatTicketId}`),
      fetch(`/api/solicitudes/estado?id=${currentChatTicketId}`)
    ]);

    if (!resTicket.ok) return;

    const ticket = await resTicket.json();
    const msgs = await resMsgs.json();

    const sum = document.getElementById("nurse-chat-patient-summary");
    if (sum) {
      sum.textContent = `${ticket.nombre_paciente} • Piso ${ticket.piso} (${ticket.area_campana || ''}) • Motivo: "${ticket.motivo}"`;
    }

    const selStatus = document.getElementById("select-ticket-status-chat");
    if (selStatus && document.activeElement !== selStatus) {
      selStatus.value = ticket.estado;
    }

    renderMensajesEnfermeriaUI(msgs, ticket);

  } catch (e) {
    console.warn("Error cargando mensajes de enfermería:", e);
  }
}

function renderMensajesEnfermeriaUI(msgs, ticket) {
  const container = document.getElementById("nurse-chat-messages-container");
  if (!container) return;

  const previousCount = container.querySelectorAll(".nurse-chat-item").length;

  container.innerHTML = msgs.map(m => {
    const isEnfermera = m.remitente_tipo === "ENFERMERIA";
    const isSistema = m.remitente_tipo === "SISTEMA";

    if (isSistema) {
      return `
        <div class="nurse-chat-item flex justify-center my-2">
          <span class="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-medium flex items-center gap-1.5">
            <i data-lucide="info" class="w-3 h-3 text-slate-500"></i>
            ${escapeHtml(m.mensaje)}
          </span>
        </div>
      `;
    }

    if (isEnfermera) {
      return `
        <div class="nurse-chat-item flex justify-end">
          <div class="max-w-[80%] bg-[#16325C] text-white rounded-2xl rounded-tr-xs p-3 shadow-xs">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-bold text-[11px] text-[#FDBA74] flex items-center gap-1">
                <i data-lucide="stethoscope" class="w-3 h-3"></i>
                ${escapeHtml(m.remitente_nombre || 'Tú (Enfermería)')}
              </span>
              <span class="text-[9px] text-slate-300">${formatHoraChat(m.creado_en)}</span>
            </div>
            <p class="text-xs leading-relaxed whitespace-pre-wrap">${escapeHtml(m.mensaje)}</p>
            ${m.ubicacion_enfermera ? `<span class="text-[9px] text-orange-200/90 block mt-1">Ubicación indicada: ${escapeHtml(m.ubicacion_enfermera)}</span>` : ''}
          </div>
        </div>
      `;
    }

    // Mensaje del Colaborador / Paciente
    return `
      <div class="nurse-chat-item flex justify-start">
        <div class="max-w-[80%] bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-xs p-3 shadow-xs">
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="font-bold text-[11px] text-brand-700 flex items-center gap-1">
              <i data-lucide="user" class="w-3 h-3"></i>
              ${escapeHtml(m.remitente_nombre || 'Colaborador')}
            </span>
            <span class="text-[9px] text-slate-400">${formatHoraChat(m.creado_en)}</span>
          </div>
          <p class="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">${escapeHtml(m.mensaje)}</p>
        </div>
      </div>
    `;
  }).join("");

  if (window.lucide) lucide.createIcons();

  if (msgs.length > previousCount) {
    container.scrollTop = container.scrollHeight;
  }
}

async function enviarMensajeChatEnfermeria(e) {
  if (e) e.preventDefault();
  if (!currentChatTicketId) return;

  const input = document.getElementById("input-chat-enfermeria");
  const msg = input ? input.value.trim() : "";
  if (!msg) return;

  try {
    const res = await fetch("/api/chat/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        solicitud_id: currentChatTicketId,
        remitente_tipo: "ENFERMERIA",
        remitente_nombre: currentUser ? currentUser.nombre_completo : "Lic. Enfermería",
        user_role: currentUser ? currentUser.rol : "ENFERMERIA",
        mensaje: msg
      })
    });

    if (res.ok) {
      if (input) input.value = "";
      cargarMensajesChatEnfermeria(false);
      cargarSolicitudesPisos();
    } else {
      const data = await res.json();
      showToast("Error", data.error || "No se pudo enviar.", "error");
    }
  } catch (err) {
    showToast("Error de conexión", err.message, "error");
  }
}

async function enviarChipEnfermeria(texto, nuevoEstado) {
  if (!currentChatTicketId) return;

  try {
    const res = await fetch("/api/chat/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        solicitud_id: currentChatTicketId,
        remitente_tipo: "ENFERMERIA",
        remitente_nombre: currentUser ? currentUser.nombre_completo : "Lic. Enfermería",
        user_role: currentUser ? currentUser.rol : "ENFERMERIA",
        mensaje: texto,
        nuevo_estado: nuevoEstado
      })
    });

    if (res.ok) {
      showToast("Respuesta Enviada", `Mensaje y estado '${nuevoEstado}' aplicados.`, "success");
      cargarMensajesChatEnfermeria(false);
      cargarSolicitudesPisos();
    }
  } catch (err) {
    showToast("Error", err.message, "error");
  }
}

async function enviarChipDesdeTarjeta(ticketId, texto, nuevoEstado) {
  try {
    const res = await fetch("/api/chat/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        solicitud_id: ticketId,
        remitente_tipo: "ENFERMERIA",
        remitente_nombre: currentUser ? currentUser.nombre_completo : "Lic. Enfermería",
        user_role: currentUser ? currentUser.rol : "ENFERMERIA",
        mensaje: texto,
        nuevo_estado: nuevoEstado
      })
    });
    if (res.ok) {
      showToast("Instrucción Enviada", `Se envió respuesta al Ticket #${ticketId}.`, "success");
      cargarSolicitudesPisos();
    }
  } catch (e) {
    showToast("Error", e.message, "error");
  }
}

async function cambiarEstadoTicketDesdeChat(nuevoEstado) {
  if (!currentChatTicketId || !nuevoEstado) return;

  try {
    const res = await fetch("/api/solicitudes/responder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        solicitud_id: currentChatTicketId,
        nuevo_estado: nuevoEstado,
        comentario: `Estado actualizado a '${nuevoEstado}' por Enfermería.`,
        user_role: currentUser ? currentUser.rol : "ENFERMERIA",
        usuario_nombre: currentUser ? currentUser.nombre_completo : "Lic. Enfermería"
      })
    });

    if (res.ok) {
      showToast("Estado Actualizado", `Ticket #${currentChatTicketId} marcado como '${nuevoEstado}'.`, "success");
      cargarMensajesChatEnfermeria(false);
      cargarSolicitudesPisos();
    }
  } catch (err) {
    showToast("Error", err.message, "error");
  }
}

function atenderPacienteDesdeChat() {
  if (!currentChatTicketId) return;
  const sid = currentChatTicketId;
  cerrarChatEnfermeria();
  atenderSolicitudEnFormulario(sid);
}

function formatHoraChat(fechaStr) {
  if (!fechaStr) return "";
  try {
    const d = new Date(fechaStr);
    if (isNaN(d.getTime())) {
      const parts = fechaStr.split(" ");
      return parts[1] ? parts[1].substring(0, 5) : fechaStr;
    }
    return d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch (e) {
    return fechaStr;
  }
}


// ================================================================
// RECONOCIMIENTO AUTOMÁTICO DE COLABORADOR POR CÉDULA (ZERO DUPLICADOS)
// ================================================================
let pacienteIdentificadoCache = null;

async function buscarColaboradorPorCedula(cedula, explicitClick = false) {
  const val = (cedula || "").trim();
  const statusEl = document.getElementById("cedula-search-status");
  const boxReconocido = document.getElementById("box-paciente-reconocido");
  const boxNuevo = document.getElementById("box-paciente-nuevo");
  const nombreInput = document.getElementById("sol-nombre");

  if (!statusEl) return;

  if (val.length < 10 && !explicitClick) {
    statusEl.textContent = `${val.length}/10 dígitos`;
    if (boxReconocido) boxReconocido.classList.add("hidden");
    if (boxNuevo) boxNuevo.classList.remove("hidden");
    if (nombreInput) {
      nombreInput.readOnly = false;
      nombreInput.required = true;
    }
    pacienteIdentificadoCache = null;
    return;
  }

  statusEl.textContent = "Verificando...";

  try {
    const res = await fetch(`/api/pacientes?q=${encodeURIComponent(val)}`);
    const list = await res.json();

    const match = list.find(p => p.cedula && p.cedula.trim() === val) || list[0];

    if (match && (match.cedula === val || (explicitClick && list.length === 1))) {
      pacienteIdentificadoCache = match;
      statusEl.textContent = "Colaborador encontrado";

      const nomCompleto = `${match.nombres} ${match.apellidos}`.trim().toUpperCase();
      if (nombreInput) {
        nombreInput.value = nomCompleto;
        nombreInput.readOnly = true;
        nombreInput.required = false;
      }

      const pNom = document.getElementById("pac-reconocido-nombre");
      const pSub = document.getElementById("pac-reconocido-sub");
      const pVis = document.getElementById("pac-reconocido-visitas");

      if (pNom) pNom.textContent = nomCompleto;
      if (pSub) pSub.textContent = `C.I: ${match.cedula} • ${match.piso_area || 'Área general'}`;
      if (pVis) pVis.textContent = `${match.total_atenciones || 0} visitas previas`;

      if (boxReconocido) boxReconocido.classList.remove("hidden");
      if (boxNuevo) boxNuevo.classList.add("hidden");

      // Auto-seleccionar piso si está en el registro del paciente
      if (match.piso_area) {
        for (const p of ['PB', 'Mezzanine', '1', '2', '3', '4', '5', '6', '7']) {
          if (match.piso_area.includes(`Piso ${p}`) || match.piso_area.includes(p)) {
            seleccionarPisoSolicitud(p);
            break;
          }
        }
      }
    } else {
      pacienteIdentificadoCache = null;
      statusEl.textContent = val.length === 10 ? "Nuevo registro (sin visitas previas)" : "No registrado";
      if (boxReconocido) boxReconocido.classList.add("hidden");
      if (boxNuevo) boxNuevo.classList.remove("hidden");
      if (nombreInput) {
        nombreInput.readOnly = false;
        nombreInput.required = true;
        nombreInput.focus();
      }
    }
  } catch (err) {
    statusEl.textContent = "Búsqueda local";
  }
}

function setMotivoChip(texto) {
  const txtArea = document.getElementById("sol-motivo");
  if (txtArea) {
    txtArea.value = texto;
    txtArea.focus();
  }
}
