const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");

// Usa siempre la base que vive junto a la aplicación, aunque el servidor se inicie desde otra carpeta.
const db = new sqlite3.Database(path.join(__dirname, "checador.db"));

function addColumns(table, required) {
    return new Promise((resolve) => db.all(`PRAGMA table_info(${table})`, (err, rows) => {
        if (err) return resolve();
        const missing = required.filter(([name]) => !rows.some((row) => row.name === name));
        const next = () => {
            const item = missing.shift();
            if (!item) return resolve();
            db.run(`ALTER TABLE ${table} ADD COLUMN ${item[0]} ${item[1]}`, (error) => {
                if (error) console.error(`Migración ${table}.${item[0]}: ${error.message}`);
                next();
            });
        };
        next();
    }));
}

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cuenta TEXT UNIQUE NOT NULL,
        nombre TEXT NOT NULL,
        apellidos TEXT NOT NULL,
        password TEXT,
        tipo TEXT NOT NULL CHECK(tipo IN ('profesor','trabajador','administrador')),
        cargo TEXT
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS reservas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        aula TEXT NOT NULL,
        profesor TEXT NOT NULL,
        materia TEXT NOT NULL,
        fecha TEXT NOT NULL,
        hora_inicio TEXT NOT NULL,
        hora_fin TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'pendiente',
        solicitante_cuenta TEXT,
        solicitante_tipo TEXT,
        respuesta_admin TEXT,
        actividad TEXT,
        detalles_json TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS justificantes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profesor_id INTEGER NOT NULL,
        fecha TEXT NOT NULL,
        motivo TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'pendiente',
        respuesta_admin TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS dias_economicos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profesor_id INTEGER NOT NULL,
        fecha TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'pendiente',
        respuesta_admin TEXT,
        creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
        grupo_id TEXT,
        UNIQUE(profesor_id, fecha)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS vacaciones_academicas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ciclo TEXT NOT NULL,
        nombre TEXT NOT NULL,
        fecha_inicio TEXT NOT NULL,
        fecha_fin TEXT NOT NULL,
        fuente TEXT NOT NULL DEFAULT 'Calendario escolar UAS'
    )`);

    // Completa migraciones antes de permitir que el servidor atienda solicitudes.
    db.ready = Promise.all([
        addColumns("reservas", [["estado", "TEXT NOT NULL DEFAULT 'pendiente'"], ["solicitante_cuenta", "TEXT"], ["solicitante_tipo", "TEXT"], ["respuesta_admin", "TEXT"], ["actividad", "TEXT"], ["detalles_json", "TEXT"], ["creado_en", "TEXT"]]),
        addColumns("justificantes", [["estado", "TEXT NOT NULL DEFAULT 'pendiente'"], ["respuesta_admin", "TEXT"], ["creado_en", "TEXT"]]),
        addColumns("dias_economicos", [["estado", "TEXT NOT NULL DEFAULT 'pendiente'"], ["respuesta_admin", "TEXT"], ["creado_en", "TEXT"], ["grupo_id", "TEXT"]]),
        addColumns("usuarios", [["password", "TEXT"], ["cargo", "TEXT"]])
    ]).then(() => new Promise((resolve) => {
        db.serialize(() => {
            let tareasPendientes = 3;
            const tareaLista = () => { tareasPendientes -= 1; if (!tareasPendientes) resolve(); };
            // Los módulos de asistencia, horarios, materias, aulas libres y personal trabajador se retiran.
            db.run("DELETE FROM usuarios WHERE tipo='trabajador'");
            ["auditoria_asistencias", "asistencias", "materias_docentes", "horarios", "materias", "aulas", "administradores"].forEach((tabla) => db.run(`DROP TABLE IF EXISTS ${tabla}`));
            db.run("DELETE FROM reservas WHERE lower(aula) NOT IN ('auditorio','sala de juntas')");
            db.run("UPDATE reservas SET aula='Sala de Juntas' WHERE lower(aula)='sala de juntas'");
            db.run("UPDATE reservas SET aula='Auditorio' WHERE lower(aula)='auditorio'");
            db.run("UPDATE reservas SET estado='pendiente' WHERE upper(estado) LIKE 'PENDIENTE%'");
            db.run("UPDATE justificantes SET estado='pendiente' WHERE upper(estado) LIKE 'PENDIENTE%'");
            db.run("UPDATE dias_economicos SET estado='pendiente' WHERE upper(estado) LIKE 'PENDIENTE%'");

            const asegurarAdministrador = (done) => db.get("SELECT id FROM usuarios WHERE cuenta='Roberto' AND tipo='administrador'", [], (lookupErr, roberto) => {
                if (lookupErr) { console.error("No se pudo buscar la cuenta de administración:", lookupErr.message); return done(); }
                const actualizarNombre = (id) => db.run("UPDATE usuarios SET nombre='Roberto',apellidos='Administrador',cargo='Administración' WHERE id=?", [id], (updateErr) => { if (updateErr) console.error("No se pudo actualizar el perfil de administración:", updateErr.message); done(); });
                if (roberto) return actualizarNombre(roberto.id);
                db.get("SELECT id FROM usuarios WHERE tipo='administrador' ORDER BY id LIMIT 1", [], (legacyErr, legacy) => {
                    if (legacyErr) { console.error("No se pudo migrar la cuenta de administración:", legacyErr.message); return done(); }
                    if (legacy) return db.run("UPDATE usuarios SET cuenta='Roberto',nombre='Roberto',apellidos='Administrador',cargo='Administración' WHERE id=?", [legacy.id], (updateErr) => { if (updateErr) console.error("No se pudo migrar la cuenta universal:", updateErr.message); done(); });
                    const claveInicial = process.env.ADMIN_PASSWORD || crypto.randomBytes(18).toString("base64url");
                    db.run("INSERT INTO usuarios (cuenta,nombre,apellidos,password,tipo,cargo) VALUES ('Roberto','Roberto','Administrador',?,'administrador','Administración')", [bcrypt.hashSync(claveInicial, 10)], function (insertErr) {
                        if (insertErr) console.error("No se pudo crear la cuenta inicial del administrador:", insertErr.message);
                        else if (!process.env.ADMIN_PASSWORD) console.log(`Cuenta inicial de administración: Roberto · contraseña temporal: ${claveInicial}`);
                        done();
                    });
                });
            });
            asegurarAdministrador(tareaLista);

            const vacaciones = [
                ["2026-2027", "Vacaciones de invierno", "2026-12-21", "2027-01-08"],
                ["2026-2027", "Vacaciones de Semana Santa", "2027-03-22", "2027-04-02"],
                ["2026-2027", "Vacaciones de verano", "2027-07-05", "2027-08-06"]
            ];
            const insertarVacacion = db.prepare("INSERT INTO vacaciones_academicas (ciclo,nombre,fecha_inicio,fecha_fin) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM vacaciones_academicas WHERE ciclo=? AND nombre=?)");
            vacaciones.forEach(([ciclo,nombre,inicio,fin]) => insertarVacacion.run(ciclo,nombre,inicio,fin,ciclo,nombre));
            insertarVacacion.finalize(tareaLista);
            db.run("CREATE INDEX IF NOT EXISTS idx_reservas_fecha_aula ON reservas(fecha,aula,estado)");
            db.run("CREATE INDEX IF NOT EXISTS idx_solicitudes_economicos ON dias_economicos(estado,fecha)");
            db.run("CREATE INDEX IF NOT EXISTS idx_solicitudes_justificantes ON justificantes(estado,fecha)", tareaLista);
        });
    }));
});

console.log("Preparando base de datos de gestión académica.");
module.exports = db;
