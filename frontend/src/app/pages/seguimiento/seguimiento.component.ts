import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../layout/header/header.component';
import { EgresadoService, EgresadoDetail, RevisionApi } from '../../services/egresado.service';

/** Paso mostrado al alumno (solo lectura). */
export interface PasoAlumnoVista {
  numero: number;
  titulo: string;
  detalle: string;
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

  get revisionesParaCorregir(): RevisionApi[] {
    return this.revisionesEnviadas.filter((r) => r.resultado === 'observaciones');
  }

  get esResidenciaProfesional(): boolean {
    const m = this.datos?.datos_proyecto?.modalidad?.trim() ?? '';
    return m.toLowerCase() === 'residencia profesional';
  }

  /**
   * Pasos del flujo de titulación (mismas etapas en sistema para todas las modalidades).
   * Textos de envío/recepción ante académicos varían si es residencia (liberación) u otra modalidad (revisión).
   */
  get pasosAlumno(): PasoAlumnoVista[] {
    const d = this.datos;
    if (!d) return [];

    const fh = (iso?: string | null): string => (iso ? this.formatearFechaHora(iso) : '—');
    const esRes = this.esResidenciaProfesional;
    const detallePaso2 = esRes
      ? 'Tu expediente fue enviado para registro y liberación ante el departamento académico.'
      : 'Tu expediente fue enviado al departamento académico para revisión de anexos XXXI y XXXII.';
    const detallePaso3 = esRes
      ? 'División de estudios profesionales confirmó la recepción de anexos XXXI y XXXII.'
      : 'División de estudios profesionales confirmó la recepción de tus anexos una vez aprobado el expediente en el departamento académico.';

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
    const c12 = c11;

    const raw: Omit<PasoAlumnoVista, 'activo'>[] = [
      {
        numero: 1,
        titulo: 'Solicitud de anexo XXXI y XXXII',
        detalle: 'Registro de tu solicitud al ingresar como egresado.',
        fecha: fh(d.fecha_creacion),
        completado: c1,
      },
      {
        numero: 2,
        titulo: 'Enviado al departamento académico',
        detalle: detallePaso2,
        fecha: fh(d.fecha_enviado_departamento_academico),
        completado: c2,
      },
      {
        numero: 3,
        titulo: 'Recibido en división de estudios profesionales',
        detalle: detallePaso3,
        fecha: fh(d.fecha_confirmacion_recibidos_anexo_xxxi_xxxii),
        completado: c3,
      },
      {
        numero: 4,
        titulo: 'recoger y firmar anexo 9.1',
        detalle: 'Pasa a recoger en división de estudios profesionales para firmar el anexo 9.1.',
        fecha: fh(d.fecha_creacion_anexo_9_1),
        completado: c4,
      },
      {
        numero: 5,
        titulo: 'Anexo 9.1 firmado recibido en división de estudios profesionales',
        detalle: 'División de estudios profesionales confirmó la recepción de tu anexo 9.1 firmado.',
        fecha: fh(d.fecha_confirmacion_entrega_anexo_9_1),
        completado: c5,
      },
      {
        numero: 6,
        titulo: 'solicita anexo 9.2 en servicios escolares',
        detalle:
          'Solicita en servicios escolares el anexo 9.2 y entregarla en división de estudios profesionales para continuar con el tramite.',
        fecha: fh(d.fecha_solicitud_anexo_9_2),
        completado: c6,
      },
      {
        numero: 7,
        titulo: 'Constancia 9.2 recibida en división de estudios profesionales',
        detalle: 'Quedó registrada la recepción de la constancia 9.2 en división de estudios profesionales.',
        fecha: fh(d.fecha_confirmacion_recibido_anexo_9_2),
        completado: c7,
      },
      {
        numero: 8,
        titulo: 'Solicitud de sinodales',
        detalle: 'Se registró la solicitud de integrantes del jurado ante el departamento académico.',
        fecha: fh(d.fecha_solicitud_sinodales),
        completado: c8,
      },
      {
        numero: 9,
        titulo: 'Sinodales recibidos',
        detalle: 'Quedó confirmada la recepción de los datos del jurado.',
        fecha: fh(d.fecha_confirmacion_sinodales_recibidos),
        completado: c9,
      },
      {
        numero: 10,
        titulo: 'Acto protocolario (9.3) agendado',
        detalle: d.fecha_agenda_acto_9_3
          ? `Tu acto protocolario quedó registrado para el ${fh(d.fecha_agenda_acto_9_3)}.`
          : 'Fecha y hora del acto de titulación registradas en el sistema.',
        fecha: fh(d.fecha_agenda_acto_9_3),
        completado: c10,
      },
      {
        numero: 11,
        titulo: 'Recoger y firmar formato 9.3',
        detalle: 'Formato del acto protocolario disponible; acude con división de estudios profesionales para recogerlo y firmar.',
        fecha: fh(d.fecha_creacion_anexo_9_3),
        completado: c11,
      },
      {
        numero: 12,
        titulo: 'Proceso de titulación finalizado',
        detalle: '¡Felicidades! Tu proceso en esta etapa quedó concluido en el sistema.',
        fecha: fh(d.fecha_creacion_anexo_9_3),
        completado: c12,
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

  get estadoAvance(): EstadoAvance {
    const d = this.datos;
    if (!d?.fecha_creacion) return 'en_tiempo';
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

  private cargarSeguimiento(): void {
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
