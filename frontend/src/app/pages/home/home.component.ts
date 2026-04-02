import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import flatpickr from 'flatpickr';
import { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import { HeaderComponent } from '../../layout/header/header.component';
import { NuevoEgresadoComponent } from './nuevo-egresado/nuevo-egresado.component';
import { EgresadoForm } from '../../core/datos';
import { EgresadoService, EgresadoItem, EgresadoDetail } from '../../services/egresado.service';
import { AuthService, CrearUsuarioBody, UsuarioStaffItem } from '../../services/auth.service';

type EstadoPaso = 'completado' | 'en_curso' | 'pendiente';
interface PasoProcesoUi {
  numero: number;
  titulo: string;
  descripcion: string;
  fecha?: string;
  estado: EstadoPaso;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, NuevoEgresadoComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit, OnDestroy {
  @ViewChild('fechaAgendar93Input') fechaAgendar93Input?: ElementRef<HTMLInputElement>;

  mostrarFormulario = false;
  editando = false;
  mensaje = '';
  lista: EgresadoItem[] = [];
  listaUsuarios: UsuarioStaffItem[] = [];
  usuarioSeleccionado: UsuarioStaffItem | null = null;
  tabLista: 'egresados' | 'usuarios' = 'egresados';
  textoBusqueda = '';
  mostrarFiltro = false;
  fechaDesde = '';
  fechaHasta = '';
  tipoFiltroFecha = 'anexo_xxxi'; // 'anexo_xxxi' | 'constancia'
  detalle: EgresadoDetail | null = null;
  cargandoDetalle = false;
  cargandoLista = false;
  errorLista = '';
  enviandoEnviar = false;
  procesandoPaso = false;

  mostrarModalAgregarUsuario = false;
  mostrarFormularioUsuario = false;
  usuarioForm: CrearUsuarioBody = {
    nombre: '',
    rol: 'coordinador',
    correo_electronico: '',
    curp: '',
  };
  guardandoUsuario = false;
  mensajeUsuario = '';
  mostrarModalAgendar93 = false;
  agendandoActo93 = false;
  fechaAgendar93 = '';
  mensajeAgendar93 = '';
  agendaActo93Ocupados: Date[] = [];
  cargandoAgendaOcupados93 = false;
  agenda93Picker: FlatpickrInstance | null = null;

  /** Solo el coordinador (no servicios_escolares) puede agregar usuarios. */
  get esCoordinador(): boolean {
    return this.authService.getUsuario()?.rol?.toLowerCase() === 'coordinador';
  }

  constructor(
    private egresadoService: EgresadoService,
    private authService: AuthService,
  ) {}

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

  ngOnInit(): void {
    this.cargarLista();
  }

  ngOnDestroy(): void {
    this.agenda93Picker?.destroy();
    this.agenda93Picker = null;
  }

  cargarLista(): void {
    this.errorLista = '';
    this.cargandoLista = true;
    const filtros: { numero_control?: string; fecha_desde?: string; fecha_hasta?: string; tipo_filtro?: string } = {};
    if (this.textoBusqueda?.trim()) filtros.numero_control = this.textoBusqueda;
    if (this.fechaDesde) filtros.fecha_desde = this.fechaDesde;
    if (this.fechaHasta) filtros.fecha_hasta = this.fechaHasta;
    if ((this.fechaDesde || this.fechaHasta) && this.tipoFiltroFecha) filtros.tipo_filtro = this.tipoFiltroFecha;
    this.egresadoService.listar(Object.keys(filtros).length ? filtros : undefined).subscribe({
      next: (lista) => {
        this.lista = lista;
        this.cargandoLista = false;
      },
      error: () => {
        this.lista = [];
        this.cargandoLista = false;
        this.errorLista = 'No se pudo cargar la lista. ¿Está el backend en ejecución?';
      },
    });
  }

  onBuscar(): void {
    if (this.tabLista === 'usuarios') {
      this.cargarListaUsuarios();
    } else {
      this.cargarLista();
    }
  }

  onSeleccionar(item: EgresadoItem): void {
    this.mensaje = '';
    this.detalle = null;
    this.cargandoDetalle = true;
    this.egresadoService.obtenerPorId(item.id).subscribe({
      next: (d) => {
        this.detalle = d;
        this.cargandoDetalle = false;
      },
      error: (err) => {
        if (err?.status === 404 && item.numero_control) {
          this.egresadoService.obtenerPorNumeroControl(item.numero_control).subscribe({
            next: (d) => {
              this.detalle = d;
              this.cargandoDetalle = false;
            },
            error: () => {
              this.detalle = null;
              this.cargandoDetalle = false;
              this.mensaje = 'Egresado no encontrado.';
            },
          });
        } else {
          this.detalle = null;
          this.cargandoDetalle = false;
          this.mensaje = err?.status === 404 ? 'Egresado no encontrado.' : 'No se pudo cargar el egresado.';
        }
      },
    });
  }

  onSeleccionarUsuario(u: UsuarioStaffItem): void {
    this.usuarioSeleccionado = u;
    this.detalle = null;
    this.mostrarFormulario = false;
    this.editando = false;
    this.mostrarFormularioUsuario = false;
    this.mensaje = '';
  }

  cambiarTabLista(tab: 'egresados' | 'usuarios'): void {
    this.tabLista = tab;
    this.detalle = null;
    this.usuarioSeleccionado = null;
    this.textoBusqueda = '';
    this.errorLista = '';
    this.mostrarFormulario = false;
    this.editando = false;
    this.mostrarFormularioUsuario = false;
    if (tab === 'usuarios') this.cargarListaUsuarios();
    else this.cargarLista();
  }

  cerrarDetalle(): void {
    this.detalle = null;
    this.textoBusqueda = '';
    this.cargarLista();
  }

  onAgregar(payload: { datos: EgresadoForm; archivo: File | null }): void {
    this.mensaje = '';
    this.detalle = null;
    this.egresadoService.crear(payload.datos, payload.archivo).subscribe({
      next: () => {
        this.mostrarFormulario = false;
        this.cargarLista();
        this.mensaje = 'Egresado registrado correctamente.';
      },
      error: (err) => {
        const msg = err?.error?.error ?? err?.message ?? err?.statusText;
        this.mensaje = msg
          ? `Error al guardar: ${msg}`
          : 'Error al guardar. Revisa que el backend esté en marcha y MongoDB conectada.';
      },
    });
  }

  onEnviarDepartamento(): void {
    if (!this.detalle) return;
    this.mensaje = '';
    this.enviandoEnviar = true;
    this.egresadoService.enviarDepartamentoAcademico(this.detalle.id).subscribe({
      next: () => {
        this.enviandoEnviar = false;
        this.egresadoService.obtenerPorId(this.detalle!.id).subscribe({
          next: (d) => { this.detalle = d; },
        });
        this.mensaje = 'Enviado al departamento académico para su registro y liberación.';
      },
      error: (err) => {
        this.enviandoEnviar = false;
        const msg = err?.error?.error ?? err?.message ?? err?.statusText;
        this.mensaje = msg ? `Error al enviar: ${msg}` : 'Error al enviar.';
      },
    });
  }

  private refrescarDetalle(): void {
    if (!this.detalle) return;
    this.egresadoService.obtenerPorId(this.detalle.id).subscribe({ next: (d) => (this.detalle = d) });
  }

  private descargarBlob(blob: Blob, nombreArchivo: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
  }

  confirmarRecibidosAnexos(): void {
    if (!this.detalle || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensaje = '';
    this.egresadoService.confirmarRecibidosAnexosXxxiXxxii(this.detalle.id).subscribe({
      next: () => {
        this.procesandoPaso = false;
        this.mensaje = 'Recibidos de anexos XXXI y XXXII confirmados.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensaje = err?.error?.error ?? 'No se pudo confirmar recibidos.';
      },
    });
  }

  crearDescargar91(): void {
    if (!this.detalle || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensaje = '';
    const nc = this.detalle.numero_control;
    this.egresadoService.descargarAnexo91(this.detalle.id).subscribe({
      next: (blob) => {
        this.procesandoPaso = false;
        this.descargarBlob(blob, `Anexo-9.1-${nc}.pdf`);
        this.mensaje = 'Anexo 9.1 generado y descargado.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensaje = err?.error?.error ?? 'No se pudo generar el anexo 9.1.';
      },
    });
  }

  confirmarEntrega91(): void {
    if (!this.detalle || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensaje = '';
    this.egresadoService.confirmarEntregaAnexo91(this.detalle.id).subscribe({
      next: () => {
        this.procesandoPaso = false;
        this.mensaje = 'Entrega de anexo 9.1 confirmada.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensaje = err?.error?.error ?? 'No se pudo confirmar entrega 9.1.';
      },
    });
  }

  crearDescargar92(): void {
    if (!this.detalle || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensaje = '';
    const nc = this.detalle.numero_control;
    this.egresadoService.descargarAnexo92(this.detalle.id).subscribe({
      next: (blob) => {
        this.procesandoPaso = false;
        this.descargarBlob(blob, `Anexo-9.2-${nc}.pdf`);
        this.mensaje = 'Anexo 9.2 generado y descargado.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensaje = err?.error?.error ?? 'No se pudo generar anexo 9.2.';
      },
    });
  }

  confirmarRecibido92(): void {
    if (!this.detalle || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensaje = '';
    this.egresadoService.confirmarRecibidoAnexo92(this.detalle.id).subscribe({
      next: () => {
        this.procesandoPaso = false;
        this.mensaje = 'Recibido de 9.2 confirmado.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensaje = err?.error?.error ?? 'No se pudo confirmar recibido 9.2.';
      },
    });
  }

  solicitarSinodales(): void {
    if (!this.detalle || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensaje = '';
    this.egresadoService.solicitarSinodales(this.detalle.id).subscribe({
      next: () => {
        this.procesandoPaso = false;
        this.mensaje = 'Solicitud de sinodales registrada.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensaje = err?.error?.error ?? 'No se pudo solicitar sinodales.';
      },
    });
  }

  confirmarSinodalesRecibidos(): void {
    if (!this.detalle || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensaje = '';
    this.egresadoService.confirmarSinodalesRecibidos(this.detalle.id).subscribe({
      next: () => {
        this.procesandoPaso = false;
        this.mensaje = 'Sinodales recibidos confirmados.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensaje = err?.error?.error ?? 'No se pudo confirmar sinodales.';
      },
    });
  }

  crearDescargar93(): void {
    if (!this.detalle || this.procesandoPaso) return;
    this.procesandoPaso = true;
    this.mensaje = '';
    const nc = this.detalle.numero_control;
    this.egresadoService.descargarAnexo93(this.detalle.id).subscribe({
      next: (blob) => {
        this.procesandoPaso = false;
        this.descargarBlob(blob, `Anexo-9.3-${nc}.pdf`);
        this.mensaje = 'Anexo 9.3 generado y descargado.';
        this.refrescarDetalle();
      },
      error: (err) => {
        this.procesandoPaso = false;
        this.mensaje = err?.error?.error ?? 'No se pudo generar anexo 9.3.';
      },
    });
  }

  onEliminar(): void {
    if (!this.detalle) return;
    if (!confirm(`¿Eliminar el registro de ${this.detalle.datos_personales.nombre} ${this.detalle.datos_personales.apellido_paterno}? Esta acción no se puede deshacer.`)) return;
    this.mensaje = '';
    this.egresadoService.eliminar(this.detalle.id).subscribe({
      next: () => {
        this.detalle = null;
        this.textoBusqueda = '';
        this.cargarLista();
        this.mensaje = 'Registro eliminado correctamente.';
      },
      error: (err) => {
        const msg = err?.error?.error ?? err?.message ?? err?.statusText;
        this.mensaje = msg ? `Error al eliminar: ${msg}` : 'Error al eliminar.';
      },
    });
  }

  onActualizar(payload: { id: string; datos: EgresadoForm; archivo: File | null }): void {
    this.mensaje = '';
    this.egresadoService.actualizar(payload.id, payload.datos, payload.archivo).subscribe({
      next: () => {
        this.editando = false;
        this.egresadoService.obtenerPorId(payload.id).subscribe({
          next: (d) => {
            this.detalle = d;
          },
        });
        this.cargarLista();
        this.mensaje = 'Egresado actualizado correctamente.';
      },
      error: (err) => {
        const msg = err?.error?.error ?? err?.message ?? err?.statusText;
        this.mensaje = msg
          ? `Error al actualizar: ${msg}`
          : 'Error al actualizar. Revisa que el backend esté en marcha y MongoDB conectada.';
      },
    });
  }

  abrirModalAgregarUsuario(): void {
    this.mostrarFormulario = false;
    this.editando = false;
    this.usuarioForm = { nombre: '', rol: 'coordinador', correo_electronico: '', curp: '' };
    this.mensajeUsuario = '';
    this.mostrarFormularioUsuario = true;
    this.tabLista = 'usuarios';
    this.usuarioSeleccionado = null;
  }

  cerrarModalAgregarUsuario(): void {
    this.mostrarFormularioUsuario = false;
    this.mensajeUsuario = '';
  }

  guardarUsuario(): void {
    this.mensajeUsuario = '';
    if (!this.usuarioForm.correo_electronico?.trim()) {
      this.mensajeUsuario = 'El correo electrónico es obligatorio.';
      return;
    }
    this.guardandoUsuario = true;
    this.authService.crearUsuario(this.usuarioForm).subscribe({
      next: (res) => {
        this.guardandoUsuario = false;
        this.mostrarFormularioUsuario = false;
        this.mensaje = res?.message ?? 'Usuario creado. Se han enviado las credenciales al correo.';
        this.cargarListaUsuarios();
      },
      error: (err) => {
        this.guardandoUsuario = false;
        const msg = err?.error?.error ?? err?.message ?? err?.statusText;
        this.mensajeUsuario = msg ?? 'Error al crear el usuario.';
      },
    });
  }

  get diasOcupadosAgenda93(): string[] {
    const set = new Set(this.agendaActo93Ocupados.map((d) => this.toLocalDateKey(d)));
    return [...set];
  }

  get horasOcupadasDiaSeleccionado93(): string[] {
    const base = this.parseDatetimeLocal(this.fechaAgendar93);
    if (!base) return [];
    const key = this.toLocalDateKey(base);
    return this.agendaActo93Ocupados
      .filter((d) => this.toLocalDateKey(d) === key)
      .map((d) => this.toLocalTimeKey(d))
      .sort();
  }

  get horaSeleccionadaYaOcupada93(): boolean {
    const actual = this.parseDatetimeLocal(this.fechaAgendar93);
    if (!actual) return false;
    const ini = actual.getTime();
    const fin = ini + 60 * 60 * 1000;
    return this.agendaActo93Ocupados.some((ocupada) => {
      const oIni = ocupada.getTime();
      const oFin = oIni + 60 * 60 * 1000;
      return ini < oFin && oIni < fin;
    });
  }

  get pasosProcesoTitulacion(): PasoProcesoUi[] {
    if (!this.detalle) return [];
    const steps = [
      { key: 'fecha_enviado_departamento_academico', titulo: 'Solicitud de anexo XXXI y XXXII', descripcion: 'Se registra el envio al departamento academico para revision inicial.' },
      { key: 'fecha_confirmacion_recibidos_anexo_xxxi_xxxii', titulo: 'Recibidos anexo XXXI y XXXII', descripcion: 'Se confirma recepcion de anexo XXXI y XXXII.' },
      { key: 'fecha_creacion_anexo_9_1', titulo: 'Crear 9.1', descripcion: 'Se genera el anexo 9.1 dentro del flujo de titulacion.' },
      { key: 'fecha_confirmacion_entrega_anexo_9_1', titulo: 'Entrega de anexo 9.1', descripcion: 'El egresado confirma entrega del anexo 9.1.' },
      { key: 'fecha_creacion_anexo_9_2', titulo: 'Crear 9.2', descripcion: 'Se genera el documento 9.2.' },
      { key: 'fecha_confirmacion_recibido_anexo_9_2', titulo: 'Recibido 9.2', descripcion: 'El egresado confirma recepcion del documento 9.2.' },
      { key: 'fecha_solicitud_sinodales', titulo: 'Solicitud de sinodales', descripcion: 'Se solicita la asignacion del tribunal de sinodales.' },
      { key: 'fecha_confirmacion_sinodales_recibidos', titulo: 'Recibimos sinodales', descripcion: 'Se confirma que el egresado recibio la asignacion de sinodales.' },
      { key: 'fecha_agenda_acto_9_3', titulo: 'Agendar acto 9.3', descripcion: 'Se agenda fecha y hora del acto protocolario 9.3.' },
      { key: 'fecha_creacion_anexo_9_3', titulo: 'Crear 9.3', descripcion: 'Se genera el anexo 9.3 despues del agendamiento.' },
    ] as const;

    let todosPreviosCompletados = true;
    return steps.map((s, i) => {
      const fecha = (this.detalle as unknown as Record<string, string | undefined>)[s.key];
      const completado = !!fecha;
      const estado: EstadoPaso = completado
        ? 'completado'
        : (todosPreviosCompletados ? 'en_curso' : 'pendiente');
      if (!completado) todosPreviosCompletados = false;
      return {
        numero: i + 1,
        titulo: s.titulo,
        descripcion: s.descripcion,
        fecha,
        estado,
      };
    });
  }

  etiquetaEstadoPaso(estado: EstadoPaso): string {
    if (estado === 'completado') return 'Completado';
    if (estado === 'en_curso') return 'En curso';
    return 'Pendiente';
  }

  puedeEnviarDepartamento(): boolean {
    if (!this.detalle) return false;
    return !this.enviandoEnviar && !this.detalle.fecha_enviado_departamento_academico;
  }

  puedeAgendar93(): boolean {
    if (!this.detalle) return false;
    return !this.detalle.fecha_agenda_acto_9_3 && !!this.detalle.fecha_confirmacion_sinodales_recibidos;
  }

  onAbrirModalAgendar93(): void {
    if (!this.detalle) return;
    this.mensajeAgendar93 = '';
    this.fechaAgendar93 = '';
    this.mostrarModalAgendar93 = true;
    this.cargarAgendaActo93Ocupados();
    setTimeout(() => this.initAgendaActo93Picker(), 0);
  }

  cerrarModalAgendar93(): void {
    this.mostrarModalAgendar93 = false;
    this.mensajeAgendar93 = '';
    this.fechaAgendar93 = '';
    this.agendaActo93Ocupados = [];
    this.agenda93Picker?.destroy();
    this.agenda93Picker = null;
  }

  confirmarAgendar93(): void {
    if (!this.detalle || !this.fechaAgendar93) return;
    if (this.horaSeleccionadaYaOcupada93) {
      this.mensajeAgendar93 = 'Esa hora se cruza con un acto ya agendado.';
      return;
    }
    this.agendandoActo93 = true;
    this.mensajeAgendar93 = '';
    this.egresadoService.agendarActo93(this.detalle.id, this.fechaAgendar93).subscribe({
      next: () => {
        this.agendandoActo93 = false;
        this.mensaje = 'Acto 9.3 agendado correctamente.';
        this.egresadoService.obtenerPorId(this.detalle!.id).subscribe({ next: (d) => (this.detalle = d) });
        this.cerrarModalAgendar93();
      },
      error: (err) => {
        this.agendandoActo93 = false;
        this.mensajeAgendar93 = err?.error?.error ?? 'No se pudo agendar el acto 9.3.';
      },
    });
  }

  abrirPickerAgenda93(): void {
    this.agenda93Picker?.open();
  }

  private cargarAgendaActo93Ocupados(): void {
    this.cargandoAgendaOcupados93 = true;
    this.egresadoService.getAgendaActo93Ocupados().subscribe({
      next: (res) => {
        this.agendaActo93Ocupados = (res?.ocupados ?? [])
          .map((s) => new Date(s))
          .filter((d) => !isNaN(d.getTime()));
        this.cargandoAgendaOcupados93 = false;
        this.initAgendaActo93Picker();
      },
      error: () => {
        this.agendaActo93Ocupados = [];
        this.cargandoAgendaOcupados93 = false;
        this.initAgendaActo93Picker();
      },
    });
  }

  private initAgendaActo93Picker(): void {
    const el = this.fechaAgendar93Input?.nativeElement;
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
        this.fechaAgendar93 = dateStr;
      },
      onDayCreate: (_dObj, _dStr, _fp, dayElem) => {
        const dateObj = (dayElem as unknown as { dateObj?: Date }).dateObj;
        if (!dateObj) return;
        const key = this.toLocalDateKey(dateObj);
        if (this.diasOcupadosAgenda93.includes(key)) {
          dayElem.classList.add('agenda-dia-ocupado');
          dayElem.title = 'Ya hay acto agendado este dia';
        }
      },
    });
  }

  private parseDatetimeLocal(value: string): Date | null {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  private toLocalDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private toLocalTimeKey(d: Date): string {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }

  private cargarListaUsuarios(): void {
    this.errorLista = '';
    this.cargandoLista = true;
    this.authService.listarUsuarios().subscribe({
      next: (lista) => {
        const term = this.textoBusqueda.trim().toLowerCase();
        this.listaUsuarios = term
          ? lista.filter((u) =>
              [u.nombre, u.username, u.correo_electronico, u.curp]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(term)),
            )
          : lista;
        this.cargandoLista = false;
      },
      error: () => {
        this.listaUsuarios = [];
        this.cargandoLista = false;
        this.errorLista = 'No se pudo cargar la lista de usuarios.';
      },
    });
  }
}
