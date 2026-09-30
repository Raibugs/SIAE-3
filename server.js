const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");
const db = require("./database");

const app = express();
const PORT = Number(process.env.PORT || 4200);
const PUBLIC = path.join(__dirname, "public");
const SALAS = ["Auditorio", "Sala de Juntas"];
const ACTIVIDADES_AUDITORIO = ["Limpieza", "Micrófono", "Proyector", "HDMI", "Coffee break", "Clase"];
const MOTIVOS_JUSTIFICANTE = ["Operación médica", "Fallecimiento", "Enfermedad", "Problema familiar"];
const ZONA = "America/Mazatlan";

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"), resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: "lax" } }));
app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store, no-cache, must-revalidate, private"); res.set("Pragma", "no-cache"); next(); });
app.use("/css", express.static(path.join(__dirname, "css"), { fallthrough: false }));
app.use("/js", express.static(path.join(PUBLIC, "js"), { fallthrough: false }));
app.use("/img", express.static(path.join(PUBLIC, "img"), { fallthrough: false }));

const perfil = (u) => ({ id: u.id, cuenta: u.cuenta, nombre: u.nombre, apellidos: u.apellidos, tipo: u.tipo, cargo: u.cargo || "" });
function requiereSesion(req, res, next) {
    if (!req.session.usuario) return res.status(401).json({ success: false, message: "Inicia sesión para continuar." });
    next();
}
function requiereRoles(...roles) {
    return (req, res, next) => {
        if (!req.session.usuario) return res.status(401).json({ success: false, message: "Inicia sesión para continuar." });
        if (req.session.usuario.tipo === "administrador" || roles.includes(req.session.usuario.tipo)) return next();
        return res.status(403).json({ success: false, message: "Tu cuenta no tiene acceso a esta sección." });
    };
}
function fechaValida(fecha) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return false;
    const d = new Date(`${fecha}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}
function diaFecha(fecha) { return new Date(`${fecha}T12:00:00Z`).getUTCDay(); }
function hoyLocal() { return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function minutosEntre(a, b) { return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000); }
function crearClaveTemporal() {
    const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#";
    const aleatorios = crypto.randomBytes(16);
    return Array.from(aleatorios.subarray(0, 12), (b) => alfabeto[b % alfabeto.length]).join("");
}
function pagina(archivo, rol) {
    app.get(`/${archivo}`, (req, res) => {
        if (!req.session.usuario) return res.redirect(`/login.html?destino=${encodeURIComponent(archivo)}`);
        if (rol && req.session.usuario.tipo !== rol && req.session.usuario.tipo !== "administrador") return res.redirect(req.session.usuario.tipo === "profesor" ? "/portal.html" : "/login.html");
        res.sendFile(path.join(PUBLIC, archivo));
    });
}

app.get("/", (_req, res) => res.sendFile(path.join(PUBLIC, "index.html")));
app.get("/login.html", (_req, res) => res.sendFile(path.join(PUBLIC, "login.html")));
app.get("/registro.html", (_req, res) => res.sendFile(path.join(PUBLIC, "registro.html")));
pagina("admin.html", "administrador");
pagina("portal.html", "profesor");

app.post("/api/login", (req, res) => {
    const { cuenta, nip, tipo } = req.body || {};
    if (!["administrador", "profesor"].includes(tipo)) return res.status(400).json({ success: false, message: "Selecciona administrador o maestro." });
    db.get("SELECT * FROM usuarios WHERE cuenta=? AND tipo=?", [(cuenta || "").trim(), tipo], async (err, usuario) => {
        if (err || !usuario || !await bcrypt.compare(nip || "", usuario.password || "")) return res.status(401).json({ success: false, message: "Número de trabajador o contraseña incorrectos." });
        req.session.usuario = perfil(usuario);
        res.json({ success: true, usuario: req.session.usuario });
    });
});
app.post("/api/registro/maestro", (req, res) => {
    const { cuenta, nombre, apellidos, nip } = req.body || {};
    const numero = String(cuenta || "").trim();
    const nombres = String(nombre || "").trim();
    const apes = String(apellidos || "").trim();
    const clave = String(nip || "");
    if (!/^[-\w]{3,30}$/.test(numero) || !nombres || nombres.length > 80 || !apes || apes.length > 100 || clave.length < 8 || clave.length > 128) {
        return res.status(400).json({ success: false, message: "Captura un número de trabajador válido, nombre, apellidos y una contraseña de al menos 8 caracteres." });
    }
    db.run("INSERT INTO usuarios (cuenta,nombre,apellidos,password,tipo,cargo) VALUES (?,?,?,?,'profesor','Docente')", [numero, nombres, apes, bcrypt.hashSync(clave, 10)], function (err) {
        if (err) {
            const duplicado = String(err.message || "").includes("UNIQUE");
            return res.status(duplicado ? 409 : 500).json({ success: false, message: duplicado ? "Ese número de trabajador ya tiene una cuenta." : "No se pudo crear la cuenta. Inténtalo de nuevo." });
        }
        res.status(201).json({ success: true, message: "Cuenta de maestro creada. Ya puedes iniciar sesión." });
    });
});
app.get("/api/usuario", (req, res) => res.json(req.session.usuario ? { success: true, usuario: req.session.usuario } : { success: false }));
app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ success: true })));

app.get("/api/calendario/vacaciones", requiereRoles("profesor"), (_req, res) => {
    db.all("SELECT id,ciclo,nombre,fecha_inicio,fecha_fin FROM vacaciones_academicas ORDER BY fecha_inicio", [], (err, vacaciones) => res.json({ success: !err, vacaciones: vacaciones || [] }));
});

function agruparDiasEconomicos(rows) {
    const grupos = new Map();
    (rows || []).forEach((row) => {
        const key = row.grupo_id || `legado-${row.id}`;
        if (!grupos.has(key)) grupos.set(key, { ...row, id: row.grupo_id || row.id, fechas: [], titulo: "Día económico" });
        const grupo = grupos.get(key);
        if (!grupo.fechas.includes(row.fecha)) grupo.fechas.push(row.fecha);
    });
    return [...grupos.values()].map((g) => {
        g.fechas.sort(); g.fecha = g.fechas[0]; g.titulo = g.fechas.length > 1 ? `Días económicos (${g.fechas.length})` : "Día económico"; return g;
    });
}

app.get("/api/maestro/solicitudes", requiereRoles("profesor"), (req, res) => {
    const id = req.session.usuario.id, cuenta = req.session.usuario.cuenta;
    db.all("SELECT id,aula,fecha,hora_inicio,hora_fin,estado,respuesta_admin,actividad,detalles_json,creado_en,'reserva' AS tipo_solicitud FROM reservas WHERE solicitante_cuenta=? ORDER BY creado_en DESC,id DESC", [cuenta], (e1, reservas) => {
        db.all("SELECT id,grupo_id,fecha,estado,respuesta_admin,creado_en,'dia_economico' AS tipo_solicitud FROM dias_economicos WHERE profesor_id=? ORDER BY creado_en DESC,id DESC", [id], (e2, dias) => {
            db.all("SELECT id,fecha,motivo,estado,respuesta_admin,creado_en,'justificante' AS tipo_solicitud FROM justificantes WHERE profesor_id=? ORDER BY creado_en DESC,id DESC", [id], (e3, justificaciones) => {
                res.json({ success: !e1 && !e2 && !e3, solicitudes: [...(reservas || []), ...agruparDiasEconomicos(dias), ...(justificaciones || [])].sort((a,b) => String(b.creado_en).localeCompare(String(a.creado_en))) });
            });
        });
    });
});

app.post("/api/solicitudes/reserva", requiereRoles("profesor"), (req, res) => {
    const { aula, fecha, hora_inicio, hora_fin, actividad, detalle } = req.body || {};
    const actividades = Array.isArray(actividad) ? actividad.filter((a) => ACTIVIDADES_AUDITORIO.includes(a)) : [];
    if (!SALAS.includes(aula)) return res.status(400).json({ success: false, message: "Selecciona Auditorio o Sala de Juntas." });
    if (!fechaValida(fecha) || fecha < hoyLocal() || diaFecha(fecha) === 0 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora_inicio || "") || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora_fin || "") || hora_inicio >= hora_fin || hora_inicio < "07:00" || hora_fin > "19:00") return res.status(400).json({ success: false, message: "Elige una fecha futura (lunes a sábado) y un horario válido entre 07:00 y 19:00." });
    if (aula === "Auditorio" && !actividades.length) return res.status(400).json({ success: false, message: "Selecciona al menos una actividad o servicio para el auditorio." });
    const campos = detalle && typeof detalle === "object" && !Array.isArray(detalle) ? detalle : {};
    const detailsJson = JSON.stringify({ ...campos, actividades: aula === "Auditorio" ? actividades : [] });
    if (detailsJson.length > 12000) return res.status(400).json({ success: false, message: "La descripción es demasiado extensa." });
    db.all("SELECT id,hora_inicio,hora_fin FROM reservas WHERE aula=? AND fecha=? AND estado!='rechazada'", [aula, fecha], (err, reservas) => {
        if (err) return res.status(500).json({ success: false, message: "No se pudo comprobar la disponibilidad." });
        if (reservas.some((r) => hora_inicio < r.hora_fin && hora_fin > r.hora_inicio)) return res.status(409).json({ success: false, message: "Ya existe una solicitud para ese espacio y horario. Elige otro horario." });
        const u = req.session.usuario;
        const titulo = String(campos.nombre_actividad || (aula === "Auditorio" ? actividades.join(", ") : "Reunión en sala de juntas")).trim().slice(0, 150);
        db.run("INSERT INTO reservas (aula,profesor,materia,fecha,hora_inicio,hora_fin,estado,solicitante_cuenta,solicitante_tipo,actividad,detalles_json) VALUES (?,?,?,?,?,?,'pendiente',?,?,?,?)", [aula, `${u.nombre} ${u.apellidos}`, titulo, fecha, hora_inicio, hora_fin, u.cuenta, u.tipo, actividades.join(", "), detailsJson], function (insertErr) {
            if (insertErr) return res.status(500).json({ success: false, message: "No se pudo guardar la solicitud." });
            res.status(201).json({ success: true, id: this.lastID, message: "La solicitud de reserva se envió al administrador." });
        });
    });
});

app.post("/api/solicitudes/dia-economico", requiereRoles("profesor"), (req, res) => {
    const payload = req.body || {};
    const fechas = [...new Set((Array.isArray(payload.fechas) ? payload.fechas : payload.fecha ? [payload.fecha] : []).map((f) => String(f || "")))].sort();
    if (!fechas.length || fechas.length > 5) return res.status(400).json({ success: false, message: "Selecciona de 1 a 5 fechas para una sola solicitud." });
    const inválida = fechas.find((fecha) => !fechaValida(fecha) || fecha < hoyLocal() || ![2,3,4].includes(diaFecha(fecha)));
    if (inválida) return res.status(400).json({ success: false, message: "Todos los días deben ser futuros y caer de martes a jueves." });
    db.all("SELECT fecha_inicio,fecha_fin,nombre FROM vacaciones_academicas", [], (err, vacaciones) => {
        if (err) return res.status(500).json({ success: false, message: "No se pudo verificar el calendario UAS." });
        for (const fecha of fechas) {
            const cercana = (vacaciones || []).find((v) => fecha >= v.fecha_inicio && fecha <= v.fecha_fin || minutosEntre(fecha, v.fecha_inicio) >= 0 && minutosEntre(fecha, v.fecha_inicio) <= 15 || minutosEntre(v.fecha_fin, fecha) >= 0 && minutosEntre(v.fecha_fin, fecha) <= 15);
            if (cercana) return res.status(400).json({ success: false, message: `${fecha}: no se puede solicitar dentro de los 15 días previos o posteriores a ${cercana.nombre}.` });
        }
        const id = req.session.usuario.id, placeholders = fechas.map(() => "?").join(",");
        db.all(`SELECT fecha FROM dias_economicos WHERE profesor_id=? AND estado!='rechazada' AND fecha IN (${placeholders})`, [id, ...fechas], (duplicateErr, existentes) => {
            if (duplicateErr) return res.status(500).json({ success: false, message: "No se pudieron validar las fechas seleccionadas." });
            if (existentes.length) return res.status(409).json({ success: false, message: `Ya tienes una solicitud activa para ${existentes.map((x) => x.fecha).join(", ")}.` });
            db.all("SELECT substr(fecha,1,4) AS anio,COUNT(*) AS usados FROM dias_economicos WHERE profesor_id=? AND estado!='rechazada' GROUP BY substr(fecha,1,4)", [id], (countErr, conteos) => {
                if (countErr) return res.status(500).json({ success: false, message: "No se pudo validar el límite anual." });
                const porAnio = new Map((conteos || []).map((r) => [r.anio, r.usados]));
                const rebasado = [...new Set(fechas.map((f) => f.slice(0,4)))].find((anio) => (porAnio.get(anio) || 0) + fechas.filter((f) => f.startsWith(anio)).length > 13);
                if (rebasado) return res.status(400).json({ success: false, message: `La solicitud rebasa el límite anual de 13 días económicos para ${rebasado}.` });
                const grupoId = crypto.randomUUID();
                const values = fechas.map(() => "(?,?,?,'pendiente')").join(",");
                const params = fechas.flatMap((fecha) => [id, fecha, grupoId]);
                db.run(`INSERT INTO dias_economicos (profesor_id,fecha,grupo_id,estado) VALUES ${values}`, params, function (insertErr) {
                    if (insertErr) return res.status(409).json({ success: false, message: "No se pudo guardar el grupo; revisa si alguna fecha ya está solicitada." });
                    res.status(201).json({ success: true, grupoId, fechas, message: `La solicitud de ${fechas.length} día${fechas.length === 1 ? "" : "s"} económico${fechas.length === 1 ? "" : "s"} se envió al administrador.` });
                });
            });
        });
    });
});

app.post("/api/solicitudes/justificante", requiereRoles("profesor"), (req, res) => {
    const { fecha, motivo, detalle = "" } = req.body || {};
    if (!fechaValida(fecha) || ![1,2,3,4,5].includes(diaFecha(fecha)) || !MOTIVOS_JUSTIFICANTE.includes(motivo)) return res.status(400).json({ success: false, message: "Elige una fecha de lunes a viernes y uno de los motivos disponibles." });
    const id = req.session.usuario.id;
    db.get("SELECT id FROM justificantes WHERE profesor_id=? AND fecha=? AND estado!='rechazada'", [id, fecha], (err, existente) => {
        if (err) return res.status(500).json({ success: false, message: "No se pudo validar la solicitud." });
        if (existente) return res.status(409).json({ success: false, message: "Ya tienes un justificante solicitado para esa fecha." });
        db.run("INSERT INTO justificantes (profesor_id,fecha,motivo,estado,respuesta_admin) VALUES (?,?,?,'pendiente',?)", [id, fecha, motivo, String(detalle).trim().slice(0, 2000)], function (insertErr) {
            if (insertErr) return res.status(500).json({ success: false, message: "No se pudo registrar la solicitud." });
            res.status(201).json({ success: true, id: this.lastID, message: "El justificante se envió al administrador." });
        });
    });
});

function juntarSolicitudes(callback) {
    db.all("SELECT id,aula,profesor AS solicitante,solicitante_cuenta AS cuenta,fecha,hora_inicio,hora_fin,estado,respuesta_admin,actividad,detalles_json,creado_en,'reserva' AS tipo_solicitud,materia AS titulo FROM reservas ORDER BY creado_en DESC,id DESC", [], (e1, reservas) => {
        db.all("SELECT d.id,d.grupo_id,u.nombre||' '||u.apellidos AS solicitante,u.cuenta,d.fecha,d.estado,d.respuesta_admin,d.creado_en,'dia_economico' AS tipo_solicitud,'Día económico' AS titulo FROM dias_economicos d LEFT JOIN usuarios u ON u.id=d.profesor_id ORDER BY d.creado_en DESC,d.id DESC", [], (e2, dias) => {
            db.all("SELECT j.id,u.nombre||' '||u.apellidos AS solicitante,u.cuenta,j.fecha,j.motivo,j.estado,j.respuesta_admin,j.creado_en,'justificante' AS tipo_solicitud,'Justificante' AS titulo FROM justificantes j LEFT JOIN usuarios u ON u.id=j.profesor_id ORDER BY j.creado_en DESC,j.id DESC", [], (e3, justificaciones) => {
                callback(e1 || e2 || e3, [...(reservas || []), ...agruparDiasEconomicos(dias), ...(justificaciones || [])].sort((a,b) => String(b.creado_en).localeCompare(String(a.creado_en))));
            });
        });
    });
}
app.get("/api/admin/solicitudes", requiereRoles("administrador"), (_req, res) => juntarSolicitudes((err, solicitudes) => {
    if (err) { console.error("Error consultando solicitudes del administrador:", err.message); return res.status(500).json({ success: false, message: "No se pudieron consultar las solicitudes guardadas." }); }
    res.json({ success: true, solicitudes });
}));
app.get("/api/admin/resumen", requiereRoles("administrador"), (_req, res) => juntarSolicitudes((err, solicitudes) => {
    const lista = solicitudes || [];
    res.json({ success: !err, resumen: { solicitudesPendientes: lista.filter((s) => s.estado === "pendiente").length, reservas: lista.filter((s) => s.tipo_solicitud === "reserva").length, proximasReservas: lista.filter((s) => s.tipo_solicitud === "reserva" && s.estado === "aprobada" && s.fecha >= hoyLocal()).length } });
}));
app.get("/api/admin/reservas", requiereRoles("administrador"), (_req, res) => db.all("SELECT * FROM reservas ORDER BY fecha DESC,hora_inicio", [], (err, reservas) => res.json({ success: !err, reservas: reservas || [] })));
app.patch("/api/admin/solicitudes/:tipo/:id", requiereRoles("administrador"), (req, res) => {
    const { tipo, id } = req.params, { estado, respuesta_admin = "" } = req.body || {};
    const tabla = { reserva: "reservas", dia_economico: "dias_economicos", justificante: "justificantes" }[tipo];
    if (!tabla || !["aprobada", "rechazada"].includes(estado)) return res.status(400).json({ success: false, message: "La decisión indicada no es válida." });
    const guardar = () => db.run(`UPDATE ${tabla} SET estado=?,respuesta_admin=? WHERE id=? AND estado='pendiente'`, [estado, String(respuesta_admin).trim().slice(0, 2000), id], function (err) {
        if (err || !this.changes) return res.status(409).json({ success: false, message: "La solicitud ya fue atendida o no existe." });
        res.json({ success: true, message: estado === "aprobada" ? "Solicitud aprobada." : "Solicitud rechazada." });
    });
    if (tipo === "dia_economico") {
        const condicion = /^\d+$/.test(id) ? "grupo_id IS NULL AND id=?" : "grupo_id=?";
        return db.run(`UPDATE dias_economicos SET estado=?,respuesta_admin=? WHERE ${condicion} AND estado='pendiente'`, [estado,String(respuesta_admin).trim().slice(0,2000),id], function (err) {
            if (err || !this.changes) return res.status(409).json({ success: false, message: "La solicitud ya fue atendida o no existe." });
            res.json({ success: true, message: estado === "aprobada" ? "Solicitud de días económicos aprobada." : "Solicitud de días económicos rechazada." });
        });
    }
    if (tipo !== "reserva" || estado !== "aprobada") return guardar();
    db.get("SELECT * FROM reservas WHERE id=? AND estado='pendiente'", [id], (err, r) => {
        if (err || !r) return res.status(404).json({ success: false, message: "No se encontró la solicitud pendiente." });
        db.get("SELECT id FROM reservas WHERE aula=? AND fecha=? AND estado='aprobada' AND id<>? AND hora_inicio<? AND hora_fin>?", [r.aula,r.fecha,id,r.hora_fin,r.hora_inicio], (checkErr, choque) => {
            if (checkErr) return res.status(500).json({ success: false, message: "No se pudo comprobar el horario." });
            if (choque) return res.status(409).json({ success: false, message: "No se puede aprobar: el espacio ya tiene una reserva confirmada en ese horario." });
            guardar();
        });
    });
});

app.get("/api/admin/maestros", requiereRoles("administrador"), (_req, res) => db.all("SELECT id,cuenta,nombre,apellidos,cargo FROM usuarios WHERE tipo='profesor' ORDER BY apellidos,nombre", [], (err, maestros) => {
    if (err) { console.error("Error consultando cuentas de maestros:", err.message); return res.status(500).json({ success: false, message: "No se pudieron consultar las cuentas registradas." }); }
    res.json({ success: true, maestros });
}));
app.post("/api/admin/maestros", requiereRoles("administrador"), (req, res) => {
    const { cuenta, nombre, apellidos } = req.body || {};
    const clavePersonalizada = String((req.body || {}).clave || "");
    if (!/^[-\w]{3,30}$/.test(cuenta || "") || !String(nombre || "").trim() || !String(apellidos || "").trim()) return res.status(400).json({ success: false, message: "Captura número de trabajador, nombre y apellidos." });
    if (clavePersonalizada && (clavePersonalizada.length < 8 || clavePersonalizada.length > 128)) return res.status(400).json({ success: false, message: "La contraseña personalizada debe tener entre 8 y 128 caracteres." });
    const clave = clavePersonalizada || crearClaveTemporal();
    db.run("INSERT INTO usuarios (cuenta,nombre,apellidos,password,tipo,cargo) VALUES (?,?,?,?,'profesor','Docente')", [cuenta.trim(),String(nombre).trim(),String(apellidos).trim(),bcrypt.hashSync(clave,10)], function (err) {
        if (err) return res.status(409).json({ success: false, message: "Ese número de trabajador ya está registrado." });
        res.status(201).json({ success: true, maestro: { id: this.lastID, cuenta: cuenta.trim(), nombre: String(nombre).trim(), apellidos: String(apellidos).trim() }, clave, message: clavePersonalizada ? "Cuenta creada con la contraseña asignada." : "Cuenta creada. Copia la contraseña aleatoria y entrégala al maestro." });
    });
});
app.post("/api/admin/maestros/:id/restablecer", requiereRoles("administrador"), (req, res) => {
    const clave = crearClaveTemporal();
    db.run("UPDATE usuarios SET password=? WHERE id=? AND tipo='profesor'", [bcrypt.hashSync(clave,10),req.params.id], function (err) {
        if (err || !this.changes) return res.status(404).json({ success: false, message: "No se encontró la cuenta del maestro." });
        res.json({ success: true, clave, message: "Nueva contraseña temporal generada." });
    });
});

app.get("/api/admin/notificaciones", requiereRoles("administrador"), (_req, res) => juntarSolicitudes((err, solicitudes) => res.json({ success: !err, notificaciones: (solicitudes || []).filter((s) => s.estado === "pendiente") })));

app.use((req, res) => req.path.startsWith("/api/") ? res.status(404).json({ success: false, message: "No se encontró esta operación." }) : res.status(404).send("No se encontró esta página."));

db.ready.then(() => app.listen(PORT, "0.0.0.0", () => console.log(`Sistema de Gestión Académica UAS listo en http://localhost:${PORT}`)));
