import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../layout/header/header.component';
import { EgresadoService, EgresadoDetail, RevisionApi } from '../../services/egresado.service';
import { calcularVistaPlazosNoResidencia } from '../../core/plazos-titulacion-no-residencia';

/** Paso mostrado al alumno (solo lectura). */
export interface PasoAlumnoVista {
  numero: number;
  titulo: string;
  detalle: string;
  /** Si existe, se muestra en negrita después del detalle (p. ej. fecha/hora del acto). */
  fechaDetalleResaltada?: string;
  fecha: string;
  completado: boolean;
  activo: boolean;
}

type EstadoAvance = 'en_tiempo' | 'rezagado' | 'vencido';

const MARGEN_REZAGO_DIAS = 30;

function diasPlazoPorModalidad(modalidad: string): number {
  const m = modalidad.trim().toLowerCase();
  if (m === 'residencia profesional') return 183;
  if (m === 'tesina' || m === 'ceneval') return 365;
  return 548;
}

function inicioDiaLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function diffDiasCalendario(fechaFin: Date, fechaInicio: Date): number {
  const ms = inicioDiaLocal(fechaFin).getTime() - inicioDiaLocal(fechaInicio).getTime();
  return Math.round(ms / 86400000);
}

function sumarDiasCalendario(base: Date, dias: number): Date {
  const d = inicioDiaLocal(base);
  d.setDate(d.getDate() + dias);
  return d;
}

@Component({
  selector: 'app-seguimiento',
  standalone: true,
  imports: [CommonModule, HeaderComponent],
  templateUrl: './seguimiento.component.html',
  styleUrl: './seguimiento.component.css',
})
export class SeguimientoComponent implements OnInit {
  datos: EgresadoDetail | null = null;
  cargando = true;
  error = '';
  cargandoRevisionesEnviadas = false;
  revisionesEnviadas: RevisionApi[] = [];
  mostrarPanelRevisiones = false;
  errorDescargaRevision = '';
  private revisionesExpandidas = new Set<string>();

  archivosPdfEscaneados: File[] = [];
  enviandoDocEscaneada = false;
  mensajeDocEscaneada = '';

  get revisionesParaCorregir(): RevisionApi[] {
    return this.revisionesEnviadas.filter((r) => r.resultado === 'observaciones');
  }

  get totalRevisionesPendientes(): number {
    return this.revisionesParaCorregir.length;
  }

  get tieneRevisionesPendientes(): boolean {
    return this.totalRevisionesPendientes > 0;
  }

  get etapaRevisionesCompletada(): boolean {
    // Si ya existe el paso 4 (anexo 9.1), el flujo de revisiones iniciales ya quedó atrás.
    return !!this.datos?.fecha_creacion_anexo_9_1;
  }

  get resumenRevisionesPaso(): string {
    if (this.etapaRevisionesCompletada) return 'Revisiones completadas.';
    const total = this.totalRevisionesPendientes;
    if (total <= 0) return 'Sin revisiones pendientes.';
    if (total === 1) return '1 revisión pendiente de atender.';
    return `${total} revisiones pendientes de atender.`;
  }

  get esResidenciaProfesional(): boolean {
    const m = this.datos?.datos_proyecto?.modalidad?.trim() ?? '';
    return m.toLowerCase() === 'residencia profesional';
  }

  /** Formulario de PDF: solo cuando el paso 13 es el paso actual del timeline (solicitud hecha, aún sin envío). */
  get mostrarFormularioSubidaDocEscaneada(): boolean {
    const d = this.datos;
    if (!d?.fecha_solicitud_documentacion_escaneada) return false;
    if (d.fecha_envio_documentacion_escaneada_egresado) return false;
    if (d.fecha_confirmacion_documentacion_escaneada_recibida) return false;
    const p13 = this.pasosAlumno.find((p) => p.numero === 13);
    return !!p13 && p13.activo && !p13.completado;
  }

  /** Mensaje “enviado, esperando DEP”: cuando el paso 14 es el actual. */
  get mostrarEstadoDocEscaneadaEnviada(): boolean {
    const d = this.datos;
    if (!d?.fecha_envio_documentacion_escaneada_egresado || d.fecha_confirmacion_documentacion_escaneada_recibida) {
      return false;
    }
    const p14 = this.pasosAlumno.find((p) => p.numero === 14);
    return !!p14 && p14.activo && !p14.completado;
  }

