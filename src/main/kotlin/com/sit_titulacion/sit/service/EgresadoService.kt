package com.sit_titulacion.sit.service

import com.sit_titulacion.sit.domain.AnexoXxxi
import com.sit_titulacion.sit.domain.ConstanciaNoInconveniencia
import com.sit_titulacion.sit.domain.DatosPersonales
import com.sit_titulacion.sit.domain.DatosProyecto
import com.sit_titulacion.sit.domain.DocumentoAdjunto
import com.sit_titulacion.sit.domain.Documentos
import com.sit_titulacion.sit.domain.Egresado
import com.sit_titulacion.sit.domain.HistorialEstado
import com.sit_titulacion.sit.domain.SinodalesTribunal
import com.sit_titulacion.sit.repository.EgresadoRepository
import com.sit_titulacion.sit.repository.UsuarioRepository
import com.sit_titulacion.sit.web.api.dto.AnexoDto
import com.sit_titulacion.sit.web.api.dto.DepartamentoListItemDto
import com.sit_titulacion.sit.web.api.dto.ConstanciaDto
import com.sit_titulacion.sit.web.api.dto.DatosPersonalesDto
import com.sit_titulacion.sit.web.api.dto.DatosProyectoDto
import com.sit_titulacion.sit.web.api.dto.DocumentoAdjuntoDto
import com.sit_titulacion.sit.web.api.dto.DocumentosDto
import com.sit_titulacion.sit.web.api.dto.EgresadoDetailDto
import com.sit_titulacion.sit.web.api.dto.EgresadoListItemDto
import com.sit_titulacion.sit.web.api.dto.EgresadoRequestDto
import com.sit_titulacion.sit.web.api.dto.EgresadoResponseDto
import org.apache.poi.xwpf.usermodel.XWPFDocument
import org.bson.types.ObjectId
import org.slf4j.LoggerFactory
import org.springframework.core.env.Environment
import org.springframework.core.io.ClassPathResource
import org.springframework.data.mongodb.core.query.Criteria
import org.springframework.data.mongodb.core.query.Query
import org.springframework.data.mongodb.gridfs.GridFsTemplate
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Paths
import java.util.concurrent.TimeUnit
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import java.time.Instant
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.time.ZoneOffset
import java.util.Locale
import java.time.format.DateTimeParseException
import java.time.format.DateTimeFormatter

data class DocumentoStream(
    val inputStream: InputStream,
    val contentType: String,
    val fileName: String,
)

