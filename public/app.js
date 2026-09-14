// Dispensario Médico FYDI - Frontend JavaScript con Control de Roles
let medicamentosCache = [];
let pacientesCache = [];
let renglonesReceta = [];
let renglonIdCounter = 0;
let atencionPendiente = null;
let permisosCache = [];

// Estado de sesión activa (Exige autenticación corporativa real)
let currentUser = JSON.parse(localStorage.getItem("fydi_user")) || null;

document.addEventListener("DOMContentLoaded", () => {
  initIdioma();
  initReloj();
  initFechaHoy();

  // Verificar si hay sesión activa; si no, abrir pantalla de login corporativo
  if (!currentUser || !currentUser.usuario) {
    abrirModalLogin();
  } else {
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

function abrirModalLogin() {
  const modal = document.getElementById("modal-login");
  if (!modal) return;
  modal.classList.remove("hidden");

  // Limpiar formulario y errores previos
  const errBox = document.getElementById("login-error-msg");
  if (errBox) errBox.classList.add("hidden");
  const pInput = document.getElementById("login-password");
  if (pInput) pInput.value = "";

  if (window.lucide) lucide.createIcons();
}

function cerrarModalLogin() {
  // Solo se puede cerrar si ya existe un usuario autenticado
  if (!currentUser || !currentUser.usuario) {
    showToast("Autenticación Obligatoria", "Debe ingresar sus credenciales para acceder al sistema.", "warning");
    return;
  }
  document.getElementById("modal-login").classList.add("hidden");
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
  abrirModalLogin();
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const u = document.getElementById("login-usuario").value.trim();
  const p = document.getElementById("login-password").value.trim();
  const errBox = document.getElementById("login-error-msg");
  const errTxt = document.getElementById("login-error-text");
  const btnSubmit = document.getElementById("btn-login-submit");

  if (!u || !p) {
    if (errBox) {
      errBox.classList.remove("hidden");
      errTxt.textContent = "Debe ingresar usuario y contraseña.";
    }
    return;
  }

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Validando credenciales...`;
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
        errTxt.textContent = data.error || "Credenciales incorrectas. Verifique usuario y contraseña.";
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
      document.getElementById("modal-login").classList.add("hidden");
      aplicarPermisosRol();
      renderInventarioTabla(medicamentosCache);
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
      btnSubmit.innerHTML = `<i data-lucide="lock" class="w-4 h-4"></i> <span>Verificar e Ingresar al Sistema</span>`;
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

  if (tabName === "inventario") {
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
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-slate-400">No se encontraron productos coincidentes.</td></tr>`;
    return;
  }

  let totUnidades = 0;
  let disponibles = 0;
  let bajos = 0;
  let agotados = 0;

  const esAdmin = currentUser.rol === "ADMINISTRADOR";

  tbody.innerHTML = lista.map(m => {
    totUnidades += m.stock_actual;
    if (m.stock_actual === 0) {
      agotados++;
    } else if (m.stock_actual <= m.stock_minimo) {
      bajos++;
    } else {
      disponibles++;
    }

    let badgeHtml = "";
    if (m.estado === "DISPONIBLE") {
      const txt = typeof t === "function" ? t("badge_disponible") : "🟢 DISPONIBLE";
      badgeHtml = `<span class="bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full text-[10px]">${txt}</span>`;
    } else if (m.estado === "STOCK BAJO") {
      const txt = typeof t === "function" ? t("badge_stock_bajo") : "🟡 STOCK BAJO";
      badgeHtml = `<span class="bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full text-[10px]">${txt}</span>`;
    } else {
      const txt = typeof t === "function" ? t("badge_agotado") : "🔴 AGOTADO";
      badgeHtml = `<span class="bg-rose-100 text-rose-800 font-semibold px-2 py-0.5 rounded-full text-[10px]">${txt}</span>`;
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
        <button onclick="abrirModalEditarMed(${m.id})" class="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded-lg transition ml-1" title="Editar catálogo">
          <i data-lucide="edit-2" class="w-3 h-3"></i> ${lblEditar}
        </button>
        <button onclick="abrirModalAjusteStock(${m.id})" class="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg transition ml-1" title="Ajuste físico de stock">
          <i data-lucide="sliders" class="w-3 h-3"></i> ${lblAjustar}
        </button>
      `;
    }

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="py-2.5 px-4 font-mono font-bold text-slate-700">${m.codigo}</td>
        <td class="py-2.5 px-4 font-semibold text-slate-800">${m.nombre}</td>
        <td class="py-2.5 px-4 text-slate-600">${m.presentacion || '-'}</td>
        <td class="py-2.5 px-4 text-slate-600">${m.concentracion || '-'}</td>
        <td class="py-2.5 px-4">${marcasHtml}</td>
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

  document.getElementById("metric-inv-total-unidades").textContent = totUnidades;
  document.getElementById("metric-inv-disponibles").textContent = disponibles;
  document.getElementById("metric-inv-bajos").textContent = bajos;
  document.getElementById("metric-inv-agotados").textContent = agotados;

  const badgeAlertas = document.getElementById("badge-alertas");
  if (bajos + agotados > 0) {
    badgeAlertas.textContent = bajos + agotados;
    badgeAlertas.classList.remove("hidden");
  } else {
    badgeAlertas.classList.add("hidden");
  }

  if (window.lucide) lucide.createIcons();
}

function filtrarInventario() {
  const q = document.getElementById("filtro-inv-busqueda").value.toLowerCase().trim();
  const cat = document.getElementById("filtro-inv-categoria").value;

  const filtrados = medicamentosCache.filter(m => {
    const matchQ = !q || m.nombre.toLowerCase().includes(q) || 
                          m.codigo.toLowerCase().includes(q) || 
                          (m.marcas_comerciales && m.marcas_comerciales.toLowerCase().includes(q));
    let matchCat = true;
    if (cat === "ALERTAS") {
      matchCat = m.stock_actual <= m.stock_minimo;
    } else if (cat) {
      matchCat = m.categoria === cat;
    }
    return matchQ && matchCat;
  });

  renderInventarioTabla(filtrados);
}

function renderAlertasPanel(lista) {
  const container = document.getElementById("panel-alertas-stock");
  if (!container) return;

  const alertas = lista.filter(m => m.stock_actual <= m.stock_minimo);

  if (alertas.length === 0) {
    container.innerHTML = `<div class="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-800 text-center font-medium">✨ Todos los medicamentos están con stock óptimo.</div>`;
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
    stock_inicial: stockInicial
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
        ${medicamentosCache.map(m => `
          <option value="${m.id}" data-stock="${m.stock_actual}" data-smin="${m.stock_minimo}">
            ${m.nombre} (${m.presentacion || ''} ${m.concentracion || ''}) - [Stock: ${m.stock_actual}] ${m.marcas_comerciales ? `| ${m.marcas_comerciales}` : ''}
          </option>
        `).join("")}
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

  if (stock === 0) {
    info.innerHTML = `<span class="text-rose-600 font-bold bg-rose-50 px-2 py-1 rounded">Agotado (0)</span>`;
  } else if (stock <= 5) {
    info.innerHTML = `<span class="text-amber-600 font-bold bg-amber-50 px-2 py-1 rounded">Stock: ${stock}</span>`;
  } else {
    info.innerHTML = `<span class="text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded">Stock: ${stock}</span>`;
  }
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
      ${medicamentosCache.map(m => `
        <option value="${m.id}" data-stock="${m.stock_actual}" data-smin="${m.stock_minimo}" ${m.id == currentVal ? 'selected' : ''}>
          ${m.nombre} (${m.presentacion || ''} ${m.concentracion || ''}) - [Stock: ${m.stock_actual}] ${m.marcas_comerciales ? `| ${m.marcas_comerciales}` : ''}
        </option>
      `).join("")}
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
    usuario_registro: currentUser.usuario
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
function abrirModalAnulacion(atencionId, pacienteNombre, medsSummary) {
  if (currentUser.rol === "AUDITOR") {
    showToast("Acceso Denegado", "El rol de Auditoría no puede anular atenciones.", "error");
    return;
  }

  document.getElementById("anular-atencion-id").value = atencionId;
  document.getElementById("anular-info-id").textContent = `#${atencionId}`;
  document.getElementById("anular-info-paciente").textContent = pacienteNombre;
  document.getElementById("anular-info-meds").innerHTML = medsSummary;
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
        motivo: motivo,
        usuario_anula: currentUser.usuario,
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
  const lote = document.getElementById("entrada-lote").value;
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
        badge = `<span class="bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded text-[10px]">⚙️ AJUSTE</span>`;
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
      <td class="py-2.5 px-4 text-center">
        <button onclick="abrirModalExpediente(${p.id})" class="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-3 py-1 rounded-lg transition">
          <i data-lucide="folder-open" class="w-3.5 h-3.5"></i> ${typeof t === "function" ? t("btn_ver_expediente") : "Ver Historial"}
        </button>
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

    const esAdmin = currentUser.rol === "ADMINISTRADOR";

    atListDiv.innerHTML = pac.historial.map(at => {
      const esAnulada = at.estado === "ANULADA";
      const medListHtml = at.medicamentos && at.medicamentos.length > 0 
        ? at.medicamentos.map(m => `<span class="bg-white border ${esAnulada ? 'border-slate-200 text-slate-400 line-through' : 'border-slate-200 text-slate-700'} px-2 py-0.5 rounded text-[11px] font-medium">${m.nombre} (${m.presentacion || ''}) x${m.cantidad}</span>`).join(" ")
        : `<span class="text-slate-400 italic">Solo consulta / curación</span>`;

      const medsSummaryEscaped = at.medicamentos && at.medicamentos.length > 0
        ? at.medicamentos.map(m => `&bull; ${m.nombre} (${m.presentacion || ''}) x${m.cantidad} unidades`).join("<br>")
        : "Sin medicinas";

      const pacNombre = `${pac.nombres} ${pac.apellidos}`.replace(/'/g, "\\'");

      let anularBtnHtml = "";
      if (!esAnulada && esAdmin) {
        anularBtnHtml = `
          <button onclick="abrirModalAnulacion(${at.id}, '${pacNombre}', '${medsSummaryEscaped}')" class="text-[10px] font-bold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-lg border border-rose-200 transition">
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
    const tbody = document.getElementById("tabla-historial-body");
    if (!tbody) return;

    if (atenciones.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">Sin atenciones registradas.</td></tr>`;
      return;
    }

    const esAdmin = currentUser.rol === "ADMINISTRADOR";

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

      const medsSummaryEscaped = a.medicamentos && a.medicamentos.length > 0
        ? a.medicamentos.map(m => `&bull; ${m.nombre} (${m.presentacion || ''}) x${m.cantidad} unidades`).join("<br>")
        : "Sin medicinas";

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
      } else if (esAdmin) {
        const pacienteNombreCompleto = `${a.nombres} ${a.apellidos}`.replace(/'/g, "\\'");
        accionesHtml = `
          <button onclick="abrirModalAnulacion(${a.id}, '${pacienteNombreCompleto}', '${medsSummaryEscaped}')" class="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-200 transition" title="Anular consulta y devolver stock a bodega">
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
}

