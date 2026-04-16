import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import flatpickr from 'flatpickr';
import { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import { HeaderComponent } from '../../layout/header/header.component';
import { mensajeErrorApiConBlob } from '../../core/http-blob-error';
import { EgresadoService, EgresadoDetail, EgresadoItem } from '../../services/egresado.service';

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
interface PasoProcesoUi {
  numero: number;
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
  @ViewChild('fechaActoInput') fechaActoInput?: ElementRef<HTMLInputElement>;
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
  agendaActo93Ocupados: Date[] = [];
  agenda93Picker: FlatpickrInstance | null = null;

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

  constructor(private egresadoService: EgresadoService) {}

  ngOnInit(): void {
    this.cargar();
  }

  ngOnDestroy(): void {
    this.agenda93Picker?.destroy();
    this.agenda93Picker = null;
  }

  seleccionarEstado(estado: EstadoFiltro): void {
    this.filtroEstado = estado;
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

  seleccionarEgresado(item: SeguimientoItem): void {
    this.mensajeProceso = '';
    this.cargandoDetalle = true;
    this.fechaActo93 = '';
    this.agenda93Picker?.destroy();
    this.agenda93Picker = null;
    this.egresadoService.obtenerPorId(item.id).subscribe({
      next: (d) => {
        this.detalleSeleccionado = d;
        this.cargandoDetalle = false;
        this.cargarAgendaActo93Ocupados();
      },
      error: () => {
        this.detalleSeleccionado = null;
        this.cargandoDetalle = false;
      },
    });
  }

  get pasosProcesoTitulacion(): PasoProcesoUi[] {
    if (!this.detalleSeleccionado) return [];
    const esRes = this.esResidenciaProfesionalSeguimiento;
    const steps = [
      {
        key: 'fecha_enviado_departamento_academico',
        titulo: 'Solicitud de anexo XXXI y XXXII',
        descripcion: esRes
          ? 'Se registra el envío al departamento académico para revisión inicial.'
          : 'Se envía al departamento académico para revisión del expediente (anexo XXXI y XXXII).',
      },
      {
        key: 'fecha_confirmacion_recibidos_anexo_xxxi_xxxii',
        titulo: 'Recibidos anexo XXXI y XXXII',
        descripcion: esRes
          ? 'Se confirma recepción de anexo XXXI y XXXII.'
          : 'División confirma recepción una vez aprobado el expediente en el departamento académico.',
      },
      { key: 'fecha_creacion_anexo_9_1', titulo: 'Crear 9.1', descripcion: 'Se genera el anexo 9.1 dentro del flujo de titulacion.' },
      { key: 'fecha_confirmacion_entrega_anexo_9_1', titulo: 'Entrega de anexo 9.1', descripcion: 'El egresado confirma entrega del anexo 9.1.' },
      { key: 'fecha_solicitud_anexo_9_2', titulo: 'Solicitar 9.2 al egresado', descripcion: 'División registra la solicitud de entrega de la constancia 9.2.' },
      { key: 'fecha_confirmacion_recibido_anexo_9_2', titulo: 'Recibido 9.2', descripcion: 'Se confirma la recepcion de la constancia 9.2 (división o egresado).' },
      { key: 'fecha_solicitud_sinodales', titulo: 'Solicitud de sinodales', descripcion: 'Se solicita la asignacion del tribunal de sinodales.' },
      { key: 'fecha_confirmacion_sinodales_recibidos', titulo: 'Recibimos sinodales', descripcion: 'Se confirma que el egresado recibio la asignacion de sinodales.' },
      { key: 'fecha_agenda_acto_9_3', titulo: 'Agendar acto 9.3', descripcion: 'Se agenda fecha y hora del acto protocolario 9.3.' },
      { key: 'fecha_creacion_anexo_9_3', titulo: 'Crear 9.3', descripcion: 'Se genera el anexo 9.3 despues del agendamiento.' },
    ] as const;
    let todosPreviosCompletados = true;
    return steps.map((s, i) => {
      const fecha = (this.detalleSeleccionado as unknown as Record<string, string | undefined>)[s.key];
      const completado = !!fecha;
      const estado: EstadoPaso = completado ? 'completado' : (todosPreviosCompletados ? 'en_curso' : 'pendiente');
      if (!completado) todosPreviosCompletados = false;
      return { numero: i + 1, titulo: s.titulo, descripcion: s.descripcion, fecha, estado };
    });
  }

  etiquetaEstadoPaso(estado: EstadoPaso): string {
    if (estado === 'completado') return 'Completado';
    if (estado === 'en_curso') return 'En curso';
    return 'Pendiente';
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
    this.egresadoService.obtenerPorId(this.detalleSeleccionado.id).subscribe({
      next: (d) => (this.detalleSeleccionado = d),
    });
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
        this.mensajeProceso = 'Recibidos XXXI/XXXII confirmados.';
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
    this.egresadoService.confirmarSinodalesRecibidos(this.detalleSeleccionado.id).subscribe({
      next: () => {
        this.procesandoPaso = false;
        this.mensajeProceso = 'Sinodales recibidos confirmados.';
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
    this.egresadoService.agendarActo93(this.detalleSeleccionado.id, valor).subscribe({
      next: () => {
        this.procesandoPaso = false;
        this.mensajeProceso = 'Acto 9.3 agendado.';
        this.fechaActo93 = '';
        this.refrescarDetalle();
        this.cargarAgendaActo93Ocupados();
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

  private cargar(): void {
    this.cargando = true;
    this.error = '';
    this.egresadoService.listar().subscribe({
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

    if (e.fecha_creacion_anexo_9_3) {
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
    this.initAgendaActo93Picker();
    this.agenda93Picker?.open();
  }

  private cargarAgendaActo93Ocupados(): void {
    this.egresadoService.getAgendaActo93Ocupados().subscribe({
      next: (res) => {
        this.agendaActo93Ocupados = (res?.ocupados ?? [])
          .map((s) => new Date(s))
          .filter((d) => !isNaN(d.getTime()));
        this.initAgendaActo93Picker();
      },
      error: () => {
        this.agendaActo93Ocupados = [];
      },
    });
  }

  private initAgendaActo93Picker(): void {
    const el = this.fechaActoInput?.nativeElement;
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
      onDayCreate: (_dObj, _dStr, _fp, dayElem) => {
        const dateObj = (dayElem as unknown as { dateObj?: Date }).dateObj;
        if (!dateObj) return;
        const key = this.toLocalDateKey(dateObj);
        if (this.diasOcupadosAgenda93.includes(key)) {
          dayElem.classList.add('agenda-dia-ocupado');
          dayElem.title = 'Ya hay acto agendado este día';
        }
      },
    });
  }

  private get diasOcupadosAgenda93(): string[] {
    const set = new Set(this.agendaActo93Ocupados.map((d) => this.toLocalDateKey(d)));
    return [...set];
  }

  private toLocalDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

