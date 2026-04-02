# Usuario coordinador (apoyo a la titulación)

El coordinador de apoyo a la titulación inicia sesión en la misma pantalla que los egresados y accede al **home** (lista de egresados, alta, etc.). Los egresados inician sesión con el **usuario y contraseña enviados por correo**; el sistema **valida en la base de datos** (colección `usuarios`) y, si el rol es `egresado`, los redirige a la **interfaz de seguimiento**.

## Usuario coordinador por defecto (temporal)

**Por lo mientras**, al arrancar la aplicación se crea automáticamente un usuario en la colección `usuarios` con:

- **Usuario:** `coordinador`
- **Contraseña:** `12345`
- **Rol:** `coordinador`

Si ya existe un usuario con username `coordinador`, no se vuelve a crear. Cuando tu asesor indique cómo o dónde se gestionan los usuarios, se puede quitar este comportamiento o ajustarlo.

## Crear otro coordinador manualmente (opcional)

Si más adelante quieres crear otro usuario coordinador a mano en la colección `usuarios` (con contraseña hasheada en BCrypt), puedes usar:

### Opción 1: Endpoint de desarrollo

1. Arranca el backend con perfil `dev`:
   ```bash
   # En la raíz del proyecto (donde está build.gradle.kts)
   ./gradlew bootRun --args='--spring.profiles.active=dev'
   ```
   En Windows:
   ```cmd
   gradlew.bat bootRun --args="--spring.profiles.active=dev"
   ```

2. Genera el hash de la contraseña deseada:
   ```bash
   curl -X POST http://localhost:8081/api/auth/hash -H "Content-Type: application/json" -d "{\"password\":\"TuContraseñaSegura\"}"
   ```
   La respuesta será algo como: `{"hash":"$2a$10$..."}`.

3. Crea el documento del coordinador en MongoDB (mongosh, Compass o similar):
   ```javascript
   db.usuarios.insertOne({
     username: "coordinador",        // o el usuario que quieras
     passwordHash: "$2a$10$...",    // el hash obtenido en el paso 2
     rol: "coordinador",
     activo: true,
     fechaCreacion: new Date(),
     fechaActualizacion: new Date()
   });
   ```
   No incluyas `egresadoId` (solo los egresados lo tienen).

4. Vuelve a arrancar el backend **sin** el perfil `dev` en producción (para que el endpoint `/api/auth/hash` no esté disponible).

### Opción 2: Sin endpoint (producción)

Si no quieres usar el endpoint `/api/auth/hash`:

- Genera el hash con alguna herramienta BCrypt (10 rounds), por ejemplo:
  - [bcrypt-generator.com](https://www.bcrypt-generator.com/) (elegir 10 rounds), o
  - Un pequeño programa en Kotlin/Java que use `BCryptPasswordEncoder().encode("tuPassword")`.
- Inserta en `usuarios` el documento como en el paso 3 anterior, usando ese `passwordHash`.

## Resumen de roles

| Rol                | Acceso tras login |
|--------------------|-------------------|
| `coordinador` / `apoyo_titulacion` | Home (lista de egresados, alta, etc.) |
| `egresado`         | Interfaz de seguimiento del egresado |

El frontend trata `coordinador` y `apoyo_titulacion` como el mismo tipo de usuario para el home.
