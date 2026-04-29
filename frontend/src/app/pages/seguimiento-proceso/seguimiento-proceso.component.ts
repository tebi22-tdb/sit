import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import flatpickr from 'flatpickr';
import { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import { catchError, EMPTY, finalize, of, throwError, timeout } from 'rxjs';
import { HeaderComponent } from '../../layout/header/header.component';
import { mensajeErrorApiConBlob } from '../../core/http-blob-error';
import { EgresadoService, EgresadoDetail, EgresadoItem } from '../../services/egresado.service';
import { calcularVistaPlazosNoResidencia } from '../../core/plazos-titulacion-no-residencia';

type EstadoFiltro = 'todos' | 'en_tiempo' | 'rezagado' | 'vencido';
type OrdenFiltro = 'prioridad' | 'nombre' | 'control';

/** Días de margen antes del límite para pasar de "en tiempo" a "rezagado". */
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

interface SeguimientoItem {
  id: string;
  alumno: string;
  noControl: string;
  producto: string;
  carrera: string;
  estado: Exclude<EstadoFiltro, 'todos'>;
  documentoFaltante: string;
  ultimoMovimiento: string;
  fechaLimite: string;
}

type EstadoPaso = 'completado' | 'en_curso' | 'pendiente';

interface PasoTitulacionDef {
  key: string;
  titulo: string;
  descripcion: string;
}

interface PasoProcesoUi {
  numero: number;
  key: string;
  titulo: string;
  descripcion: string;
  fecha?: string;
  estado: EstadoPaso;
}

@Component({
  selector: 'app-seguimiento-proceso',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent],
  templateUrl: './seguimiento-proceso.component.html',
  styleUrl: './seguimiento-proceso.component.css',
})
export class SeguimientoProcesoComponent implements OnInit, OnDestroy {
  @ViewChild('fechaActo93Input') fechaActo93Input?: ElementRef<HTMLInputElement>;

  cargando = true;
  error = '';
  items: SeguimientoItem[] = [];

  buscarControl = '';
  filtroCarrera = '';
  filtroProducto = '';
  filtroDocumento = 'todos';
  filtroEstado: EstadoFiltro = 'todos';
  ordenarPor: OrdenFiltro = 'prioridad';
  mostrarMasFiltros = false;
  detalleSeleccionado: EgresadoDetail | null = null;
  cargandoDetalle = false;
  procesandoPaso = false;
  mensajeProceso = '';
  fechaActo93 = '';
  /** Pasos del proceso: propiedad estable (no getter) para no destruir el DOM en cada ciclo de detección de cambios. */
  pasosProcesoTitulacionCache: PasoProcesoUi[] = [];
  /** Días (clave yyyy-MM-dd locales) que ya tienen acto 9.3 agendado; solo para color en flatpickr. */
  agendaActo93OcupadosKeys = new Set<string>();
  agenda93Picker: FlatpickrInstance | null = null;
  agenda93Cargada = false;
  agenda93Cargando = false;
  private detalleRequestSeq = 0;

  get carrerasDisponibles(): string[] {
    return [...new Set(this.items.map((i) => i.carrera))].sort((a, b) => a.localeCompare(b));
  }

  get productosDisponibles(): string[] {
    return [...new Set(this.items.map((i) => i.producto))].sort((a, b) => a.localeCompare(b));
  }

  get totalExpedientes(): number {
    return this.items.length;
  }

  get totalEnTiempo(): number {
    return this.items.filter((i) => i.estado === 'en_tiempo').length;
  }

  get totalRezagado(): number {
    return this.items.filter((i) => i.estado === 'rezagado').length;
  }

  get totalVencidos(): number {
    return this.items.filter((i) => i.estado === 'vencido').length;
  }

  get itemsFiltrados(): SeguimientoItem[] {
    const term = this.buscarControl.trim().toLowerCase();
    let out = this.items.filter((i) => {
      if (term && !i.noControl.toLowerCase().includes(term)) return false;
      if (this.filtroCarrera && i.carrera !== this.filtroCarrera) return false;
      if (this.filtroProducto && i.producto !== this.filtroProducto) return false;
      if (this.filtroDocumento !== 'todos' && i.documentoFaltante !== this.filtroDocumento) return false;
      if (this.filtroEstado !== 'todos' && i.estado !== this.filtroEstado) return false;
      return true;
    });

    if (this.ordenarPor === 'nombre') {
      out = out.sort((a, b) => a.alumno.localeCompare(b.alumno));
    } else if (this.ordenarPor === 'control') {
      out = out.sort((a, b) => a.noControl.localeCompare(b.noControl));
    } else {
      const prioridad = { vencido: 0, rezagado: 1, en_tiempo: 2 };
      out = out.sort((a, b) => prioridad[a.estado] - prioridad[b.estado]);
    }
    return out;
  }

