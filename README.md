# SIAE-3 · Gestión Académica UAS

Aplicación para que los maestros soliciten reservas de espacios, días económicos y justificantes, y para que administración revise las solicitudes y gestione cuentas docentes.

## Requisitos

- Node.js 18 o posterior
- npm

## Iniciar en desarrollo

```sh
npm install
PORT=4200 npm start
```

Abre `http://localhost:4200/`.

## Cuenta de administración

El usuario universal es `Roberto`. Para una instalación nueva, el sistema genera una contraseña temporal al primer inicio y la muestra en la terminal. También puedes establecerla antes de iniciar el servidor con la variable de entorno `ADMIN_PASSWORD`. Las cuentas existentes conservan su contraseña. En un despliegue estable, configura además `SESSION_SECRET` para mantener las sesiones entre reinicios.

No publiques contraseñas ni compartas archivos locales de base de datos. La base SQLite y las cargas personales están excluidas del repositorio mediante `.gitignore`.

## Funciones

- Acceso y registro de maestros.
- Solicitudes para Auditorio y Sala de Juntas.
- Selección conjunta de hasta cinco días económicos por solicitud, con validación del calendario escolar.
- Justificantes de días laborales.
- Panel administrativo con notificaciones, revisión de solicitudes, reservas, digitalización de nóminas y cuentas de maestros.
