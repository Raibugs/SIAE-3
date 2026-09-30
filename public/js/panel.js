const titulosVista = { inicio: "Panel de Gestión Académica", solicitudes: "Solicitudes pendientes", reservas: "Consultar reservas", nomina: "Escaneo de nómina", maestros: "Cuentas de maestros" };
let solicitudesPanel = [], soloPendientes = true, filtroLocal = "", idsNotificados = new Set(), primeraConsulta = true, paginasNomina = [];
const porId = (id) => document.getElementById(id);

function cambiarVista(vista) {
    document.querySelectorAll(".vista-admin").forEach((el) => el.classList.toggle("activa", el.id === `vista-${vista}`));
    document.querySelectorAll("[data-vista]").forEach((el) => el.classList.toggle("activo", el.dataset.vista === vista));
    porId("tituloVista").textContent = titulosVista[vista] || titulosVista.inicio;
    porId("miga").textContent = vista === "inicio" ? "Panel de administración" : "Gestión / " + titulosVista[vista];
    document.body.classList.remove("menu-abierto");
    if (vista === "maestros") cargarMaestros();
    if (vista === "reservas" || vista === "solicitudes") cargarSolicitudes();
}
document.querySelectorAll("[data-vista]").forEach((b) => b.addEventListener("click", () => cambiarVista(b.dataset.vista)));
document.querySelectorAll("[data-ir]").forEach((b) => b.addEventListener("click", () => cambiarVista(b.dataset.ir)));
porId("botonCampana").addEventListener("click", () => { soloPendientes = true; actualizarFiltros(); cambiarVista("solicitudes"); });
porId("botonMenu").addEventListener("click", () => document.body.classList.toggle("menu-abierto"));
porId("fondoLateral").addEventListener("click", () => document.body.classList.remove("menu-abierto"));
document.querySelectorAll("[data-filtro]").forEach((b) => b.addEventListener("click", () => { soloPendientes = b.dataset.filtro === "pendiente"; actualizarFiltros(); renderSolicitudes(); }));
porId("filtroTipoSolicitud").addEventListener("change", (e) => { filtroLocal = e.target.value; renderSolicitudes(); });
porId("filtroEstadoReserva").addEventListener("change", renderReservas);
porId("filtroSalaReserva").addEventListener("change", renderReservas);

function actualizarFiltros() { document.querySelectorAll("[data-filtro]").forEach((b) => b.classList.toggle("seleccionado", b.dataset.filtro === (soloPendientes ? "pendiente" : "todas"))); }
function notificar(texto) { const toast = porId("toastPanel"); toast.textContent = texto; toast.hidden = false; clearTimeout(notificar.timer); notificar.timer = setTimeout(() => toast.hidden = true, 6000); }
function fechaBonita(fecha) { if (!/^\d{4}-\d\d-\d\d$/.test(fecha || "")) return fecha || "—"; return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "numeric" }); }
function horaBonita(hora) { return (hora || "").slice(0,5); }
function tipoBonito(tipo) { return ({ reserva: "Reserva de espacio", dia_economico: "Día económico", justificante: "Justificante" })[tipo] || "Solicitud"; }
function leerDetalle(s) { try { return typeof s.detalles_json === "string" ? JSON.parse(s.detalles_json) : (s.detalles_json || {}); } catch { return {}; } }
function text(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; node.textContent = value ?? ""; return node; }

