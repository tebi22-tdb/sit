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
import java.nio.file.Files
import java.time.Instant
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.time.ZoneOffset
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
    private val gridFsTemplate: GridFsTemplate,
    private val env: Environment,
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

    fun contarParaDepartamento(): Map<String, Int> {
        val all = egresadoRepository.findAll()
        val pendientes = all.count { it.fechaEnviadoDepartamentoAcademico != null && it.fechaRecibidoRegistroLiberacion == null }
        val aprobados = all.count { it.fechaRecibidoRegistroLiberacion != null }
        val todos = all.count { it.fechaEnviadoDepartamentoAcademico != null }
        val sinodales = all.count { it.fechaSolicitudSinodales != null && it.fechaConfirmacionSinodalesRecibidos == null }
        return mapOf(
            "pendientes" to pendientes,
            "aprobados" to aprobados,
            "todos" to todos,
            "sinodales_por_asignar" to sinodales,
        )
    }

    fun listarParaDepartamento(estado: String): List<DepartamentoListItemDto> {
        val all = egresadoRepository.findAll()
        val lista = when (estado.trim().lowercase()) {
            "aprobados" -> all.filter { it.fechaRecibidoRegistroLiberacion != null }
            "sinodales" -> all.filter { it.fechaSolicitudSinodales != null && it.fechaConfirmacionSinodalesRecibidos == null }
            "todos" -> all.filter { it.fechaEnviadoDepartamentoAcademico != null }
            else -> all.filter { it.fechaEnviadoDepartamentoAcademico != null && it.fechaRecibidoRegistroLiberacion == null }
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
                estadoRevision = if (e.fechaRecibidoRegistroLiberacion != null) "aprobado" else "pendiente",
                fechaSolicitudSinodales = e.fechaSolicitudSinodales?.let { formatter.format(it) },
                sinodalesAsignados = e.fechaAsignacionSinodales != null,
            )
        }
    }

    fun obtenerPorId(id: String): EgresadoDetailDto? {
        val objectId = try {
            ObjectId(id)
        } catch (_: Exception) {
            return null
        }
        return egresadoRepository.findById(objectId).orElse(null)?.let { toDetailDto(it) }
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
        if (!esResidenciaProfesional(e)) return false
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
        if (!esResidenciaProfesional(e)) return null
        if (e.fechaConfirmacionRecibidosAnexoXxxiXxxii == null) return null
        val ahora = Instant.now()
        if (e.fechaCreacionAnexo91 == null) {
            egresadoRepository.save(e.copy(fechaCreacionAnexo91 = ahora, fecha_actualizacion = ahora))
        }
        return generarPdfAnexo(
            titulo = "Anexo 9.1",
            templateProperty = "sit.anexo91.plantilla-docx",
            defaultTemplateClasspath = "templates/ITVO-AC-PR-05-02-Solicitud-del-Acto-de-Recepcion-Profesional.docx",
            e = e,
            extras = listOf("MODALIDAD" to e.datos_proyecto.modalidad),
        )
    }

    fun confirmarEntregaAnexo91(id: String): Boolean {
        val e = cargarEgresadoPorId(id) ?: return false
        if (!esResidenciaProfesional(e)) return false
        if (e.fechaCreacionAnexo91 == null) return false
        if (e.fechaConfirmacionEntregaAnexo91 != null) return false
        val ahora = Instant.now()
        egresadoRepository.save(e.copy(fechaConfirmacionEntregaAnexo91 = ahora, fecha_actualizacion = ahora))
        return true
    }

    fun crearAnexo92(id: String): ByteArray? {
        val e = cargarEgresadoPorId(id) ?: return null
        if (!esResidenciaProfesional(e)) return null
        if (e.fechaConfirmacionEntregaAnexo91 == null) return null
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
        if (!esResidenciaProfesional(e)) return false
        if (e.fechaCreacionAnexo92 == null) return false
        if (e.fechaConfirmacionRecibidoAnexo92 != null) return false
        val ahora = Instant.now()
        egresadoRepository.save(e.copy(fechaConfirmacionRecibidoAnexo92 = ahora, fecha_actualizacion = ahora))
        return true
    }

    fun solicitarSinodales(id: String): Boolean {
        val e = cargarEgresadoPorId(id) ?: return false
        if (!esResidenciaProfesional(e)) return false
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
        if (!esResidenciaProfesional(e)) return false
        if (e.fechaSolicitudSinodales == null || e.fechaAsignacionSinodales == null) return false
        if (e.fechaConfirmacionSinodalesRecibidos != null) return false
        val ahora = Instant.now()
        egresadoRepository.save(e.copy(fechaConfirmacionSinodalesRecibidos = ahora, fecha_actualizacion = ahora))
        return true
    }

    fun crearAnexo93(id: String): ByteArray? {
        val e = cargarEgresadoPorId(id) ?: return null
        if (!esResidenciaProfesional(e)) return null
        if (e.fechaAgendaActo93 == null) return null
        val ahora = Instant.now()
        if (e.fechaCreacionAnexo93 == null) {
            egresadoRepository.save(e.copy(fechaCreacionAnexo93 = ahora, fecha_actualizacion = ahora))
        }
        return generarPdfAnexo(
            titulo = "Anexo 9.3",
            templateProperty = "sit.anexo93.plantilla-docx",
            defaultTemplateClasspath = "templates/anexo-9-3.docx",
            e = e,
            extras = listOf(
                "ACTO_93" to DateTimeFormatter.ISO_INSTANT.format(e.fechaAgendaActo93),
                "PRESIDENTE" to (e.sinodalesTribunal?.presidente ?: ""),
                "SECRETARIO" to (e.sinodalesTribunal?.secretario ?: ""),
                "VOCAL" to (e.sinodalesTribunal?.vocal ?: ""),
                "VOCAL_SUPLENTE" to (e.sinodalesTribunal?.vocal_suplente ?: ""),
            ),
        )
    }

    fun agendarActo93(id: String, fechaHoraRaw: String): Boolean {
        val e = cargarEgresadoPorId(id) ?: return false
        if (!esResidenciaProfesional(e)) return false
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

    fun listarActo93Ocupados(): List<Instant> =
        egresadoRepository.findConActo93Agendado()
            .mapNotNull { it.fechaAgendaActo93 }
            .sorted()

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
        return egresadoRepository.findById(objectId).orElse(null)
    }

    private fun esResidenciaProfesional(e: Egresado): Boolean =
        e.datos_proyecto.modalidad.trim().equals("Residencia Profesional", ignoreCase = true)

    private fun nombreCompleto(e: Egresado): String =
        listOf(e.datos_personales.nombre, e.datos_personales.apellido_paterno, e.datos_personales.apellido_materno)
            .filter { !it.isNullOrBlank() }
            .joinToString(" ")
            .ifBlank { e.numero_control }

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

        val docxTemplate = cargarPlantillaDocx(templateProperty, defaultTemplateClasspath)
        if (docxTemplate != null) {
            val pdfPlantilla = convertirDocxTemplateAPdf(docxTemplate, valores)
            if (pdfPlantilla != null) return pdfPlantilla
            log.error("No se pudo convertir plantilla DOCX de {} a PDF.", titulo)
            return null
        } else {
            log.error("No se encontró plantilla DOCX para {}.", titulo)
            return null
        }
    }

    private fun cargarPlantillaDocx(templateProperty: String, defaultTemplateClasspath: String): ByteArray? {
        val rutaConfig = env.getProperty(templateProperty)?.trim().orEmpty()
        if (rutaConfig.isNotEmpty()) {
            val f = File(rutaConfig)
            if (f.exists() && f.isFile) return Files.readAllBytes(f.toPath())
            log.warn("Plantilla configurada no existe: {}={}", templateProperty, rutaConfig)
        }
        return try {
            ClassPathResource(defaultTemplateClasspath).inputStream.use { it.readBytes() }
        } catch (_: Exception) {
            null
        }
    }

    private fun convertirDocxTemplateAPdf(docxBytes: ByteArray, valores: Map<String, String>): ByteArray? {
        val docxRellenado = reemplazarMarcadoresDocx(docxBytes, valores)
        val tmpDir = Files.createTempDirectory("sit-anexos-").toFile()
        val docxFile = File(tmpDir, "anexo.docx")
        val pdfFile = File(tmpDir, "anexo.pdf")
        return try {
            Files.write(docxFile.toPath(), docxRellenado)
            val proc = ProcessBuilder(
                "soffice",
                "--headless",
                "--convert-to",
                "pdf:writer_pdf_Export",
                "--outdir",
                tmpDir.absolutePath,
                docxFile.absolutePath,
            )
                .redirectErrorStream(true)
                .start()
            val ok = proc.waitFor(90, java.util.concurrent.TimeUnit.SECONDS) && proc.exitValue() == 0
            if (!ok || !pdfFile.exists()) return null
            Files.readAllBytes(pdfFile.toPath())
        } catch (_: Exception) {
            null
        } finally {
            pdfFile.delete()
            docxFile.delete()
            tmpDir.delete()
        }
    }

    private fun reemplazarMarcadoresDocx(docxBytes: ByteArray, valores: Map<String, String>): ByteArray {
        val out = ByteArrayOutputStream()
        XWPFDocument(ByteArrayInputStream(docxBytes)).use { doc ->
            doc.paragraphs.forEach { p -> reemplazarTextoParrafo(p.text ?: "", p, valores) }
            doc.tables.forEach { t ->
                t.rows.forEach { r ->
                    r.tableCells.forEach { c ->
                        c.paragraphs.forEach { p -> reemplazarTextoParrafo(p.text ?: "", p, valores) }
                    }
                }
            }
            doc.write(out)
        }
        return out.toByteArray()
    }

    private fun reemplazarTextoParrafo(textoOriginal: String, parrafo: org.apache.poi.xwpf.usermodel.XWPFParagraph, valores: Map<String, String>) {
        if (textoOriginal.isBlank()) return
        var texto = textoOriginal
        valores.forEach { (k, v) ->
            val valSafe = v.ifBlank { "—" }
            texto = texto
                .replace("{{$k}}", valSafe, ignoreCase = true)
                .replace("\${$k}", valSafe, ignoreCase = true)
                .replace("<<$k>>", valSafe, ignoreCase = true)
        }
        if (texto == textoOriginal) return
        while (parrafo.runs.size > 0) parrafo.removeRun(0)
        parrafo.createRun().setText(texto, 0)
    }

}
