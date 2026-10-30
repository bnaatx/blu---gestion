/* Blu Gestión — pedidos, ventas, inventario, catálogo, remodelación y parrilla de contenido.
   Los datos viven en Supabase, en la tabla "registros" (coleccion, id, data), protegidos por usuario. */
"use strict";

/* ---------- Constantes ---------- */
const ESTADOS = ["pendiente", "empacado", "enviado", "entregado"];
const EST_LABEL = { pendiente: "Pedido pendiente", empacado: "Empacado", enviado: "Enviado", entregado: "Entregado", perdido: "Envío perdido" };
const PAGO_LABEL = { pendiente: "Pago pendiente", abono: "Apartado", pagado: "Pagado" };
const pagoDe = p => p.pago || (p.pagado ? "pagado" : "pendiente");
const saldo = p => pagoDe(p) === "pagado" ? 0 : Math.max(0, pedTotal(p) - (pagoDe(p) === "abono" ? (+p.abono || 0) : 0));
const INV_CATS = ["Mercancía", "Insumos", "Empaques", "Publicidad", "Envíos", "Otros"];
const NEXT_LABEL = { pendiente: "Marcar empacado", empacado: "Marcar enviado", enviado: "Marcar entregado", perdido: "Marcar reenviado" };
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
let S = { productos: [], materia: [], pedidos: [], contenido: [], inversiones: [] };
let estado = "cargando"; // cargando | listo | error
const COLS = ["productos", "materia", "pedidos", "contenido", "inversiones"];
const ID_OF = { productos: p => String(p.codigo), materia: m => String(m.id), pedidos: p => p.id, contenido: c => c.id, inversiones: i => i.id };

