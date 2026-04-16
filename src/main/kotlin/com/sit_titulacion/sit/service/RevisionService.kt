package com.sit_titulacion.sit.service

import com.sit_titulacion.sit.domain.Revision
import com.sit_titulacion.sit.repository.EgresadoRepository
import com.sit_titulacion.sit.repository.RevisionRepository
import com.sit_titulacion.sit.web.api.dto.CreateRevisionRequestDto
import com.sit_titulacion.sit.web.api.dto.RevisionDto
import java.time.Instant
import java.time.format.DateTimeFormatter
import org.bson.types.ObjectId
import org.springframework.stereotype.Service

@Service
class RevisionService(
    private val revisionRepository: RevisionRepository,
    private val egresadoRepository: EgresadoRepository,
) {
    private val formatter = DateTimeFormatter.ISO_INSTANT

    fun crear(egresadoId: String, body: CreateRevisionRequestDto, revisadoPor: String): RevisionDto? {
        val oid = try { ObjectId(egresadoId) } catch (_: Exception) { return null }
        if (!egresadoRepository.existsById(oid)) return null
        val siguiente = (revisionRepository.countByEgresadoId(oid) + 1).toInt()
        val rev = Revision(
            egresadoId = oid,
            numeroRevision = siguiente,
            revisadoPor = revisadoPor,
            resultado = body.resultado.trim().lowercase().takeIf { it in listOf("observaciones", "aprobado") } ?: "observaciones",
            observaciones = body.observaciones?.trim()?.takeIf { it.isNotBlank() },
        )
        val guardada = revisionRepository.save(rev)
        if (guardada.resultado == "aprobado") {
            val eg = egresadoRepository.findById(oid).orElse(null)
            if (eg != null) {
                val esResidencia =
                    eg.datos_proyecto.modalidad.trim().equals("Residencia Profesional", ignoreCase = true)
                if (!esResidencia &&
                    eg.fechaEnviadoDepartamentoAcademico != null &&
                    eg.fechaRecibidoRegistroLiberacion == null
                ) {
                    val ahora = Instant.now()
                    egresadoRepository.save(
                        eg.copy(
                            fechaRecibidoRegistroLiberacion = ahora,
                            fecha_actualizacion = ahora,
                        ),
                    )
                }
            }
        }
        return toDto(guardada)
    }

    fun listarPorEgresado(egresadoId: String): List<RevisionDto> {
        val oid = try { ObjectId(egresadoId) } catch (_: Exception) { return emptyList() }
        return revisionRepository.findByEgresadoIdOrderByNumeroRevisionDesc(oid).map { toDto(it) }
    }

    fun ultimaRevision(egresadoId: ObjectId): Revision? =
        revisionRepository.findByEgresadoIdOrderByNumeroRevisionDesc(egresadoId).firstOrNull()

    private fun toDto(r: Revision) = RevisionDto(
        id = r.id?.toHexString() ?: "",
        egresadoId = r.egresadoId.toHexString(),
        numeroRevision = r.numeroRevision,
        fecha = formatter.format(r.fecha),
        revisadoPor = r.revisadoPor,
        resultado = r.resultado,
        observaciones = r.observaciones,
    )
}
