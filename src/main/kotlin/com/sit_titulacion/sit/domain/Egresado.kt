package com.sit_titulacion.sit.domain

import org.bson.types.ObjectId
import org.springframework.data.annotation.Id
import org.springframework.data.mongodb.core.mapping.Document
import org.springframework.data.mongodb.core.mapping.Field
import java.time.Instant

@Document(collection = "registro")
data class Egresado(
    @Id val id: ObjectId? = null,
    val numero_control: String,
    val datos_personales: DatosPersonales,
    val datos_proyecto: DatosProyecto,
    val documentos: Documentos,
    val documento_adjunto: DocumentoAdjunto = DocumentoAdjunto(),
    val estado_general: String = "registrado",
    val historial_estados: List<HistorialEstado> = emptyList(),
    @Field("fecha_creacion") val fechaCreacion: Instant = Instant.now(),
    val fecha_actualizacion: Instant = Instant.now(),
    /** Cuando se envía al departamento académico (paso 1.1 del seguimiento). */
    @Field("fecha_enviado_departamento_academico") val fechaEnviadoDepartamentoAcademico: Instant? = null,
    /** Cuando el departamento académico recibe registro y liberación (paso 2; se marca al guardar egresado). */
    @Field("fecha_recibido_registro_liberacion") val fechaRecibidoRegistroLiberacion: Instant? = null,
    /** Cuando División de estudios confirma "Recibidos anexo XXXI y XXXII" (paso 2 confirmado). */
    @Field("fecha_confirmacion_recibidos_anexo_xxxi_xxxii") val fechaConfirmacionRecibidosAnexoXxxiXxxii: Instant? = null,
    /** Cuando División de estudios crea/descarga el Anexo 9.1 (paso 3). */
    @Field("fecha_creacion_anexo_9_1") val fechaCreacionAnexo91: Instant? = null,
    /** Egresado confirma entrega del anexo 9.1 al departamento. */
    @Field("fecha_confirmacion_entrega_anexo_9_1") val fechaConfirmacionEntregaAnexo91: Instant? = null,
    /** Generación/descarga de constancia 9.2 desde plantilla (antes de confirmar recibido). */
    @Field("fecha_creacion_anexo_9_2") val fechaCreacionAnexo92: Instant? = null,
    /** Egresado confirma recibido constancia 9.2. */
    @Field("fecha_confirmacion_recibido_anexo_9_2") val fechaConfirmacionRecibidoAnexo92: Instant? = null,
    @Field("fecha_solicitud_sinodales") val fechaSolicitudSinodales: Instant? = null,
    /** Nombres completos del tribunal asignados por departamento académico (subdocumento). */
    @Field("sinodales_tribunal") val sinodalesTribunal: SinodalesTribunal? = null,
    @Field("fecha_asignacion_sinodales") val fechaAsignacionSinodales: Instant? = null,
    @Field("fecha_confirmacion_sinodales_recibidos") val fechaConfirmacionSinodalesRecibidos: Instant? = null,
    /** Fecha y hora agendada del acto 9.3. */
    @Field("fecha_agenda_acto_9_3") val fechaAgendaActo93: Instant? = null,
    @Field("fecha_creacion_anexo_9_3") val fechaCreacionAnexo93: Instant? = null,
)