  /**
   * Pasos del flujo de titulación (mismas etapas para todas las modalidades; pasos 2–3 varían si es residencia).
   */
  get pasosAlumno(): PasoAlumnoVista[] {
    const d = this.datos;
    if (!d) return [];

    const fh = (iso?: string | null): string => (iso ? this.formatearFechaHora(iso) : '—');
    const esRes = this.esResidenciaProfesional;
    const modalidad = (d.datos_proyecto?.modalidad ?? '').trim() || 'titulación integral';
    const tituloPaso2 = esRes
      ? 'Envío de solicitud al departamento académico (residencia)'
      : 'Envío de solicitud al Departamento de Apoyo a la Titulación';
    const detallePaso2 = esRes
      ? 'La DEP envió la solicitud para registro y liberación de tu proyecto de titulación integral por residencia al departamento académico.'
      : 'La DEP envía la solicitud de registro, revisión y aprobación del proyecto de titulación integral al Departamento de Apoyo a la Titulación. Si cuentas con correcciones, aquí se mostrarán las revisiones realizadas por la Coordinación de Apoyo a la Titulación en cuanto sean enviadas.';
    const tituloPaso3 = esRes ? 'Recepción de anexos XXXII y XXXIII' : 'Recepción de anexos XXXII y XXXIII';
    const detallePaso3 = esRes
      ? 'La DEP recibió los anexos XXXII y XXXIII (registro y liberación) de tu proyecto de titulación integral por parte del departamento académico.'
      : 'La DEP recibe los anexos XXXII y XXXIII (registro y aprobación) del proyecto de titulación integral por parte del Departamento de Apoyo a la Titulación.';

    const c1 = !!d.fecha_creacion;
    const c2 = !!d.fecha_enviado_departamento_academico;
    const c3 = !!d.fecha_confirmacion_recibidos_anexo_xxxi_xxxii;
    const c4 = !!d.fecha_creacion_anexo_9_1;
    const c5 = !!d.fecha_confirmacion_entrega_anexo_9_1;
    const c6 = !!d.fecha_solicitud_anexo_9_2;
    const c7 = !!d.fecha_confirmacion_recibido_anexo_9_2;
    const c8 = !!d.fecha_solicitud_sinodales;
    const c9 = !!d.fecha_confirmacion_sinodales_recibidos;
    const c10 = !!d.fecha_agenda_acto_9_3;
    const c11 = !!d.fecha_creacion_anexo_9_3;
    const c12docSolicitud = !!d.fecha_solicitud_documentacion_escaneada;
    const c12docEnvio = !!d.fecha_envio_documentacion_escaneada_egresado;
    const c12docRecibido = !!d.fecha_confirmacion_documentacion_escaneada_recibida;

    const raw: Omit<PasoAlumnoVista, 'activo'>[] = [
      {
        numero: 1,
        titulo: 'Registro de tu solicitud',
        detalle: `Se registró tu solicitud para iniciar el trámite del proceso de titulación por ${modalidad}.`,
        fecha: fh(d.fecha_creacion),
        completado: c1,
      },
      {
        numero: 2,
        titulo: tituloPaso2,
        detalle: detallePaso2,
        fecha: fh(d.fecha_enviado_departamento_academico),
        completado: c2,
      },
      {
        numero: 3,
        titulo: tituloPaso3,
        detalle: detallePaso3,
        fecha: fh(d.fecha_confirmacion_recibidos_anexo_xxxi_xxxii),
        completado: c3,
      },
      {
        numero: 4,
        titulo: 'Recoger y firmar anexo 9.1',
        detalle:
          'Acude a división de estudios profesionales para recoger y firmar tu anexo 9.1 (formato de solicitud de acto de recepción profesional).',
        fecha: fh(d.fecha_creacion_anexo_9_1),
        completado: c4,
      },
      {
        numero: 5,
        titulo: 'Confirmación de anexo 9.1 firmado',
        detalle:
          'La DEP confirmó la recepción de tu anexo 9.1 (formato de solicitud de acto de recepción profesional) firmado.',
        fecha: fh(d.fecha_confirmacion_entrega_anexo_9_1),
        completado: c5,
      },
      {
        numero: 6,
        titulo: 'Solicitud del anexo 9.2',
        detalle:
          'Solicita en servicios escolares tu anexo 9.2 (constancia de no inconveniencia para acto de recepción profesional) y entrégalo en la DEP para continuar con el trámite.',
        fecha: fh(d.fecha_solicitud_anexo_9_2),
        completado: c6,
      },
      {
        numero: 7,
        titulo: 'Constancia 9.2 recibida',
        detalle:
          'Quedó registrada la recepción de la constancia 9.2 (constancia de no inconveniencia para acto de recepción profesional) en división de estudios profesionales.',
        fecha: fh(d.fecha_confirmacion_recibido_anexo_9_2),
        completado: c7,
      },
      {
        numero: 8,
        titulo: 'Solicitud de sinodales',
        detalle: 'La DEP solicitó al departamento académico la asignación de sinodales.',
        fecha: fh(d.fecha_solicitud_sinodales),
        completado: c8,
      },
      {
        numero: 9,
        titulo: 'Oficio de sinodales recibido',
        detalle:
          'Quedó confirmada la recepción del oficio de sinodales que el departamento académico entregó a la DEP.',
        fecha: fh(d.fecha_confirmacion_sinodales_recibidos),
        completado: c9,
      },
      {
        numero: 10,
        titulo: 'Acto protocolario agendado',
        detalle: d.fecha_agenda_acto_9_3
          ? 'La DEP agendó fecha y horario para la realización de tu acto protocolario. Tu fecha y horario es:'
          : 'Cuando se registre el agendamiento, aquí verás la fecha y horario de tu acto protocolario.',
        fechaDetalleResaltada: d.fecha_agenda_acto_9_3 ? fh(d.fecha_agenda_acto_9_3) : undefined,
        fecha: fh(d.fecha_agenda_acto_9_3),
        completado: c10,
      },
      {
        numero: 11,
        titulo: 'Anexo 9.3 generado',
        detalle:
          'La DEP generó el anexo 9.3 (aviso de realización de acto protocolario de titulación integral). Favor de recogerlo en división de estudios profesionales.',
        fecha: fh(d.fecha_creacion_anexo_9_3),
        completado: c11,
      },
      {
        numero: 12,
        titulo: 'Solicitud de documentación escaneada',
        detalle:
          'La división de estudios solicitó que subas al sistema la documentación escaneada en PDF de todo tu proceso correspondiente a la titulación integral.',
        fecha: fh(d.fecha_solicitud_documentacion_escaneada),
        completado: c12docSolicitud,
      },
      {
        numero: 13,
        titulo: 'Documentación escaneada enviada',
        detalle: c12docEnvio
          ? 'Quedó registrado el envío de tus archivos PDF con la documentación del proceso.'
          : 'Sube desde este paso los archivos PDF con la documentación escaneada de todo tu proceso de titulación integral.',
        fecha: fh(d.fecha_envio_documentacion_escaneada_egresado),
        completado: c12docEnvio,
      },
      {
        numero: 14,
        titulo: 'Recepción de documentación confirmada',
        detalle:
          'La DEP confirmó la recepción de tu documentación escaneada. ¡Felicidades! Tu proceso en esta etapa quedó concluido en el sistema.',
        fecha: fh(d.fecha_confirmacion_documentacion_escaneada_recibida),
        completado: c12docRecibido,
      },
    ];

    const idxActivo = raw.findIndex((p) => !p.completado);
    return raw.map((p, i) => ({
      ...p,
      activo: idxActivo >= 0 && i === idxActivo,
    }));
  }

