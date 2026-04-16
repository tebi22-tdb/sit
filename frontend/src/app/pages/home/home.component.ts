import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HeaderComponent } from '../../layout/header/header.component';
import { NuevoEgresadoComponent } from './nuevo-egresado/nuevo-egresado.component';
import { EgresadoForm } from '../../core/datos';
import { EgresadoService, EgresadoItem, EgresadoDetail, EgresadoCrearResponse } from '../../services/egresado.service';
import { AuthService, CrearUsuarioBody, UsuarioStaffItem } from '../../services/auth.service';

/**
 * Coordinador: alta/edición de egresados y administración de usuarios del personal.
 * El seguimiento del proceso de titulación (incl. residencia profesional) está en la ruta `/home/seguimiento-proceso`.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent, NuevoEgresadoComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit {
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
  tipoFiltroFecha = 'anexo_xxxi';
  detalle: EgresadoDetail | null = null;
  cargandoDetalle = false;
  cargandoLista = false;
  errorLista = '';

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

  get esCoordinador(): boolean {
    return this.authService.getUsuario()?.rol?.toLowerCase() === 'coordinador';
  }

  constructor(
    private egresadoService: EgresadoService,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    this.cargarLista();
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
      next: (res: EgresadoCrearResponse) => {
        this.mostrarFormulario = false;
        this.cargarLista();
        if (res.credenciales_enviadas_correo === true) {
          this.mensaje = 'Egresado registrado. Se enviaron usuario y contraseña al correo del egresado.';
        } else if (res.aviso_credenciales) {
          this.mensaje = `Egresado registrado. ${res.aviso_credenciales}`;
        } else {
          this.mensaje = 'Egresado registrado correctamente.';
        }
      },
      error: (err) => {
        const msg = err?.error?.error ?? err?.message ?? err?.statusText;
        this.mensaje = msg
          ? `Error al guardar: ${msg}`
          : 'Error al guardar. Revisa que el backend esté en marcha y MongoDB conectada.';
      },
    });
  }

  onEliminar(): void {
    if (!this.detalle) return;
    if (
      !confirm(
        `¿Eliminar el registro de ${this.detalle.datos_personales.nombre} ${this.detalle.datos_personales.apellido_paterno}? Esta acción no se puede deshacer.`,
      )
    ) {
      return;
    }
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
    if (!this.usuarioForm.curp?.trim()) {
      this.mensajeUsuario = 'La CURP es obligatoria.';
      return;
    }
    this.usuarioForm.curp = this.usuarioForm.curp.trim().toUpperCase();
    this.guardandoUsuario = true;
    this.authService.crearUsuario(this.usuarioForm).subscribe({
      next: (res) => {
        this.guardandoUsuario = false;
        this.mostrarFormularioUsuario = false;
        let m = res?.message ?? 'Usuario creado.';
        if (res?.correo_enviado === false && res?.detalle_correo) {
          m += ` (${res.detalle_correo})`;
        }
        this.mensaje = m;
        this.cargarListaUsuarios();
      },
      error: (err) => {
        this.guardandoUsuario = false;
        const msg = err?.error?.error ?? err?.message ?? err?.statusText;
        this.mensajeUsuario = msg ?? 'Error al crear el usuario.';
      },
    });
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