  constructor(
    private egresadoService: EgresadoService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  ngOnDestroy(): void {
    this.destruirAgendaActo93Picker();
  }

  seleccionarEstado(estado: EstadoFiltro): void {
    this.filtroEstado = estado;
  }

  volverInicio(): void {
    this.router.navigate(['/home']);
  }

  esEstadoActivo(estado: EstadoFiltro): boolean {
    return this.filtroEstado === estado;
  }

  limpiarFiltros(): void {
    this.buscarControl = '';
    this.filtroCarrera = '';
    this.filtroProducto = '';
    this.filtroDocumento = 'todos';
    this.filtroEstado = 'todos';
    this.ordenarPor = 'prioridad';
    this.mostrarMasFiltros = false;
  }

  badgeEstado(estado: SeguimientoItem['estado']): string {
    if (estado === 'vencido') return 'Vencido';
    if (estado === 'rezagado') return 'Rezagado';
    return 'En tiempo';
  }

  /** Misma modalidad que en formulario / backend (Residencia Profesional usa Liberar; el resto revisión académica). */
  get esResidenciaProfesionalSeguimiento(): boolean {
    return (this.detalleSeleccionado?.datos_proyecto?.modalidad ?? '').trim() === 'Residencia Profesional';
  }

  /** Aviso 12 + 6 meses solo para modalidades distintas a residencia. */
  get avisoPlazosNoResDetalle(): ReturnType<typeof calcularVistaPlazosNoResidencia> | null {
    const d = this.detalleSeleccionado;
    if (!d || this.esResidenciaProfesionalSeguimiento) return null;
    return calcularVistaPlazosNoResidencia({
      fecha_creacion: d.fecha_creacion,
      fecha_enviado_departamento_academico: d.fecha_enviado_departamento_academico,
      fecha_confirmacion_recibidos_anexo_xxxi_xxxii: d.fecha_confirmacion_recibidos_anexo_xxxi_xxxii,
      fecha_confirmacion_documentacion_escaneada_recibida: d.fecha_confirmacion_documentacion_escaneada_recibida,
    });
  }

  seleccionarEgresado(item: SeguimientoItem): void {
    if (this.procesandoPaso) {
      this.mensajeProceso = 'Espera a que termine la acción en curso (por ejemplo agendar o crear anexo).';
      return;
    }
    this.mensajeProceso = '';
    this.cargandoDetalle = true;
    this.detalleSeleccionado = null;
    this.pasosProcesoTitulacionCache = [];
    this.fechaActo93 = '';
    this.destruirAgendaActo93Picker();
    const requestSeq = ++this.detalleRequestSeq;
    const guard = window.setTimeout(() => {
      if (requestSeq === this.detalleRequestSeq && this.cargandoDetalle) {
        this.cargandoDetalle = false;
        this.mensajeProceso = 'No se pudo cargar el detalle a tiempo. Intenta de nuevo.';
      }
    }, 22000);
    this.egresadoService
      .obtenerPorId(item.id, false)
      .pipe(
        timeout(20000),
        // Solo usamos respaldo por numero_control si el backend responde 404 al id.
        catchError((err) => {
          if (err instanceof HttpErrorResponse && err.status === 404 && item.noControl?.trim()) {
            return this.egresadoService.obtenerPorNumeroControl(item.noControl.trim()).pipe(timeout(20000));
          }
          return throwError(() => err);
        }),
        finalize(() => {
          clearTimeout(guard);
        }),
      )
      .subscribe({
        next: (d) => {
          if (requestSeq !== this.detalleRequestSeq) return;
          this.detalleSeleccionado = d;
          this.cargandoDetalle = false;
          this.actualizarPasosProcesoTitulacion();
        },
        error: (err) => {
          if (requestSeq !== this.detalleRequestSeq) return;
          this.cargandoDetalle = false;
          this.mensajeProceso =
            err?.name === 'TimeoutError'
              ? 'El servidor tardó demasiado en responder al cargar el detalle.'
              : err?.error?.error ?? 'No se pudo cargar el detalle del egresado. Intenta de nuevo.';
        },
      });
  }

  trackByPasoNumero(_index: number, paso: PasoProcesoUi): number {
    return paso.numero;
  }

  private actualizarPasosProcesoTitulacion(): void {
    if (!this.detalleSeleccionado) {
      this.pasosProcesoTitulacionCache = [];
      return;
    }
    const esRes = this.esResidenciaProfesionalSeguimiento;
    /** Pasos 1–2: residencia y otras modalidades tienen texto distinto. */
    const pasosInicioPorModalidad: PasoTitulacionDef[] = [
      {
        key: 'fecha_enviado_departamento_academico',
        titulo: esRes
          ? 'Envío de la DEP la  solicitud para registro y liberación de proyecto de titulación integral al departamento académico'
          : 'La DEP envía la solicitud de registro, revisión y aprobación del proyecto de titulación integral al Departamento de Apoyo a la Titulación.',
        descripcion: 'La DEP registra el envío de la solicitud al departamento académico.',
      },
      {
        key: 'fecha_confirmacion_recibidos_anexo_xxxi_xxxii',
        titulo: esRes
          ? 'Recibimos anexos XXXII y XXXIII (registro y liberación) del proyecto de titulación integral por parte del departamento académico'
          : 'La DEP recibe los anexos XXXII y XXXIII (registro y aprobación) del proyecto de titulación integral por parte del Departamento de Apoyo a la Titulación.',
        descripcion: 'La DEP confirma la recepción de los documentos del departamento académico.',
      },
    ];
    /** Pasos 3 en adelante: mismos textos detallados para todas las modalidades. */
    const pasosTitulacionCompartidos: PasoTitulacionDef[] = [
      {
        key: 'fecha_creacion_anexo_9_1',
        titulo: 'Generar anexo 9.1 (formato de solicitud del acto de recepción profesional)',
        descripcion: 'Se genera el documento correspondiente en el sistema.',
      },
      {
        key: 'fecha_confirmacion_entrega_anexo_9_1',
        titulo: 'Entrega de anexo 9.1 al sustentante',
        descripcion: 'Se confirma la entrega del anexo al sustentante.',
      },
      {
        key: 'fecha_solicitud_anexo_9_2',
        titulo:
          'Solicitar anexo 9.2 al sustentante (constancia de no inconveniencia para su acto de recepción profesional)',
        descripcion: 'La DEP solicita al sustentante la constancia 9.2.',
      },
      {
        key: 'fecha_confirmacion_recibido_anexo_9_2',
        titulo: 'Recibe la DEP el anexo 9.2',
        descripcion: 'La DEP registra la recepción de la constancia 9.2.',
      },
      {
        key: 'fecha_solicitud_sinodales',
        titulo: 'Solicita sinodales la DEP al departamento académico',
        descripcion: 'La DEP envía la solicitud de asignación de sinodales.',
      },
      {
        key: 'fecha_confirmacion_sinodales_recibidos',
        titulo: 'Entrega oficio de asignación de sinodales el departamento académico a DEP',
        descripcion:
          'El departamento académico registra la asignación; la DEP confirma con «Confirmar» la recepción del oficio.',
      },
      {
        key: 'fecha_agenda_acto_9_3',
        titulo: 'La DEP agenda fecha y horario para la realización del acto protocolario del sustentante',
        descripcion: 'Se agenda día y hora del acto dentro de la ventana permitida (lunes a viernes, 10:00–14:00).',
      },
      {
        key: 'fecha_creacion_anexo_9_3',
        titulo:
          'La DEP genera el anexo 9.3 (aviso de realización de acto protocolario de titulación integral)',
        descripcion: 'Se genera el PDF del anexo 9.3 después del agendamiento.',
      },
    ];
    const pasoEntrega93Residencia: PasoTitulacionDef[] = esRes
      ? [
          {
            key: 'fecha_confirmacion_entrega_anexo_9_3',
            titulo: 'Entrega de anexo 9.3 a sinodales y sustentante',
            descripcion: 'La DEP confirma la entrega del aviso al jurado y al sustentante.',
          },
        ]
      : [];
    const pasosDocumentacionEscaneada: PasoTitulacionDef[] = [
      {
        key: 'fecha_solicitud_documentacion_escaneada',
        titulo: 'Entrega de documentación escaneada del proceso correspondiente a la titulación integral',
        descripcion: 'La DEP solicita al sustentante que suba en el sistema los PDF de su proceso.',
      },
      {
        key: 'fecha_confirmacion_documentacion_escaneada_recibida',
        titulo: 'Se recibió documentación correspondiente a la titulación integral',
        descripcion: 'La DEP confirma la recepción de los documentos escaneados enviados por el sustentante.',
      },
    ];
    const steps = [
      ...pasosInicioPorModalidad,
      ...pasosTitulacionCompartidos,
      ...pasoEntrega93Residencia,
      ...pasosDocumentacionEscaneada,
    ];
    const d = this.detalleSeleccionado;
    let todosPreviosCompletados = true;
    this.pasosProcesoTitulacionCache = steps.map((s, i) => {
      if (s.key === 'fecha_solicitud_documentacion_escaneada') {
        const fecha = d.fecha_solicitud_documentacion_escaneada;
        const completado = !!fecha;
        const estado: EstadoPaso = completado ? 'completado' : todosPreviosCompletados ? 'en_curso' : 'pendiente';
        if (!completado) todosPreviosCompletados = false;
        return {
          numero: i + 1,
          key: s.key,
          titulo: s.titulo,
          descripcion: s.descripcion,
          fecha,
          estado,
        };
      }
      if (s.key === 'fecha_confirmacion_documentacion_escaneada_recibida') {
        const fechaConf = d.fecha_confirmacion_documentacion_escaneada_recibida;
        const fechaEnv = d.fecha_envio_documentacion_escaneada_egresado;
        const completado = !!fechaConf;
        let estado: EstadoPaso;
        if (completado) estado = 'completado';
        else if (!todosPreviosCompletados) estado = 'pendiente';
        else if (fechaEnv) estado = 'en_curso';
        else estado = 'pendiente';
        const fecha = fechaConf || fechaEnv;
        if (!completado) todosPreviosCompletados = false;
        return {
          numero: i + 1,
          key: s.key,
          titulo: s.titulo,
          descripcion: s.descripcion,
          fecha,
          estado,
        };
      }
      const fecha = (d as unknown as Record<string, string | undefined>)[s.key];
      const completado = !!fecha;
      const estado: EstadoPaso = completado ? 'completado' : (todosPreviosCompletados ? 'en_curso' : 'pendiente');
      if (!completado) todosPreviosCompletados = false;
      return {
        numero: i + 1,
        key: s.key,
        titulo: s.titulo,
        descripcion: s.descripcion,
        fecha,
        estado,
      };
    });
  }

  etiquetaEstadoPaso(estado: EstadoPaso): string {
    if (estado === 'completado') return 'Completado';
    if (estado === 'en_curso') return 'Paso actual';
    return 'Pendiente';
  }

  etiquetaEstadoPasoPara(paso: PasoProcesoUi): string {
    const d = this.detalleSeleccionado;
    if (
      paso.key === 'fecha_confirmacion_documentacion_escaneada_recibida' &&
      paso.estado === 'pendiente' &&
      d?.fecha_solicitud_documentacion_escaneada &&
      !d?.fecha_envio_documentacion_escaneada_egresado
    ) {
      return 'En espera del egresado';
    }
    return this.etiquetaEstadoPaso(paso.estado);
  }

  formatearFechaHora(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dia = d.getDate().toString().padStart(2, '0');
    const mes = (d.getMonth() + 1).toString().padStart(2, '0');
    const anio = d.getFullYear();
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${dia}/${mes}/${anio}, ${h}:${m}`;
  }

  private refrescarDetalle(): void {
    if (!this.detalleSeleccionado) return;
    const id = this.detalleSeleccionado.id;
    this.egresadoService
      .obtenerPorId(id, false)
      .pipe(
        timeout(25000),
        catchError((err) => {
          const extra =
            err?.name === 'TimeoutError'
              ? 'El servidor tardó al refrescar el detalle.'
              : 'No se pudo refrescar el detalle.';
          this.mensajeProceso = this.mensajeProceso ? `${this.mensajeProceso} ${extra}` : extra;
          return EMPTY;
        }),
      )
      .subscribe({
        next: (d) => {
          if (this.detalleSeleccionado?.id === id) {
            this.detalleSeleccionado = d;
            this.actualizarPasosProcesoTitulacion();
          }
        },
      });
  }

  /** Valor `YYYY-MM-DDTHH:mm` (flatpickr o datetime-local) → ISO UTC como el backend. */
  private parseDatetimeLocalToIso(valor: string): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(valor.trim());
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  private descargarBlob(blob: Blob, nombreArchivo: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
  }

  enviarDepartamento(): void {
    if (!this.detalleSeleccionado || this.procesandoPaso || this.detalleSeleccionado.fecha_enviado_departamento_academico) return;
    this.procesandoPaso = true;
    this.mensajeProceso = '';
    this.egresadoService.enviarDepartamentoAcademico(this.detalleSeleccionado.id).subscribe({
      next: () => {
        this.procesandoPaso = false;
        this.mensajeProceso = 'Solicitud enviada al departamento académico.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensajeProceso = err?.error?.error ?? 'No se pudo enviar.';
      },
    });
  }

  confirmarRecibidosAnexos(): void {
    if (!this.detalleSeleccionado || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensajeProceso = '';
    this.egresadoService.confirmarRecibidosAnexosXxxiXxxii(this.detalleSeleccionado.id).subscribe({
      next: () => {
        this.procesandoPaso = false;
        this.mensajeProceso = 'Recibidos XXXII/XXXIII confirmados.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensajeProceso = err?.error?.error ?? 'No se pudo confirmar.';
      },
    });
  }

  crearDescargar91(): void {
    if (!this.detalleSeleccionado || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensajeProceso = '';
    const nc = this.detalleSeleccionado.numero_control;
    this.egresadoService.descargarAnexo91(this.detalleSeleccionado.id).subscribe({
      next: (blob) => {
        this.procesandoPaso = false;
        this.descargarBlob(blob, `Anexo-9.1-${nc}.pdf`);
        this.mensajeProceso = 'Anexo 9.1 generado.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        void mensajeErrorApiConBlob(err, 'No se pudo generar 9.1.').then((m) => {
          this.mensajeProceso = m;
        });
      },
    });
  }

  confirmarEntrega91(): void {
    if (!this.detalleSeleccionado || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensajeProceso = '';
    this.egresadoService.confirmarEntregaAnexo91(this.detalleSeleccionado.id).subscribe({
      next: () => {
        this.procesandoPaso = false;
        this.mensajeProceso = 'Entrega 9.1 confirmada.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensajeProceso = err?.error?.error ?? 'No se pudo confirmar entrega.';
      },
    });
  }

  solicitarConstancia92AlEgresado(): void {
    if (!this.detalleSeleccionado || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensajeProceso = '';
    this.egresadoService.solicitarConstancia92Division(this.detalleSeleccionado.id).subscribe({
      next: () => {
        this.procesandoPaso = false;
        this.mensajeProceso = 'Solicitud de constancia 9.2 registrada.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensajeProceso = err?.error?.error ?? 'No se pudo registrar la solicitud 9.2.';
      },
    });
  }

  confirmarRecibido92(): void {
    if (!this.detalleSeleccionado || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensajeProceso = '';
    this.egresadoService.confirmarRecibidoAnexo92(this.detalleSeleccionado.id).subscribe({
      next: () => {
        this.procesandoPaso = false;
        this.mensajeProceso = 'Constancia 9.2: recepción confirmada.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensajeProceso = err?.error?.error ?? 'No se pudo confirmar la recepción del 9.2.';
      },
    });
  }

  solicitarSinodales(): void {
    if (!this.detalleSeleccionado || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensajeProceso = '';
    this.egresadoService.solicitarSinodales(this.detalleSeleccionado.id).subscribe({
      next: () => {
        this.procesandoPaso = false;
        this.mensajeProceso = 'Solicitud de sinodales enviada.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensajeProceso = err?.error?.error ?? 'No se pudo solicitar sinodales.';
      },
    });
  }

  confirmarSinodalesRecibidos(): void {
    if (!this.detalleSeleccionado || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensajeProceso = '';
    this.egresadoService
      .confirmarSinodalesRecibidos(this.detalleSeleccionado.id)
      .pipe(
        timeout(25000),
        catchError((err) => {
          if (err?.name === 'TimeoutError') {
            return throwError(() => ({ error: { error: 'El servidor no respondió al confirmar sinodales. Intenta de nuevo.' } }));
          }
          return throwError(() => err);
        }),
      )
      .subscribe({
        next: () => {
          this.procesandoPaso = false;
          this.mensajeProceso = 'Sinodales recibidos confirmados.';
          if (this.detalleSeleccionado) {
            this.detalleSeleccionado = {
              ...this.detalleSeleccionado,
              fecha_confirmacion_sinodales_recibidos: new Date().toISOString(),
            };
            this.actualizarPasosProcesoTitulacion();
          }
          this.refrescarDetalle();
        },
        error: (err) => {
          this.procesandoPaso = false;
          this.mensajeProceso = err?.error?.error ?? 'No se pudo confirmar sinodales.';
        },
      });
  }

  agendarActo93(valor: string): void {
    if (!this.detalleSeleccionado || this.procesandoPaso) return;
    if (!valor?.trim()) {
      this.mensajeProceso = 'Selecciona fecha y hora para el acto 9.3.';
      return;
    }
    this.procesandoPaso = true;
    this.mensajeProceso = '';
    this.egresadoService
      .agendarActo93(this.detalleSeleccionado.id, valor)
      .pipe(
        timeout(25000),
        catchError((err) => {
          if (err?.name === 'TimeoutError') {
            return throwError(() => ({ error: { error: 'El servidor no respondió al agendar. Revisa conexión o intenta de nuevo.' } }));
          }
          return throwError(() => err);
        }),
      )
      .subscribe({
        next: () => {
          this.procesandoPaso = false;
          this.mensajeProceso = 'Acto 9.3 agendado.';
          this.fechaActo93 = '';
          this.destruirAgendaActo93Picker();
          const iso = this.parseDatetimeLocalToIso(valor);
          if (iso && this.detalleSeleccionado) {
            this.detalleSeleccionado = { ...this.detalleSeleccionado, fecha_agenda_acto_9_3: iso };
            this.actualizarPasosProcesoTitulacion();
          }
          this.refrescarDetalle();
        },
        error: (err) => {
          this.procesandoPaso = false;
          this.mensajeProceso = err?.error?.error ?? 'No se pudo agendar 9.3.';
        },
      });
  }

  crearDescargar93(): void {
    if (!this.detalleSeleccionado || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensajeProceso = '';
    const nc = this.detalleSeleccionado.numero_control;
    this.egresadoService.descargarAnexo93(this.detalleSeleccionado.id).subscribe({
      next: (blob) => {
        this.procesandoPaso = false;
        this.descargarBlob(blob, `Anexo-9.3-${nc}.pdf`);
        this.mensajeProceso = 'Anexo 9.3 generado.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        void mensajeErrorApiConBlob(err, 'No se pudo generar 9.3.').then((m) => {
          this.mensajeProceso = m;
        });
      },
    });
  }

  confirmarEntrega93(): void {
    if (!this.detalleSeleccionado || this.procesandoPaso) return;
    if (!this.detalleSeleccionado.fecha_creacion_anexo_9_3) {
      this.mensajeProceso = 'Primero debe generarse el anexo 9.3.';
      return;
    }
    this.procesandoPaso = true;
    this.mensajeProceso = '';
    this.egresadoService.confirmarEntregaAnexo93(this.detalleSeleccionado.id).subscribe({
      next: () => {
        this.procesandoPaso = false;
        this.mensajeProceso = 'Entrega del anexo 9.3 confirmada.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensajeProceso = err?.error?.error ?? 'No se pudo confirmar la entrega del 9.3.';
      },
    });
  }

  solicitarDocumentacionEscaneada(): void {
    if (!this.detalleSeleccionado || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensajeProceso = '';
    this.egresadoService.solicitarDocumentacionEscaneada(this.detalleSeleccionado.id).subscribe({
      next: () => {
        this.procesandoPaso = false;
        this.mensajeProceso = 'Solicitud de documentación escaneada registrada.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensajeProceso = err?.error?.error ?? 'No se pudo registrar la solicitud.';
      },
    });
  }

  confirmarDocumentacionEscaneadaRecibida(): void {
    if (!this.detalleSeleccionado || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensajeProceso = '';
    this.egresadoService.confirmarDocumentacionEscaneadaRecibida(this.detalleSeleccionado.id).subscribe({
      next: () => {
        this.procesandoPaso = false;
        this.mensajeProceso = 'Recepción de documentación escaneada confirmada.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensajeProceso = err?.error?.error ?? 'No se pudo confirmar la recepción.';
      },
    });
  }

  private cargar(): void {
    this.cargando = true;
    this.error = '';
    this.egresadoService.listar({ aplicar_scope_departamento: false }).subscribe({
      next: (lista: EgresadoItem[]) => {
        this.items = lista.map((e) => this.mapearItem(e));
        this.cargando = false;
      },
      error: () => {
        this.error = 'No se pudo cargar el seguimiento.';
        this.cargando = false;
      },
    });
  }

  private mapearItem(e: EgresadoItem): SeguimientoItem {
    const hoy = new Date();
    const modalidad = e.modalidad?.trim() || '—';
    const producto = modalidad !== '—' ? `Titulación — ${modalidad}` : 'Seguimiento de titulación';

    const isoUltimo = e.fecha_actualizacion;
    const ultimoMovimiento = isoUltimo ? this.formatoFecha(new Date(isoUltimo)) : '—';

    const esRes = modalidad.trim().toLowerCase() === 'residencia profesional';
    const docCerrado = !!e.fecha_confirmacion_documentacion_escaneada_recibida;
    const tituloListo =
      esRes && e.fecha_creacion_anexo_9_3 && e.fecha_confirmacion_entrega_anexo_9_3 && docCerrado;
    const tituloListoOtras = !esRes && e.fecha_creacion_anexo_9_3 && docCerrado;
    if (tituloListo || tituloListoOtras) {
      return {
        id: e.id,
        alumno: e.nombre || '—',
        noControl: e.numero_control || '—',
        producto,
        carrera: e.carrera || '—',
        estado: 'en_tiempo',
        documentoFaltante: 'Sin atraso',
        ultimoMovimiento,
        fechaLimite: 'Finalizado',
      };
    }

    if (!esRes) {
      const plazos = calcularVistaPlazosNoResidencia(
        {
          fecha_creacion: e.fecha_creacion,
          fecha_enviado_departamento_academico: e.fecha_enviado_departamento_academico,
          fecha_confirmacion_recibidos_anexo_xxxi_xxxii: e.fecha_confirmacion_recibidos_anexo_xxxi_xxxii,
          fecha_confirmacion_documentacion_escaneada_recibida: e.fecha_confirmacion_documentacion_escaneada_recibida,
        },
        hoy,
      );
      const estado = plazos.estadoGlobal;
      const fechaLimite = plazos.fechaLimiteMasCercana
        ? this.formatoFecha(plazos.fechaLimiteMasCercana)
        : '—';
      const documentoFaltante =
        estado === 'vencido' ? 'Plazo vencido' : estado === 'rezagado' ? 'En curso (cerca del límite)' : 'En curso';
      return {
        id: e.id,
        alumno: e.nombre || '—',
        noControl: e.numero_control || '—',
        producto,
        carrera: e.carrera || '—',
        estado,
        documentoFaltante,
        ultimoMovimiento,
        fechaLimite,
      };
    }

    const isoInicio = e.fecha_enviado_departamento_academico || e.fecha_creacion;
    const inicio = isoInicio ? new Date(isoInicio) : hoy;
    if (isNaN(inicio.getTime())) {
      return {
        id: e.id,
        alumno: e.nombre || '—',
        noControl: e.numero_control || '—',
        producto,
        carrera: e.carrera || '—',
        estado: 'en_tiempo',
        documentoFaltante: 'En curso',
        ultimoMovimiento,
        fechaLimite: '—',
      };
    }

    const plazoDias = diasPlazoPorModalidad(modalidad);
    const fechaLimiteDate = sumarDiasCalendario(inicio, plazoDias);
    const diasRestantes = diffDiasCalendario(fechaLimiteDate, hoy);

    let estado: SeguimientoItem['estado'];
    if (diasRestantes < 0) estado = 'vencido';
    else if (diasRestantes <= MARGEN_REZAGO_DIAS) estado = 'rezagado';
    else estado = 'en_tiempo';

    const documentoFaltante =
      estado === 'vencido' ? 'Plazo vencido' : estado === 'rezagado' ? 'En curso (cerca del límite)' : 'En curso';

    return {
      id: e.id,
      alumno: e.nombre || '—',
      noControl: e.numero_control || '—',
      producto,
      carrera: e.carrera || '—',
      estado,
      documentoFaltante,
      ultimoMovimiento,
      fechaLimite: this.formatoFecha(fechaLimiteDate),
    };
  }

  private formatoFecha(d: Date): string {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  abrirCalendarioActo93(): void {
    const abrirPicker = (): void => {
      window.setTimeout(() => {
        this.initAgendaActo93Picker();
        this.agenda93Picker?.open();
      }, 0);
    };

    if (!this.agenda93Cargada && !this.agenda93Cargando) {
      this.agenda93Cargando = true;
      this.egresadoService
        .getAgendaActo93Ocupados()
        .pipe(
          timeout(12000),
          catchError(() => of({ ocupados: [] as string[] })),
          finalize(() => {
            this.agenda93Cargando = false;
            this.agenda93Cargada = true;
          }),
        )
        .subscribe({
          next: (res) => {
            this.rellenarClavesOcupadasAgenda93(res);
            abrirPicker();
          },
        });
      return;
    }

    if (this.agenda93Picker) {
      window.setTimeout(() => {
        this.agenda93Picker?.open();
        this.pintarDiasOcupadosEnFlatpickr(this.agenda93Picker!);
      }, 0);
      return;
    }

    abrirPicker();
  }

  private rellenarClavesOcupadasAgenda93(res: { ocupados?: string[] }): void {
    const fechas = (res?.ocupados ?? [])
      .map((s) => new Date(s))
      .filter((d) => !isNaN(d.getTime()));
    this.agendaActo93OcupadosKeys = new Set(fechas.map((d) => this.toLocalDateKey(d)));
  }

  /** Repinta amarillo: onDayCreate a veces corre antes de tener claves; redraw no siempre vuelve a crear celdas. */
  private pintarDiasOcupadosEnFlatpickr(fp: FlatpickrInstance): void {
    const root = fp.daysContainer;
    if (!root) return;
    root.querySelectorAll('.flatpickr-day').forEach((node) => {
      const el = node as HTMLElement & { dateObj?: Date };
      if (el.classList.contains('flatpickr-disabled')) return;
      el.classList.remove('agenda-dia-ocupado');
      const dateObj = el.dateObj;
      if (!dateObj) return;
      if (this.agendaActo93OcupadosKeys.has(this.toLocalDateKey(dateObj))) {
        el.classList.add('agenda-dia-ocupado');
        el.title = 'Ya hay acto protocolario agendado este día';
      }
    });
  }

  private initAgendaActo93Picker(): void {
    const el = this.fechaActo93Input?.nativeElement;
    if (!el) return;
    this.agenda93Picker?.destroy();
    this.agenda93Picker = flatpickr(el, {
      enableTime: true,
      time_24hr: true,
      minuteIncrement: 15,
      dateFormat: 'Y-m-d\\TH:i',
      minTime: '10:00',
      maxTime: '14:00',
      disable: [(date) => date.getDay() === 0 || date.getDay() === 6],
      onChange: (_dates, dateStr) => {
        this.fechaActo93 = dateStr;
      },
      onDayCreate: (_dObj, _dStr, fp, dayElem) => {
        const dateObj = (dayElem as unknown as { dateObj?: Date }).dateObj;
        if (!dateObj) return;
        const key = this.toLocalDateKey(dateObj);
        if (this.agendaActo93OcupadosKeys.has(key)) {
          dayElem.classList.add('agenda-dia-ocupado');
          dayElem.title = 'Ya hay acto protocolario agendado este día';
        }
      },
      onOpen: (_d, _s, fp) => {
        window.requestAnimationFrame(() => this.pintarDiasOcupadosEnFlatpickr(fp));
      },
      onMonthChange: (_d, _s, fp) => {
        window.requestAnimationFrame(() => this.pintarDiasOcupadosEnFlatpickr(fp));
      },
    });
  }

  private toLocalDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private destruirAgendaActo93Picker(): void {
    this.agenda93Picker?.destroy();
    this.agenda93Picker = null;
    this.agendaActo93OcupadosKeys.clear();
    this.agenda93Cargada = false;
    this.agenda93Cargando = false;
  }
}