@Service
class EgresadoService(
    private val egresadoRepository: EgresadoRepository,
    private val usuarioRepository: UsuarioRepository,
    private val gridFsTemplate: GridFsTemplate,
    private val env: Environment,
    private val htmlAnexoPdfService: HtmlAnexoPdfService,
    private val revisionService: RevisionService,
) {
    private val log = LoggerFactory.getLogger(EgresadoService::class.java)

    fun crear(datos: EgresadoRequestDto, archivo: MultipartFile?): Egresado {
        val ahora = Instant.now()
        val documentoAdjunto = if (archivo != null && !archivo.isEmpty) {
            val gridFsId = subirArchivo(archivo)
            DocumentoAdjunto(
                gridfs_id = gridFsId,
                nombre_original = archivo.originalFilename ?: "",
                content_type = archivo.contentType ?: "application/octet-stream",
                tamanio_bytes = archivo.size,
                fecha_subida = ahora,
            )
        } else {
            DocumentoAdjunto()
        }

        val egresado = Egresado(
            numero_control = datos.numero_control,
            datos_personales = DatosPersonales(
                nombre = datos.nombre,
                apellido_paterno = datos.apellidoPaterno,
                apellido_materno = datos.apellidoMaterno,
                carrera = datos.carrera,
                nivel = datos.nivel,
                direccion = datos.direccion,
                telefono = datos.telefono,
                correo_electronico = datos.correo_electronico,
            ),
            datos_proyecto = DatosProyecto(
                nombre_proyecto = datos.nombreProyecto ?: "",
                modalidad = datos.modalidad,
                curso_titulacion = datos.cursoTitulacion?.trim()?.lowercase()?.takeIf { it == "si" } ?: "no",
                asesor_interno = datos.asesorInterno?.takeIf { it.isNotBlank() },
                asesor_externo = datos.asesorExterno?.takeIf { it.isNotBlank() },
                director = datos.director?.takeIf { it.isNotBlank() },
                asesor_1 = datos.asesor1?.takeIf { it.isNotBlank() },
                asesor_2 = datos.asesor2?.takeIf { it.isNotBlank() },
            ),
            documentos = Documentos(
                anexo_xxxi = AnexoXxxi(
                    fecha_registro = parseFecha(datos.fechaRegistroAnexo),
                    estado = "pendiente",
                ),
                constancia_no_inconveniencia = ConstanciaNoInconveniencia(
                    fecha_expedicion = parseFecha(datos.fechaExpedicionConstancia),
                    estado = "pendiente",
                ),
            ),
            documento_adjunto = documentoAdjunto,
            estado_general = "registrado",
            historial_estados = listOf(
                HistorialEstado(estado = "registrado", fecha = ahora, observacion = "Registro inicial del alumno"),
            ),
            fechaCreacion = ahora,
            fecha_actualizacion = ahora,
        )
        val guardado = egresadoRepository.save(egresado)
        log.info("Egresado guardado en sit_titulacion.registro: id={}, numero_control={}", guardado.id, guardado.numero_control)
        return guardado
    }

    fun actualizar(id: String, datos: EgresadoRequestDto, archivo: MultipartFile?): Boolean {
        val objectId = try {
            ObjectId(id)
        } catch (_: Exception) {
            return false
        }
        val existente = egresadoRepository.findById(objectId).orElse(null) ?: return false
        val ahora = Instant.now()
        val documentoAdjunto = when {
            datos.quitarArchivo == true -> DocumentoAdjunto()
            archivo != null && !archivo.isEmpty -> {
                val gridFsId = subirArchivo(archivo)
                DocumentoAdjunto(
                    gridfs_id = gridFsId,
                    nombre_original = archivo.originalFilename ?: "",
                    content_type = archivo.contentType ?: "application/octet-stream",
                    tamanio_bytes = archivo.size,
                    fecha_subida = ahora,
                )
            }
            else -> existente.documento_adjunto
        }
        val actualizado = existente.copy(
            numero_control = datos.numero_control,
            datos_personales = DatosPersonales(
                nombre = datos.nombre,
                apellido_paterno = datos.apellidoPaterno,
                apellido_materno = datos.apellidoMaterno,
                carrera = datos.carrera,
                nivel = datos.nivel,
                direccion = datos.direccion,
                telefono = datos.telefono,
                correo_electronico = datos.correo_electronico,
            ),
            datos_proyecto = DatosProyecto(
                nombre_proyecto = datos.nombreProyecto ?: "",
                modalidad = datos.modalidad,
                curso_titulacion = datos.cursoTitulacion?.trim()?.lowercase()?.takeIf { it == "si" } ?: "no",
                asesor_interno = datos.asesorInterno?.takeIf { it.isNotBlank() },
                asesor_externo = datos.asesorExterno?.takeIf { it.isNotBlank() },
                director = datos.director?.takeIf { it.isNotBlank() },
                asesor_1 = datos.asesor1?.takeIf { it.isNotBlank() },
                asesor_2 = datos.asesor2?.takeIf { it.isNotBlank() },
            ),
            documentos = Documentos(
                anexo_xxxi = AnexoXxxi(
                    fecha_registro = parseFecha(datos.fechaRegistroAnexo),
                    estado = existente.documentos.anexo_xxxi.estado,
                ),
                constancia_no_inconveniencia = ConstanciaNoInconveniencia(
                    fecha_expedicion = parseFecha(datos.fechaExpedicionConstancia),
                    estado = existente.documentos.constancia_no_inconveniencia.estado,
                ),
            ),
            documento_adjunto = documentoAdjunto,
            fecha_actualizacion = ahora,
        )
        egresadoRepository.save(actualizado)
        log.info("Egresado actualizado: id={}, numero_control={}", id, datos.numero_control)
        return true
    }

    fun eliminar(id: String): Boolean {
        val objectId = try {
            ObjectId(id)
        } catch (_: Exception) {
            return false
        }
        if (!egresadoRepository.existsById(objectId)) return false
        egresadoRepository.deleteById(objectId)
        log.info("Egresado eliminado: id={}", id)
        return true
    }

    fun listarTodos(): List<EgresadoResponseDto> =
        egresadoRepository.findAll().map { e ->
            EgresadoResponseDto(
                id = e.id?.toString() ?: "",
                numero_control = e.numero_control,
            )
        }

    /** Lista para el panel izquierdo: recientes primero, opcional filtro por número de control. */
    fun listarParaLista(numeroControlFilter: String?): List<EgresadoListItemDto> {
        val lista = if (numeroControlFilter.isNullOrBlank()) {
            egresadoRepository.findAll().sortedByDescending { it.id }
        } else {
            egresadoRepository.findByNumeroControlContaining(numeroControlFilter.trim())
                .sortedByDescending { it.id }
        }
        log.info("listarParaLista: encontrados {} egresados en DB", lista.size)
        val formatter = DateTimeFormatter.ISO_INSTANT
        return lista.map { e ->
            val p = e.datos_personales
            val nombreCompleto = listOf(p.nombre, p.apellido_paterno, p.apellido_materno)
                .filter { !it.isNullOrBlank() }
                .joinToString(" ")
                .ifBlank { "—" }
            val carrera = p.carrera.ifBlank { "—" }
            EgresadoListItemDto(
                id = e.id?.toString() ?: "",
                numero_control = e.numero_control,
                nombre = nombreCompleto,
                carrera = carrera,
                modalidad = e.datos_proyecto.modalidad.ifBlank { "—" },
                fecha_creacion = formatter.format(e.fechaCreacion),
                fecha_enviado_departamento_academico = e.fechaEnviadoDepartamentoAcademico?.let { formatter.format(it) },
                fecha_actualizacion = formatter.format(e.fecha_actualizacion),
                fecha_creacion_anexo_9_3 = e.fechaCreacionAnexo93?.let { formatter.format(it) },
            )
        }
    }

    /**
     * Compatibilidad con controlador actual: por ahora se ignoran filtros por fecha/tipo.
     */
    fun listarParaLista(
        numeroControlFilter: String?,
        @Suppress("UNUSED_PARAMETER") fechaDesde: Instant?,
        @Suppress("UNUSED_PARAMETER") fechaHasta: Instant?,
        @Suppress("UNUSED_PARAMETER") tipoFiltro: String?,
    ): List<EgresadoListItemDto> = listarParaLista(numeroControlFilter)

    fun contarParaDepartamento(academicoUsername: String): Map<String, Int> {
        val allBase = filtrarEgresadosPorCarreraSiAcademico(egresadoRepository.findAll(), academicoUsername)
        val all = if (esAcademicoSoloRevisiones(academicoUsername)) allBase.filter { !esResidenciaProfesional(it) } else allBase
        val pendientes = all.count {
            it.fechaEnviadoDepartamentoAcademico != null &&
                it.fechaRecibidoRegistroLiberacion == null &&
                !enCorreccionAcademico(it)
        }
        val enCorreccion = all.count {
            it.fechaEnviadoDepartamentoAcademico != null &&
                it.fechaRecibidoRegistroLiberacion == null &&
                enCorreccionAcademico(it)
        }
        val aprobados = all.count { it.fechaRecibidoRegistroLiberacion != null }
        val todos = all.count { it.fechaEnviadoDepartamentoAcademico != null }
        val sinodales = all.count { it.fechaSolicitudSinodales != null && it.fechaConfirmacionSinodalesRecibidos == null }
        return mapOf(
            "pendientes" to pendientes,
            "en_correccion" to enCorreccion,
            "aprobados" to aprobados,
            "todos" to todos,
            "sinodales_por_asignar" to sinodales,
        )
    }

    fun listarParaDepartamento(estado: String, academicoUsername: String): List<DepartamentoListItemDto> {
        val allBase = filtrarEgresadosPorCarreraSiAcademico(egresadoRepository.findAll(), academicoUsername)
        val all = if (esAcademicoSoloRevisiones(academicoUsername)) allBase.filter { !esResidenciaProfesional(it) } else allBase
        val norm = estado.trim().lowercase()
        val lista = when (norm) {
            "aprobados" -> all.filter { it.fechaRecibidoRegistroLiberacion != null }
            "sinodales" ->
                all
                    .filter { it.fechaSolicitudSinodales != null }
                    // Primero historial pendiente (sin asignar), luego los ya asignados.
                    .sortedWith(
                        compareBy<Egresado> { it.fechaAsignacionSinodales != null }
                            .thenByDescending { it.fechaSolicitudSinodales ?: Instant.EPOCH }
                            .thenByDescending { it.fecha_actualizacion },
                    )
            "todos" -> all.filter { it.fechaEnviadoDepartamentoAcademico != null }
            "en_correccion" -> all.filter {
                it.fechaEnviadoDepartamentoAcademico != null &&
                    it.fechaRecibidoRegistroLiberacion == null &&
                    enCorreccionAcademico(it)
            }
            else -> all.filter {
                it.fechaEnviadoDepartamentoAcademico != null &&
                    it.fechaRecibidoRegistroLiberacion == null &&
                    !enCorreccionAcademico(it)
            }
        }
        val formatter = DateTimeFormatter.ISO_INSTANT
        return lista.map { e ->
            val p = e.datos_personales
            val nombre = listOf(p.nombre, p.apellido_paterno, p.apellido_materno)
                .filter { !it.isNullOrBlank() }
                .joinToString(" ")
                .ifBlank { "—" }
            DepartamentoListItemDto(
                id = e.id?.toString() ?: "",
                nombre = nombre,
                numeroControl = e.numero_control,
                modalidad = e.datos_proyecto.modalidad,
                fechaActualizacion = e.fecha_actualizacion.let { formatter.format(it) },
                fechaEnviadoDepartamento = e.fechaEnviadoDepartamentoAcademico?.let { formatter.format(it) },
                estadoRevision = estadoRevisionDepartamento(e),
                fechaSolicitudSinodales = e.fechaSolicitudSinodales?.let { formatter.format(it) },
                sinodalesAsignados = e.fechaAsignacionSinodales != null,
            )
        }
    }

    /**
     * Usuario con rol `academico` y lista `carreras_asignadas` no vacía solo ve egresados de esas carreras.
     * Si la lista está vacía (usuarios antiguos), no se filtra.
     */
    fun academicoPuedeAccederAEgresado(academicoUsername: String, egresadoId: String): Boolean {
        if (esAcademicoSoloRevisiones(academicoUsername)) {
            val e = cargarEgresadoPorId(egresadoId) ?: return false
            if (esResidenciaProfesional(e)) return false
        }
        val permitidas = carrerasFiltroAcademico(academicoUsername) ?: return true
        if (permitidas.isEmpty()) return true
        val e = cargarEgresadoPorId(egresadoId) ?: return false
        return carreraPermitidaParaAcademico(e.datos_personales.carrera, permitidas)
    }

    private fun filtrarEgresadosPorCarreraSiAcademico(egresados: List<Egresado>, academicoUsername: String): List<Egresado> {
        val permitidas = carrerasFiltroAcademico(academicoUsername) ?: return egresados
        if (permitidas.isEmpty()) return egresados
        return egresados.filter { carreraPermitidaParaAcademico(it.datos_personales.carrera, permitidas) }
    }

    /** Conjunto de carreras asignadas al académico, o null si no aplica filtro. */
    private fun carrerasFiltroAcademico(username: String): Set<String>? {
        val u = usuarioRepository.findByUsername(username.trim()) ?: return null
        if (!u.rol.trim().equals("academico", ignoreCase = true)) return null
        val permitidas = u.carrerasAsignadas.map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        return if (permitidas.isEmpty()) null else permitidas
    }

    /**
     * Académico general (sin segmento/carreras): solo trabaja expedientes de revisión académica
     * de modalidades distintas a Residencia Profesional.
     */
    private fun esAcademicoSoloRevisiones(username: String): Boolean {
        val u = usuarioRepository.findByUsername(username.trim()) ?: return false
        if (!u.rol.trim().equals("academico", ignoreCase = true)) return false
        val sinSegmento = u.segmentoAcademico?.trim().isNullOrEmpty()
        val sinCarreras = u.carrerasAsignadas.isEmpty()
        return sinSegmento && sinCarreras
    }

    private fun carreraPermitidaParaAcademico(carrera: String, permitidas: Set<String>): Boolean {
        val c = carrera.trim()
        if (c.isEmpty()) return false
        return permitidas.any { perm -> perm.equals(c, ignoreCase = true) }
    }

    fun obtenerPorId(id: String): EgresadoDetailDto? {
        val objectId = try {
            ObjectId(id)
        } catch (_: Exception) {
            return null
        }
        return try {
            egresadoRepository.findByObjectIdConTimeout(objectId)?.let { toDetailDto(it) }
        } catch (e: Exception) {
            log.warn("obtenerPorId: timeout/error consultando id={}: {}", id, e.message)
            null
        }
    }

    /** Obtener por número de control (respaldo cuando el id de la lista no coincide). */
    fun obtenerPorNumeroControl(numeroControl: String): EgresadoDetailDto? {
        if (numeroControl.isBlank()) return null
        return egresadoRepository.findByNumeroControl(numeroControl.trim())?.let { toDetailDto(it) }
    }

    fun obtenerPorEgresadoId(egresadoId: ObjectId): EgresadoDetailDto? =
        egresadoRepository.findById(egresadoId).orElse(null)?.let { toDetailDto(it) }

    fun obtenerPorNumeroControlParaSeguimiento(numeroControl: String): EgresadoDetailDto? =
        obtenerPorNumeroControl(numeroControl)

    fun obtenerDocumentoAdjunto(id: String): DocumentoStream? {
        val objectId = try { ObjectId(id) } catch (_: Exception) { return null }
        val e = egresadoRepository.findById(objectId).orElse(null) ?: return null
        val adj = e.documento_adjunto
        val gridId = adj.gridfs_id ?: return null
        val file = gridFsTemplate.findOne(Query.query(Criteria.where("_id").`is`(gridId))) ?: return null
        val resource = gridFsTemplate.getResource(file)
        val input = resource.inputStream
        return DocumentoStream(
            inputStream = input,
            contentType = adj.content_type.ifBlank { "application/octet-stream" },
            fileName = adj.nombre_original.ifBlank { "documento" },
        )
    }

    fun marcarEnviadoDepartamentoAcademico(id: String): Boolean {
        val objectId = try { ObjectId(id) } catch (_: Exception) { return false }
        val e = egresadoRepository.findById(objectId).orElse(null) ?: return false
        if (e.fechaEnviadoDepartamentoAcademico != null) return false
        val ahora = Instant.now()
        egresadoRepository.save(
            e.copy(
                fechaEnviadoDepartamentoAcademico = ahora,
                fecha_actualizacion = ahora,
            ),
        )
        return true
    }

    fun liberar(id: String): Boolean {
        val objectId = try { ObjectId(id) } catch (_: Exception) { return false }
        val e = egresadoRepository.findById(objectId).orElse(null) ?: return false
        if (!esResidenciaProfesional(e)) return false
        if (e.fechaEnviadoDepartamentoAcademico == null) return false
        if (e.fechaRecibidoRegistroLiberacion != null) return false
        val ahora = Instant.now()
        egresadoRepository.save(
            e.copy(
                fechaRecibidoRegistroLiberacion = ahora,
                fecha_actualizacion = ahora,
            ),
        )
        return true
    }

    fun confirmarRecibidosAnexoXxxiXxxii(id: String): Boolean {
        val e = cargarEgresadoPorId(id) ?: return false
        if (e.fechaRecibidoRegistroLiberacion == null) return false
        if (e.fechaConfirmacionRecibidosAnexoXxxiXxxii != null) return false
        val ahora = Instant.now()
        egresadoRepository.save(
            e.copy(
                fechaConfirmacionRecibidosAnexoXxxiXxxii = ahora,
                fecha_actualizacion = ahora,
            ),
        )
        return true
    }

    fun crearAnexo91(id: String): ByteArray? {
        val e = cargarEgresadoPorId(id) ?: return null
        if (e.fechaConfirmacionRecibidosAnexoXxxiXxxii == null) return null
        val ahora = Instant.now()
        if (e.fechaCreacionAnexo91 == null) {
            egresadoRepository.save(e.copy(fechaCreacionAnexo91 = ahora, fecha_actualizacion = ahora))
        }
        val destinatarioServicios =
            env.getProperty("sit.anexo91.destinatario-servicios-escolares")?.trim().orEmpty()
        val valores =
            construirValoresPlantillaHtml(
                e,
                listOf(
                    "MODALIDAD" to e.datos_proyecto.modalidad,
                    "FECHA_CARTA" to fechaCartaEspanola(ahora),
                    "TEXTO_OPCION_TI" to textoOpcionTitulacionIntegral(e.datos_proyecto.modalidad),
                    "DESTINATARIO_SERVICIOS_ESCOLARES" to
                        if (destinatarioServicios.isEmpty()) "\u200B" else destinatarioServicios,
                ),
            )
        return htmlAnexoPdfService.generarDesdeClasspath("templates/html/anexo-9-1.html", valores)
    }

    fun confirmarEntregaAnexo91(id: String): Boolean {
        val e = cargarEgresadoPorId(id) ?: return false
        if (e.fechaCreacionAnexo91 == null) return false
        if (e.fechaConfirmacionEntregaAnexo91 != null) return false
        val ahora = Instant.now()
        egresadoRepository.save(e.copy(fechaConfirmacionEntregaAnexo91 = ahora, fecha_actualizacion = ahora))
        return true
    }

    /** División de estudios registra la solicitud de constancia 9.2 al egresado (sin generar PDF aquí). */
    fun solicitarConstancia92Division(id: String): Boolean {
        val e = cargarEgresadoPorId(id) ?: return false
        if (e.fechaConfirmacionEntregaAnexo91 == null) return false
        if (e.fechaSolicitudAnexo92 != null) return false
        val ahora = Instant.now()
        egresadoRepository.save(
            e.copy(
                fechaSolicitudAnexo92 = ahora,
                fecha_actualizacion = ahora,
            ),
        )
        return true
    }

    fun crearAnexo92(id: String): ByteArray? {
        val e = cargarEgresadoPorId(id) ?: return null
        if (e.fechaConfirmacionEntregaAnexo91 == null) return null
        // Primera generación: exige solicitud previa de división. Re-descarga: si ya existe fecha de creación.
        if (e.fechaCreacionAnexo92 == null && e.fechaSolicitudAnexo92 == null) return null
        val ahora = Instant.now()
        if (e.fechaCreacionAnexo92 == null) {
            egresadoRepository.save(e.copy(fechaCreacionAnexo92 = ahora, fecha_actualizacion = ahora))
        }
        return generarPdfAnexo(
            titulo = "Anexo 9.2",
            templateProperty = "sit.anexo92.plantilla-docx",
            defaultTemplateClasspath = "templates/anexo-9-2.docx",
            e = e,
            extras = emptyList(),
        )
    }

    fun confirmarRecibidoAnexo92(id: String): Boolean {
        val e = cargarEgresadoPorId(id) ?: return false
        if (e.fechaSolicitudAnexo92 == null) return false
        if (e.fechaConfirmacionRecibidoAnexo92 != null) return false
        val ahora = Instant.now()
        egresadoRepository.save(e.copy(fechaConfirmacionRecibidoAnexo92 = ahora, fecha_actualizacion = ahora))
        return true
    }

    fun solicitarSinodales(id: String): Boolean {
        val e = cargarEgresadoPorId(id) ?: return false
        if (e.fechaConfirmacionRecibidoAnexo92 == null) return false
        if (e.fechaSolicitudSinodales != null) return false
        val ahora = Instant.now()
        egresadoRepository.save(e.copy(fechaSolicitudSinodales = ahora, fecha_actualizacion = ahora))
        return true
    }

    fun obtenerSinodales(id: String): SinodalesTribunal? {
        val e = cargarEgresadoPorId(id) ?: return null
        return e.sinodalesTribunal
    }

    fun asignarSinodales(id: String, presidente: String, secretario: String, vocal: String, vocalSuplente: String): Boolean {
        val e = cargarEgresadoPorId(id) ?: return false
        if (e.fechaSolicitudSinodales == null) return false
        val ahora = Instant.now()
        egresadoRepository.save(
            e.copy(
                sinodalesTribunal = SinodalesTribunal(
                    presidente = presidente.trim(),
                    secretario = secretario.trim(),
                    vocal = vocal.trim(),
                    vocal_suplente = vocalSuplente.trim(),
                ),
                fechaAsignacionSinodales = ahora,
                fecha_actualizacion = ahora,
            ),
        )
        return true
    }

    fun confirmarSinodalesRecibidos(id: String): Boolean {
        val e = cargarEgresadoPorId(id) ?: return false
        if (e.fechaSolicitudSinodales == null || e.fechaAsignacionSinodales == null) return false
        if (e.fechaConfirmacionSinodalesRecibidos != null) return false
        val ahora = Instant.now()
        egresadoRepository.save(e.copy(fechaConfirmacionSinodalesRecibidos = ahora, fecha_actualizacion = ahora))
        return true
    }

    fun crearAnexo93(id: String): ByteArray? {
        val e = cargarEgresadoPorId(id) ?: return null
        if (e.fechaAgendaActo93 == null) return null
        val ahora = Instant.now()
        if (e.fechaCreacionAnexo93 == null) {
            egresadoRepository.save(e.copy(fechaCreacionAnexo93 = ahora, fecha_actualizacion = ahora))
        }
        val zona = ZoneId.systemDefault()
        val acto = e.fechaAgendaActo93!!
        val actoLegible = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(zona).format(acto)
        val zActo = acto.atZone(zona)
        val diaActo = zActo.dayOfMonth.toString().padStart(2, '0')
        val mesActo =
            nombreMesEspanol(zActo.monthValue).uppercase(Locale.forLanguageTag("es-MX"))
        val anioActo = zActo.year.toString()
        val horaActo = String.format(Locale.ROOT, "%02d:%02d", zActo.hour, zActo.minute)
        val jefeDivisionNombre =
            env.getProperty("sit.anexo93.jefe-division-nombre", "HIBER YAIR AMBROCIO LÓPEZ").trim()
        val valores =
            construirValoresPlantillaHtml(
                e,
                listOf(
                    "ACTO_93" to actoLegible,
                    "FECHA_CARTA" to fechaCartaEspanolaAnexo93(Instant.now()),
                    "TEXTO_OPCION_TI" to textoOpcionTitulacionIntegral(e.datos_proyecto.modalidad),
                    "ACTO_DIA" to diaActo,
                    "ACTO_MES" to mesActo,
                    "ACTO_ANIO" to anioActo,
                    "ACTO_HORA" to horaActo,
                    "PRESIDENTE" to (e.sinodalesTribunal?.presidente ?: ""),
                    "SECRETARIO" to (e.sinodalesTribunal?.secretario ?: ""),
                    "VOCAL" to (e.sinodalesTribunal?.vocal ?: ""),
                    "VOCAL_SUPLENTE" to (e.sinodalesTribunal?.vocal_suplente ?: ""),
                    "JEFE_DIVISION_NOMBRE" to jefeDivisionNombre,
                ),
            )
        return htmlAnexoPdfService.generarDesdeClasspath("templates/html/anexo-9-3.html", valores)
    }

    fun agendarActo93(id: String, fechaHoraRaw: String): Boolean {
        val e = cargarEgresadoPorId(id) ?: return false
        if (e.fechaConfirmacionSinodalesRecibidos == null || e.fechaAgendaActo93 != null) return false

        val inicio = parseFechaHoraLocal(fechaHoraRaw) ?: return false
        val zona = ZoneId.systemDefault()
        val zInicio = inicio.atZone(zona)
        val diaSemana = zInicio.dayOfWeek.value
        if (diaSemana !in 1..5) return false

        val horaInicio = zInicio.toLocalTime()
        val horaFin = horaInicio.plusHours(1)
        val ventanaInicio = LocalTime.of(10, 0)
        val ventanaFin = LocalTime.of(14, 0)
        if (horaInicio < ventanaInicio || horaFin > ventanaFin) return false

        val fin = inicio.plus(1, ChronoUnit.HOURS)
        val candidates = egresadoRepository.findByFechaAgendaActo93Solapando(
            inicio.minus(1, ChronoUnit.HOURS),
            fin,
        )
        if (candidates.isNotEmpty()) return false

        val ahora = Instant.now()
        egresadoRepository.save(e.copy(fechaAgendaActo93 = inicio, fecha_actualizacion = ahora))
        return true
    }

    fun listarActo93Ocupados(): List<Instant> {
        val zona = ZoneId.systemDefault()
        val inicio = LocalDate.now(zona).minusMonths(1).atStartOfDay(zona).toInstant()
        val fin = LocalDate.now(zona).plusYears(2).atStartOfDay(zona).toInstant()
        return try {
            egresadoRepository.findActo93AgendadoEnRango(inicio, fin)
                .mapNotNull { it.fechaAgendaActo93 }
                .distinct()
                .sorted()
                .take(1500)
        } catch (e: Exception) {
            log.warn("listarActo93Ocupados: timeout/error consultando agenda 9.3: {}", e.message)
            emptyList()
        }
    }

    private fun toDetailDto(e: Egresado): EgresadoDetailDto {
        val p = e.datos_personales
        val doc = e.documentos
        val formatter = DateTimeFormatter.ISO_INSTANT
        return EgresadoDetailDto(
            id = e.id?.toString() ?: "",
            numero_control = e.numero_control,
            datos_personales = DatosPersonalesDto(
                nombre = p.nombre,
                apellido_paterno = p.apellido_paterno,
                apellido_materno = p.apellido_materno ?: "",
                carrera = p.carrera,
                nivel = p.nivel,
                direccion = p.direccion,
                telefono = p.telefono,
                correo_electronico = p.correo_electronico,
            ),
            datos_proyecto = DatosProyectoDto(
                nombre_proyecto = e.datos_proyecto.nombre_proyecto,
                modalidad = e.datos_proyecto.modalidad,
                curso_titulacion = e.datos_proyecto.curso_titulacion,
                asesor_interno = e.datos_proyecto.asesor_interno,
                asesor_externo = e.datos_proyecto.asesor_externo,
                director = e.datos_proyecto.director,
                asesor_1 = e.datos_proyecto.asesor_1,
                asesor_2 = e.datos_proyecto.asesor_2,
            ),
            documentos = DocumentosDto(
                anexo_xxxi = doc.anexo_xxxi.let { AnexoDto(it.fecha_registro?.let { formatter.format(it) }, it.estado) },
                constancia_no_inconveniencia = doc.constancia_no_inconveniencia.let { ConstanciaDto(it.fecha_expedicion?.let { formatter.format(it) }, it.estado) },
            ),
            documento_adjunto = e.documento_adjunto.let { adj ->
                if (adj.nombre_original.isNotBlank() || adj.tamanio_bytes > 0) {
                    DocumentoAdjuntoDto(nombre_original = adj.nombre_original, tamanio_bytes = adj.tamanio_bytes)
                } else null
            },
            estado_general = e.estado_general,
            fecha_creacion = e.fechaCreacion.let { formatter.format(it) },
            fecha_actualizacion = e.fecha_actualizacion.let { formatter.format(it) },
            fecha_enviado_departamento_academico = e.fechaEnviadoDepartamentoAcademico?.let { formatter.format(it) },
            fecha_recibido_registro_liberacion = e.fechaRecibidoRegistroLiberacion?.let { formatter.format(it) },
            fecha_confirmacion_recibidos_anexo_xxxi_xxxii = e.fechaConfirmacionRecibidosAnexoXxxiXxxii?.let { formatter.format(it) },
            fecha_creacion_anexo_9_1 = e.fechaCreacionAnexo91?.let { formatter.format(it) },
            fecha_confirmacion_entrega_anexo_9_1 = e.fechaConfirmacionEntregaAnexo91?.let { formatter.format(it) },
            fecha_solicitud_anexo_9_2 = e.fechaSolicitudAnexo92?.let { formatter.format(it) },
            fecha_creacion_anexo_9_2 = e.fechaCreacionAnexo92?.let { formatter.format(it) },
            fecha_confirmacion_recibido_anexo_9_2 = e.fechaConfirmacionRecibidoAnexo92?.let { formatter.format(it) },
            fecha_solicitud_sinodales = e.fechaSolicitudSinodales?.let { formatter.format(it) },
            fecha_asignacion_sinodales = e.fechaAsignacionSinodales?.let { formatter.format(it) },
            fecha_confirmacion_sinodales_recibidos = e.fechaConfirmacionSinodalesRecibidos?.let { formatter.format(it) },
            fecha_agenda_acto_9_3 = e.fechaAgendaActo93?.let { formatter.format(it) },
            fecha_creacion_anexo_9_3 = e.fechaCreacionAnexo93?.let { formatter.format(it) },
        )
    }

    private fun subirArchivo(archivo: MultipartFile): ObjectId {
        val id = gridFsTemplate.store(
            archivo.inputStream,
            archivo.originalFilename ?: "documento",
            archivo.contentType ?: "application/octet-stream",
            null,
        )
        return id as ObjectId
    }

    private fun parseFecha(s: String?): Instant? {
        if (s.isNullOrBlank()) return null
        return try {
            LocalDate.parse(s).atStartOfDay(ZoneOffset.UTC).toInstant()
        } catch (_: DateTimeParseException) {
            null
        }
    }

    private fun parseFechaHoraLocal(s: String?): Instant? {
        if (s.isNullOrBlank()) return null
        return try {
            LocalDateTime.parse(s.trim()).atZone(ZoneId.systemDefault()).toInstant()
        } catch (_: Exception) {
            null
        }
    }

    private fun cargarEgresadoPorId(id: String): Egresado? {
        val objectId = try {
            ObjectId(id)
        } catch (_: Exception) {
            return null
        }
        return try {
            egresadoRepository.findByObjectIdConTimeout(objectId)
        } catch (e: Exception) {
            log.warn("cargarEgresadoPorId: timeout/error consultando id={}: {}", id, e.message)
            null
        }
    }

    private fun esResidenciaProfesional(e: Egresado): Boolean =
        e.datos_proyecto.modalidad.trim().equals("Residencia Profesional", ignoreCase = true)

    private fun ultimaRevisionResultado(e: Egresado): String? {
        val oid = e.id ?: return null
        return revisionService.ultimaRevision(oid)?.resultado
    }

    /** No residencia: última revisión académica con observaciones y aún sin “liberación/aprobación” en expediente. */
    private fun enCorreccionAcademico(e: Egresado): Boolean =
        !esResidenciaProfesional(e) && ultimaRevisionResultado(e) == "observaciones"

    private fun estadoRevisionDepartamento(e: Egresado): String {
        if (e.fechaRecibidoRegistroLiberacion != null) return "aprobado"
        if (enCorreccionAcademico(e)) return "con_observaciones"
        return "pendiente"
    }

    private fun nombreCompleto(e: Egresado): String =
        listOf(e.datos_personales.nombre, e.datos_personales.apellido_paterno, e.datos_personales.apellido_materno)
            .filter { !it.isNullOrBlank() }
            .joinToString(" ")
            .ifBlank { e.numero_control }

    /** Valores para plantillas HTML (9.1 y 9.3): fecha legible en zona local. */
    private fun construirValoresPlantillaHtml(e: Egresado, extras: List<Pair<String, String>>): Map<String, String> {
        val fmt = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(ZoneId.systemDefault())
        val valores =
            mutableMapOf(
                "NOMBRE" to nombreCompleto(e),
                "NUMERO_CONTROL" to e.numero_control,
                "CARRERA" to e.datos_personales.carrera,
                "NIVEL" to e.datos_personales.nivel.trim().ifBlank { "—" },
                "PROYECTO" to e.datos_proyecto.nombre_proyecto,
                "FECHA_GENERACION" to fmt.format(Instant.now()),
            )
        for ((k, v) in extras) valores[k] = v
        expandirAliasPlantilla(valores)
        return valores
    }

    private fun fechaCartaEspanola(instant: Instant): String {
        val z = instant.atZone(ZoneId.systemDefault())
        val mes = nombreMesEspanol(z.monthValue).uppercase(Locale.forLanguageTag("es-MX"))
        return "${z.dayOfMonth} de $mes de ${z.year}"
    }

    /** Fecha en encabezado del Anexo 9.3: “01 de Julio del 2021” (mes en formato título, “del” antes del año). */
    private fun fechaCartaEspanolaAnexo93(instant: Instant): String {
        val z = instant.atZone(ZoneId.systemDefault())
        val mes = nombreMesEspanol(z.monthValue)
        val dia = z.dayOfMonth.toString().padStart(2, '0')
        return "$dia de $mes del ${z.year}"
    }

    private fun nombreMesEspanol(monthValue1to12: Int): String {
        val meses =
            listOf(
                "enero", "febrero", "marzo", "abril", "mayo", "junio",
                "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
            )
        val m = meses.getOrElse(monthValue1to12 - 1) { "—" }
        return m.replaceFirstChar { it.uppercaseChar() }
    }

    /** Texto entre paréntesis tras “Titulación integral” en formatos ITVO. */
    private fun textoOpcionTitulacionIntegral(modalidad: String): String {
        val m = modalidad.trim().lowercase(Locale.ROOT)
        return when {
            m.contains("residencia") -> "REPORTE FINAL DE RESIDENCIA PROFESIONAL"
            m.contains("tesina") -> "TESINA"
            m.contains("ceneval") -> "EXAMEN CENEVAL"
            else -> modalidad.uppercase(Locale.forLanguageTag("es-MX"))
        }
    }

    private fun generarPdfAnexo(
        titulo: String,
        templateProperty: String,
        defaultTemplateClasspath: String,
        e: Egresado,
        extras: List<Pair<String, String>>,
    ): ByteArray? {
        val valores = mutableMapOf(
            "NOMBRE" to nombreCompleto(e),
            "NUMERO_CONTROL" to e.numero_control,
            "CARRERA" to e.datos_personales.carrera,
            "PROYECTO" to e.datos_proyecto.nombre_proyecto,
            "FECHA_GENERACION" to DateTimeFormatter.ISO_INSTANT.format(Instant.now()),
        )
        for ((k, v) in extras) valores[k] = v
        expandirAliasPlantilla(valores)

        val docxTemplate = cargarPlantillaDocx(templateProperty, defaultTemplateClasspath)
        if (docxTemplate == null) {
            log.warn(
                "No se pudo cargar la plantilla DOCX para {}: revisa la propiedad {} (ruta absoluta al .docx) o el recurso en classpath {}.",
                titulo,
                templateProperty,
                defaultTemplateClasspath,
            )
            return null
        }
        val pdfPlantilla = convertirDocxTemplateAPdf(docxTemplate, valores)
        if (pdfPlantilla != null) return pdfPlantilla
        log.warn(
            "LibreOffice no generó PDF para {}. Revisa que LibreOffice esté instalado y sit.soffice.path apunte a soffice/soffice.exe.",
            titulo,
        )
        return null
    }

    private fun cargarPlantillaDocx(templateProperty: String, defaultTemplateClasspath: String): ByteArray? {
        val rutaConfig = env.getProperty(templateProperty)?.trim().orEmpty()
        if (rutaConfig.isNotEmpty()) {
            try {
                val path = Paths.get(rutaConfig)
                if (Files.isRegularFile(path)) return Files.readAllBytes(path)
            } catch (_: Exception) { /* continuar */ }
            val f = File(rutaConfig)
            if (f.exists() && f.isFile) return Files.readAllBytes(f.toPath())
            log.warn("Plantilla configurada no existe o no es legible: {}={}", templateProperty, rutaConfig)
        }
        return try {
            ClassPathResource(defaultTemplateClasspath).inputStream.use { it.readBytes() }
        } catch (_: Exception) {
            null
        }
    }

    private fun ejecutarLibreOfficeConvert(soffice: Array<String>, tmpDir: File, docxFile: File, pdfFile: File, conPerfilAislado: Boolean): Boolean {
        val args = mutableListOf(*soffice, "--headless")
        if (conPerfilAislado) {
            args.add("-env:UserInstallation=file:///${tmpDir.absolutePath.replace('\\', '/')}/lo-profile")
        }
        args.addAll(listOf("--convert-to", "pdf:writer_pdf_Export", "--outdir", tmpDir.absolutePath, docxFile.absolutePath))
        return try {
            val proc = ProcessBuilder(args).redirectErrorStream(true).start()
            val salida = proc.inputStream.use { stream ->
                String(stream.readAllBytes(), StandardCharsets.UTF_8)
            }
            val termino = proc.waitFor(90, TimeUnit.SECONDS)
            val exit = if (termino) proc.exitValue() else -1
            val ok = termino && exit == 0 && pdfFile.exists()
            if (!ok) {
                log.warn(
                    "LibreOffice (perfilAislado={}): exit={}, termino={}, exe={}, salida={}",
                    conPerfilAislado,
                    exit,
                    termino,
                    soffice.joinToString(),
                    salida.take(2000),
                )
            }
            ok
        } catch (ex: Exception) {
            log.warn("LibreOffice error: {}", ex.message)
            false
        }
    }

    private fun convertirDocxTemplateAPdf(docxBytes: ByteArray, valores: Map<String, String>): ByteArray? {
        val docxRellenado = reemplazarMarcadoresDocx(docxBytes, valores)
        val tmpDir = Files.createTempDirectory("sit-anexos-").toFile()
        val docxFile = File(tmpDir, "anexo.docx")
        val pdfFile = File(tmpDir, "anexo.pdf")
        val soffice = comandoSoffice()
        return try {
            Files.write(docxFile.toPath(), docxRellenado)
            when {
                ejecutarLibreOfficeConvert(soffice, tmpDir, docxFile, pdfFile, conPerfilAislado = true) -> Files.readAllBytes(pdfFile.toPath())
                ejecutarLibreOfficeConvert(soffice, tmpDir, docxFile, pdfFile, conPerfilAislado = false) -> Files.readAllBytes(pdfFile.toPath())
                else -> null
            }
        } catch (ex: Exception) {
            log.error("Error al convertir DOCX a PDF: {}", ex.message, ex)
            null
        } finally {
            pdfFile.delete()
            docxFile.delete()
            File(tmpDir, "lo-profile").deleteRecursively()
            tmpDir.delete()
        }
    }

    /** Ruta a soffice: propiedad, variable de entorno, rutas típicas en Windows, o PATH. */
    private fun comandoSoffice(): Array<String> {
        val prop = env.getProperty("sit.soffice.path")?.trim().orEmpty()
        if (prop.isNotEmpty() && File(prop).isFile) return arrayOf(prop)
        System.getenv("SIT_SOFFICE")?.trim()?.takeIf { it.isNotEmpty() && File(it).isFile() }?.let { return arrayOf(it) }
        if (System.getProperty("os.name", "").lowercase().contains("win")) {
            listOf(
                """C:\Program Files\LibreOffice\program\soffice.exe""",
                """C:\Program Files (x86)\LibreOffice\program\soffice.exe""",
            ).firstOrNull { File(it).isFile }?.let { return arrayOf(it) }
        }
        return arrayOf("soffice")
    }

    /** Igual nombre de campo en plantillas ITVO / variaciones. */
    private fun expandirAliasPlantilla(valores: MutableMap<String, String>) {
        val nombre = valores["NOMBRE"].orEmpty()
        val control = valores["NUMERO_CONTROL"].orEmpty()
        val carrera = valores["CARRERA"].orEmpty()
        val proyecto = valores["PROYECTO"].orEmpty()
        valores.putIfAbsent("NOMBRE_COMPLETO", nombre)
        valores.putIfAbsent("NOMBRE_ALUMNO", nombre)
        valores.putIfAbsent("ALUMNO", nombre)
        valores.putIfAbsent("CONTROL", control)
        valores.putIfAbsent("NO_CONTROL", control)
        valores.putIfAbsent("NUMERO_DE_CONTROL", control)
        valores.putIfAbsent("CARRERA_COMPLETA", carrera)
        valores.putIfAbsent("NOMBRE_PROYECTO", proyecto)
    }

    /**
     * Reemplaza marcadores sin reescribir el DOCX con POI (evita romper el formato de plantillas complejas).
     * Procesa los XML del paquete Office Open XML.
     */
    private fun reemplazarMarcadoresDocx(docxBytes: ByteArray, valores: Map<String, String>): ByteArray {
        return try {
            reemplazarMarcadoresEnZipDocx(docxBytes, valores)
        } catch (ex: Exception) {
            log.warn("Reemplazo por ZIP falló ({}), se intenta Apache POI.", ex.message)
            reemplazarMarcadoresDocxPoi(docxBytes, valores)
        }
    }

    private fun esXmlWordParaMarcadores(entryName: String): Boolean {
        if (!entryName.startsWith("word/") || !entryName.endsWith(".xml")) return false
        val base = entryName.removePrefix("word/").substringBefore(".xml")
        return base == "document" ||
            base.startsWith("header") ||
            base.startsWith("footer") ||
            base == "footnotes" ||
            base == "endnotes"
    }

    private fun escapeXmlTextoContenido(s: String): String =
        s.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")

    private fun aplicarMarcadoresEnTextoXml(original: String, valores: Map<String, String>): String {
        var texto = original
        valores.forEach { (k, v) ->
            val safe = escapeXmlTextoContenido(v.ifBlank { "—" })
            texto = texto.replace("{{$k}}", safe, ignoreCase = true)
            texto = texto.replace("$" + "{" + k + "}", safe, ignoreCase = true)
            texto = texto.replace("<<$k>>", safe, ignoreCase = true)
            texto = texto.replace("[$k]", safe, ignoreCase = true)
        }
        return texto
    }

    private fun reemplazarMarcadoresEnZipDocx(docxBytes: ByteArray, valores: Map<String, String>): ByteArray {
        val outBytes = ByteArrayOutputStream()
        ZipOutputStream(outBytes).use { zOut ->
            ZipInputStream(ByteArrayInputStream(docxBytes)).use { zIn ->
                var entry = zIn.nextEntry
                while (entry != null) {
                    val name = entry.name
                    val raw = zIn.readAllBytes()
                    val processed =
                        if (!entry.isDirectory && esXmlWordParaMarcadores(name)) {
                            val xml = String(raw, StandardCharsets.UTF_8)
                            aplicarMarcadoresEnTextoXml(xml, valores).toByteArray(StandardCharsets.UTF_8)
                        } else {
                            raw
                        }
                    val ze = ZipEntry(name)
                    ze.time = entry.time
                    zOut.putNextEntry(ze)
                    zOut.write(processed)
                    zOut.closeEntry()
                    entry = zIn.nextEntry
                }
            }
        }
        return outBytes.toByteArray()
    }

    private fun reemplazarMarcadoresDocxPoi(docxBytes: ByteArray, valores: Map<String, String>): ByteArray {
        val out = ByteArrayOutputStream()
        XWPFDocument(ByteArrayInputStream(docxBytes)).use { doc ->
            fun textoParrafo(p: org.apache.poi.xwpf.usermodel.XWPFParagraph): String =
                buildString { p.runs.forEach { r -> append(r.getText(0) ?: "") } }

            fun reemplazarParrafo(p: org.apache.poi.xwpf.usermodel.XWPFParagraph) {
                val original = textoParrafo(p)
                if (original.isBlank()) return
                var texto = original
                valores.forEach { (k, v) ->
                    val valSafe = v.ifBlank { "—" }
                    texto = texto
                        .replace("{{$k}}", valSafe, ignoreCase = true)
                        .replace("$" + "{" + k + "}", valSafe, ignoreCase = true)
                        .replace("<<$k>>", valSafe, ignoreCase = true)
                }
                if (texto == original) return
                while (p.runs.isNotEmpty()) p.removeRun(0)
                p.createRun().setText(texto, 0)
            }

            doc.paragraphs.forEach(::reemplazarParrafo)
            doc.tables.forEach { t ->
                t.rows.forEach { r ->
                    r.tableCells.forEach { c ->
                        c.paragraphs.forEach(::reemplazarParrafo)
                    }
                }
            }
            doc.write(out)
        }
        return out.toByteArray()
    }

}