function crearTarjetaSolicitud(s, compacto = false) {
    const card = document.createElement("article"); card.className = "tarjeta-solicitud";
    const top = document.createElement("div"); top.className = "solicitud-top";
    const left = document.createElement("div"); left.append(text("span", "eyebrow", tipoBonito(s.tipo_solicitud)), text("h3", "", s.titulo || s.motivo || s.aula || "Solicitud"));
    const status = text("span", `estado-solicitud estado-${s.estado || "pendiente"}`, (s.estado || "pendiente").replace(/^./, (c) => c.toUpperCase()));
    top.append(left, status); card.append(top);
    const quien = document.createElement("p"); quien.className = "solicitud-quien"; quien.textContent = `${s.solicitante || "Maestro"}${s.cuenta ? ` · ${s.cuenta}` : ""}`; card.append(quien);
    const datos = document.createElement("div"); datos.className = "datos-solicitud";
    const agregar = (label, value) => { if (value === undefined || value === null || value === "") return; const item = document.createElement("div"); item.append(text("span", "", label), text("strong", "", value)); datos.append(item); };
    if (s.tipo_solicitud === "dia_economico") agregar(s.fechas?.length > 1 ? "Fechas solicitadas" : "Fecha", (s.fechas || [s.fecha]).map(fechaBonita).join(" · "));
    else agregar("Fecha", fechaBonita(s.fecha));
    if (s.tipo_solicitud === "reserva") { agregar("Espacio", s.aula); agregar("Horario", `${horaBonita(s.hora_inicio)}–${horaBonita(s.hora_fin)}`); }
    else if (s.tipo_solicitud === "justificante") agregar("Motivo", s.motivo);
    agregar("Recibida", s.creado_en ? new Date(s.creado_en.replace(" ", "T") + (s.creado_en.endsWith("Z") ? "" : "Z")).toLocaleString("es-MX") : "");
    card.append(datos);
    if (s.tipo_solicitud === "reserva") {
        const detalle = leerDetalle(s), box = document.createElement("div"); box.className = "detalle-reserva";
        const filas = [["Solicitado por", detalle.solicitado_por], ["Actividad", detalle.nombre_actividad || s.titulo], ["Observaciones", detalle.observaciones]];
        filas.forEach(([k,v]) => { if (v) { const row = document.createElement("p"); row.append(text("b", "", `${k}: `), document.createTextNode(String(v))); box.append(row); } });
        const actividades = detalle.especificaciones || detalle.actividades || (s.actividad ? s.actividad.split(",") : []);
        if (actividades.length) { const row = document.createElement("p"); row.append(text("b", "", "Especificaciones: "), document.createTextNode(actividades.join(", "))); box.append(row); }
        if (!compacto && detalle) Object.entries(detalle).forEach(([k,v]) => { if (!["solicitado_por","nombre_actividad","observaciones","especificaciones","actividades"].includes(k) && v) { const row=document.createElement("p"); row.append(text("b","",`${k.replaceAll("_"," ")}: `),document.createTextNode(Array.isArray(v)?v.join(", "):String(v))); box.append(row); } });
        if (box.childElementCount) card.append(box);
    } else if (s.tipo_solicitud === "justificante" && s.respuesta_admin && s.estado !== "pendiente") card.append(text("p", "respuesta-solicitud", `Respuesta: ${s.respuesta_admin}`));
    else if (s.tipo_solicitud === "dia_economico" && s.respuesta_admin && s.estado !== "pendiente") card.append(text("p", "respuesta-solicitud", `Respuesta: ${s.respuesta_admin}`));
    if (s.estado === "pendiente" && !compacto) {
        const actions = document.createElement("div"); actions.className = "acciones-solicitud";
        const approve = text("button", "boton azul boton-pequeno", "Aprobar"); approve.type = "button"; approve.addEventListener("click", () => resolverSolicitud(s,"aprobada"));
        const reject = text("button", "boton boton-rechazar boton-pequeno", "Rechazar"); reject.type = "button"; reject.addEventListener("click", () => resolverSolicitud(s,"rechazada"));
        actions.append(approve,reject); card.append(actions);
    }
    return card;
}

