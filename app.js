/* Blu Gestión — pedidos, ventas, inventario, catálogo, remodelación y parrilla de contenido.
   Los datos viven en Supabase, en la tabla "registros" (coleccion, id, data), protegidos por usuario. */
"use strict";

/* ---------- Constantes ---------- */
const ESTADOS = ["pendiente", "empacado", "enviado", "entregado"];
const EST_LABEL = { pendiente: "Pendiente", empacado: "Empacado", enviado: "Enviado", entregado: "Entregado" };
const NEXT_LABEL = { pendiente: "Marcar empacado", empacado: "Marcar enviado", enviado: "Marcar entregado" };
const TIPOS = ["Pulsera", "Manilla individual", "Manillas parejas", "Manillas trios", "Cadenita individual", "Cadenitas parejas", "Collar individual", "Collares pareja", "Anillos", "Anillos pareja"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["L", "M", "M", "J", "V", "S", "D"];
const REMO = { pendiente: "Pendiente", remodelado: "Remodelado", archivado: "Archivado" };
const SERIES = [
  { id: "remodelacion", nombre: "Remodelación del emprendimiento", sc: "#F1D1F6", si: "#7A3489" },
  { id: "rebranding", nombre: "Rebranding de productos", sc: "#FDDAE1", si: "#B9396F" },
  { id: "nuevo", nombre: "Producto nuevo", sc: "#F7E6BA", si: "#755510" },
  { id: "detalle", nombre: "Vista detallada", sc: "#CFF6F7", si: "#0F6468" },
  { id: "otro", nombre: "Otro", sc: "#FFF5F9", si: "#8C6A7C" },
];
const C_EST = ["idea", "guion", "grabado", "editado", "programado", "publicado"];
const C_EST_LABEL = { idea: "Idea", guion: "Guion listo", grabado: "Grabado", editado: "Editado", programado: "Programado", publicado: "Publicado" };
const PLATAFORMAS = ["TikTok", "Instagram", "TikTok e Instagram", "Facebook"];
const C_TIPOS = ["Video", "Reel", "Carrusel", "Historia", "Foto"];

const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const $ = n => cop.format(Math.round(n || 0)).replace(/\s/g, " ");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const isoDate = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const today = () => isoDate(new Date());
const fmtDate = s => { if (!s) return ""; const [y, m, d] = s.split("-"); return `${+d} ${MESES[+m - 1].slice(0, 3)} ${y}`; };
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const num = v => Math.max(0, parseInt(String(v).replace(/[^\d]/g, ""), 10) || 0);
const serie = id => SERIES.find(s => s.id === id) || SERIES[SERIES.length - 1];
const serStyle = id => { const s = serie(id); return `--sc:${s.sc};--si:${s.si}`; };
const safeUrl = u => /^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "";

function costoProd(p) { return (p.hilo || 0) + (p.dije || 0) + (p.mostacillas || 0) + (p.compra || 0) + (p.manoObra || 0) + (p.empaque || 0); }
const remo = p => p.remodelacion || "pendiente";
const activos = () => S.productos.filter(p => remo(p) !== "archivado");

const pedSub = p => p.lineas.reduce((a, l) => a + l.cantidad * l.precio, 0);
const pedTotal = p => pedSub(p) + (p.envioPaga === "cliente" ? (+p.envio || 0) : 0);
const pedCosto = p => p.lineas.reduce((a, l) => a + l.cantidad * (l.costo || 0), 0);
const pedGan = p => pedSub(p) - pedCosto(p) - (p.envioPaga === "yo" ? (+p.envio || 0) : 0);
const unidades = p => p.lineas.reduce((a, l) => a + l.cantidad, 0);

/* ---------- Supabase ---------- */
const sb = window.supabase.createClient(window.BLU_CONFIG.supabaseUrl, window.BLU_CONFIG.supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
let uid = null, email = "";
let S = { productos: [], materia: [], pedidos: [], contenido: [] };
let estado = "cargando"; // cargando | listo | error
const COLS = ["productos", "materia", "pedidos", "contenido"];
const ID_OF = { productos: p => String(p.codigo), materia: m => String(m.id), pedidos: p => p.id, contenido: c => c.id };

async function cargar() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("registros").select("coleccion,id,data").range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const n = { productos: [], materia: [], pedidos: [], contenido: [] };
  rows.forEach(r => { if (n[r.coleccion]) n[r.coleccion].push(r.data); });
  n.productos.sort((a, b) => a.codigo - b.codigo);
  n.materia.sort((a, b) => a.id - b.id);
  n.pedidos.sort((a, b) => a.n - b.n);
  S = n;
}

const colas = {};
let pendientes = 0;
function escribir(key, op) {
  pendientes++;
  colas[key] = (colas[key] || Promise.resolve()).then(op).then(r => { if (r && r.error) throw r.error; })
    .catch(e => { console.error(e); toast("No se guardó un cambio. Revisa tu conexión e inténtalo de nuevo"); })
    .finally(() => { pendientes--; });
  return colas[key];
}
function guardar(col, obj) {
  const id = ID_OF[col](obj), data = JSON.parse(JSON.stringify(obj));
  return escribir(col + "/" + id, () => sb.from("registros").upsert({ user_id: uid, coleccion: col, id, data, actualizado: new Date().toISOString() }));
}
function borrar(col, id) {
  return escribir(col + "/" + id, () => sb.from("registros").delete().eq("coleccion", col).eq("id", String(id)));
}
const nextN = () => S.pedidos.reduce((a, p) => Math.max(a, p.n || 0), 0) + 1;

/* ---------- Sesión ---------- */
const $id = id => document.getElementById(id);
async function iniciar(session) {
  if (!session) { $id("shell").hidden = true; $id("login").hidden = false; return; }
  uid = session.user.id; email = session.user.email || "";
  $id("login").hidden = true; $id("shell").hidden = false;
  estado = "cargando"; render();
  try { await cargar(); estado = "listo"; } catch (e) { console.error(e); estado = "error"; }
  render();
}
$id("loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $id("loginErr"), btn = $id("loginBtn");
  err.hidden = true; btn.disabled = true; btn.textContent = "Entrando…";
  const { data, error } = await sb.auth.signInWithPassword({ email: $id("l_email").value.trim(), password: $id("l_pass").value });
  btn.disabled = false; btn.textContent = "Entrar";
  if (error) { err.hidden = false; err.textContent = /invalid/i.test(error.message) ? "El correo o la contraseña no coinciden." : "No se pudo entrar. Revisa tu conexión e inténtalo de nuevo."; return; }
  iniciar(data.session);
});
let ultimaCarga = Date.now();
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !uid || pendientes || sheetRoot.innerHTML || Date.now() - ultimaCarga < 30000) return;
  ultimaCarga = Date.now();
  try { await cargar(); render(); } catch (e) { /* sin conexión: se queda lo que hay */ }
});

/* ---------- Navegación ---------- */
let tab = "inicio";
const now = new Date();
let ui = { pedFiltro: "activos", ventasMes: "", stockQ: "", stockTipo: "", catSeg: "productos", catQ: "", remFiltro: "pendiente",
  cVista: "calendario", cMes: now.getFullYear() + "-" + pad(now.getMonth() + 1), cDia: "", cSerie: "" };
const TITLES = { inicio: "Inicio", pedidos: "Pedidos", ventas: "Ventas", stock: "Inventario", catalogo: "Catálogo", contenido: "Contenido" };
function go(t) { tab = t; render(); window.scrollTo(0, 0); }

