# Estructura del proyecto SITVO

**SITVO — Sistema Integral de Titulación**  
Proyecto de residencia profesional.

- **Backend:** Kotlin + Spring Boot 4  
- **Frontend:** Angular 18  
- **Base de datos:** MongoDB  

---

## 1. Tecnologías utilizadas

| Capa      | Tecnología        | Versión / detalle        |
|-----------|-------------------|---------------------------|
| Backend   | Kotlin            | 2.2.x                     |
| Backend   | Spring Boot       | 4.0.x (Web, Security, Data MongoDB, Mail) |
| Frontend  | Angular           | 18.x                      |
| Base de datos | MongoDB       | Base `sit_titulacion`     |

---

## 2. Árbol del proyecto (código fuente)

```
sit/
├── build.gradle.kts                 # Build y dependencias del backend
├── README.md                        # Descripción y ejecución
│
├── src/main/
│   ├── kotlin/com/sit_titulacion/sit/
│   │   ├── SitApplication.kt              # Punto de entrada
│   │   ├── config/                        # Configuración
│   │   │   ├── MongoConfig.kt
│   │   │   ├── SecurityConfig.kt
│   │   │   ├── UsuarioDetailsService.kt
│   │   │   ├── UsuarioPrincipal.kt
│   │   │   ├── SeedCoordinadorRunner.kt   # Usuario coordinador por defecto
│   │   │   └── SeedAcademicoRunner.kt     # Usuario departamento académico
│   │   ├── domain/                        # Modelos (MongoDB)
│   │   │   ├── Egresado.kt
│   │   │   ├── Usuario.kt
│   │   │   ├── DatosPersonales.kt
│   │   │   ├── DatosProyecto.kt
│   │   │   ├── Documentos.kt
│   │   │   ├── DocumentoAdjunto.kt
│   │   │   └── HistorialEstado.kt
│   │   ├── repository/
│   │   │   ├── EgresadoRepository.kt
│   │   │   └── UsuarioRepository.kt
│   │   ├── service/
│   │   │   ├── EgresadoService.kt
│   │   │   ├── UsuarioService.kt
│   │   │   └── EmailService.kt
│   │   └── web/
│   │       ├── RootController.kt
│   │       └── api/
│   │           ├── AuthController.kt
│   │           ├── EgresadoController.kt
│   │           ├── GlobalExceptionHandler.kt
│   │           └── dto/EgresadoDtos.kt
│   └── resources/
│       ├── application.properties
│       └── application-dev.properties     # Perfil dev (cookies, etc.)
│
├── frontend/
│   ├── angular.json
│   ├── package.json
│   ├── proxy.conf.js                      # Proxy /api → backend (dev)
│   └── src/
│       ├── index.html, main.ts
│       ├── app/
│       │   ├── app.component.ts, app.config.ts, app.routes.ts
│       │   ├── core/datos.ts               # Constantes e interfaz formulario
│       │   ├── guards/auth.guard.ts        # coordinador, egresado, academico
│       │   ├── interceptors/credentials.interceptor.ts
│       │   ├── layout/header/              # Encabezado común
│       │   ├── pages/
│       │   │   ├── login/
│       │   │   ├── home/                   # Lista, detalle, filtros
│       │   │   │   └── nuevo-egresado/     # Alta/edición egresado
│       │   │   ├── seguimiento/            # Vista egresado (seguimiento)
│       │   │   └── departamento-academico/ # Vista departamento académico
│       │   └── services/
│       │       ├── auth.service.ts
│       │       └── egresado.service.ts
│       └── environments/
│           ├── environment.ts
│           └── environment.prod.ts
│
└── docs/
    ├── ESTRUCTURA.md                 # Este archivo
    ├── DEPLOY.md                     # Despliegue en servidor
    ├── MONGODB-PERSISTENCIA.md       # Persistencia y respaldos
    ├── USUARIO-COORDINADOR.md        # Usuarios por defecto y roles
    └── COLECCION_REVISIONES.md       # Propuesta colección revisiones
```

---

## 3. Capas del backend (Kotlin / Spring)

| Capa       | Ubicación      | Responsabilidad |
|------------|----------------|------------------|
| Entrada    | `SitApplication.kt` | Arranque de la aplicación |
| Config     | `config/`      | MongoDB, seguridad, usuarios por defecto (seeds) |
| Dominio    | `domain/`      | Entidades: Egresado, Usuario, documentos |
| Persistencia | `repository/` | Acceso a MongoDB |
| Lógica     | `service/`     | Reglas de negocio (egresados, usuarios, correo) |
| API        | `web/api/`     | REST (auth, egresados), DTOs, errores |

---

## 4. Capas del frontend (Angular)

| Capa       | Ubicación        | Responsabilidad |
|------------|------------------|------------------|
| Rutas      | `app.routes.ts`  | login, home, seguimiento, departamento-academico |
| Core       | `core/datos.ts`  | Constantes e interfaz del formulario |
| Guards     | `guards/`        | Protección por rol (coordinador, egresado, academico) |
| Servicios  | `services/`      | Auth y API de egresados |
| Layout     | `layout/header/` | Encabezado común |
| Páginas    | `pages/`         | login, home, nuevo-egresado, seguimiento, departamento-academico |

---

## 5. Documentación (docs/)

| Archivo | Contenido |
|---------|-----------|
| **ESTRUCTURA.md** | Estructura y tecnologías (este archivo) |
| **DEPLOY.md** | Compilación y despliegue en servidor |
| **MONGODB-PERSISTENCIA.md** | Persistencia y respaldos MongoDB |
| **USUARIO-COORDINADOR.md** | Usuarios por defecto (coordinador, academico) y roles |
| **COLECCION_REVISIONES.md** | Diseño de la colección `revisiones` para el flujo de revisiones |

---

## 6. Ejecución en desarrollo

- **Backend:** `.\gradlew bootRun` (puerto 8081). Con cookies en dev: `.\gradlew bootRun --args='--spring.profiles.active=dev'`
- **Frontend:** `cd frontend` → `npm install` → `npm start` (puerto 4200)
- **Navegador:** http://localhost:4200 (redirige a login)

MongoDB: base `sit_titulacion`, colecciones `registro` (egresados) y `usuarios`.