async function cargar() {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("registros").select("coleccion,id,data").range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const n = { productos: [], materia: [], pedidos: [], contenido: [], inversiones: [] };
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
  const id = ID_OF[col](obj), data = JSON.parse(JSON.stringify(obj, (k, v) => k === "_t" ? undefined : v));
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
let ui = { pedFiltro: "activos", ventasMes: "", ventasSeg: "ventas", ventasEst: "", invMes: "", stockQ: "", stockTipo: "", catSeg: "productos", catQ: "", remFiltro: "pendiente",
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
    ${(() => { const inv = S.inversiones.filter(i => i.fecha.startsWith(ym)).reduce((s, i) => s + (+i.valor || 0), 0); return inv ? `<span class="sub">Invertido este mes: <b>${$(inv)}</b></span>` : ""; })()}
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
    ${opts.track && p.estado !== "perdido" ? `<div class="track" aria-hidden="true">${ESTADOS.map((e, k) => `<i class="${k <= i ? "on" : ""}"></i>`).join("")}</div>` : ""}
    <div class="items">${p.lineas.map(l => `<div><span>${l.cantidad} × ${esc(l.nombre)} <span class="muted">${esc(l.tipo)}</span></span><span class="num">${$(l.cantidad * l.precio)}</span></div>`).join("")}
      ${p.envio ? `<div class="muted"><span>Envío · paga ${p.envioPaga === "yo" ? "Blu" : "el cliente"}</span><span class="num">${$(p.envio)}</span></div>` : ""}</div>
    <div class="row between wrap">
      <div class="row wrap" style="gap:6px">${pagoDe(p) !== "pagado" ? `<span class="pill pg-${pagoDe(p)}">${PAGO_LABEL[pagoDe(p)]}</span>` : ""}${p.precioTipo === "mayor" ? '<span class="pill wa-mayorista">Cliente mayorista</span>' : ""}${p.importado ? '<span class="tag">Del Excel</span>' : ""}</div>
      <div style="text-align:right"><span class="money">${$(pedTotal(p))}</span>${saldo(p) && saldo(p) < pedTotal(p) ? `<div class="small muted">Abonó ${$(p.abono)} · debe ${$(saldo(p))}</div>` : saldo(p) ? `<div class="small" style="color:var(--loss)">Debe ${$(saldo(p))}</div>` : ""}</div>
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
  const filtros = [["activos", "Todos (" + act.length + ")"], ...["pendiente", "empacado", "enviado", "perdido"].map(e => [e, EST_LABEL[e] + " (" + act.filter(p => p.estado === e).length + ")"]).filter(([k, l]) => k !== "perdido" || !l.endsWith("(0)"))];
  return `<div class="scroller">${filtros.map(([k, l]) => `<button class="chip" type="button" data-action="filtro-ped" data-v="${k}" aria-pressed="${f === k}">${l}</button>`).join("")}</div>
  <div class="list">${lista.length ? lista.map(p => orderCard(p, { track: true, actions: true })).join("") :
    `<div class="empty"><div class="iso"></div><b>No hay pedidos aquí</b><span class="small">Toca “Nuevo pedido” para registrar uno. Cuando lo marques como entregado pasa a Ventas.</span></div>`}</div>`;
}

/* ---------- Ventas ---------- */
const mlabel = ym => { const [y, m] = ym.split("-"); return MESES[+m - 1][0].toUpperCase() + MESES[+m - 1].slice(1) + " " + y; };
const V_FILTROS = [["", "Todas"], ["pendiente", "Pedido pendiente"], ["apartado", "Apartado"], ["pagopend", "Pago pendiente"], ["empacado", "Empacado"], ["enviado", "Enviado"], ["entregado", "Entregado"], ["mayorista", "Cliente mayorista"], ["perdido", "Envío perdido"]];
const V_CLASE = { pendiente: "st-pendiente", apartado: "pg-abono", pagopend: "pg-pendiente", empacado: "st-empacado", enviado: "st-enviado", entregado: "st-entregado", mayorista: "wa-mayorista", perdido: "st-perdido" };
function cumple(p, f) {
  if (!f) return true;
  if (f === "apartado") return pagoDe(p) === "abono";
  if (f === "pagopend") return pagoDe(p) === "pendiente";
  if (f === "mayorista") return p.precioTipo === "mayor";
  return p.estado === f;
}
function vVentas() {
  const seg = `<div class="seg" role="group" aria-label="Ventas"><button type="button" data-action="v-seg" data-v="ventas" aria-pressed="${ui.ventasSeg === "ventas"}">Ventas</button><button type="button" data-action="v-seg" data-v="invertido" aria-pressed="${ui.ventasSeg === "invertido"}">Invertido</button></div>`;
  if (ui.ventasSeg === "invertido") return seg + vInvertido();
  const todas = S.pedidos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha) || b.n - a.n);
  const meses = [...new Set(todas.map(p => p.fecha.slice(0, 7)))].sort().reverse();
  if (ui.ventasMes && !meses.includes(ui.ventasMes)) ui.ventasMes = "";
  const delPeriodo = ui.ventasMes ? todas.filter(p => p.fecha.startsWith(ui.ventasMes)) : todas;
  const lista = delPeriodo.filter(p => cumple(p, ui.ventasEst));
  const validas = lista.filter(p => p.estado !== "perdido");
  const tot = validas.reduce((a, p) => a + pedSub(p), 0), gan = validas.reduce((a, p) => a + pedGan(p), 0), u = validas.reduce((a, p) => a + unidades(p), 0);
  const porCobrar = lista.reduce((a, p) => a + saldo(p), 0);
  return `${seg}<div class="field"><label for="mesSel">Periodo</label>
    <select id="mesSel" data-change="mes"><option value="">Todo el historial</option>${meses.map(m => `<option value="${m}" ${m === ui.ventasMes ? "selected" : ""}>${mlabel(m)}</option>`).join("")}</select></div>
  <div class="scroller">${V_FILTROS.map(([k, l]) => { const n = delPeriodo.filter(p => cumple(p, k)).length; return `<button class="chip wa-chip ${k ? V_CLASE[k] : ""}" type="button" data-action="v-est" data-v="${k}" aria-pressed="${ui.ventasEst === k}">${l} <b>${n}</b></button>`; }).join("")}</div>
  <section class="hero"><span class="sub">Vendido</span><span class="big">${$(tot)}</span>
    <div class="split"><div>Pedidos<b>${validas.length}</b></div><div>Unidades<b>${u}</b></div><div>Ganancia<b>${$(gan)}</b></div></div>
    ${porCobrar ? `<span class="sub" style="margin-top:8px">Por cobrar: <b>${$(porCobrar)}</b></span>` : ""}</section>
  <div class="list">${lista.length ? lista.map(p => orderCard(p, { detalle: true })).join("") : `<div class="empty"><div class="iso"></div><b>No hay ventas con este filtro</b></div>`}</div>`;
}