function render() {
  $id("viewTitle").textContent = TITLES[tab];
  document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === tab ? "page" : "false"));
  const fab = $id("fab");
  fab.hidden = estado !== "listo" || !["inicio", "pedidos", "contenido"].includes(tab);
  fab.textContent = tab === "contenido" ? "+ Nuevo contenido" : "+ Nuevo pedido";
  fab.dataset.action = tab === "contenido" ? "new-content" : "new-order";
  if (estado !== "listo") {
    $id("app").innerHTML = estado === "cargando"
      ? `<div class="empty"><div class="iso"></div><b>Cargando tus datos…</b></div>`
      : `<div class="empty"><div class="iso"></div><b>No se pudieron cargar tus datos</b><span class="small">Revisa tu conexión.</span><button class="btn" type="button" data-action="reintentar">Intentar de nuevo</button></div>`;
    return;
  }
  $id("app").innerHTML = { inicio: vInicio, pedidos: vPedidos, ventas: vVentas, stock: vStock, catalogo: vCatalogo, contenido: vContenido }[tab]();
}

/* ---------- Inicio ---------- */
function vInicio() {
  const d = new Date(), ym = d.getFullYear() + "-" + pad(d.getMonth() + 1);
  const vacio = !S.productos.length && !S.pedidos.length && !S.materia.length;
  const cuenta = e => S.pedidos.filter(p => p.estado === e && (e !== "entregado" || p.fecha.startsWith(ym))).length;
  const mes = S.pedidos.filter(p => p.estado === "entregado" && p.fecha.startsWith(ym));
  const vendido = mes.reduce((a, p) => a + pedSub(p), 0), costo = mes.reduce((a, p) => a + pedCosto(p), 0), gan = mes.reduce((a, p) => a + pedGan(p), 0);
  const act = activos(), uno = act.filter(p => p.stock === 1), agot = act.filter(p => p.stock <= 0);
  const hoy = today(), semana = isoDate(new Date(Date.now() + 7 * 864e5));
  const prox = S.contenido.filter(c => c.estado !== "publicado" && c.fechaPublicacion && c.fechaPublicacion >= hoy && c.fechaPublicacion <= semana)
    .sort((a, b) => (a.fechaPublicacion + (a.hora || "")).localeCompare(b.fechaPublicacion + (b.hora || "")));
  const importar = `<section class="card acct">
      <h3>${vacio ? "Pasa tus datos a la app" : "Importar respaldo"}</h3>
      <p class="muted small" style="margin:0">${vacio ? "Tu cuenta está vacía. Sube el archivo de respaldo (.json) que te pasé para cargar productos, stock, materia prima y ventas." : "Sube un archivo de respaldo (.json). Reemplaza los registros que tengan el mismo código y agrega los nuevos."}</p>
      <label class="btn ${vacio ? "" : "ghost"} filebtn">Subir respaldo<input type="file" id="fileImport" accept=".json,application/json"></label>
    </section>`;
  return `${vacio ? importar : ""}
  <section class="states" aria-label="Pedidos por estado">
    ${ESTADOS.map(e => `<button type="button" class="state st-${e}" data-action="filtro-ped" data-v="${e}"><b>${cuenta(e)}</b><span>${EST_LABEL[e]}${e === "entregado" ? "<br>este mes" : ""}</span></button>`).join("")}
  </section>
  <section class="hero">
    <span class="sub">Ganancia de ${MESES[d.getMonth()]}</span>
    <span class="big">${$(gan)}</span>
    <span class="sub">${mes.length ? `${mes.length} pedido${mes.length > 1 ? "s" : ""} entregado${mes.length > 1 ? "s" : ""} este mes` : "Todavía no hay pedidos entregados este mes"}</span>
    <div class="split"><div>Vendido<b>${$(vendido)}</b></div><div>Costo<b>${$(costo)}</b></div><div>Margen<b>${vendido ? Math.round(gan / vendido * 100) : 0}%</b></div></div>
  </section>
  <section class="card" style="display:flex;flex-direction:column;gap:10px">
    <div class="row between"><h3>Para publicar esta semana</h3><button class="btn sm ghost" data-action="tab" data-v="contenido" type="button">Ver parrilla</button></div>
    ${prox.length ? `<div class="list">${prox.slice(0, 5).map(c => `<div class="row between tappable" data-action="edit-content" data-id="${c.id}" role="button" tabindex="0">
        <div class="grow"><div style="font-weight:500">${esc(c.titulo || "Sin título")}</div><div class="muted small">${fmtDate(c.fechaPublicacion)}${c.hora ? " · " + esc(c.hora) : ""} · ${esc(c.plataforma || "")}</div></div>
        <span class="pill cst-${c.estado}">${C_EST_LABEL[c.estado]}</span></div>`).join("")}</div>`
      : `<p class="muted small" style="margin:0">No tienes contenido programado para los próximos 7 días.</p>`}
  </section>
  <section class="card" style="display:flex;flex-direction:column;gap:10px">
    <div class="row between"><h3>Stock bajo</h3><button class="btn sm ghost" data-action="tab" data-v="stock" type="button">Ver inventario</button></div>
    <div class="row wrap" style="gap:8px"><span class="tag ok">${uno.length} con 1 unidad</span><span class="tag">${agot.length} agotados</span></div>
    <div class="chips">${uno.slice(0, 14).map(p => `<span class="chip" style="cursor:default">${esc(p.nombre)} <span class="muted small">· ${esc(p.tipo)}</span></span>`).join("")}</div>
  </section>
  <section class="card acct">
    <h3>Descargar</h3>
    <p class="muted small" style="margin:0">El Excel trae pedidos, ventas, inventario, costos, materia prima y la parrilla. El respaldo sirve para restaurar la app si algo pasa.</p>
    <div class="row wrap" style="gap:8px"><button class="btn grow" type="button" data-action="excel">Descargar Excel</button><button class="btn ghost grow" type="button" data-action="respaldo">Descargar respaldo</button></div>
  </section>
  ${vacio ? "" : importar}
  <section class="card acct">
    <h3>Cuenta</h3>
    <p class="muted small" style="margin:0">${esc(email)}</p>
    <button class="btn ghost" type="button" data-action="logout">Cerrar sesión</button>
  </section>`;
}

