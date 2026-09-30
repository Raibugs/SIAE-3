const titulosMaestro = { reserva:"Solicitar apartado de espacio", economico:"Solicitar día económico", justificante:"Justificar un día", "mis-solicitudes":"Mis solicitudes" };
const maestroId = (id) => document.getElementById(id);
let usuarioMaestro = null, vacacionesUAS = [], mesCalendario = new Date(), fechasEconomicasSeleccionadas = new Set();

function mostrarVistaMaestro(vista) {
    document.querySelectorAll(".vista-maestro").forEach((s) => s.classList.toggle("activa", s.id === `maestro-${vista}`));
    document.querySelectorAll("[data-maestro-vista]").forEach((b) => b.classList.toggle("activo", b.dataset.maestroVista === vista));
    maestroId("tituloMaestroVista").textContent = titulosMaestro[vista] || titulosMaestro.reserva;
    document.body.classList.remove("menu-abierto");
    if (vista === "mis-solicitudes") cargarMisSolicitudes();
    if (vista === "economico") dibujarCalendario();
}
document.querySelectorAll("[data-maestro-vista]").forEach((b) => b.addEventListener("click", () => mostrarVistaMaestro(b.dataset.maestroVista)));
maestroId("botonMenuMaestro").addEventListener("click", () => document.body.classList.toggle("menu-abierto"));
maestroId("fondoLateralMaestro").addEventListener("click", () => document.body.classList.remove("menu-abierto"));

async function cargarPerfilMaestro() {
    const r = await fetch("/api/usuario"), d = await r.json();
    if (!d.success) return location.href = "/login.html";
    usuarioMaestro = d.usuario;
    const nombre = `${d.usuario.nombre} ${d.usuario.apellidos}`;
    maestroId("nombreSesion").textContent = nombre; maestroId("cuentaSesion").textContent = `N.º ${d.usuario.cuenta}`; maestroId("avatarMaestro").textContent = d.usuario.nombre.slice(0,1).toUpperCase(); maestroId("solicitadoPor").value = nombre;
}
function mensajeMaestro(texto, bien = true) { const el=maestroId("mensajeMaestro");el.textContent=texto;el.className=`toast-panel ${bien?"exito":"error"}`;el.hidden=false;clearTimeout(mensajeMaestro.timer);mensajeMaestro.timer=setTimeout(()=>el.hidden=true,6000); }

maestroId("espacioReserva").addEventListener("change",(e)=>maestroId("especificacionesAuditorio").hidden=e.target.value!=="Auditorio");
maestroId("formReserva").addEventListener("submit",async(e)=>{
    e.preventDefault();
    const aula=maestroId("espacioReserva").value;
    const actividad=[...document.querySelectorAll("[name=actividadAuditorio]:checked")].map((x)=>x.value);
    const detalle={ solicitado_por:usuarioMaestro?`${usuarioMaestro.nombre} ${usuarioMaestro.apellidos}`:"", especificaciones:actividad, observaciones:maestroId("observacionesReserva").value.trim() };
    const r=await fetch("/api/solicitudes/reserva",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({aula,fecha:maestroId("fechaReserva").value,hora_inicio:maestroId("horaInicioReserva").value,hora_fin:maestroId("horaFinReserva").value,actividad,detalle})}),d=await r.json();
    mensajeMaestro(d.message,d.success);if(d.success){e.target.reset();maestroId("especificacionesAuditorio").hidden=true;document.querySelectorAll("[name=actividadAuditorio]").forEach((x)=>x.checked=false);}
});

