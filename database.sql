-- Esquema vigente del Sistema de Gestión Académica UAS.
CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cuenta TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    password TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('profesor','administrador')),
    cargo TEXT
);

CREATE TABLE reservas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    aula TEXT NOT NULL CHECK(aula IN ('Auditorio','Sala de Juntas')),
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
);

CREATE TABLE justificantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profesor_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    motivo TEXT NOT NULL CHECK(motivo IN ('Operación médica','Fallecimiento','Enfermedad','Problema familiar')),
    estado TEXT NOT NULL DEFAULT 'pendiente',
    respuesta_admin TEXT,
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dias_economicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profesor_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    respuesta_admin TEXT,
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(profesor_id, fecha)
);

CREATE TABLE vacaciones_academicas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ciclo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    fecha_inicio TEXT NOT NULL,
    fecha_fin TEXT NOT NULL,
    fuente TEXT NOT NULL DEFAULT 'Calendario escolar UAS'
);
