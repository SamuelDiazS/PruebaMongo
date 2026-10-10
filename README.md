# EduPets

EduPets es un proyecto educativo y divertido para niños de primaria. La idea es cuidar una mascota virtual, aprender matemáticas básicas y manejar un pequeño inventario con monedas virtuales.

## Tecnologías usadas

- HTML5, CSS3 y JavaScript vanilla
- Node.js y Express
- MongoDB con el paquete oficial `mongodb`
- `dotenv` para variables de entorno
- `express-session` para sesiones HTTP-only
- `bcryptjs` para hash seguro de contraseñas

## Estructura principal

- `server.js`: backend principal, rutas REST, sesión, validación y conexión a MongoDB.
- `public/index.html`: página de presentación del proyecto.
- `public/login.html`: inicio de sesión.
- `public/register.html`: registro del usuario y su mascota.
- `public/pet.html`: pantalla principal de la mascota.
- `public/css/styles.css`: estilos visuales, diseño para niños.
- `public/js/auth.js`: lógica de login y registro.
- `public/js/pet.js`: lógica del juego, tienda, estadística y actividades.
- `.env.example`: plantilla para las variables de entorno.

## Instalación

1. Copia `.env.example` a `.env`.
2. Ajusta `MONGODB_URI`, `MONGODB_DB_NAME` y `SESSION_SECRET`.
3. Ejecuta:

```bash
npm install
npm start
```

La aplicación queda disponible en `http://localhost:3000`.

## Funcionalidades

- Registro con validación del usuario y la mascota.
- Inicio de sesión con sesión HTTP-only.
- Protección de rutas privadas.
- Mascota con hambre, energía y felicidad.
- Alimentación consumiendo elementos del inventario.
- Tienda con productos básicos.
- Actividad matemática con validación en el servidor.
- Historial de actividades guardadas en MongoDB.

## Notas de seguridad

- Las contraseñas nunca se almacenan en texto plano.
- Las sesiones se guardan en cookies `httpOnly`.
- Los cambios de estado se validan en el servidor.
- Las respuestas de la actividad matemática se comprueban en el servidor.

## Modelo de datos

La aplicación usa dos colecciones principales:

- `users`: datos del jugador y de la mascota.
- `activities`: registros educativos realizados.

## Autor

Este proyecto sirve como base para aprender desarrollo web y bases de datos con MongoDB de forma sencilla y clara.