/* ---------- Pedidos ---------- */
function orderCard(p, opts = {}) {
  const i = ESTADOS.indexOf(p.estado);
  return `<article class="card order">
    <div class="row between" style="align-items:flex-start">
      <div class="grow"><div class="who">${esc(p.cliente)}</div><div class="muted small">#${p.n} · ${fmtDate(p.fecha)} · ${esc(p.ciudad)}</div></div>
      <span class="pill st-${p.estado}">${EST_LABEL[p.estado]}</span>
    </div>
    ${opts.track ? `<div class="track" aria-hidden="true">${ESTADOS.map((e, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("")}</div>` : ""}
    <div class="items">${p.lineas.map(l => `<div><span>${l.cantidad} × ${esc(l.nombre)} <span class="muted">${esc(l.tipo)}</span></span><span class="num">${$(l.cantidad * l.precio)}</span></div>`).join("")}
      ${p.envio ? `<div class="muted"><span>Envío · paga ${p.envioPaga === "yo" ? "Blu" : "el cliente"}</span><span class="num">${$(p.envio)}</span></div>` : ""}</div>
    <div class="row between wrap">
      <div class="row wrap" style="gap:6px">${p.importado ? '<span class="tag">Del Excel</span>' : ""}<span class="tag ${p.pagado ? "ok" : "loss"}">${p.pagado ? "Pagado" : "Sin pagar"}</span></div>
      <span class="money">${$(pedTotal(p))}</span>
    </div>
    ${opts.actions ? `<div class="row" style="gap:8px">
      <button class="btn grow" type="button" data-action="avanzar" data-id="${p.id}">${NEXT_LABEL[p.estado]}</button>
      <button class="btn ghost" type="button" data-action="ver" data-id="${p.id}">Detalle</button></div>` : ""}
    ${opts.detalle ? `<button class="btn ghost sm" type="button" data-action="ver" data-id="${p.id}" style="align-self:flex-start">Detalle</button>` : ""}
  </article>`;
}
function vPedidos() {
  const f = ui.pedFiltro;
  const act = S.pedidos.filter(p => p.estado !== "entregado");
  const lista = (f === "activos" ? act : act.filter(p => p.estado === f)).slice().sort((a, b) => b.n - a.n);
  const filtros = [["activos", "Todos (" + act.length + ")"], ...ESTADOS.slice(0, 3).map(e => [e, EST_LABEL[e] + " (" + act.filter(p => p.estado === e).length + ")"])];
  return `<div class="scroller">${filtros.map(([k, l]) => `<button class="chip" type="button" data-action="filtro-ped" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join("")}</div>
  <div class="list">${lista.length ? lista.map(p => orderCard(p, { track: true, actions: true })).join("") :
    `<div class="empty"><div class="iso"></div><b>No hay pedidos aquí</b><span class="small">Toca “Nuevo pedido” para registrar uno. Cuando lo marques como entregado pasa a Ventas.</span></div>`}</div>`;
}

/* ---------- Ventas ---------- */
function vVentas() {
  const ent = S.pedidos.filter(p => p.estado === "entregado").sort((a, b) => b.fecha.localeCompare(a.fecha) || b.n - a.n);
  const meses = [...new Set(ent.map(p => p.fecha.slice(0, 7)))].sort().reverse();
  if (ui.ventasMes && !meses.includes(ui.ventasMes)) ui.ventasMes = "";
  const lista = ui.ventasMes ? ent.filter(p => p.fecha.startsWith(ui.ventasMes)) : ent;
  const tot = lista.reduce((a, p) => a + pedSub(p), 0), gan = lista.reduce((a, p) => a + pedGan(p), 0), u = lista.reduce((a, p) => a + unidades(p), 0);
  const mlabel = ym => { const [y, m] = ym.split("-"); return MESES[+m - 1][0].toUpperCase() + MESES[+m - 1].slice(1) + " " + y; };
  return `<div class="field"><label for="mesSel">Periodo</label>
    <select id="mesSel" data-change="mes"><option value="">Todo el historial</option>${meses.map(m => `<option value="${m}" ${m === ui.ventasMes ? "selected" : ""}>${mlabel(m)}</option>`).join("")}</select></div>
  <section class="hero"><span class="sub">Vendido</span><span class="big">${$(tot)}</span>
    <div class="split"><div>Pedidos<b>${lista.length}</b></div><div>Unidades<b>${u}</b></div><div>Ganancia<b>${$(gan)}</b></div></div></section>
  <div class="list">${lista.length ? lista.map(p => orderCard(p, { detalle: true })).join("") : `<div class="empty"><div class="iso"></div><b>Sin ventas en este periodo</b></div>`}</div>`;
}

/* ---------- Inventario ---------- */
function vStock() {
  const q = norm(ui.stockQ);
  const lista = activos().filter(p => (!ui.stockTipo || p.tipo === ui.stockTipo) && (!q || norm(p.nombre).includes(q)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const unid = activos().reduce((a, p) => a + Math.max(0, p.stock), 0);
  return `<input class="search" id="stockQ" data-input="stockQ" placeholder="Buscar producto" value="${esc(ui.stockQ)}" aria-label="Buscar producto">
  <div class="scroller"><button class="chip" type="button" data-action="stock-tipo" data-v="" aria-pressed="${!ui.stockTipo}">Todos</button>${TIPOS.map(t => `<button class="chip" type="button" data-action="stock-tipo" data-v="${t}" aria-pressed="${ui.stockTipo === t}">${t}</button>`).join("")}</div>
  <p class="muted small" style="margin:0">${unid} unidades en stock · ${lista.length} productos</p>
  <section class="card" style="padding-block:4px">${lista.map(p => `<div class="prow">
    <div class="grow"><div class="name">${esc(p.nombre)}</div><div class="muted small">${esc(p.tipo)}${p.stock <= 0 ? " · Agotado" : ""}</div></div>
    <div class="stepper"><button class="icon-btn" type="button" data-action="stock" data-c="${p.codigo}" data-d="-1" aria-label="Restar uno a ${esc(p.nombre)}">−</button>
    <b class="${p.stock <= 0 ? "zero" : ""}">${p.stock}</b>
    <button class="icon-btn" type="button" data-action="stock" data-c="${p.codigo}" data-d="1" aria-label="Sumar uno a ${esc(p.nombre)}">+</button></div></div>`).join("") || '<div class="empty">No hay productos con ese filtro</div>'}</section>`;
}

/* ---------- Catálogo: productos, materia prima, remodelación ---------- */
function vCatalogo() {
  const seg = ui.catSeg, q = norm(ui.catQ);
  let body;
  if (seg === "productos") {
    const lista = activos().filter(p => !q || norm(p.nombre).includes(q) || norm(p.tipo).includes(q)).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const perd = activos().filter(p => p.mayor - costoProd(p) < 0).length;
    body = `${perd ? `<div class="warn">${perd} producto${perd > 1 ? "s" : ""} te dan pérdida al por mayor. Están marcados en rojo.</div>` : ""}
    <section class="card" style="padding-block:4px">${lista.map(p => { const c = costoProd(p), gm = p.mayor - c; return `<div class="prow tappable" data-action="edit-prod" data-c="${p.codigo}" role="button" tabindex="0">
      <div class="grow"><div class="name">${esc(p.nombre)}</div><div class="muted small">${esc(p.tipo)} · #${p.codigo}</div>
      ${gm < 0 ? `<span class="tag loss">Pérdida al por mayor ${$(gm)}</span>` : ""}${!p.menor ? `<span class="tag loss">Sin precio</span>` : ""}</div>
      <div class="prices"><span>Costo</span><span>Mayor</span><span>Detal</span><b>${$(c)}</b><b>${$(p.mayor)}</b><b>${$(p.menor)}</b></div></div>`; }).join("") || '<div class="empty">Sin resultados</div>'}</section>`;
  } else if (seg === "materia") {
    const lista = S.materia.filter(m => !q || norm(m.nombre).includes(q) || norm(m.lugar).includes(q));
    body = `<section class="card" style="padding-block:4px">${lista.map(m => { const url = safeUrl(m.link); return `<div class="prow tappable" data-action="edit-mat" data-id="${m.id}" role="button" tabindex="0">
      <div class="grow"><div class="name">${esc(m.nombre)}</div><div class="muted small">${esc(m.lugar)} · ${m.cantidad} unid. por ${$(m.precio)} · <b class="num">${$(m.cantidad ? m.precio / m.cantidad : 0)}</b> c/u</div></div>
      ${url ? `<a class="buy" href="${esc(url)}" target="_blank" rel="noopener">Comprar</a>` : ""}</div>`; }).join("") || '<div class="empty">Sin resultados</div>'}</section>`;
  } else {
    const todos = S.productos, arch = todos.filter(p => remo(p) === "archivado").length, base = todos.length - arch;
    const hechos = todos.filter(p => remo(p) === "remodelado").length;
    const lista = todos.filter(p => remo(p) === ui.remFiltro && (!q || norm(p.nombre).includes(q) || norm(p.tipo).includes(q))).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    const cnt = k => todos.filter(p => remo(p) === k).length;
    body = `<section class="card" style="display:flex;flex-direction:column;gap:8px">
      <div class="row between"><b>${hechos} de ${base} remodelados</b><span class="muted small">${arch} archivados</span></div>
      <div class="progress" aria-hidden="true"><i style="width:${base ? Math.round(hechos / base * 100) : 0}%"></i></div></section>
    <div class="scroller">${Object.keys(REMO).map(k => `<button class="chip" type="button" data-action="rem-filtro" data-v="${k}" aria-pressed="${ui.remFiltro === k}">${REMO[k]} (${cnt(k)})</button>`).join("")}</div>
    ${ui.remFiltro === "archivado" ? `<p class="note" style="margin:0">Los archivados no salen en inventario, catálogo ni pedidos nuevos. Sus ventas viejas se conservan. Puedes recuperarlos cuando quieras.</p>` : ""}
    <section class="card" style="padding-block:2px">${lista.map(p => { const r = remo(p), v = S.contenido.filter(c => c.productoCodigo === p.codigo).length; return `<div class="rmrow">
      <div class="row between" style="align-items:flex-start"><div class="grow"><div class="name">${esc(p.nombre)}</div><div class="muted small">${esc(p.tipo)} · #${p.codigo}${v ? ` · ${v} video${v > 1 ? "s" : ""}` : ""}</div></div>
      ${r !== "archivado" ? `<button class="btn sm ghost" type="button" data-action="video-prod" data-c="${p.codigo}">Crear video</button>` : ""}</div>
      <div class="rm-st" role="group" aria-label="Estado de ${esc(p.nombre)}">
        <button type="button" data-action="remo" data-c="${p.codigo}" data-v="pendiente" aria-pressed="${r === "pendiente"}">Pendiente</button>
        <button type="button" data-action="remo" data-c="${p.codigo}" data-v="remodelado" aria-pressed="${r === "remodelado"}">Remodelado</button>
        <button type="button" class="arch" data-action="remo" data-c="${p.codigo}" data-v="archivado" aria-pressed="${r === "archivado"}">${r === "archivado" ? "Archivado" : "Archivar"}</button>
      </div></div>`; }).join("") || '<div class="empty">No hay productos en este estado</div>'}</section>`;
  }
  return `<div class="seg" role="group" aria-label="Catálogo" style="grid-template-columns:repeat(3,1fr)">
    <button type="button" data-action="seg" data-v="productos" aria-pressed="${seg === "productos"}">Productos</button>
    <button type="button" data-action="seg" data-v="materia" aria-pressed="${seg === "materia"}">Materia prima</button>
    <button type="button" data-action="seg" data-v="remodelacion" aria-pressed="${seg === "remodelacion"}">Remodelación</button></div>
  <div class="row"><input class="search grow" id="catQ" data-input="catQ" placeholder="Buscar" value="${esc(ui.catQ)}" aria-label="Buscar en catálogo">
  ${seg !== "remodelacion" ? `<button class="btn" type="button" data-action="${seg === "productos" ? "new-prod" : "new-mat"}">+ Nuevo</button>` : ""}</div>${body}`;
}

/* ---------- Contenido ---------- */
function cCard(c) {
  const s = serie(c.serie);
  return `<article class="card ccard" data-action="edit-content" data-id="${c.id}" role="button" tabindex="0">
    <div class="row between" style="align-items:flex-start"><div class="t grow">${esc(c.titulo || "Sin título")}</div><span class="pill cst-${c.estado}">${C_EST_LABEL[c.estado]}</span></div>
    <div class="row wrap" style="gap:6px"><span class="ser" style="${serStyle(c.serie)}">${esc(s.nombre)}${c.capitulo ? " · Cap. " + c.capitulo : ""}</span></div>
    <div class="meta">${c.fechaPublicacion ? fmtDate(c.fechaPublicacion) + (c.hora ? " · " + esc(c.hora) : "") : "Sin fecha de publicación"}${c.plataforma ? " · " + esc(c.plataforma) : ""}${c.tipo ? " · " + esc(c.tipo) : ""}</div>
  </article>`;
}
function vContenido() {
  const vista = ui.cVista;
  const seg = `<div class="seg" role="group" aria-label="Vista"><button type="button" data-action="c-vista" data-v="calendario" aria-pressed="${vista === "calendario"}">Calendario</button><button type="button" data-action="c-vista" data-v="series" aria-pressed="${vista === "series"}">Por serie</button></div>`;
  const legend = `<div class="legend">${SERIES.slice(0, 4).map(s => `<span class="ser" style="${serStyle(s.id)}">${esc(s.nombre)}</span>`).join("")}</div>`;
  if (vista === "series") {
    const filtro = ui.cSerie;
    const grupos = SERIES.filter(s => !filtro || s.id === filtro).map(s => {
      const items = S.contenido.filter(c => (c.serie || "otro") === s.id).sort((a, b) => (a.capitulo || 999) - (b.capitulo || 999) || (a.fechaPublicacion || "9").localeCompare(b.fechaPublicacion || "9"));
      if (!items.length && filtro !== s.id) return "";
      const pub = items.filter(c => c.estado === "publicado").length;
      return `<section style="display:flex;flex-direction:column;gap:10px"><div class="row between"><span class="ser" style="${serStyle(s.id)}">${esc(s.nombre)}</span><span class="muted small">${pub} de ${items.length} publicados</span></div>
        <div class="list">${items.map(cCard).join("") || '<div class="empty small">Todavía no hay capítulos</div>'}</div></section>`;
    }).join("");
    return `${seg}<div class="scroller"><button class="chip" type="button" data-action="c-serie" data-v="" aria-pressed="${!filtro}">Todas</button>${SERIES.map(s => `<button class="chip" type="button" data-action="c-serie" data-v="${s.id}" aria-pressed="${filtro === s.id}">${esc(s.nombre)}</button>`).join("")}</div>
      ${grupos || `<div class="empty"><div class="iso"></div><b>Aún no hay contenido</b><span class="small">Toca “Nuevo contenido” para planear el primer video.</span></div>`}`;
  }
  const [y, m] = ui.cMes.split("-").map(Number);
  const first = new Date(y, m - 1, 1), dias = new Date(y, m, 0).getDate(), offset = (first.getDay() + 6) % 7;
  const delMes = S.contenido.filter(c => (c.fechaPublicacion || "").startsWith(ui.cMes));
  const hoy = today();
  let cells = "";
  for (let i = 0; i < offset; i++) cells += `<button type="button" class="out" tabindex="-1" aria-hidden="true"></button>`;
  for (let d = 1; d <= dias; d++) {
    const iso = ui.cMes + "-" + pad(d), items = delMes.filter(c => c.fechaPublicacion === iso);
    cells += `<button type="button" data-action="c-dia" data-v="${iso}" class="${iso === hoy ? "today" : ""}" aria-pressed="${ui.cDia === iso}" aria-label="${d} de ${MESES[m - 1]}, ${items.length} publicaciones">
      <span>${d}</span><span class="dots">${items.slice(0, 6).map(c => `<i style="${serStyle(c.serie)}"></i>`).join("")}</span></button>`;
  }
  const lista = (ui.cDia ? delMes.filter(c => c.fechaPublicacion === ui.cDia) : delMes).sort((a, b) => (a.fechaPublicacion + (a.hora || "")).localeCompare(b.fechaPublicacion + (b.hora || "")));
  const sinFecha = S.contenido.filter(c => !c.fechaPublicacion);
  const pub = delMes.filter(c => c.estado === "publicado").length;
  return `${seg}
  <div class="monthbar"><button class="icon-btn" type="button" data-action="c-mes" data-d="-1" aria-label="Mes anterior">‹</button>
    <h2>${MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)} ${y}</h2>
    <button class="icon-btn" type="button" data-action="c-mes" data-d="1" aria-label="Mes siguiente">›</button></div>
  <p class="muted small" style="margin:0;text-align:center">${delMes.length} ${delMes.length === 1 ? "publicación planeada" : "publicaciones planeadas"} · ${pub} ${pub === 1 ? "publicada" : "publicadas"}</p>
  <div class="cal">${DIAS.map(d => `<span class="dow">${d}</span>`).join("")}${cells}</div>
  ${legend}
  <div class="row between"><h3>${ui.cDia ? fmtDate(ui.cDia) : "Todo el mes"}</h3>${ui.cDia ? `<button class="btn sm ghost" type="button" data-action="c-dia" data-v="">Ver todo el mes</button>` : ""}</div>
  <div class="list">${lista.map(cCard).join("") || `<div class="empty"><div class="iso"></div><b>${ui.cDia ? "Nada planeado este día" : "Nada planeado este mes"}</b><span class="small">Toca “Nuevo contenido” para agregar un video.</span></div>`}</div>
  ${sinFecha.length ? `<h3>Ideas sin fecha (${sinFecha.length})</h3><div class="list">${sinFecha.map(cCard).join("")}</div>` : ""}`;
}

/* ---------- Hojas ---------- */
const sheetRoot = $id("sheetRoot");
function openSheet(title, html, onMount) {
  sheetRoot.innerHTML = `<div class="sheet-bg" data-action="close-bg"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="grab"></div><div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" type="button" data-action="close" aria-label="Cerrar">×</button></div>${html}</div></div>`;
  document.body.style.overflow = "hidden";
  onMount && onMount(sheetRoot.querySelector(".sheet"));
}
function closeSheet() { sheetRoot.innerHTML = ""; document.body.style.overflow = ""; draft = null; editing = null; editingMat = null; editingC = null; }