  get estadoActualAlumno(): string {
    const d = this.datos;
    if (!d) return '';
    const pasos = this.pasosAlumno;
    const p = pasos.find((x) => x.activo);
    if (p) return `Paso actual: ${p.numero}. ${p.titulo}.`;
    if (pasos.length && pasos.every((x) => x.completado)) return 'Proceso finalizado. ¡Felicidades!';
    return 'Revisa el detalle de cada paso.';
  }

  get avisoPlazosNoResAlumno(): ReturnType<typeof calcularVistaPlazosNoResidencia> | null {
    const d = this.datos;
    if (!d || this.esResidenciaProfesional) return null;
    return calcularVistaPlazosNoResidencia({
      fecha_creacion: d.fecha_creacion,
      fecha_enviado_departamento_academico: d.fecha_enviado_departamento_academico,
      fecha_confirmacion_recibidos_anexo_xxxi_xxxii: d.fecha_confirmacion_recibidos_anexo_xxxi_xxxii,
      fecha_confirmacion_documentacion_escaneada_recibida: d.fecha_confirmacion_documentacion_escaneada_recibida,
    });
  }

  get estadoAvance(): EstadoAvance {
    const d = this.datos;
    if (!d?.fecha_creacion) return 'en_tiempo';
    if (!this.esResidenciaProfesional) {
      return this.avisoPlazosNoResAlumno?.estadoGlobal ?? 'en_tiempo';
    }
    const inicio = new Date(d.fecha_creacion);
    if (isNaN(inicio.getTime())) return 'en_tiempo';
    const modalidad = d.datos_proyecto?.modalidad?.trim() ?? '';
    const plazoDias = diasPlazoPorModalidad(modalidad);
    const fechaLimite = sumarDiasCalendario(inicio, plazoDias);
    const hoy = new Date();
    const diasRestantes = diffDiasCalendario(fechaLimite, hoy);
    if (diasRestantes < 0) return 'vencido';
    if (diasRestantes <= MARGEN_REZAGO_DIAS) return 'rezagado';
    return 'en_tiempo';
  }