async function cargarSesionAdmin() {
    const r = await fetch("/api/usuario"), d = await r.json();
    if (!d.success || d.usuario.tipo !== "administrador") return location.href = "/login.html";
    const hora = new Date().getHours();
    porId("saludoAdmin").textContent = `${hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches"}, ${d.usuario.nombre}`;
}
async function cargarSolicitudes() {
    let r, d;
    try {
        r = await fetch("/api/admin/solicitudes", { cache: "no-store" });
        d = await r.json();
    } catch (error) { console.error("Error de red al cargar solicitudes:", error); notificar(`No hay conexión con el servidor de solicitudes${error?.message ? `: ${error.message}` : "."}`); return; }
    if (!r.ok) { notificar(d.message || "No se pudieron cargar las solicitudes. Actualiza el panel o vuelve a iniciar sesión."); return; }
    if (!d.success) { notificar(d.message || "No se pudieron consultar las solicitudes."); return; }
    try {
        solicitudesPanel = d.solicitudes || []; renderSolicitudes(); renderReservas(); renderResumen(); actualizarNotificaciones();
    } catch (error) { console.error("Error mostrando solicitudes:", error); notificar(`No se pudieron mostrar las solicitudes: ${error?.message || "error de interfaz"}`); }
}
function renderSolicitudes() {
    const list = porId("listaSolicitudes"); if (!list) return; list.replaceChildren();
    const filtradas = solicitudesPanel.filter((s) => (!soloPendientes || s.estado === "pendiente") && (!filtroLocal || s.tipo_solicitud === filtroLocal));
    if (!filtradas.length) { list.append(text("div", "estado-vacio", soloPendientes ? "No hay solicitudes pendientes." : "No hay solicitudes registradas.")); return; }
    filtradas.forEach((s) => list.append(crearTarjetaSolicitud(s)));
}
function renderReservas() {
    const list = porId("listaReservas"); if (!list) return; list.replaceChildren();
    const estado = porId("filtroEstadoReserva").value, sala = porId("filtroSalaReserva").value;
    const filtradas = solicitudesPanel.filter((s) => s.tipo_solicitud === "reserva" && (!estado || s.estado === estado) && (!sala || s.aula === sala));
    if (!filtradas.length) { list.append(text("div", "estado-vacio", "No hay reservas que coincidan con este filtro.")); return; }
    filtradas.forEach((s) => list.append(crearTarjetaSolicitud(s)));
}
function renderResumen() {
    const pending = solicitudesPanel.filter((s) => s.estado === "pendiente"), reservas = solicitudesPanel.filter((s) => s.tipo_solicitud === "reserva"), aprobadas = reservas.filter((s) => s.estado === "aprobada" && s.fecha >= new Date().toISOString().slice(0,10));
    porId("totalPendientes").textContent = pending.length; porId("totalReservas").textContent = reservas.length; porId("proximasReservas").textContent = aprobadas.length;
    const p = porId("inicioPendientes"); p.replaceChildren(); pending.slice(0,4).forEach((s) => { const row = document.createElement("button"); row.className = "fila-resumen"; row.append(text("span", "punto-pendiente", "•"), text("span", "", `${s.solicitante || "Maestro"} · ${tipoBonito(s.tipo_solicitud)}`), text("small", "", fechaBonita(s.fecha))); row.addEventListener("click", () => cambiarVista("solicitudes")); p.append(row); }); if (!pending.length) p.append(text("p", "estado-vacio pequeno", "No tienes solicitudes pendientes."));
    const r = porId("inicioReservas"); r.replaceChildren(); aprobadas.sort((a,b)=>a.fecha.localeCompare(b.fecha)).slice(0,4).forEach((s) => { const row = document.createElement("div"); row.className = "fila-resumen"; row.append(text("span", "icono-reserva", "▦"), text("span", "", `${s.aula} · ${s.solicitante || "Maestro"}`), text("small", "", `${fechaBonita(s.fecha)} ${horaBonita(s.hora_inicio)}`)); r.append(row); }); if (!aprobadas.length) r.append(text("p", "estado-vacio pequeno", "No hay reservas aprobadas próximas."));
}
async function resolverSolicitud(s, estado) {
    let respuesta_admin = "";
    if (s.tipo_solicitud === "dia_economico") {
        respuesta_admin = "Recuerde Pasar a llenar y firmar la solicitud a direccion";
    } else if (s.tipo_solicitud === "reserva") {
        respuesta_admin = window.prompt("Comentario para el maestro (opcional). Si pulsas Cancelar, la decisión se enviará sin comentario:", "") || "";
    } else {
        const comentario = window.prompt(estado === "aprobada" ? "Comentario para el maestro (opcional):" : "Motivo del rechazo (opcional):", "");
        if (comentario === null) return;
        respuesta_admin = comentario;
    }
    const r = await fetch(`/api/admin/solicitudes/${encodeURIComponent(s.tipo_solicitud)}/${s.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({estado,respuesta_admin}) });
    const d = await r.json(); notificar(d.message); if (d.success) await cargarSolicitudes();
}
async function actualizarNotificaciones() {
    const pendientes = solicitudesPanel.filter((s) => s.estado === "pendiente"), ids = new Set(pendientes.map((s) => `${s.tipo_solicitud}:${s.id}`));
    porId("badgeSolicitudes").textContent = pendientes.length; porId("campanaCuenta").textContent = pendientes.length;
    const nuevos = [...ids].filter((id) => !idsNotificados.has(id));
    if (primeraConsulta && pendientes.length) notificar(`Tienes ${pendientes.length} solicitud${pendientes.length === 1 ? " pendiente" : "es pendientes"} por revisar.`);
    else if (!primeraConsulta && nuevos.length) notificar(`Recibiste ${nuevos.length} nueva${nuevos.length === 1 ? " solicitud" : "s solicitudes"}.`);
    ids.forEach((id) => idsNotificados.add(id)); primeraConsulta = false;
}

async function cargarMaestros() {
    const r = await fetch("/api/admin/maestros", { cache: "no-store" }); if (!r.ok) { notificar("No se pudieron cargar las cuentas de maestros."); return; }
    const d = await r.json(), list = porId("listaMaestros"); list.replaceChildren();
    (d.maestros || []).forEach((m) => { const card = document.createElement("div"); card.className = "fila-maestro"; const info = document.createElement("div"); info.append(text("strong","",`${m.nombre} ${m.apellidos}`),text("small","",`N.º ${m.cuenta}`)); const reset = text("button","boton gris boton-pequeno","Nueva contraseña"); reset.addEventListener("click", () => restablecerClave(m.id,`${m.nombre} ${m.apellidos}`)); card.append(info,reset); list.append(card); });
    if (!d.maestros?.length) list.append(text("p","estado-vacio pequeno","Aún no hay cuentas de maestros."));
}
porId("formMaestro").addEventListener("submit", async (e) => {
    e.preventDefault(); porId("resultadoClave").hidden = true;
    const payload = { cuenta:porId("cuentaMaestro").value.trim(), nombre:porId("nombreMaestro").value.trim(), apellidos:porId("apellidosMaestro").value.trim(), clave:porId("claveMaestro").value };
    const r = await fetch("/api/admin/maestros",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}),d=await r.json();
    porId("mensajeMaestro").textContent=d.message; porId("mensajeMaestro").className=`mensaje-formulario ${d.success?"exito":"error"}`;
    if (d.success) { mostrarClave(d.clave, porId("resultadoClave")); e.target.reset(); cargarMaestros(); }
});
porId("recargarMaestros").addEventListener("click",cargarMaestros);
async function restablecerClave(id,nombre) { if (!confirm(`¿Generar una contraseña temporal nueva para ${nombre}?`)) return; const r=await fetch(`/api/admin/maestros/${id}/restablecer`,{method:"POST"}),d=await r.json(); if(!d.success)return notificar(d.message); mostrarClave(d.clave,porId("resultadoClave")); porId("resultadoClave").hidden=false; notificar(d.message); }
function mostrarClave(clave,contenedor) { contenedor.replaceChildren(); contenedor.hidden=false; contenedor.append(text("strong","","Contraseña temporal (se muestra ahora):"),text("code","clave-visible",clave)); const copia=text("button","boton gris boton-pequeno","Copiar contraseña"); copia.type="button"; copia.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(clave);notificar("Contraseña copiada.")}catch{window.prompt("Copia la contraseña:",clave)}});contenedor.append(copia); }

porId("paginasNomina").addEventListener("change", (e) => { const files=[...e.target.files].filter((f)=>f.type.startsWith("image/")); paginasNomina.push(...files.map((file)=>({id:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,file,url:URL.createObjectURL(file)}))); e.target.value=""; renderNomina(); });
function renderNomina() { const root=porId("vistaPaginasNomina"); root.replaceChildren(); paginasNomina.forEach((page,index)=>{const item=document.createElement("article");item.className="pagina-nomina-wrap";const image=document.createElement("img");image.src=page.url;image.alt=`Página de nómina ${index+1}`;image.className="pagina-nomina-imagen";const controls=text("div","controles-pagina","Página "+(index+1));const del=text("button","boton boton-rechazar boton-pequeno no-imprimir","Quitar");del.addEventListener("click",()=>{URL.revokeObjectURL(page.url);paginasNomina.splice(index,1);renderNomina()});controls.append(del);item.append(controls,image);root.append(item)});porId("exportarNomina").disabled=!paginasNomina.length;porId("mensajeNomina").textContent=paginasNomina.length?`${paginasNomina.length} página${paginasNomina.length===1?"":"s"} lista${paginasNomina.length===1?"":"s"} para exportar.`:"En la ventana de impresión elige «Guardar como PDF» para exportar el documento."; }
porId("vaciarNomina").addEventListener("click",()=>{paginasNomina.forEach((p)=>URL.revokeObjectURL(p.url));paginasNomina=[];renderNomina()});
porId("exportarNomina").addEventListener("click",async()=>{await Promise.all([...document.querySelectorAll(".pagina-nomina-imagen")].map((img)=>img.decode().catch(()=>{})));document.body.classList.add("imprimir-nomina");window.print();setTimeout(()=>document.body.classList.remove("imprimir-nomina"),1000)});
window.addEventListener("afterprint",()=>document.body.classList.remove("imprimir-nomina"));
async function cerrarSesion(){await fetch("/api/logout",{method:"POST"});location.href="/";}

cargarSesionAdmin(); cargarSolicitudes(); cargarMaestros(); setInterval(cargarSolicitudes,12000);