function fechaAISO(y,m,d){return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;}
function fechaAUTC(fecha){const [y,m,d]=fecha.split("-").map(Number);return Date.UTC(y,m-1,d);}
function formatoDia(fecha){const [y,m,d]=fecha.split("-").map(Number);return new Intl.DateTimeFormat("es-MX",{day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(y,m-1,d)));}
function hoyISO(){const d=new Date();return fechaAISO(d.getFullYear(),d.getMonth(),d.getDate());}
function restriccionEconomico(fecha){
    const day=new Date(`${fecha}T12:00:00Z`).getUTCDay();
    if(![2,3,4].includes(day)) return {bloqueado:true,razon:"Solo martes, miércoles y jueves"};
    if(fecha<hoyISO()) return {bloqueado:true,razon:"La fecha ya pasó"};
    const target=fechaAUTC(fecha);
    for(const v of vacacionesUAS){const start=fechaAUTC(v.fecha_inicio),end=fechaAUTC(v.fecha_fin);if(target>=start-15*86400000&&target<=end+15*86400000)return {bloqueado:true,razon:`Periodo no disponible por ${v.nombre}`};}
    return {bloqueado:false,razon:"Fecha disponible"};
}
async function cargarCalendarioUAS(){const r=await fetch("/api/calendario/vacaciones"),d=await r.json();vacacionesUAS=d.vacaciones||[];}
function actualizarResumenEconomico(){
    const fechas=[...fechasEconomicasSeleccionadas].sort();
    maestroId("fechaEconomicaElegida").textContent=fechas.length?`${fechas.length} de 5 días seleccionados: ${fechas.map(formatoDia).join(" · ")}`:"Selecciona de 1 a 5 martes, miércoles o jueves.";
    const boton=maestroId("enviarDiaEconomico");boton.disabled=!fechas.length;boton.textContent=fechas.length?`Enviar solicitud (${fechas.length} día${fechas.length===1?"":"s"})`:"Enviar solicitud";
}
function dibujarCalendario(){
    const y=mesCalendario.getFullYear(),m=mesCalendario.getMonth();maestroId("tituloMes").textContent=new Intl.DateTimeFormat("es-MX",{month:"long",year:"numeric"}).format(mesCalendario);
    const root=maestroId("calendarioDias");root.replaceChildren();["L","M","M","J","V","S","D"].forEach((label)=>root.append(maestroId("tituloMes")&&Object.assign(document.createElement("span"),{className:"cabecera-dia",textContent:label})));
    const first=new Date(Date.UTC(y,m,1)).getUTCDay(), offset=(first+6)%7, last=new Date(Date.UTC(y,m+1,0)).getUTCDate();
    for(let i=0;i<offset;i++){const blank=document.createElement("span");blank.className="dia-calendario vacio";root.append(blank);}
    for(let day=1;day<=last;day++){
        const date=fechaAISO(y,m,day), status=restriccionEconomico(date), btn=document.createElement("button");btn.type="button";btn.className=`dia-calendario${status.bloqueado?" bloqueado":" disponible"}${fechasEconomicasSeleccionadas.has(date)?" elegido":""}`;btn.textContent=day;btn.disabled=status.bloqueado;btn.title=status.razon;
        const holiday=vacacionesUAS.some((v)=>date>=v.fecha_inicio&&date<=v.fecha_fin);
        if(holiday){btn.classList.add("dia-vacacional");btn.title=vacacionesUAS.find((v)=>date>=v.fecha_inicio&&date<=v.fecha_fin)?.nombre||"Vacaciones UAS";}
        btn.setAttribute("aria-pressed",String(fechasEconomicasSeleccionadas.has(date)));
        btn.addEventListener("click",()=>{if(fechasEconomicasSeleccionadas.has(date))fechasEconomicasSeleccionadas.delete(date);else if(fechasEconomicasSeleccionadas.size>=5){mensajeMaestro("Puedes seleccionar hasta cinco días por solicitud.",false);return;}else fechasEconomicasSeleccionadas.add(date);actualizarResumenEconomico();dibujarCalendario();});root.append(btn);
    }
}
maestroId("mesAnterior").addEventListener("click",()=>{mesCalendario=new Date(mesCalendario.getFullYear(),mesCalendario.getMonth()-1,1);dibujarCalendario();});
maestroId("mesSiguiente").addEventListener("click",()=>{mesCalendario=new Date(mesCalendario.getFullYear(),mesCalendario.getMonth()+1,1);dibujarCalendario();});
maestroId("enviarDiaEconomico").addEventListener("click",async()=>{const fechas=[...fechasEconomicasSeleccionadas].sort();if(!fechas.length)return;const r=await fetch("/api/solicitudes/dia-economico",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({fechas})}),d=await r.json();mensajeMaestro(d.message,d.success);if(d.success){fechasEconomicasSeleccionadas.clear();actualizarResumenEconomico();dibujarCalendario();}});

maestroId("formJustificante").addEventListener("submit",async(e)=>{e.preventDefault();const r=await fetch("/api/solicitudes/justificante",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fecha:maestroId("fechaJustificante").value,motivo:maestroId("motivoJustificante").value,detalle:maestroId("detalleJustificante").value.trim()})}),d=await r.json();mensajeMaestro(d.message,d.success);if(d.success)e.target.reset();});

function fechaLegible(fecha){if(!/^\d{4}-\d\d-\d\d$/.test(fecha||""))return fecha||"—";return new Intl.DateTimeFormat("es-MX",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(`${fecha}T12:00:00Z`));}
async function cargarMisSolicitudes(){const r=await fetch("/api/maestro/solicitudes",{cache:"no-store"}),d=await r.json(),root=maestroId("misSolicitudes");root.replaceChildren();if(!d.success||!d.solicitudes?.length){const empty=document.createElement("div");empty.className="estado-vacio";empty.textContent="Aún no has enviado solicitudes.";root.append(empty);return;}
    d.solicitudes.forEach((s)=>{const card=document.createElement("article");card.className="tarjeta-solicitud";const row=document.createElement("div");row.className="solicitud-top";const left=document.createElement("div");const labels={reserva:"Reserva de espacio",dia_economico:"Día económico",justificante:"Justificante"};const title=s.tipo_solicitud==="reserva"?`${s.aula} · ${s.actividad||"Solicitud"}`:s.tipo_solicitud==="justificante"?s.motivo:s.fechas?.length>1?`Días económicos (${s.fechas.length})`:"Día económico";left.append(Object.assign(document.createElement("span"),{className:"eyebrow",textContent:labels[s.tipo_solicitud]}),Object.assign(document.createElement("h3"),{textContent:title}));const status=document.createElement("span");status.className=`estado-solicitud estado-${s.estado}`;status.textContent=(s.estado||"pendiente").replace(/^./,(c)=>c.toUpperCase());row.append(left,status);card.append(row);const fechas=s.tipo_solicitud==="dia_economico"?(s.fechas||[s.fecha]).map(fechaLegible).join(" · "):fechaLegible(s.fecha);const meta=document.createElement("p");meta.className="solicitud-quien";meta.textContent=`${fechas}${s.hora_inicio?` · ${s.hora_inicio.slice(0,5)}–${s.hora_fin.slice(0,5)}`:""}`;card.append(meta);if(s.respuesta_admin){const ans=document.createElement("p");ans.className="respuesta-solicitud";ans.textContent=`Respuesta de administración: ${s.respuesta_admin}`;card.append(ans);}root.append(card);});
}
async function cerrarSesionMaestro(){await fetch("/api/logout",{method:"POST"});location.href="/";}

(async()=>{await cargarPerfilMaestro();await cargarCalendarioUAS();dibujarCalendario();})();