/* ---------- Invertido ---------- */
function vInvertido() {
  const todas = S.inversiones.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const meses = [...new Set([...todas.map(i => i.fecha.slice(0, 7)), ...S.pedidos.map(p => p.fecha.slice(0, 7))])].sort().reverse();
  if (ui.invMes && !meses.includes(ui.invMes)) ui.invMes = "";
  const lista = ui.invMes ? todas.filter(i => i.fecha.startsWith(ui.invMes)) : todas;
  const invertido = lista.reduce((a, i) => a + (+i.valor || 0), 0);
  const ventas = S.pedidos.filter(p => p.estado !== "perdido" && (!ui.invMes || p.fecha.startsWith(ui.invMes)));
  const vendido = ventas.reduce((a, p) => a + pedSub(p), 0);
  const cobrado = ventas.reduce((a, p) => a + pedTotal(p) - saldo(p), 0);
  const bal = vendido - invertido;
  const porCat = INV_CATS.map(c => [c, lista.filter(i => (i.categoria || "Otros") === c).reduce((a, i) => a + (+i.valor || 0), 0)]).filter(([, v]) => v);
  return `<div class="row"><div class="field grow"><label for="invMes">Periodo</label>
    <select id="invMes" data-change="invmes"><option value="">Todo el historial</option>${meses.map(m => `<option value="${m}" ${m === ui.invMes ? "selected" : ""}>${mlabel(m)}</option>`).join("")}</select></div>
    <button class="btn" type="button" data-action="new-inv" style="align-self:flex-end">+ Compra</button></div>
  <section class="hero"><span class="sub">Invertido</span><span class="big">${$(invertido)}</span>
    <div class="split"><div>Vendido<b>${$(vendido)}</b></div><div>Cobrado<b>${$(cobrado)}</b></div><div>${bal >= 0 ? "Recuperado" : "Falta recuperar"}<b>${$(Math.abs(bal))}</b></div></div></section>
  ${porCat.length ? `<section class="card" style="display:flex;flex-direction:column;gap:8px"><h3>En qué se fue</h3>${porCat.map(([c, v]) => `<div class="row between"><span>${c}</span><b class="num">${$(v)}</b></div><div class="progress" aria-hidden="true"><i style="width:${Math.round(v / invertido * 100)}%"></i></div>`).join("")}</section>` : ""}
  <div class="list">${lista.length ? lista.map(i => `<article class="card ccard" data-action="edit-inv" data-id="${i.id}" role="button" tabindex="0">
      <div class="row between" style="align-items:flex-start"><div class="t grow">${esc(i.descripcion || "Compra")}</div><b class="money">${$(i.valor)}</b></div>
      <div class="meta">${fmtDate(i.fecha)} · ${esc(i.categoria || "Otros")}${i.lugar ? " · " + esc(i.lugar) : ""}</div>
      ${i.detalle ? `<div class="small" style="white-space:pre-line">${esc(i.detalle)}</div>` : ""}</article>`).join("")
    : `<div class="empty"><div class="iso"></div><b>Todavía no registras compras</b><span class="small">Toca “+ Compra” para anotar lo que inviertes en mercancía, insumos o empaques.</span></div>`}</div>`;
}
let editingInv = null;
function editInv(id) {
  const nuevo = id == null;
  const i = nuevo ? { id: "i" + Date.now(), fecha: today(), descripcion: "", categoria: "Mercancía", lugar: "", valor: 0, detalle: "" } : { ...S.inversiones.find(x => x.id === id) };
  openSheet(nuevo ? "Registrar compra" : "Editar compra", `
    <div class="field"><label for="iv_desc">Qué compraste</label><input id="iv_desc" data-iv="descripcion" value="${esc(i.descripcion)}" placeholder="Ej: Pedido SHEIN de dijes y cadenas"></div>
    <div class="grid2"><div class="field"><label for="iv_fecha">Fecha</label><input id="iv_fecha" type="date" data-iv="fecha" value="${esc(i.fecha)}"></div>
      <div class="field"><label for="iv_valor">Valor total</label><input id="iv_valor" inputmode="numeric" data-iv="valor" value="${i.valor || ""}" placeholder="0"></div></div>
    <div class="grid2"><div class="field"><label for="iv_cat">Categoría</label><select id="iv_cat" data-iv="categoria">${INV_CATS.map(c => `<option ${c === i.categoria ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="field"><label for="iv_lugar">Dónde</label><input id="iv_lugar" data-iv="lugar" value="${esc(i.lugar)}" placeholder="SHEIN, Santorini…"></div></div>
    <div class="field"><label for="iv_det">Detalle (opcional)</label><textarea id="iv_det" data-iv="detalle" rows="3" placeholder="Qué incluía la compra">${esc(i.detalle)}</textarea></div>
    <button class="btn block" type="button" data-action="save-inv">Guardar</button>
    ${nuevo ? "" : `<div id="delIBox"><button class="btn block danger" type="button" data-action="del-inv-ask">Eliminar compra</button></div>`}`, () => { editingInv = i; });
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
function closeSheet() { sheetRoot.innerHTML = ""; document.body.style.overflow = ""; draft = null; editing = null; editingMat = null; editingC = null; editingInv = null; }

/* Nuevo pedido */
let draft = null;
function newOrder() {
  draft = { fecha: today(), cliente: "", celular: "", cc: "", ciudad: "", direccion: "", precioTipo: "detal", envio: 0, envioPaga: "cliente", pago: "pendiente", abono: 0, estado: "pendiente", lineas: [], q: "", pegado: "" };
  openSheet("Nuevo pedido", `<div id="orderForm"></div>`, () => drawOrderForm());
}
const priceFor = (p, t) => t === "mayor" ? p.mayor : p.menor;
function drawOrderForm(focusId) {
  const d = draft, box = $id("orderForm"); if (!box) return;
  const q = norm(d.q);
  const res = q ? activos().filter(p => norm(p.nombre).includes(q) || norm(p.tipo).includes(q)).slice(0, 8) : [];
  const faltan = d.lineas.filter(l => { const p = S.productos.find(x => x.codigo === l.codigo); return p && l.cantidad > p.stock; });
  box.innerHTML = `
  <div class="card" style="display:flex;flex-direction:column;gap:10px;background:var(--soft);border-color:transparent">
    <div class="field"><label for="f_pegado">Pegar mensaje del cliente o la factura</label>
      <textarea id="f_pegado" data-f="pegado" rows="4" placeholder="Pega los datos de envío o la factura que le mandaste. Puedes pegar uno y después el otro.">${esc(d.pegado || "")}</textarea></div>
    <div class="row" style="gap:8px"><button class="btn grow" type="button" data-action="organizar">Organizar</button>${navigator.clipboard && navigator.clipboard.readText ? `<button class="btn ghost" type="button" data-action="pegar">Pegar</button>` : ""}</div>
  </div>
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
  <div class="field"><span class="lbl">Pago</span><div class="seg" style="grid-template-columns:repeat(3,1fr)">
    <button type="button" data-action="pago" data-v="pagado" aria-pressed="${d.pago === "pagado"}">Pagó todo</button>
    <button type="button" data-action="pago" data-v="abono" aria-pressed="${d.pago === "abono"}">Abonó</button>
    <button type="button" data-action="pago" data-v="pendiente" aria-pressed="${d.pago === "pendiente"}">No ha pagado</button></div></div>
  ${d.pago === "abono" ? `<div class="field"><label for="f_abono">Valor del abono</label><input id="f_abono" inputmode="numeric" data-f="abono" value="${d.abono || ""}" placeholder="${Math.round(pedTotal(d) / 2)}"></div>` : ""}
  <div class="totals"><div><span>Productos</span><span>${$(pedSub(d))}</span></div>
    ${d.envio ? `<div><span>Envío ${d.envioPaga === "yo" ? "(lo pagas tú)" : ""}</span><span>${d.envioPaga === "yo" ? "—" : $(d.envio)}</span></div>` : ""}
    <div class="t"><span>Total a cobrar</span><span>${$(pedTotal(d))}</span></div>
    ${d.pago === "abono" ? `<div><span>Abono</span><span>${$(d.abono)}</span></div><div><span>Saldo pendiente</span><span>${$(Math.max(0, pedTotal(d) - (+d.abono || 0)))}</span></div>` : ""}
    <div class="small muted"><span>Ganancia estimada</span><span>${$(pedGan(d))}</span></div></div>
  <div id="formErr" class="warn" hidden></div>
  <button class="btn block" type="button" data-action="save-order">Guardar pedido</button>`;
  if (focusId) { const el = $id(focusId); if (el) { el.focus(); const v = el.value; try { el.setSelectionRange(v.length, v.length); } catch (e) { } } }
}
/* Organiza el mensaje que manda el cliente por WhatsApp (nombre, ciudad, dirección, celular, cédula) */
const CIUDADES = ["bogota", "medellin", "cali", "barranquilla", "cartagena", "bucaramanga", "pereira", "manizales", "ibague", "neiva", "villavicencio", "pasto", "santa marta", "cucuta", "armenia", "tunja", "popayan", "monteria", "sincelejo", "valledupar", "palmira", "soacha", "facatativa", "zipaquira", "chia", "sopo", "fusagasuga", "girardot", "mosquera", "madrid", "funza", "cajica", "envigado", "itagui", "bello", "rionegro", "floridablanca", "giron", "piedecuesta", "dosquebradas", "duitama", "sogamoso", "yopal", "florencia", "riohacha", "quibdo", "tulua", "buga", "cartago", "jamundi", "yumbo", "la calera", "tocancipa", "tenjo", "cota", "la mesa", "villeta", "ubate", "honda", "espinal", "melgar", "sabaneta", "la estrella", "caldas", "apartado", "turbo", "barrancabermeja", "ocaña", "pamplona", "san andres", "leticia", "mocoa", "arauca", "san gil", "chiquinquira", "ipiales", "tumaco", "buenaventura", "magangue", "cienaga", "soledad", "malambo", "maicao", "aguachica", "lorica", "cerete", "sahagun", "caucasia", "guarne", "marinilla", "la ceja", "santander de quilichao", "zarzal", "sevilla", "calarca", "la dorada", "chinchina", "puerto boyaca", "garzon", "pitalito", "la plata"];
const RX_DIR = /^(cra|cr|kra|kr|carrera|calle|cll|cl|clle|av|avda|avenida|ak|ac|diagonal|diag|dg|transversal|transv|trans|tv|tr|mz|manzana|vereda|km|kilometro|conjunto|edificio|torre|apto|apartamento|casa|barrio|urbanizacion|urb|interrapidisimo|punto|oficina)\b/i;
function organizar(texto) {
  const out = {}, libres = [];
  let lineas = String(texto || "").replace(/\r/g, "").split("\n").map(l => l.replace(/^[\s•\-–*·>]+/, "").trim()).filter(Boolean);
  if (lineas.length === 1) lineas = lineas[0].split(/\s*[,;]\s*/).filter(Boolean);
  const etiquetas = [
    [/^(nombre( completo)?|cliente|destinatario)\s*[:\-]\s*/i, "cliente"],
    [/^(ciudad|municipio)\s*[:\-]\s*/i, "ciudad"],
    [/^(direcci[oó]n|dir)\s*[:\-]\s*/i, "direccion"],
    [/^(barrio)\s*[:\-]\s*/i, "barrio"],
    [/^(cel(ular)?|tel([eé]fono)?|whatsapp|n[uú]mero)\s*[:\-]\s*/i, "celular"],
    [/^(c[eé]dula|cc|c\.c\.?|documento|doc|identificaci[oó]n|nit)\s*[:\-.]?\s*/i, "cc"],
  ];
  for (const l of lineas) {
    const et = etiquetas.find(([rx]) => rx.test(l));
    if (et) { const v = l.replace(et[0], "").trim(); if (!v) continue;
      if (et[1] === "barrio") out.barrio = v; else if (et[1] === "celular" || et[1] === "cc") out[et[1]] = v.replace(/[^\d]/g, ""); else out[et[1]] = v; continue; }
    const dig = l.replace(/[\s.\-()+]/g, "");
    if (/^\d{6,13}$/.test(dig)) {
      const n = dig.replace(/^57(?=3\d{9}$)/, "");
      if (/^3\d{9}$/.test(n) && !out.celular) out.celular = n; else if (!out.cc) out.cc = dig; else if (!out.celular) out.celular = n;
      continue;
    }
    const n = norm(l);
    if (RX_DIR.test(n) || /#|\bno\.?\s*\d|\d+\s*-\s*\d+/.test(l)) { out.direccion = out.direccion ? out.direccion + ", " + l : l; continue; }
    if (CIUDADES.includes(n.replace(/[.,]/g, "")) && !out.ciudad) { out.ciudad = l; continue; }
    libres.push(l);
  }
  // Lo que queda: el nombre suele ser lo más largo; la ciudad, lo corto
  libres.sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length);
  for (const l of libres) {
    const palabras = l.split(/\s+/).length;
    if (!out.cliente && palabras >= 2 && !/\d/.test(l)) out.cliente = l;
    else if (!out.ciudad && palabras <= 3 && !/\d/.test(l)) out.ciudad = l;
    else if (!out.cliente) out.cliente = l;
    else if (/barrio/i.test(l) || !out.barrio) out.barrio = l;
  }
  if (out.barrio && out.direccion && !norm(out.direccion).includes(norm(out.barrio))) out.direccion += ", " + out.barrio;
  else if (out.barrio && !out.direccion) out.direccion = out.barrio;
  delete out.barrio;
  return out;
}
/* Lee la factura que le mandas al cliente: "(1) collar Soy Luna: 35.000", "Abono (50%): 17.500", "Envío: 12.000" */
const plata = s => parseInt(String(s).replace(/[^\d]/g, ""), 10) || 0;
const TIPO_PALABRAS = [["manillas", "Manillas parejas"], ["manilla", "Manilla individual"], ["pulsera", "Pulsera"], ["cadenitas", "Cadenitas parejas"], ["cadenas", "Cadenitas parejas"], ["cadenita", "Cadenita individual"], ["cadena", "Cadenita individual"], ["collares", "Collares pareja"], ["collar", "Collar individual"], ["choker", "Collares pareja"], ["anillos", "Anillos pareja"], ["anillo", "Anillos"]];
function buscarProducto(texto) {
  const n = norm(texto).replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
  const tipoTxt = (TIPO_PALABRAS.find(([w]) => new RegExp("\\b" + w + "\\b").test(n)) || [])[1];
  const trio = /\btrio|tres\b/.test(n), pareja = /\bpareja|parejas|duo\b/.test(n);
  let mejor = null, puntos = 0;
  for (const p of activos()) {
    const nom = norm(p.nombre).replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
    if (!nom || !(" " + n + " ").includes(" " + nom + " ")) continue;
    let s = nom.length * 2;
    if (tipoTxt && p.tipo === tipoTxt) s += 30;
    else if (tipoTxt && p.tipo.split(" ")[0].toLowerCase().startsWith(tipoTxt.split(" ")[0].toLowerCase().slice(0, 6))) s += 15;
    if (trio && /trios/.test(p.tipo)) s += 20;
    if (pareja && /parejas|pareja/.test(p.tipo)) s += 10;
    if (s > puntos) { puntos = s; mejor = p; }
  }
  return mejor;
}
function leerFactura(texto) {
  const res = { lineas: [], abono: 0, envio: 0, pagado: false };
  String(texto || "").split("\n").map(l => l.replace(/^[\s•\-–*·>✨💗💖❤️🩷]+/u, "").trim()).filter(Boolean).forEach(l => {
    const n = norm(l);
    if (/^total|saldo/.test(n.replace(/[^a-z ]/g, "").trim())) return;
    if (/abono/.test(n)) { res.abono = plata(l.split(":").pop()); return; }
    if (/env[ií]o|domicilio|flete/.test(n) && /\d/.test(l)) { res.envio = plata(l.split(":").pop()); return; }
    if (/pag[oó] (completo|total)|ya pag/.test(n)) { res.pagado = true; return; }
    let m = l.match(/^\(?\s*(\d+)\s*\)?\s*(?:x|×|und\.?|unid\.?|uds?\.?)?\s+(.+?)\s*[:=\-–]\s*\$?\s*([\d.,]+)\s*$/i)
      || l.match(/^(.+?)\s*(?:x|×)\s*(\d+)\s*[:=\-–]\s*\$?\s*([\d.,]+)\s*$/i);
    if (!m) return;
    let cant, nombre, total;
    if (/^\(?\s*\d/.test(l)) { cant = +m[1]; nombre = m[2]; total = plata(m[3]); } else { nombre = m[1]; cant = +m[2]; total = plata(m[3]); }
    if (!cant || !total || !nombre) return;
    res.lineas.push({ texto: nombre.trim(), cantidad: cant, total });
  });
  return res;
}
function aplicarOrganizado() {
  const r = organizar(draft.pegado), f = leerFactura(draft.pegado);
  // una factura trae productos y valores; los datos de envío llegan en otro mensaje
  const campos = f.lineas.length ? [] : ["cliente", "ciudad", "direccion", "celular", "cc"].filter(k => r[k]);
  campos.forEach(k => draft[k] = r[k]);
  const sinMatch = [];
  f.lineas.forEach(x => {
    const p = buscarProducto(x.texto), precio = Math.round(x.total / x.cantidad);
    if (p) {
      const ex = draft.lineas.find(l => l.codigo === p.codigo);
      if (ex) { ex.cantidad = x.cantidad; ex.precio = precio; }
      else draft.lineas.push({ codigo: p.codigo, nombre: p.nombre, tipo: p.tipo, cantidad: x.cantidad, precio, costo: costoProd(p) });
      if (precio === p.mayor && p.mayor !== p.menor) draft.precioTipo = "mayor";
    } else { sinMatch.push(x.texto); draft.lineas.push({ codigo: null, nombre: x.texto, tipo: "No está en el catálogo", cantidad: x.cantidad, precio, costo: 0 }); }
  });
  if (f.envio) { draft.envio = f.envio; draft.envioPaga = "cliente"; }
  if (f.abono) { draft.pago = "abono"; draft.abono = f.abono; } else if (f.pagado) draft.pago = "pagado";
  if (!campos.length && !f.lineas.length) { toast("No encontré datos en ese mensaje"); return; }
  draft.pegado = ""; drawOrderForm();
  toast(sinMatch.length ? "Revisa: no encontré “" + sinMatch.join("”, “") + "” en el catálogo" : f.lineas.length ? "Listo: " + f.lineas.length + " producto" + (f.lineas.length > 1 ? "s" : "") + " agregado" + (f.lineas.length > 1 ? "s" : "") + ". Revisa antes de guardar" : "Listo. Revisa que cada dato quedó en su lugar");
}
let draftPegadoUsado = false;

function saveOrder() {
  const d = draft, err = $id("formErr"), miss = [];
  if (!d.cliente.trim()) miss.push("el nombre del cliente");
  if (!d.lineas.length) miss.push("al menos un producto");
  if (miss.length) { err.hidden = false; err.textContent = "Falta " + miss.join(" y ") + "."; return; }
  d.lineas.forEach(l => { const p = S.productos.find(x => x.codigo === l.codigo); if (p) { p.stock -= l.cantidad; guardar("productos", p); } });
  const ped = { ...d, id: "p" + Date.now(), n: nextN(), envio: +d.envio || 0, pagado: d.pago === "pagado", abono: d.pago === "abono" ? (+d.abono || 0) : 0 }; delete ped.q; delete ped.pegado;
  S.pedidos.push(ped); guardar("pedidos", ped); closeSheet(); ui.pedFiltro = "activos"; go("pedidos"); toast("Pedido #" + ped.n + " guardado · stock descontado");
}
function verPedido(id) {
  const p = S.pedidos.find(x => x.id === id); if (!p) return;
  const prev = p.estado === "perdido" ? null : ESTADOS[ESTADOS.indexOf(p.estado) - 1];
  openSheet("Pedido #" + p.n, `${orderCard(p, { track: true })}
    <div class="card" style="display:grid;gap:6px;font-size:14px">
      <div><span class="muted small">Celular</span><br>${esc(p.celular) || "—"}</div>
      <div><span class="muted small">Cédula</span><br>${esc(p.cc) || "—"}</div>
      <div><span class="muted small">Dirección</span><br>${esc(p.direccion) || "—"}</div>
      <div><span class="muted small">Precio</span><br>${p.precioTipo === "mayor" ? "Por mayor" : "Detal"}</div></div>
    <div class="field"><span class="lbl">Pago</span><div class="seg" style="grid-template-columns:repeat(3,1fr)">
      ${["pagado", "abono", "pendiente"].map(k => `<button type="button" data-action="set-pago" data-id="${p.id}" data-v="${k}" aria-pressed="${pagoDe(p) === k}">${{ pagado: "Pagó todo", abono: "Abonó", pendiente: "No ha pagado" }[k]}</button>`).join("")}</div></div>
    ${pagoDe(p) === "abono" ? `<div class="field"><label for="d_abono">Valor del abono</label><input id="d_abono" inputmode="numeric" data-abono="${p.id}" value="${p.abono || ""}"></div>` : ""}
    ${p.estado === "enviado" ? `<button class="btn block ghost" type="button" data-action="perdido" data-id="${p.id}" style="color:var(--loss)">Marcar envío perdido</button>` : ""}
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
    "Envío": p.envio, "Paga envío": p.envioPaga === "yo" ? "Blu" : "Cliente", "Pago": PAGO_LABEL[pagoDe(p)], "Abono": p.abono || 0, "Saldo": saldo(p), "Precio": p.precioTipo === "mayor" ? "Por mayor" : "Detal" });
  const rows = arr => arr.slice().sort((a, b) => a.n - b.n).flatMap(p => p.lineas.map(l => fila(p, l)));
  const wb = XLSX.utils.book_new();
  const add = (name, data) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{}]), name);
  add("Pedidos", rows(S.pedidos.filter(p => p.estado !== "entregado")));
  add("Invertido", S.inversiones.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)).map(i => ({ "Fecha": i.fecha, "Qué compré": i.descripcion, "Categoría": i.categoria, "Dónde": i.lugar, "Valor": i.valor, "Detalle": i.detalle })));
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
    case "pago": draft.pago = v; if (v === "abono" && !draft.abono) draft.abono = Math.round(pedTotal(draft) / 2); drawOrderForm(); break;
    case "add-line": { const p = prodC(); const ex = draft.lineas.find(l => l.codigo === p.codigo);
      if (ex) ex.cantidad++; else draft.lineas.push({ codigo: p.codigo, nombre: p.nombre, tipo: p.tipo, cantidad: 1, precio: priceFor(p, draft.precioTipo), costo: costoProd(p) });
      draft.q = ""; drawOrderForm(); break; }
    case "del-line": draft.lineas.splice(+t.dataset.i, 1); drawOrderForm(); break;
    case "qty": { const l = draft.lineas[+t.dataset.i]; l.cantidad = Math.max(1, l.cantidad + (+t.dataset.d)); drawOrderForm(); break; }
    case "save-order": saveOrder(); break;
    case "organizar": aplicarOrganizado(); break;
    case "pegar": navigator.clipboard.readText().then(txt => { if (!txt) { toast("No hay nada copiado"); return; } draft.pegado = txt; aplicarOrganizado(); })
      .catch(() => toast("No se pudo pegar. Mantén presionado el cuadro y toca Pegar")); break;
    case "avanzar": { const p = S.pedidos.find(x => x.id === t.dataset.id); p.estado = p.estado === "perdido" ? "enviado" : ESTADOS[ESTADOS.indexOf(p.estado) + 1]; guardar("pedidos", p); render();
      toast(p.estado === "entregado" ? "Pedido #" + p.n + " entregado · pasó a Ventas" : "Pedido #" + p.n + ": " + EST_LABEL[p.estado].toLowerCase()); break; }
    case "ver": verPedido(t.dataset.id); break;
    case "set-pago": { const p = S.pedidos.find(x => x.id === t.dataset.id); p.pago = v; p.pagado = v === "pagado"; if (v === "abono" && !p.abono) p.abono = Math.round(pedTotal(p) / 2); if (v !== "abono") p.abono = 0; guardar("pedidos", p); render(); verPedido(p.id); break; }
    case "perdido": { const p = S.pedidos.find(x => x.id === t.dataset.id); p.estado = "perdido"; guardar("pedidos", p); closeSheet(); render(); toast("Pedido #" + p.n + " marcado como envío perdido"); break; }
    case "v-seg": ui.ventasSeg = v; render(); break;
    case "v-est": ui.ventasEst = v; render(); break;
    case "new-inv": editInv(null); break;
    case "edit-inv": editInv(t.dataset.id); break;
    case "save-inv": { const i = editingInv; if (!i.descripcion.trim() || !i.valor) { toast("Escribe qué compraste y el valor"); return; }
      const k = S.inversiones.findIndex(x => x.id === i.id); if (k >= 0) S.inversiones[k] = i; else S.inversiones.push(i);
      guardar("inversiones", i); closeSheet(); ui.ventasSeg = "invertido"; if (tab !== "ventas") go("ventas"); else render(); toast("Compra guardada"); break; }
    case "del-inv-ask": $id("delIBox").innerHTML = `<div class="warn">¿Eliminar esta compra?</div><div class="row" style="margin-top:8px"><button class="btn danger grow" type="button" data-action="del-inv-yes">Sí, eliminar</button><button class="btn ghost grow" type="button" data-action="close">No</button></div>`; break;
    case "del-inv-yes": { const id = editingInv.id; S.inversiones = S.inversiones.filter(x => x.id !== id); borrar("inversiones", id); closeSheet(); render(); toast("Compra eliminada"); break; }
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
    case "logout": sb.auth.signOut().then(() => { S = { productos: [], materia: [], pedidos: [], contenido: [], inversiones: [] }; uid = null; iniciar(null); }); break;
  }
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".tappable,.ccard")) { e.preventDefault(); e.target.click(); }
  if (e.key === "Escape" && sheetRoot.innerHTML) closeSheet();
});
document.addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.input) { ui[t.dataset.input] = t.value; render(); const el = $id(t.id); el.focus(); el.setSelectionRange(el.value.length, el.value.length); return; }
  if (t.dataset.f && draft) { const k = t.dataset.f; draft[k] = (k === "envio" || k === "abono") ? num(t.value) : t.value; if (k === "q" || k === "envio" || k === "abono") drawOrderForm(t.id); return; }
  if (t.dataset.lp && draft) { draft.lineas[+t.dataset.lp].precio = num(t.value); drawOrderForm(t.id); return; }
  if (t.dataset.pp && editing) { const k = t.dataset.pp; editing[k] = (k === "nombre" || k === "tipo") ? t.value : (k === "stock" ? (parseInt(t.value, 10) || 0) : num(t.value)); drawProdTot(); return; }
  if (t.dataset.mm && editingMat) { const k = t.dataset.mm; editingMat[k] = (k === "cantidad" || k === "precio") ? num(t.value) : t.value; return; }
  if (t.dataset.iv && editingInv) { editingInv[t.dataset.iv] = t.dataset.iv === "valor" ? num(t.value) : t.value; return; }
  if (t.dataset.abono) { const p = S.pedidos.find(x => x.id === t.dataset.abono); if (p) { p.abono = num(t.value); clearTimeout(p._t); p._t = setTimeout(() => { delete p._t; guardar("pedidos", p); render(); }, 600); } return; }
  if (t.dataset.cc && editingC) { editingC[t.dataset.cc] = t.value; if (t.dataset.cc === "inspiracion" || t.dataset.cc === "link") drawCLinks(); }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.change === "mes") { ui.ventasMes = t.value; render(); }
  if (t.dataset.change === "invmes") { ui.invMes = t.value; render(); }
  if (t.dataset.iv && editingInv) editingInv[t.dataset.iv] = t.value;
  if (t.dataset.pp && editing) { editing[t.dataset.pp] = t.value; drawProdTot(); }
  if (t.dataset.cc && editingC) editingC[t.dataset.cc] = t.value;
  if (t.id === "fileImport" && t.files && t.files[0]) importar(t.files[0]);
});

/* ---------- Arranque ---------- */
sb.auth.getSession().then(({ data }) => iniciar(data.session));
sb.auth.onAuthStateChange((ev, session) => { if (ev === "SIGNED_OUT") iniciar(null); });