/* Nuevo pedido */
let draft = null;
function newOrder() {
  draft = { fecha: today(), cliente: "", celular: "", cc: "", ciudad: "", direccion: "", precioTipo: "detal", envio: 0, envioPaga: "cliente", pagado: false, estado: "pendiente", lineas: [], q: "" };
  openSheet("Nuevo pedido", `<div id="orderForm"></div>`, () => drawOrderForm());
}
const priceFor = (p, t) => t === "mayor" ? p.mayor : p.menor;
function drawOrderForm(focusId) {
  const d = draft, box = $id("orderForm"); if (!box) return;
  const q = norm(d.q);
  const res = q ? activos().filter(p => norm(p.nombre).includes(q) || norm(p.tipo).includes(q)).slice(0, 8) : [];
  const faltan = d.lineas.filter(l => { const p = S.productos.find(x => x.codigo === l.codigo); return p && l.cantidad > p.stock; });
  box.innerHTML = `
  <div class="grid2"><div class="field"><label for="f_fecha">Fecha</label><input id="f_fecha" type="date" data-f="fecha" value="${d.fecha}"></div>
    <div class="field"><label for="f_cc">Cédula</label><input id="f_cc" inputmode="numeric" data-f="cc" value="${esc(d.cc)}"></div></div>
  <div class="field"><label for="f_cliente">Cliente</label><input id="f_cliente" data-f="cliente" value="${esc(d.cliente)}" placeholder="Nombre y apellido" autocomplete="off"></div>
  <div class="grid2"><div class="field"><label for="f_cel">Celular</label><input id="f_cel" type="tel" data-f="celular" value="${esc(d.celular)}"></div>
    <div class="field"><label for="f_ciudad">Ciudad</label><input id="f_ciudad" data-f="ciudad" value="${esc(d.ciudad)}"></div></div>
  <div class="field"><label for="f_dir">Dirección</label><input id="f_dir" data-f="direccion" value="${esc(d.direccion)}" placeholder="O punto Interrapidísimo"></div>
  <div class="field"><span class="lbl">Precio</span><div class="seg" role="group" aria-label="Precio">
    <button type="button" data-action="ptipo" data-v="detal" aria-pressed="${d.precioTipo === "detal"}">Detal</button>
    <button type="button" data-action="ptipo" data-v="mayor" aria-pressed="${d.precioTipo === "mayor"}">Por mayor</button></div></div>
  <div class="field"><label for="f_q">Productos</label>
    <input id="f_q" class="search" data-f="q" value="${esc(d.q)}" placeholder="Buscar para agregar" autocomplete="off">
    ${res.length ? `<div class="results">${res.map(p => `<button type="button" data-action="add-line" data-c="${p.codigo}"><span><b>${esc(p.nombre)}</b> <span class="muted small">${esc(p.tipo)}</span></span><span class="small ${p.stock > 0 ? "" : "muted"}">${p.stock > 0 ? p.stock + " en stock" : "Agotado"}</span></button>`).join("")}</div>` : (q ? '<span class="muted small">Sin resultados</span>' : "")}
  </div>
  ${d.lineas.length ? `<div class="list">${d.lineas.map((l, i) => `<div class="line-item">
    <div><b>${esc(l.nombre)}</b><div class="muted small">${esc(l.tipo)}</div></div>
    <button class="icon-btn" type="button" data-action="del-line" data-i="${i}" aria-label="Quitar ${esc(l.nombre)}">×</button>
    <div class="ctl"><div class="stepper"><button class="icon-btn" type="button" data-action="qty" data-i="${i}" data-d="-1" aria-label="Menos">−</button><b>${l.cantidad}</b><button class="icon-btn" type="button" data-action="qty" data-i="${i}" data-d="1" aria-label="Más">+</button></div>
    <span class="muted small" style="margin-left:auto">c/u</span><input id="lp_${i}" inputmode="numeric" data-lp="${i}" value="${l.precio}" aria-label="Precio por unidad de ${esc(l.nombre)}"></div></div>`).join("")}</div>` : ""}
  ${faltan.length ? `<div class="warn">No alcanza el stock de: ${faltan.map(l => esc(l.nombre)).join(", ")}. Puedes guardarlo igual; el inventario quedará en negativo hasta que las fabriques.</div>` : ""}
  <div class="grid2"><div class="field"><label for="f_envio">Valor envío</label><input id="f_envio" inputmode="numeric" data-f="envio" value="${d.envio || ""}" placeholder="0"></div>
    <div class="field"><span class="lbl">¿Quién paga el envío?</span><div class="seg"><button type="button" data-action="paga" data-v="cliente" aria-pressed="${d.envioPaga === "cliente"}">Cliente</button><button type="button" data-action="paga" data-v="yo" aria-pressed="${d.envioPaga === "yo"}">Blu</button></div></div></div>
  <div class="field"><span class="lbl">¿Ya pagó?</span><div class="seg"><button type="button" data-action="pagado" data-v="1" aria-pressed="${d.pagado}">Sí, pagó</button><button type="button" data-action="pagado" data-v="0" aria-pressed="${!d.pagado}">Todavía no</button></div></div>
  <div class="totals"><div><span>Productos</span><span>${$(pedSub(d))}</span></div>
    ${d.envio ? `<div><span>Envío ${d.envioPaga === "yo" ? "(lo pagas tú)" : ""}</span><span>${d.envioPaga === "yo" ? "—" : $(d.envio)}</span></div>` : ""}
    <div class="t"><span>Total a cobrar</span><span>${$(pedTotal(d))}</span></div>
    <div class="small muted"><span>Ganancia estimada</span><span>${$(pedGan(d))}</span></div></div>
  <div id="formErr" class="warn" hidden></div>
  <button class="btn block" type="button" data-action="save-order">Guardar pedido</button>`;
  if (focusId) { const el = $id(focusId); if (el) { el.focus(); const v = el.value; try { el.setSelectionRange(v.length, v.length); } catch (e) { } } }
}
function saveOrder() {
  const d = draft, err = $id("formErr"), miss = [];
  if (!d.cliente.trim()) miss.push("el nombre del cliente");
  if (!d.lineas.length) miss.push("al menos un producto");
  if (miss.length) { err.hidden = false; err.textContent = "Falta " + miss.join(" y ") + "."; return; }
  d.lineas.forEach(l => { const p = S.productos.find(x => x.codigo === l.codigo); if (p) { p.stock -= l.cantidad; guardar("productos", p); } });
  const ped = { ...d, id: "p" + Date.now(), n: nextN(), envio: +d.envio || 0 }; delete ped.q;
  S.pedidos.push(ped); guardar("pedidos", ped); closeSheet(); ui.pedFiltro = "activos"; go("pedidos"); toast("Pedido #" + ped.n + " guardado · stock descontado");
}
function verPedido(id) {
  const p = S.pedidos.find(x => x.id === id); if (!p) return;
  const prev = ESTADOS[ESTADOS.indexOf(p.estado) - 1];
  openSheet("Pedido #" + p.n, `${orderCard(p, { track: true })}
    <div class="card" style="display:grid;gap:6px;font-size:14px">
      <div><span class="muted small">Celular</span><br>${esc(p.celular) || "—"}</div>
      <div><span class="muted small">Cédula</span><br>${esc(p.cc) || "—"}</div>
      <div><span class="muted small">Dirección</span><br>${esc(p.direccion) || "—"}</div>
      <div><span class="muted small">Precio</span><br>${p.precioTipo === "mayor" ? "Por mayor" : "Detal"}</div></div>
    <button class="btn block line" type="button" data-action="toggle-pago" data-id="${p.id}">${p.pagado ? "Marcar como no pagado" : "Marcar como pagado"}</button>
    ${prev ? `<button class="btn block ghost" type="button" data-action="retroceder" data-id="${p.id}">Devolver a ${EST_LABEL[prev].toLowerCase()}</button>` : ""}
    <div id="cancelBox"><button class="btn block danger" type="button" data-action="cancel-ask" data-id="${p.id}">${p.estado === "entregado" ? "Borrar venta" : "Cancelar pedido"}</button></div>`);
}

