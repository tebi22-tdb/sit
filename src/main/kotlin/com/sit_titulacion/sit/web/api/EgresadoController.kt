package com.sit_titulacion.sit.web.api

import com.sit_titulacion.sit.config.UsuarioPrincipal
import com.sit_titulacion.sit.repository.EgresadoRepository
import com.sit_titulacion.sit.service.EgresadoService
import com.sit_titulacion.sit.service.EmailService
import com.sit_titulacion.sit.service.UsuarioService
import com.sit_titulacion.sit.web.api.dto.DepartamentoListItemDto
import com.sit_titulacion.sit.web.api.dto.EgresadoDetailDto
import com.sit_titulacion.sit.web.api.dto.EgresadoListItemDto
import com.sit_titulacion.sit.web.api.dto.EgresadoRequestDto
import com.sit_titulacion.sit.web.api.dto.EgresadoResponseDto
import com.sit_titulacion.sit.web.api.dto.CreateRevisionRequestDto
import com.sit_titulacion.sit.web.api.dto.AgendarActoRequestDto
import com.sit_titulacion.sit.web.api.dto.AsignarSinodalesRequestDto
import com.sit_titulacion.sit.web.api.dto.SinodalesRespuestaDto
import com.sit_titulacion.sit.web.api.dto.RevisionDto
import com.sit_titulacion.sit.service.RevisionService
import com.sit_titulacion.sit.service.DocumentoStream
import org.springframework.core.env.Environment
import org.springframework.core.io.InputStreamResource
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RequestPart
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import org.bson.types.ObjectId
import org.slf4j.LoggerFactory
import java.time.format.DateTimeFormatter