  get estadoAvanceLabel(): string {
    if (this.estadoAvance === 'vencido') return 'Vencido';
    if (this.estadoAvance === 'rezagado') return 'Rezagado';
    return 'En tiempo';
  }

  get fechaLimiteTexto(): string {
    const d = this.datos;
    if (!d?.fecha_creacion) return '—';
    if (!this.esResidenciaProfesional) {
      const lim = this.avisoPlazosNoResAlumno?.fechaLimiteMasCercana;
      if (!lim) return '—';
      const dia = lim.getDate().toString().padStart(2, '0');
      const mes = (lim.getMonth() + 1).toString().padStart(2, '0');
      const anio = lim.getFullYear();
      return `${dia}/${mes}/${anio}`;
    }
    const inicio = new Date(d.fecha_creacion);
    if (isNaN(inicio.getTime())) return '—';
    const modalidad = d.datos_proyecto?.modalidad?.trim() ?? '';
    const fechaLimite = sumarDiasCalendario(inicio, diasPlazoPorModalidad(modalidad));
    const dia = fechaLimite.getDate().toString().padStart(2, '0');
    const mes = (fechaLimite.getMonth() + 1).toString().padStart(2, '0');
    const anio = fechaLimite.getFullYear();
    return `${dia}/${mes}/${anio}`;
  }

  get detalleEstadoAvance(): string {
    const d = this.datos;
    if (!d?.fecha_creacion) return 'Aún sin fecha de inicio registrada.';
    if (!this.esResidenciaProfesional) {
      const p = this.avisoPlazosNoResAlumno;
      if (!p) return '—';
      const dias = p.diasHastaLimiteMasCercano;
      if (dias == null) {
        return `${p.lineaProyecto} ${p.lineaTitulacion}`;
      }
      if (dias < 0) {
        return `La fecha límite más próxima venció hace ${Math.abs(dias)} día(s). ${p.lineaProyecto} ${p.lineaTitulacion}`;
      }
      return `Faltan ${dias} día(s) para la fecha límite más próxima. ${p.lineaProyecto} ${p.lineaTitulacion}`;
    }
    const inicio = new Date(d.fecha_creacion);
    if (isNaN(inicio.getTime())) return 'No se pudo calcular el plazo.';
    const modalidad = d.datos_proyecto?.modalidad?.trim() ?? '';
    const fechaLimite = sumarDiasCalendario(inicio, diasPlazoPorModalidad(modalidad));
    const hoy = new Date();
    const diasRestantes = diffDiasCalendario(fechaLimite, hoy);
    if (diasRestantes < 0) {
      return `Tienes ${Math.abs(diasRestantes)} día(s) de atraso contra la fecha límite.`;
    }
    return `Faltan ${diasRestantes} día(s) para la fecha límite.`;
  }

  get nombreCompletoEgresado(): string {
    const p = this.datos?.datos_personales;
    if (!p) return 'Egresado';
    return [p.nombre, p.apellido_paterno, p.apellido_materno].filter(Boolean).join(' ').trim() || 'Egresado';
  }

  get inicialesEgresado(): string {
    const nombre = this.nombreCompletoEgresado;
    const partes = nombre.split(/\s+/).filter(Boolean);
    if (partes.length === 0) return 'EG';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }

  constructor(private egresadoService: EgresadoService) {}

  ngOnInit(): void {
    this.cargarSeguimiento();
    this.cargarRevisionesEnviadas();
  }