/* Producto */
let editing = null;
function editProd(codigo) {
  const nuevo = codigo == null;
  const p = nuevo ? { codigo: Math.max(100, ...S.productos.map(x => x.codigo)) + 1, nombre: "", tipo: TIPOS[1], hilo: 0, dije: 0, mostacillas: 0, compra: 0, manoObra: 0, empaque: 2815, mayor: 0, menor: 0, stock: 0, remodelacion: "pendiente" } : { ...S.productos.find(x => x.codigo === codigo) };
  const f = (k, l) => `<div class="field"><label for="pp_${k}">${l}</label><input id="pp_${k}" inputmode="numeric" data-pp="${k}" value="${p[k] || ""}" placeholder="0"></div>`;
  openSheet(nuevo ? "Nuevo producto" : "Editar producto", `
    <div class="field"><label for="pp_nombre">Nombre</label><input id="pp_nombre" data-pp="nombre" value="${esc(p.nombre)}"></div>
    <div class="grid2"><div class="field"><label for="pp_tipo">Tipo</label><select id="pp_tipo" data-pp="tipo">${TIPOS.map(t => `<option ${t === p.tipo ? "selected" : ""}>${t}</option>`).join("")}</select></div>${f("stock", "Stock")}</div>
    <h3>Costos</h3>
    <div class="grid3">${f("hilo", "Hilo")}${f("dije", "Dije")}${f("mostacillas", "Mostacillas")}${f("compra", "Compra")}${f("manoObra", "Mano de obra")}${f("empaque", "Empaque")}</div>
    <h3>Precios</h3>
    <div class="grid2">${f("mayor", "Por mayor")}${f("menor", "Detal")}</div>
    <div class="totals" id="ppTot"></div>
    <button class="btn block" type="button" data-action="save-prod">Guardar producto</button>`, () => { editing = p; drawProdTot(); });
}
function drawProdTot() {
  const p = editing, c = costoProd(p), el = $id("ppTot"); if (!el) return;
  el.innerHTML = `<div><span>Costo de fabricación</span><span>${$(c)}</span></div>
    <div style="color:${p.mayor - c < 0 ? "var(--loss)" : "inherit"}"><span>Ganancia por mayor</span><span>${$(p.mayor - c)}</span></div>
    <div class="t" style="color:${p.menor - c < 0 ? "var(--loss)" : "var(--pink-press)"}"><span>Ganancia al detal</span><span>${$(p.menor - c)}</span></div>`;
}