@RestController
@RequestMapping("/api/egresados")
class EgresadoController(
    private val egresadoService: EgresadoService,
    private val egresadoRepository: EgresadoRepository,
    private val usuarioService: UsuarioService,
    private val emailService: EmailService,
    private val revisionService: RevisionService,
    private val env: Environment,
) {
    private val log = LoggerFactory.getLogger(EgresadoController::class.java)

    /** Diagnóstico: base de datos, colección y cantidad de documentos. */
    @GetMapping("/diagnostico")
    fun diagnostico(): ResponseEntity<Map<String, Any>> {
        val dbName = env.getProperty("spring.data.mongodb.database") ?: env.getProperty("spring.data.mongodb.uri")?.substringAfterLast("/")?.substringBefore("?") ?: "test"
        val collectionName = "registro"
        val count = egresadoRepository.count()
        return ResponseEntity.ok(mapOf(
            "mensaje" to "Configuración actual del backend",
            "base_de_datos" to dbName,
            "coleccion" to collectionName,
            "documentos_en_coleccion" to count,
            "donde_ver_en_compass" to "En Compass: 77.37.74.122:27017 → base '$dbName' → colección '$collectionName'",
        ))
    }

    @GetMapping
    fun listar(
        @RequestParam(required = false) numero_control: String?,
        @RequestParam(required = false) fecha_desde: String?,
        @RequestParam(required = false) fecha_hasta: String?,
        @RequestParam(required = false) tipo_filtro: String?,
    ): ResponseEntity<List<EgresadoListItemDto>> {
        val desde = parseFechaParam(fecha_desde)
        val hasta = parseFechaParam(fecha_hasta, endOfDay = true)
        val tipo = when (tipo_filtro?.trim()?.lowercase()) {
            "anexo_xxxi", "anexo" -> "anexo_xxxi"
            "constancia" -> "constancia"
            else -> null
        }
        val lista = egresadoService.listarParaLista(numero_control, desde, hasta, tipo)
        return ResponseEntity.ok(lista)
    }

    /** Conteos para pestañas del departamento académico. Solo rol academico. */
    @GetMapping("/departamento/counts")
    fun contarDepartamento(@AuthenticationPrincipal principal: UsuarioPrincipal?): ResponseEntity<*> {
        if (principal == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        if (principal.getRol().trim().lowercase() != "academico") {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        }
        return ResponseEntity.ok(egresadoService.contarParaDepartamento(principal.username))
    }

    /** Lista para departamento académico (Pendientes, Aprobados, Todos). Solo rol academico. */
    @GetMapping("/departamento")
    fun listarDepartamento(
        @RequestParam(required = false, defaultValue = "pendientes") estado: String,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        if (principal.getRol().trim().lowercase() != "academico") {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        }
        val lista = egresadoService.listarParaDepartamento(estado, principal.username)
        return ResponseEntity.ok(lista)
    }

    private fun parseFechaParam(s: String?, endOfDay: Boolean = false): java.time.Instant? {
        if (s.isNullOrBlank()) return null
        return try {
            val date = java.time.LocalDate.parse(s)
            if (endOfDay) {
                date.atTime(23, 59, 59, 999_999_999).atOffset(java.time.ZoneOffset.UTC).toInstant()
            } else {
                date.atStartOfDay(java.time.ZoneOffset.UTC).toInstant()
            }
        } catch (_: Exception) {
            null
        }
    }

    /** Respaldo: obtener por número de control (evita 404 si el id en lista era de otra base). */
    @GetMapping("/por-numero/{numeroControl}")
    fun obtenerPorNumeroControl(@PathVariable numeroControl: String): ResponseEntity<*> {
        log.info("detalle-egresado: buscando por numero_control={}", numeroControl)
        val detalle = egresadoService.obtenerPorNumeroControl(numeroControl)
        log.info("detalle-egresado: resultado por numero_control={} encontrado={}", numeroControl, detalle != null)
        return if (detalle != null) ResponseEntity.ok(detalle)
        else ResponseEntity.notFound().build<Void>()
    }

    /** Seguimiento del egresado: devuelve su propio registro (por egresadoId o por número de control). */
    @GetMapping("/mi-seguimiento")
    fun miSeguimiento(@AuthenticationPrincipal principal: UsuarioPrincipal?): ResponseEntity<*> {
        if (principal == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        val numeroControl = principal.username.trim().ifBlank { null } ?: return ResponseEntity.notFound().build<Void>()
        val egresadoIdFromUsuario = principal.getEgresadoId()
        val detalle = if (egresadoIdFromUsuario != null) {
            egresadoService.obtenerPorEgresadoId(egresadoIdFromUsuario).also { d ->
                if (d != null) log.debug("mi-seguimiento: username={}, encontrado por egresadoId", numeroControl)
                else log.warn("mi-seguimiento: username={}, egresadoId={} no existe en registro", numeroControl, egresadoIdFromUsuario)
            }
        } else {
            egresadoService.obtenerPorNumeroControlParaSeguimiento(numeroControl).also { d ->
                if (d != null) {
                    log.debug("mi-seguimiento: username={}, encontrado por numero_control", numeroControl)
                    try {
                        usuarioService.crearOVincularUsuarioEgresado(numeroControl, ObjectId(d.id))
                        log.info("mi-seguimiento: usuario {} vinculado a egresado {} para próximas consultas", numeroControl, d.id)
                    } catch (e: Exception) {
                        log.warn("mi-seguimiento: no se pudo vincular egresadoId al usuario {}: {}", numeroControl, e.message)
                    }
                } else {
                    log.warn("mi-seguimiento: username={}, no hay egresadoId ni registro con numero_control (revisar BD)", numeroControl)
                }
            }
        }
        return if (detalle != null) ResponseEntity.ok(detalle)
        else ResponseEntity.notFound().build<Void>()
    }

    @GetMapping("/{id}")
    fun obtenerPorId(
        @PathVariable id: String,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        log.info("detalle-egresado: buscando por id={}", id)
        val detalle = egresadoService.obtenerPorId(id)
        log.info("detalle-egresado: resultado por id={} encontrado={}", id, detalle != null)
        return if (detalle != null) ResponseEntity.ok(detalle)
        else ResponseEntity.notFound().build<Void>()
    }

    /** Descarga/visualiza el documento adjunto del egresado (PDF/Word). Solo rol academico. */
    @GetMapping("/{id}/documento")
    fun obtenerDocumento(
        @PathVariable id: String,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null || principal.getRol().trim().lowercase() != "academico") {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        }
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        val doc = egresadoService.obtenerDocumentoAdjunto(id) ?: return ResponseEntity.notFound().build<Void>()
        val headers = HttpHeaders().apply {
            set(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + doc.fileName.replace("\"", "%22") + "\"")
        }
        val mediaType = try { MediaType.parseMediaType(doc.contentType) } catch (_: Exception) { MediaType.APPLICATION_OCTET_STREAM }
        return ResponseEntity.ok()
            .headers(headers)
            .contentType(mediaType)
            .body(InputStreamResource(doc.inputStream))
    }

    @PostMapping(consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun crear(
        @RequestPart("datos") datos: EgresadoRequestDto,
        @RequestPart(value = "archivo", required = false) archivo: MultipartFile? = null,
    ): ResponseEntity<EgresadoResponseDto> {
        val egresado = egresadoService.crear(datos, archivo)
        val idStr = egresado.id?.toString() ?: ""
        val correo = datos.correo_electronico?.trim().orEmpty()

        if (idStr.isBlank()) {
            return ResponseEntity.status(HttpStatus.CREATED).body(
                EgresadoResponseDto(
                    id = "",
                    numero_control = egresado.numero_control,
                    credenciales_enviadas_correo = false,
                    aviso_credenciales = "Registro guardado sin identificador; revise la base de datos.",
                ),
            )
        }

        val oid = ObjectId(idStr)
        val (user, passwordPlana) = try {
            usuarioService.crearUsuarioEgresado(egresado.numero_control.trim(), oid)
        } catch (e: IllegalArgumentException) {
            try {
                usuarioService.crearOVincularUsuarioEgresado(egresado.numero_control.trim(), oid)
            } catch (e2: Exception) {
                log.warn(
                    "Egresado creado pero no se pudo vincular usuario para control {}: {}",
                    egresado.numero_control,
                    e2.message,
                )
                return ResponseEntity.status(HttpStatus.CREATED).body(
                    EgresadoResponseDto(
                        id = idStr,
                        numero_control = egresado.numero_control,
                        credenciales_enviadas_correo = false,
                        aviso_credenciales =
                            "Egresado registrado. No se pudo crear o vincular el usuario: ${e.message ?: "error"}.",
                    ),
                )
            }
        } catch (e: Exception) {
            log.error("Error al crear usuario egresado para id={}: {}", idStr, e.message, e)
            return ResponseEntity.status(HttpStatus.CREATED).body(
                EgresadoResponseDto(
                    id = idStr,
                    numero_control = egresado.numero_control,
                    credenciales_enviadas_correo = false,
                    aviso_credenciales =
                        "Egresado registrado. Error al crear usuario: ${e.message ?: "desconocido"}.",
                ),
            )
        }

        var credencialesOk: Boolean?
        var aviso: String?
        if (passwordPlana.isBlank()) {
            credencialesOk = false
            aviso =
                "Ya existía un usuario con ese número de control; se vinculó al registro. No se envían credenciales nuevas por correo."
        } else if (correo.isBlank()) {
            credencialesOk = false
            aviso =
                "Usuario creado (inicio de sesión: número de control). No se envió correo: falta correo electrónico en el registro."
        } else {
            try {
                val enviado = emailService.enviarCredenciales(correo, user, passwordPlana)
                if (enviado) {
                    credencialesOk = true
                    aviso = null
                } else {
                    credencialesOk = false
                    aviso =
                        "Usuario creado; no se envió correo (revise correo en el registro y configuración SMTP del servidor)."
                }
            } catch (e: Exception) {
                log.error("No se pudo enviar correo de credenciales a {}: {}", correo, e.message, e)
                credencialesOk = false
                aviso =
                    "Usuario creado; no se pudo enviar el correo (${e.message ?: "error SMTP"}). Comunique la contraseña por otro medio o reintente."
            }
        }

        return ResponseEntity.status(HttpStatus.CREATED).body(
            EgresadoResponseDto(
                id = idStr,
                numero_control = egresado.numero_control,
                credenciales_enviadas_correo = credencialesOk,
                aviso_credenciales = aviso,
            ),
        )
    }

    @PostMapping("/{id}", consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
    fun actualizar(
        @PathVariable id: String,
        @RequestPart("datos") datos: EgresadoRequestDto,
        @RequestPart(value = "archivo", required = false) archivo: MultipartFile? = null,
    ): ResponseEntity<*> {
        return if (egresadoService.actualizar(id, datos, archivo)) {
            ResponseEntity.ok().build<Void>()
        } else {
            ResponseEntity.notFound().build<Void>()
        }
    }

    @PostMapping("/eliminar/{id}")
    fun eliminar(@PathVariable id: String): ResponseEntity<*> {
        return if (egresadoService.eliminar(id)) {
            ResponseEntity.noContent().build<Void>()
        } else {
            ResponseEntity.notFound().build<Void>()
        }
    }

    /** Marca el egresado como "Enviado al departamento académico" (paso 1.1 del seguimiento). */
    @PostMapping("/{id}/enviar-departamento-academico")
    fun enviarDepartamentoAcademico(@PathVariable id: String): ResponseEntity<*> {
        return if (egresadoService.marcarEnviadoDepartamentoAcademico(id)) {
            ResponseEntity.ok().build<Void>()
        } else {
            ResponseEntity.notFound().build<Void>()
        }
    }

    /** Marca "recibido registro y liberación" desde departamento académico (solo Residencia). */
    @PostMapping("/{id}/liberar")
    fun liberar(
        @PathVariable id: String,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null || principal.getRol().trim().lowercase() != "academico") {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        }
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        return if (egresadoService.liberar(id)) {
            ResponseEntity.ok().build<Void>()
        } else {
            ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
                mapOf("error" to "No se pudo liberar. Solo aplica a Residencia Profesional enviada al departamento y no liberada previamente."),
            )
        }
    }

    @PostMapping("/{id}/confirmar-recibidos-anexo-xxxi-xxxii")
    fun confirmarRecibidosAnexoXxxiXxxii(
        @PathVariable id: String,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        return if (egresadoService.confirmarRecibidosAnexoXxxiXxxii(id)) {
            ResponseEntity.ok().build<Void>()
        } else {
            ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(mapOf("error" to "No se pudo confirmar recibidos XXXI/XXXII para este registro."))
        }
    }

    @GetMapping("/{id}/anexo-9-1")
    fun descargarAnexo91(
        @PathVariable id: String,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        val bytes = egresadoService.crearAnexo91(id)
            ?: return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
                mapOf("error" to "No se pudo generar el PDF del anexo 9.1 (plantilla HTML del sistema). Revisa los logs del servidor."),
            )
        val fileName = "Anexo-9.1-$id.pdf"
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_PDF)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$fileName\"")
            .body(bytes)
    }

    @PostMapping("/{id}/confirmar-entrega-anexo-9-1")
    fun confirmarEntregaAnexo91(
        @PathVariable id: String,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        return if (egresadoService.confirmarEntregaAnexo91(id)) {
            ResponseEntity.ok().build<Void>()
        } else {
            ResponseEntity.status(HttpStatus.BAD_REQUEST).body(mapOf("error" to "No se pudo confirmar entrega 9.1."))
        }
    }

    /** División: solicita al egresado la constancia 9.2 (sin generar PDF aquí). */
    @PostMapping("/{id}/solicitar-constancia-9-2-division")
    fun solicitarConstancia92Division(
        @PathVariable id: String,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        return if (egresadoService.solicitarConstancia92Division(id)) {
            ResponseEntity.ok().build<Void>()
        } else {
            ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
                mapOf("error" to "No se pudo registrar la solicitud 9.2 (revisa entrega 9.1 o que no esté duplicada)."),
            )
        }
    }

    @GetMapping("/{id}/anexo-9-2")
    fun descargarAnexo92(
        @PathVariable id: String,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        val bytes = egresadoService.crearAnexo92(id)
            ?: return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
                mapOf(
                    "error" to
                        "No se pudo generar el 9.2: primero división debe usar «Solicitar constancia 9.2», " +
                        "o falló LibreOffice/plantilla.",
                ),
            )
        val fileName = "Anexo-9.2-$id.pdf"
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_PDF)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$fileName\"")
            .body(bytes)
    }

    @PostMapping("/{id}/confirmar-recibido-anexo-9-2")
    fun confirmarRecibidoAnexo92(
        @PathVariable id: String,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        return if (egresadoService.confirmarRecibidoAnexo92(id)) {
            ResponseEntity.ok().build<Void>()
        } else {
            ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
                mapOf("error" to "No se pudo confirmar: falta la solicitud de división para la 9.2 o ya estaba confirmado."),
            )
        }
    }

    @PostMapping("/{id}/solicitar-sinodales")
    fun solicitarSinodales(
        @PathVariable id: String,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        return if (egresadoService.solicitarSinodales(id)) {
            ResponseEntity.ok().build<Void>()
        } else {
            ResponseEntity.status(HttpStatus.BAD_REQUEST).body(mapOf("error" to "No se pudo solicitar sinodales."))
        }
    }

    @GetMapping("/{id}/sinodales")
    fun getSinodales(
        @PathVariable id: String,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null || principal.getRol().trim().lowercase() != "academico") {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        }
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        val s = egresadoService.obtenerSinodales(id)
        return ResponseEntity.ok(
            SinodalesRespuestaDto(
                presidente = s?.presidente ?: "",
                secretario = s?.secretario ?: "",
                vocal = s?.vocal ?: "",
                vocalSuplente = s?.vocal_suplente ?: "",
            ),
        )
    }

    @PostMapping("/{id}/sinodales", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun asignarSinodales(
        @PathVariable id: String,
        @RequestBody body: AsignarSinodalesRequestDto,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null || principal.getRol().trim().lowercase() != "academico") {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        }
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        return if (egresadoService.asignarSinodales(id, body.presidente, body.secretario, body.vocal, body.vocalSuplente)) {
            ResponseEntity.ok().build<Void>()
        } else {
            ResponseEntity.status(HttpStatus.BAD_REQUEST).body(mapOf("error" to "No se pudieron guardar los sinodales."))
        }
    }

    @PostMapping("/{id}/confirmar-sinodales-recibidos")
    fun confirmarSinodalesRecibidos(
        @PathVariable id: String,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        return if (egresadoService.confirmarSinodalesRecibidos(id)) {
            ResponseEntity.ok().build<Void>()
        } else {
            ResponseEntity.status(HttpStatus.BAD_REQUEST).body(mapOf("error" to "No se pudo confirmar sinodales recibidos."))
        }
    }

    /** Lista revisiones del egresado (solo rol academico). */
    @GetMapping("/{id}/revisiones")
    fun listarRevisiones(
        @PathVariable id: String,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null || principal.getRol().trim().lowercase() != "academico") {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        }
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        val lista = revisionService.listarPorEgresado(id)
        return ResponseEntity.ok(lista)
    }

    /** Crea una revisión (Enviar revisión con observaciones). Solo rol academico. */
    @PostMapping(value = ["/{id}/revisiones"], consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun crearRevision(
        @PathVariable id: String,
        @RequestBody body: CreateRevisionRequestDto,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null || principal.getRol().trim().lowercase() != "academico") {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        }
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        val creada = revisionService.crear(id, body, principal.getRol())
        return if (creada != null) ResponseEntity.status(HttpStatus.CREATED).body(creada)
        else ResponseEntity.notFound().build<Void>()
    }

    @PostMapping("/{id}/agendar-acto-9-3", consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun agendarActo93(
        @PathVariable id: String,
        @RequestBody body: AgendarActoRequestDto,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        return if (egresadoService.agendarActo93(id, body.fecha_hora)) {
            ResponseEntity.ok().build<Void>()
        } else {
            ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(mapOf("error" to "No se pudo agendar: fecha/hora fuera del horario permitido (L-V 10:00-14:00) o el intervalo ya está ocupado."))
        }
    }

    @GetMapping("/agenda-acto-9-3/ocupados")
    fun listarAgendaActo93Ocupados(@AuthenticationPrincipal principal: UsuarioPrincipal?): ResponseEntity<*> {
        if (principal == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        val fechas = egresadoService.listarActo93Ocupados().map { DateTimeFormatter.ISO_INSTANT.format(it) }
        return ResponseEntity.ok(mapOf("ocupados" to fechas))
    }

    @GetMapping("/{id}/anexo-9-3")
    fun descargarAnexo93(
        @PathVariable id: String,
        @AuthenticationPrincipal principal: UsuarioPrincipal?,
    ): ResponseEntity<*> {
        if (principal == null) return ResponseEntity.status(HttpStatus.FORBIDDEN).build<Void>()
        respuestaSiAcademicoSinCarrera(id, principal)?.let { return it }
        val bytes = egresadoService.crearAnexo93(id)
            ?: return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
                mapOf("error" to "No se pudo generar el PDF del anexo 9.3 (plantilla HTML del sistema). Revisa los logs del servidor."),
            )
        val fileName = "Anexo-9.3-$id.pdf"
        return ResponseEntity.ok()
            .contentType(MediaType.APPLICATION_PDF)
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"$fileName\"")
            .body(bytes)
    }

    /** Académico con carreras asignadas no puede abrir expedientes de otras carreras. */
    private fun respuestaSiAcademicoSinCarrera(id: String, principal: UsuarioPrincipal?): ResponseEntity<*>? {
        if (principal == null) return null
        if (principal.getRol().trim().lowercase() != "academico") return null
        return if (!egresadoService.academicoPuedeAccederAEgresado(principal.username, id)) {
            ResponseEntity.status(HttpStatus.FORBIDDEN).body(mapOf("error" to "No autorizado para este egresado."))
        } else {
            null
        }
    }
}