  onArchivosDocEscaneadaSeleccionados(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    const pdfs = files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    this.archivosPdfEscaneados = pdfs;
    this.mensajeDocEscaneada = '';
    if (files.length > pdfs.length) {
      this.mensajeDocEscaneada = 'Solo se incluyen archivos PDF; se omitieron otros formatos.';
    }
  }

  enviarDocumentacionEscaneadaAlumno(): void {
    if (!this.archivosPdfEscaneados.length) {
      this.mensajeDocEscaneada = 'Selecciona al menos un archivo PDF.';
      return;
    }
    this.enviandoDocEscaneada = true;
    this.mensajeDocEscaneada = '';
    this.egresadoService.subirDocumentacionEscaneadaMiSeguimiento(this.archivosPdfEscaneados).subscribe({
      next: () => {
        this.enviandoDocEscaneada = false;
        this.archivosPdfEscaneados = [];
        this.mensajeDocEscaneada = 'Documentación enviada correctamente.';
        this.cargarSeguimiento();
      },
      error: (err: { error?: { error?: string } }) => {
        this.enviandoDocEscaneada = false;
        this.mensajeDocEscaneada = err?.error?.error ?? 'No se pudo enviar la documentación. Intenta de nuevo.';
      },
    });
  }

  togglePanelRevisiones(): void {
    this.mostrarPanelRevisiones = !this.mostrarPanelRevisiones;
    if (!this.mostrarPanelRevisiones) return;
    setTimeout(() => {
      const seccion = document.getElementById('revisiones-apoyo');
      if (!seccion) return;
      seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }

  esRevisionExpandida(revisionId: string): boolean {
    return this.revisionesExpandidas.has(revisionId);
  }

  toggleRevision(revisionId: string): void {
    if (this.revisionesExpandidas.has(revisionId)) {
      this.revisionesExpandidas.delete(revisionId);
      return;
    }
    this.revisionesExpandidas.add(revisionId);
  }

  observacionEsLarga(obs?: string): boolean {
    return !!obs?.trim();
  }

  descargarAdjuntoRevision(r: RevisionApi): void {
    if (!r?.id || !r.tiene_documento_adjunto) return;
    this.errorDescargaRevision = '';
    this.egresadoService.descargarDocumentoMiRevision(r.id).subscribe({
      next: ({ blob, fileName }) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName || `revision-${r.numero_revision}.pdf`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      error: (err) => {
        const msg = err?.error?.error ?? err?.error?.message ?? err?.message ?? '';
        this.errorDescargaRevision = msg
          ? `No se pudo descargar el PDF adjunto: ${msg}`
          : 'No se pudo descargar el PDF adjunto.';
      },
    });
  }

  cargarSeguimiento(): void {
    this.egresadoService.getMiSeguimiento().subscribe({
      next: (d) => {
        this.datos = d;
        this.cargando = false;
      },
      error: (err: { status?: number }) => {
        this.cargando = false;
        if (err?.status === 404) {
          this.error = 'No tienes un registro de seguimiento asociado. Contacta al departamento académico.';
        } else if (err?.status === 403) {
          this.error = 'No tienes permiso para ver el seguimiento.';
        } else {
          this.error = 'No se pudo cargar el seguimiento. ¿Está el backend en ejecución?';
        }
      },
    });
  }

  private cargarRevisionesEnviadas(): void {
    this.cargandoRevisionesEnviadas = true;
    this.egresadoService.getMisRevisionesEnviadas().subscribe({
      next: (lista) => {
        this.cargandoRevisionesEnviadas = false;
        this.revisionesEnviadas = lista;
      },
      error: () => {
        this.cargandoRevisionesEnviadas = false;
        this.revisionesEnviadas = [];
      },
    });
  }

  formatearFechaHora(iso?: string): string {
    if (!iso) return '—';
    try {
      const dt = new Date(iso);
      if (isNaN(dt.getTime())) return iso;
      const dia = dt.getDate().toString().padStart(2, '0');
      const mes = (dt.getMonth() + 1).toString().padStart(2, '0');
      const anio = dt.getFullYear();
      const h = dt.getHours().toString().padStart(2, '0');
      const min = dt.getMinutes().toString().padStart(2, '0');
      return `${dia}/${mes}/${anio}, ${h}:${min}`;
    } catch {
      return iso;
    }
  }
}