/* Materia prima */
let editingMat = null;
function editMat(id) {
  const nuevo = id == null;
  const m = nuevo ? { id: Math.max(0, ...S.materia.map(x => x.id)) + 1, nombre: "", lugar: "SHEIN", cantidad: 0, precio: 0, link: "" } : { ...S.materia.find(x => x.id === id) };
  const url = safeUrl(m.link);
  openSheet(nuevo ? "Nueva materia prima" : "Editar materia prima", `
    <div class="field"><label for="mm_nombre">Nombre</label><input id="mm_nombre" data-mm="nombre" value="${esc(m.nombre)}"></div>
    <div class="field"><label for="mm_lugar">Dónde se compra</label><input id="mm_lugar" data-mm="lugar" value="${esc(m.lugar)}"></div>
    <div class="grid2"><div class="field"><label for="mm_cantidad">Cantidad</label><input id="mm_cantidad" inputmode="numeric" data-mm="cantidad" value="${m.cantidad || ""}"></div>
    <div class="field"><label for="mm_precio">Precio total</label><input id="mm_precio" inputmode="numeric" data-mm="precio" value="${m.precio || ""}"></div></div>
    <div class="field"><label for="mm_link">Link de compra</label><input id="mm_link" type="url" data-mm="link" value="${esc(m.link)}" placeholder="https://"></div>
    ${url ? `<a class="buy" style="align-self:flex-start" href="${esc(url)}" target="_blank" rel="noopener">Abrir link de compra</a>` : ""}
    <button class="btn block" type="button" data-action="save-mat">Guardar</button>`, () => { editingMat = m; });
}

/* Contenido */
let editingC = null;
function editContent(id, preset) {
  const nuevo = id == null;
  const c = nuevo ? { id: "c" + Date.now(), titulo: "", serie: "rebranding", capitulo: "", fechaGrabacion: "", fechaPublicacion: ui.cDia || "", hora: "", plataforma: "TikTok", tipo: "Video", estado: "idea",
    hook: "", guion: "", caption: "", hashtags: "", audio: "", inspiracion: "", link: "", productoCodigo: null, ...(preset || {}) } : { ...S.contenido.find(x => x.id === id) };
  const opt = (arr, v, lab) => arr.map(x => { const val = typeof x === "string" ? x : x.id, t = typeof x === "string" ? (lab ? lab[x] : x) : x.nombre; return `<option value="${esc(val)}" ${val === v ? "selected" : ""}>${esc(t)}</option>`; }).join("");
  const prod = c.productoCodigo ? S.productos.find(p => p.codigo === c.productoCodigo) : null;
  openSheet(nuevo ? "Nuevo contenido" : "Editar contenido", `
    <div class="field"><label for="cc_titulo">Contenido / tema</label><input id="cc_titulo" data-cc="titulo" value="${esc(c.titulo)}" placeholder="Ej: Acompáñame a pasar de esto a esto"></div>
    ${prod ? `<p class="muted small" style="margin:0">Producto: <b>${esc(prod.nombre)}</b> · ${esc(prod.tipo)}</p>` : ""}
    <div class="grid2"><div class="field"><label for="cc_serie">Serie</label><select id="cc_serie" data-cc="serie">${opt(SERIES, c.serie)}</select></div>
      <div class="field"><label for="cc_cap">Capítulo</label><input id="cc_cap" inputmode="numeric" data-cc="capitulo" value="${esc(c.capitulo)}" placeholder="1"></div></div>
    <div class="field"><label for="cc_estado">Estado</label><select id="cc_estado" data-cc="estado">${opt(C_EST, c.estado, C_EST_LABEL)}</select></div>
    <div class="grid2"><div class="field"><label for="cc_fg">Fecha de grabación</label><input id="cc_fg" type="date" data-cc="fechaGrabacion" value="${esc(c.fechaGrabacion)}"></div>
      <div class="field"><label for="cc_fp">Fecha de publicación</label><input id="cc_fp" type="date" data-cc="fechaPublicacion" value="${esc(c.fechaPublicacion)}"></div></div>
    <div class="grid3"><div class="field"><label for="cc_hora">Hora</label><input id="cc_hora" type="time" data-cc="hora" value="${esc(c.hora)}"></div>
      <div class="field"><label for="cc_plat">Red</label><select id="cc_plat" data-cc="plataforma">${opt(PLATAFORMAS, c.plataforma)}</select></div>
      <div class="field"><label for="cc_tipo">Tipo</label><select id="cc_tipo" data-cc="tipo">${opt(C_TIPOS, c.tipo)}</select></div></div>
    <div class="field"><label for="cc_hook">Hook</label><input id="cc_hook" data-cc="hook" value="${esc(c.hook)}" placeholder="La primera frase o texto en pantalla"></div>
    <div class="field"><label for="cc_guion">Guion</label><textarea id="cc_guion" data-cc="guion" rows="5" placeholder="Toma por toma, voz en off o textos">${esc(c.guion)}</textarea></div>
    <div class="field"><label for="cc_caption">Caption</label><textarea id="cc_caption" data-cc="caption" rows="3">${esc(c.caption)}</textarea></div>
    <div class="field"><label for="cc_hash">Hashtags</label><input id="cc_hash" data-cc="hashtags" value="${esc(c.hashtags)}" placeholder="#hechoamano #manillas"></div>
    <div class="field"><label for="cc_audio">Canción o audio</label><input id="cc_audio" data-cc="audio" value="${esc(c.audio)}"></div>
    <div class="field"><label for="cc_insp">Links de inspiración (uno por línea)</label><textarea id="cc_insp" data-cc="inspiracion" rows="3" placeholder="https://www.tiktok.com/...">${esc(c.inspiracion)}</textarea></div>
    <div class="links" id="ccLinks"></div>
    <div class="field"><label for="cc_link">Link de la publicación</label><input id="cc_link" type="url" data-cc="link" value="${esc(c.link)}" placeholder="https://"></div>
    <button class="btn block" type="button" data-action="save-content">Guardar</button>
    ${nuevo ? "" : `<div id="delCBox"><button class="btn block danger" type="button" data-action="del-c-ask">Eliminar contenido</button></div>`}`, () => { editingC = c; drawCLinks(); });
}
function drawCLinks() {
  const el = $id("ccLinks"); if (!el || !editingC) return;
  const urls = [...String(editingC.inspiracion || "").split(/\s+/), editingC.link].map(safeUrl).filter(Boolean);
  el.innerHTML = urls.length ? urls.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join("") : "";
}

