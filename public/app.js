// Dispensario Médico FYDI - Frontend JavaScript con Control de Roles
let medicamentosCache = [];
let pacientesCache = [];
let renglonesReceta = [];
let renglonIdCounter = 0;

// Estado de sesión activa
let currentUser = JSON.parse(localStorage.getItem("fydi_user")) || {
  usuario: "enfermeria",
  nombre_completo: "Lic. Enfermería Dispensario",
  rol: "ENFERMERIA",
  token: "default"
};

document.addEventListener("DOMContentLoaded", () => {
  initReloj();
  initFechaHoy();
  aplicarPermisosRol();
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

  nameEl.textContent = currentUser.nombre_completo;
  badgeEl.textContent = currentUser.rol;

  if (currentUser.rol === "ADMINISTRADOR") {
    iconEl.innerHTML = `<i data-lucide="shield-check" class="w-3.5 h-3.5 text-purple-300"></i>`;
    badgeEl.className = "text-[10px] font-bold text-purple-300 uppercase tracking-wider";
    bannerContainer.className = "mb-5 p-3 rounded-xl border border-purple-200 bg-purple-50 text-xs flex items-center justify-between";
    bannerBadge.className = "font-bold px-2.5 py-0.5 rounded-full text-[10px] bg-purple-200 text-purple-900";
    bannerBadge.textContent = "ROL: ADMINISTRADOR / SUPERVISOR";
    bannerDesc.textContent = "Tienes control total del dispensario: puedes editar el catálogo, ajustar stock físico y supervisar auditorías.";
    if (btnNuevoProd) btnNuevoProd.classList.remove("hidden");
    if (readonlyNotice) readonlyNotice.classList.add("hidden");
    if (formAtencion) {
      formAtencion.querySelectorAll("input, select, textarea, button").forEach(el => el.disabled = false);
    }
  } else if (currentUser.rol === "ENFERMERIA") {
    iconEl.innerHTML = `<i data-lucide="stethoscope" class="w-3.5 h-3.5 text-sky-300"></i>`;
    badgeEl.className = "text-[10px] font-bold text-sky-300 uppercase tracking-wider";
    bannerContainer.className = "mb-5 p-3 rounded-xl border border-sky-200 bg-sky-50 text-xs flex items-center justify-between";
    bannerBadge.className = "font-bold px-2.5 py-0.5 rounded-full text-[10px] bg-sky-200 text-sky-900";
    bannerBadge.textContent = "ROL: ENFERMERÍA (ATENCIÓN Y RECETA)";
    bannerDesc.textContent = "Puedes registrar atenciones a pacientes y recetar medicinas (descuento automático). La edición de catálogo y stock está bloqueada por seguridad.";
    if (btnNuevoProd) btnNuevoProd.classList.add("hidden");
    if (readonlyNotice) readonlyNotice.classList.add("hidden");
    if (formAtencion) {
      formAtencion.querySelectorAll("input, select, textarea, button").forEach(el => el.disabled = false);
    }
  } else { // AUDITOR
    iconEl.innerHTML = `<i data-lucide="eye" class="w-3.5 h-3.5 text-slate-300"></i>`;
    badgeEl.className = "text-[10px] font-bold text-slate-300 uppercase tracking-wider";
    bannerContainer.className = "mb-5 p-3 rounded-xl border border-slate-200 bg-slate-100 text-xs flex items-center justify-between";
    bannerBadge.className = "font-bold px-2.5 py-0.5 rounded-full text-[10px] bg-slate-300 text-slate-900";
    bannerBadge.textContent = "ROL: AUDITORÍA (SOLO CONSULTA)";
    bannerDesc.textContent = "Acceso de solo lectura para supervisión de Kardex, bitácora de atenciones y descarga de balances.";
    if (btnNuevoProd) btnNuevoProd.classList.add("hidden");
    if (readonlyNotice) readonlyNotice.classList.remove("hidden");
    if (formAtencion) {
      formAtencion.querySelectorAll("input, select, textarea, button").forEach(el => el.disabled = true);
    }
  }

  if (window.lucide) lucide.createIcons();
}

function abrirModalLogin() {
  document.getElementById("modal-login").classList.remove("hidden");
  if (window.lucide) lucide.createIcons();
}

function cerrarModalLogin() {
  document.getElementById("modal-login").classList.add("hidden");
}

async function loginRapido(usuario, password) {
  await ejecutarLogin(usuario, password);
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const u = document.getElementById("login-usuario").value.trim();
  const p = document.getElementById("login-password").value.trim();
  await ejecutarLogin(u, p);
}

async function ejecutarLogin(usuario, password) {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario, password })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast("Error de Acceso", data.error || "Credenciales incorrectas.", "error");
    } else {
      currentUser = {
        usuario: data.usuario,
        nombre_completo: data.nombre_completo,
        rol: data.rol,
        token: data.token
      };
      localStorage.setItem("fydi_user", JSON.stringify(currentUser));
      cerrarModalLogin();
      aplicarPermisosRol();
      renderInventarioTabla(medicamentosCache);
      showToast("Sesión Iniciada", `Bienvenido(a), ${data.nombre_completo} (${data.rol})`, "success");
    }
  } catch (err) {
    showToast("Error de Conexión", err.message, "error");
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
      badgeHtml = `<span class="bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full text-[10px]">🟢 DISPONIBLE</span>`;
    } else if (m.estado === "STOCK BAJO") {
      badgeHtml = `<span class="bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full text-[10px]">🟡 STOCK BAJO</span>`;
    } else {
      badgeHtml = `<span class="bg-rose-100 text-rose-800 font-semibold px-2 py-0.5 rounded-full text-[10px]">🔴 AGOTADO</span>`;
    }

    const marcasHtml = m.marcas_comerciales ? `<span class="text-slate-500 italic text-[11px]">${m.marcas_comerciales}</span>` : `<span class="text-slate-300">-</span>`;

    // Acciones según rol
    let accionesHtml = `
      <button onclick="abrirModalKardex(${m.id}, '${m.nombre}', '${m.presentacion || ''}')" class="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded-lg transition" title="Ver movimientos Kardex">
        <i data-lucide="list-collapse" class="w-3 h-3"></i> Kardex
      </button>
    `;

    if (esAdmin) {
      accionesHtml += `
        <button onclick="abrirModalEditarMed(${m.id})" class="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded-lg transition ml-1" title="Editar catálogo">
          <i data-lucide="edit-2" class="w-3 h-3"></i> Editar
        </button>
        <button onclick="abrirModalAjusteStock(${m.id})" class="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg transition ml-1" title="Ajuste físico de stock">
          <i data-lucide="sliders" class="w-3 h-3"></i> Ajustar
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
    showToast("Permiso Denegado", "Solo el Administrador puede agregar nuevos productos.", "error");
    return;
  }
  document.getElementById("modal-editar-med-title").innerHTML = `<i data-lucide="package-plus" class="w-5 h-5 text-purple-600"></i> Registrar Nuevo Medicamento / Insumo`;
  document.getElementById("edit-med-id").value = "";
  document.getElementById("edit-med-codigo").value = "AUTO-GENERADO";
  document.getElementById("edit-med-nombre").value = "";
  document.getElementById("edit-med-presentacion").value = "";
  document.getElementById("edit-med-concentracion").value = "";
  document.getElementById("edit-med-marcas").value = "";
  document.getElementById("edit-med-stockmin").value = "10";
  document.getElementById("edit-med-stock-inicial").value = "0";
  document.getElementById("wrapper-stock-inicial").classList.remove("hidden");
  document.getElementById("modal-editar-med").classList.remove("hidden");
  if (window.lucide) lucide.createIcons();
}

function abrirModalEditarMed(medId) {
  if (currentUser.rol !== "ADMINISTRADOR") {
    showToast("Permiso Denegado", "Solo el Administrador puede modificar los datos del medicamento.", "error");
    return;
  }
  const med = medicamentosCache.find(m => m.id === medId);
  if (!med) return;

  document.getElementById("modal-editar-med-title").innerHTML = `<i data-lucide="edit-3" class="w-5 h-5 text-purple-600"></i> Editar Datos: ${med.nombre}`;
  document.getElementById("edit-med-id").value = med.id;
  document.getElementById("edit-med-codigo").value = med.codigo;
  document.getElementById("edit-med-categoria").value = med.categoria;
  document.getElementById("edit-med-nombre").value = med.nombre;
  document.getElementById("edit-med-presentacion").value = med.presentacion || "";
  document.getElementById("edit-med-concentracion").value = med.concentracion || "";
  document.getElementById("edit-med-marcas").value = med.marcas_comerciales || "";
  document.getElementById("edit-med-stockmin").value = med.stock_minimo;
  document.getElementById("wrapper-stock-inicial").classList.add("hidden");
  document.getElementById("modal-editar-med").classList.remove("hidden");
  if (window.lucide) lucide.createIcons();
}

function cerrarModalEditarMed() {
  document.getElementById("modal-editar-med").classList.add("hidden");
}

async function guardarMedicamentoAdmin(e) {
  e.preventDefault();
  const mid = document.getElementById("edit-med-id").value;
  const payload = {
    user_role: currentUser.rol,
    id: mid ? parseInt(mid) : null,
    categoria: document.getElementById("edit-med-categoria").value,
    nombre: document.getElementById("edit-med-nombre").value.trim().toUpperCase(),
    presentacion: document.getElementById("edit-med-presentacion").value.trim(),
    concentracion: document.getElementById("edit-med-concentracion").value.trim(),
    marcas_comerciales: document.getElementById("edit-med-marcas").value.trim(),
    stock_minimo: parseInt(document.getElementById("edit-med-stockmin").value || 10),
    stock_inicial: parseInt(document.getElementById("edit-med-stock-inicial").value || 0)
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
        admin_nombre: currentUser.nombre_completo
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

async function guardarAtencion(e) {
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
  for (let rId of renglonesReceta) {
    const sel = document.getElementById(`med-select-${rId}`);
    const cantInput = document.getElementById(`med-cant-${rId}`);
    if (sel && sel.value) {
      medItems.push({
        medicamento_id: parseInt(sel.value),
        cantidad: parseInt(cantInput.value || 1)
      });
    }
  }

  if (medItems.length === 0) {
    showToast("Falta Medicamento", "Por favor selecciona al menos un producto a despachar.", "warning");
    return;
  }

  const payload = {
    fecha,
    paciente: { cedula, nombres, apellidos, edad, celular, piso_area },
    diagnostico,
    observaciones,
    medicamentos: medItems
  };

  const btn = document.getElementById("btn-guardar-atencion");
  btn.disabled = true;
  btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Descontando de bodega...`;

  try {
    const res = await fetch("/api/atenciones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      showToast("Error en Despacho", data.error || "No se pudo registrar la atención.", "error");
    } else {
      showToast("¡Atención y Despacho Registrados!", `${data.mensaje} Paciente: ${data.paciente}.`, "success");
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
    btn.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4"></i> Guardar Atención y Descontar Stock`;
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
      body: JSON.stringify({ medicamento_id: mid, cantidad: cant, fecha, proveedor, factura, lote, observaciones })
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
  tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-slate-400">Cargando movimientos...</td></tr>`;
  document.getElementById("modal-kardex").classList.remove("hidden");
  if (window.lucide) lucide.createIcons();

  try {
    const res = await fetch(`/api/kardex?medicamento_id=${medId}`);
    const list = await res.json();

    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-slate-400">Sin movimientos registrados.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(k => {
      let badge = "";
      if (k.tipo_movimiento === "ENTRADA" || k.tipo_movimiento === "INVENTARIO_INICIAL") {
        badge = `<span class="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">+ ENTRADA</span>`;
      } else if (k.tipo_movimiento === "AJUSTE_AUDITORIA") {
        badge = `<span class="bg-purple-100 text-purple-800 font-bold px-2 py-0.5 rounded text-[10px]">⚙️ AJUSTE</span>`;
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
        </tr>
      `;
    }).join("");
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-rose-500">Error al cargar Kardex: ${err.message}</td></tr>`;
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
          <i data-lucide="folder-open" class="w-3.5 h-3.5"></i> Ver Historial
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

    atListDiv.innerHTML = pac.historial.map(at => {
      const medListHtml = at.medicamentos && at.medicamentos.length > 0 
        ? at.medicamentos.map(m => `<span class="bg-white border border-slate-200 px-2 py-0.5 rounded text-[11px] font-medium text-slate-700">${m.nombre} (${m.presentacion || ''}) x${m.cantidad}</span>`).join(" ")
        : `<span class="text-slate-400 italic">Solo consulta / curación</span>`;

      return `
        <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="font-mono font-bold text-slate-800 text-xs">${at.fecha}</span>
            <span class="text-[11px] text-brand-600 font-semibold bg-brand-50 px-2 py-0.5 rounded">Atención #${at.id}</span>
          </div>
          <div class="text-slate-800 font-semibold text-xs">Diagnóstico: <span class="font-normal">${at.diagnostico}</span></div>
          <div class="pt-1 flex flex-wrap gap-1 items-center">
            <span class="text-[10px] uppercase font-bold text-slate-400">Medicinas:</span>
            ${medListHtml}
          </div>
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
// 8. HISTORIAL GENERAL
// ================================================================
async function cargarHistorial() {
  try {
    const res = await fetch("/api/atenciones?limit=60");
    const atenciones = await res.json();
    const tbody = document.getElementById("tabla-historial-body");
    if (!tbody) return;

    if (atenciones.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400">Sin atenciones registradas.</td></tr>`;
      return;
    }

    tbody.innerHTML = atenciones.map(a => {
      const medList = a.medicamentos && a.medicamentos.length > 0
        ? a.medicamentos.map(m => `<span class="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-[11px] text-slate-800 font-medium">${m.nombre} (${m.presentacion || ''}) x${m.cantidad}</span>`).join(" ")
        : `<span class="text-slate-400 italic">Procedimiento</span>`;

      return `
        <tr class="hover:bg-slate-50/80 transition">
          <td class="py-2.5 px-4 font-mono font-medium text-slate-700">${a.fecha}</td>
          <td class="py-2.5 px-4 font-mono text-slate-600">${a.cedula || '<span class="text-slate-300">S/C</span>'}</td>
          <td class="py-2.5 px-4 font-bold text-slate-800">${a.nombres} ${a.apellidos}</td>
          <td class="py-2.5 px-4 text-slate-600">${a.piso_area || '-'}</td>
          <td class="py-2.5 px-4 text-slate-700">${a.diagnostico}</td>
          <td class="py-2.5 px-4 flex flex-wrap gap-1 items-center">${medList}</td>
        </tr>
      `;
    }).join("");

  } catch (err) {
    console.error("Error al cargar historial:", err);
  }
}