/* ---------- Excel y respaldo ---------- */
async function entregarArchivo(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function descargarExcel() {
  const fila = (p, l) => ({ "N° pedido": p.n, "Fecha": p.fecha, "Estado": EST_LABEL[p.estado], "Cliente": p.cliente, "Cédula": p.cc, "Celular": p.celular, "Ciudad": p.ciudad, "Dirección": p.direccion,
    "Producto": l.nombre, "Tipo": l.tipo, "Cantidad": l.cantidad, "Precio unitario": l.precio, "Subtotal": l.cantidad * l.precio, "Costo": l.cantidad * (l.costo || 0),
    "Envío": p.envio, "Paga envío": p.envioPaga === "yo" ? "Blu" : "Cliente", "Pagado": p.pagado ? "Sí" : "No", "Precio": p.precioTipo === "mayor" ? "Por mayor" : "Detal" });
  const rows = arr => arr.slice().sort((a, b) => a.n - b.n).flatMap(p => p.lineas.map(l => fila(p, l)));
  const wb = XLSX.utils.book_new();
  const add = (name, data) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{}]), name);
  add("Pedidos", rows(S.pedidos.filter(p => p.estado !== "entregado")));
  add("Ventas", rows(S.pedidos.filter(p => p.estado === "entregado")));
  add("Inventario", activos().slice().sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre)).map(p => ({ "Código": p.codigo, "Nombre": p.nombre, "Tipo": p.tipo, "Stock": p.stock })));
  add("Costos", S.productos.map(p => { const c = costoProd(p); return { "Código": p.codigo, "Nombre": p.nombre, "Tipo": p.tipo, "Remodelación": REMO[remo(p)], "Hilo": p.hilo, "Dije": p.dije, "Mostacillas": p.mostacillas, "Compra": p.compra, "Mano de obra": p.manoObra, "Empaque": p.empaque, "Costo total": c, "Precio por mayor": p.mayor, "Ganancia por mayor": p.mayor - c, "Precio detal": p.menor, "Ganancia detal": p.menor - c }; }));
  add("Materia prima", S.materia.map(m => ({ "Nombre": m.nombre, "Lugar": m.lugar, "Cantidad": m.cantidad, "Precio": m.precio, "Precio por unidad": m.cantidad ? Math.round(m.precio / m.cantidad * 100) / 100 : 0, "Link": m.link })));
  add("Parrilla", S.contenido.slice().sort((a, b) => (a.fechaPublicacion || "9").localeCompare(b.fechaPublicacion || "9")).map(c => ({ "Fecha grabación": c.fechaGrabacion, "Fecha publicación": c.fechaPublicacion, "Hora": c.hora, "Serie": serie(c.serie).nombre, "Capítulo": c.capitulo, "Contenido": c.titulo, "Hook": c.hook, "Guion": c.guion, "Caption": c.caption, "Hashtags": c.hashtags, "Audio": c.audio, "Plataforma": c.plataforma, "Tipo": c.tipo, "Estado": C_EST_LABEL[c.estado], "Inspiración": c.inspiracion, "Link": c.link })));
  const data = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  entregarArchivo(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "Blu Accesories " + today() + ".xlsx");
}
function descargarRespaldo() {
  entregarArchivo(new Blob([JSON.stringify({ app: "blu-gestion", version: 1, fecha: new Date().toISOString(), ...S })], { type: "application/json" }), "Blu respaldo " + today() + ".json");
}
async function importar(file) {
  let d;
  try { d = JSON.parse(await file.text()); } catch (e) { toast("Ese archivo no es un respaldo válido"); return; }
  const rows = [];
  COLS.forEach(col => (Array.isArray(d[col]) ? d[col] : []).forEach(o => { if (o && ID_OF[col](o) != null) rows.push({ user_id: uid, coleccion: col, id: ID_OF[col](o), data: o, actualizado: new Date().toISOString() }); }));
  if (!rows.length) { toast("El archivo no tiene datos de Blu"); return; }
  toast("Importando " + rows.length + " registros…");
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from("registros").upsert(rows.slice(i, i + 200));
    if (error) { console.error(error); toast("La importación se cortó. Revisa tu conexión e inténtalo de nuevo"); return; }
  }
  await cargar(); render(); toast("Listo: " + rows.length + " registros importados");
}

/* ---------- Toast ---------- */
let tt;
function toast(msg) { const r = $id("toastRoot"); r.innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`; clearTimeout(tt); tt = setTimeout(() => r.innerHTML = "", 2800); }

/* ---------- Eventos ---------- */
document.addEventListener("click", e => {
  if (e.target.closest("a[href]")) return;
  const t = e.target.closest("[data-tab],[data-action]"); if (!t) return;
  if (t.dataset.tab) { go(t.dataset.tab); return; }
  const a = t.dataset.action, v = t.dataset.v;
  if (a === "close-bg" && e.target !== t) return;
  const prodC = () => S.productos.find(x => x.codigo === +t.dataset.c);
  switch (a) {
    case "tab": go(v); break;
    case "reintentar": iniciar({ user: { id: uid, email } }); break;
    case "filtro-ped": if (v === "entregado") go("ventas"); else { ui.pedFiltro = v; go("pedidos"); } break;
    case "new-order": newOrder(); break;
    case "close": case "close-bg": closeSheet(); break;
    case "ptipo": draft.precioTipo = v; draft.lineas.forEach(l => { const p = S.productos.find(x => x.codigo === l.codigo); if (p) l.precio = priceFor(p, v); }); drawOrderForm(); break;
    case "paga": draft.envioPaga = v; drawOrderForm(); break;
    case "pagado": draft.pagado = v === "1"; drawOrderForm(); break;
    case "add-line": { const p = prodC(); const ex = draft.lineas.find(l => l.codigo === p.codigo);
      if (ex) ex.cantidad++; else draft.lineas.push({ codigo: p.codigo, nombre: p.nombre, tipo: p.tipo, cantidad: 1, precio: priceFor(p, draft.precioTipo), costo: costoProd(p) });
      draft.q = ""; drawOrderForm(); break; }
    case "del-line": draft.lineas.splice(+t.dataset.i, 1); drawOrderForm(); break;
    case "qty": { const l = draft.lineas[+t.dataset.i]; l.cantidad = Math.max(1, l.cantidad + (+t.dataset.d)); drawOrderForm(); break; }
    case "save-order": saveOrder(); break;
    case "avanzar": { const p = S.pedidos.find(x => x.id === t.dataset.id); p.estado = ESTADOS[ESTADOS.indexOf(p.estado) + 1]; guardar("pedidos", p); render();
      toast(p.estado === "entregado" ? "Pedido #" + p.n + " entregado · pasó a Ventas" : "Pedido #" + p.n + ": " + EST_LABEL[p.estado].toLowerCase()); break; }
    case "ver": verPedido(t.dataset.id); break;
    case "toggle-pago": { const p = S.pedidos.find(x => x.id === t.dataset.id); p.pagado = !p.pagado; guardar("pedidos", p); render(); verPedido(p.id); break; }
    case "retroceder": { const p = S.pedidos.find(x => x.id === t.dataset.id); p.estado = ESTADOS[ESTADOS.indexOf(p.estado) - 1]; guardar("pedidos", p); render(); verPedido(p.id); break; }
    case "cancel-ask": { const p = S.pedidos.find(x => x.id === t.dataset.id);
      $id("cancelBox").innerHTML = `<div class="warn">${p.estado === "entregado" ? "¿Borrar esta venta? Se quita del historial; el inventario no cambia." : "¿Cancelar este pedido? Las unidades vuelven al inventario."}</div>
      <div class="row" style="margin-top:8px"><button class="btn danger grow" type="button" data-action="cancel-yes" data-id="${p.id}">Sí, ${p.estado === "entregado" ? "borrar" : "cancelar"}</button><button class="btn ghost grow" type="button" data-action="close">No</button></div>`; break; }
    case "cancel-yes": { const i = S.pedidos.findIndex(x => x.id === t.dataset.id), p = S.pedidos[i];
      if (!p.importado && p.estado !== "entregado") p.lineas.forEach(l => { const pr = S.productos.find(x => x.codigo === l.codigo); if (pr) { pr.stock += l.cantidad; guardar("productos", pr); } });
      S.pedidos.splice(i, 1); borrar("pedidos", p.id); closeSheet(); render(); toast(p.estado === "entregado" ? "Venta borrada" : "Pedido cancelado"); break; }
    case "stock": { const p = prodC(); p.stock = Math.max(0, p.stock + (+t.dataset.d)); guardar("productos", p); render(); break; }
    case "stock-tipo": ui.stockTipo = v; render(); break;
    case "seg": ui.catSeg = v; ui.catQ = ""; render(); break;
    case "rem-filtro": ui.remFiltro = v; render(); break;
    case "remo": { const p = prodC(); const antes = remo(p); p.remodelacion = v; guardar("productos", p); render();
      toast(v === "archivado" ? p.nombre + " archivado" : antes === "archivado" ? p.nombre + " recuperado" : p.nombre + ": " + REMO[v].toLowerCase()); break; }
    case "video-prod": { const p = prodC(); const caps = S.contenido.filter(c => c.serie === "rebranding").map(c => +c.capitulo || 0);
      editContent(null, { serie: "rebranding", titulo: "Acompáñame a pasar de esto a esto: " + p.nombre, productoCodigo: p.codigo, capitulo: String(Math.max(0, ...caps) + 1) }); break; }
    case "edit-prod": editProd(+t.dataset.c); break;
    case "new-prod": editProd(null); break;
    case "save-prod": { const p = editing; if (!p.nombre.trim()) { toast("Ponle nombre al producto"); return; }
      const i = S.productos.findIndex(x => x.codigo === p.codigo); if (i >= 0) S.productos[i] = p; else S.productos.push(p);
      guardar("productos", p); closeSheet(); render(); toast("Producto guardado"); break; }
    case "edit-mat": editMat(+t.dataset.id); break;
    case "new-mat": editMat(null); break;
    case "save-mat": { const m = editingMat; if (!m.nombre.trim()) { toast("Ponle nombre"); return; }
      const i = S.materia.findIndex(x => x.id === m.id); if (i >= 0) S.materia[i] = m; else S.materia.push(m); guardar("materia", m); closeSheet(); render(); toast("Guardado"); break; }
    case "new-content": editContent(null); break;
    case "edit-content": editContent(t.dataset.id); break;
    case "save-content": { const c = editingC; if (!c.titulo.trim()) { toast("Ponle un tema al contenido"); return; }
      const i = S.contenido.findIndex(x => x.id === c.id); if (i >= 0) S.contenido[i] = c; else S.contenido.push(c);
      if (c.fechaPublicacion) ui.cMes = c.fechaPublicacion.slice(0, 7);
      guardar("contenido", c); closeSheet(); if (tab !== "contenido") go("contenido"); else render(); toast("Contenido guardado"); break; }
    case "del-c-ask": $id("delCBox").innerHTML = `<div class="warn">¿Eliminar este contenido? No se puede deshacer.</div>
      <div class="row" style="margin-top:8px"><button class="btn danger grow" type="button" data-action="del-c-yes">Sí, eliminar</button><button class="btn ghost grow" type="button" data-action="close">No</button></div>`; break;
    case "del-c-yes": { const id = editingC.id; S.contenido = S.contenido.filter(x => x.id !== id); borrar("contenido", id); closeSheet(); render(); toast("Contenido eliminado"); break; }
    case "c-vista": ui.cVista = v; render(); break;
    case "c-serie": ui.cSerie = v; render(); break;
    case "c-dia": ui.cDia = ui.cDia === v ? "" : v; render(); break;
    case "c-mes": { const [y, m] = ui.cMes.split("-").map(Number); const d = new Date(y, m - 1 + (+t.dataset.d), 1); ui.cMes = d.getFullYear() + "-" + pad(d.getMonth() + 1); ui.cDia = ""; render(); break; }
    case "excel": descargarExcel(); break;
    case "respaldo": descargarRespaldo(); break;
    case "logout": sb.auth.signOut().then(() => { S = { productos: [], materia: [], pedidos: [], contenido: [] }; uid = null; iniciar(null); }); break;
  }
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".tappable,.ccard")) { e.preventDefault(); e.target.click(); }
  if (e.key === "Escape" && sheetRoot.innerHTML) closeSheet();
});
document.addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.input) { ui[t.dataset.input] = t.value; render(); const el = $id(t.id); el.focus(); el.setSelectionRange(el.value.length, el.value.length); return; }
  if (t.dataset.f && draft) { const k = t.dataset.f; draft[k] = k === "envio" ? num(t.value) : t.value; if (k === "q" || k === "envio") drawOrderForm(t.id); return; }
  if (t.dataset.lp && draft) { draft.lineas[+t.dataset.lp].precio = num(t.value); drawOrderForm(t.id); return; }
  if (t.dataset.pp && editing) { const k = t.dataset.pp; editing[k] = (k === "nombre" || k === "tipo") ? t.value : (k === "stock" ? (parseInt(t.value, 10) || 0) : num(t.value)); drawProdTot(); return; }
  if (t.dataset.mm && editingMat) { const k = t.dataset.mm; editingMat[k] = (k === "cantidad" || k === "precio") ? num(t.value) : t.value; return; }
  if (t.dataset.cc && editingC) { editingC[t.dataset.cc] = t.value; if (t.dataset.cc === "inspiracion" || t.dataset.cc === "link") drawCLinks(); }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.change === "mes") { ui.ventasMes = t.value; render(); }
  if (t.dataset.pp && editing) { editing[t.dataset.pp] = t.value; drawProdTot(); }
  if (t.dataset.cc && editingC) editingC[t.dataset.cc] = t.value;
  if (t.id === "fileImport" && t.files && t.files[0]) importar(t.files[0]);
});

/* ---------- Arranque ---------- */
sb.auth.getSession().then(({ data }) => iniciar(data.session));
sb.auth.onAuthStateChange((ev, session) => { if (ev === "SIGNED_OUT") iniciar(null); });
