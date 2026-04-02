import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CARRERAS, NIVELES, MODALIDADES, EgresadoForm } from '../../../core/datos';
import { EgresadoDetail } from '../../../services/egresado.service';

export interface AgregarEgresadoPayload {
  datos: EgresadoForm;
  archivo: File | null;
}

export interface ActualizarEgresadoPayload {
  id: string;
  datos: EgresadoForm;
  archivo: File | null;
}

@Component({
  selector: 'app-nuevo-egresado',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './nuevo-egresado.component.html',
  styleUrl: './nuevo-egresado.component.css',
})
export class NuevoEgresadoComponent implements OnChanges {
  @Input() egresadoParaEditar: EgresadoDetail | null = null;
  @Output() cancelar = new EventEmitter<void>();
  @Output() agregar = new EventEmitter<AgregarEgresadoPayload>();
  @Output() actualizar = new EventEmitter<ActualizarEgresadoPayload>();

  readonly carreras = CARRERAS;
  readonly niveles = NIVELES;
  readonly modalidades = MODALIDADES;

  archivoSeleccionado: File | null = null;
  /** Al editar: true si el usuario quiere quitar el archivo actual. */
  quitarArchivoSeleccionado = false;
  /** True cuando intentaron guardar sin adjuntar archivo (para marcar el campo en rojo). */
  archivoRequeridoError = false;
  form: FormGroup;

  constructor(private fb: FormBuilder) {
    this.form = this.fb.group({
      numero_control: ['', Validators.required],
      nombre: ['', Validators.required],
      apellido_paterno: ['', Validators.required],
      apellido_materno: ['', Validators.required],
      carrera: ['', Validators.required],
      nivel: ['', Validators.required],
      direccion: ['', Validators.required],
      telefono: ['', Validators.required],
      correo_electronico: ['', [Validators.required, Validators.email]],
      nombre_proyecto: ['', Validators.required],
      modalidad: ['', Validators.required],
      curso_titulacion: [false],
      asesor_interno: [''],
      asesor_externo: [''],
      director: [''],
      asesor_1: [''],
      asesor_2: [''],
      fecha_registro_anexo: ['', Validators.required],
      fecha_expedicion_constancia: ['', Validators.required],
      observaciones: [''], // único opcional (notas)
    });
    this.actualizarValidadoresAsesores();
    this.form.get('modalidad')?.valueChanges.subscribe(() => this.actualizarValidadoresAsesores());
  }

  ngOnChanges(changes: SimpleChanges): void {
    const d = changes['egresadoParaEditar']?.currentValue as EgresadoDetail | null;
    if (d) {
      const isoToDate = (s?: string) => (s ? s.slice(0, 10) : '');
      this.form.patchValue({
        numero_control: d.numero_control,
        nombre: d.datos_personales.nombre,
        apellido_paterno: d.datos_personales.apellido_paterno,
        apellido_materno: d.datos_personales.apellido_materno,
        carrera: d.datos_personales.carrera,
        nivel: d.datos_personales.nivel,
        direccion: d.datos_personales.direccion || '',
        telefono: d.datos_personales.telefono || '',
        correo_electronico: d.datos_personales.correo_electronico || '',
        nombre_proyecto: d.datos_proyecto.nombre_proyecto || '',
        modalidad: d.datos_proyecto.modalidad || '',
        curso_titulacion: d.datos_proyecto.curso_titulacion === 'si',
        asesor_interno: d.datos_proyecto.asesor_interno || '',
        asesor_externo: d.datos_proyecto.asesor_externo || '',
        director: d.datos_proyecto.director || '',
        asesor_1: d.datos_proyecto.asesor_1 || '',
        asesor_2: d.datos_proyecto.asesor_2 || '',
        fecha_registro_anexo: isoToDate(d.documentos?.anexo_xxxi?.fecha_registro),
        fecha_expedicion_constancia: isoToDate(d.documentos?.constancia_no_inconveniencia?.fecha_expedicion),
        observaciones: '',
      });
      this.actualizarValidadoresAsesores();
      this.quitarArchivoSeleccionado = false;
    }
  }

  get tieneArchivoActual(): boolean {
    const adj = this.egresadoParaEditar?.documento_adjunto;
    return !!(adj?.nombre_original || (adj?.tamanio_bytes && adj.tamanio_bytes > 0));
  }

  get editando(): boolean {
    return !!this.egresadoParaEditar;
  }

  /** Según la modalidad, exige asesor interno/externo o director y asesores 1 y 2. */
  private actualizarValidadoresAsesores(): void {
    const modalidad = this.form.get('modalidad')?.value;
    const esResidencia = modalidad === 'Residencia Profesional';
    const required = Validators.required;
    if (esResidencia) {
      this.form.get('asesor_interno')?.setValidators(required);
      this.form.get('asesor_externo')?.setValidators(required);
      this.form.get('director')?.clearValidators();
      this.form.get('asesor_1')?.clearValidators();
      this.form.get('asesor_2')?.clearValidators();
    } else {
      this.form.get('asesor_interno')?.clearValidators();
      this.form.get('asesor_externo')?.clearValidators();
      this.form.get('director')?.setValidators(required);
      this.form.get('asesor_1')?.setValidators(required);
      this.form.get('asesor_2')?.setValidators(required);
    }
    this.form.get('asesor_interno')?.updateValueAndValidity();
    this.form.get('asesor_externo')?.updateValueAndValidity();
    this.form.get('director')?.updateValueAndValidity();
    this.form.get('asesor_1')?.updateValueAndValidity();
    this.form.get('asesor_2')?.updateValueAndValidity();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.archivoSeleccionado = file ?? null;
    this.archivoRequeridoError = false;
    if (file) this.quitarArchivoSeleccionado = false;
  }

  /** Indica si el control está inválido y ya fue tocado (para marcar en rojo y mostrar "Campo obligatorio"). */
  campoInvalido(controlName: string): boolean {
    const c = this.form.get(controlName);
    return !!(c?.invalid && c?.touched);
  }

  onCancelar(): void {
    this.archivoSeleccionado = null;
    this.quitarArchivoSeleccionado = false;
    this.cancelar.emit();
  }

  onQuitarArchivoActual(): void {
    this.quitarArchivoSeleccionado = true;
    this.archivoSeleccionado = null;
  }

  onRestaurarArchivoActual(): void {
    this.quitarArchivoSeleccionado = false;
  }

  onSubmit(): void {
    this.archivoRequeridoError = false;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!this.editando && !this.archivoSeleccionado) {
      this.archivoRequeridoError = true;
      return;
    }
    const raw = this.form.getRawValue();
    const datos: EgresadoForm = {
      ...raw,
      curso_titulacion: raw.curso_titulacion ? 'si' : 'no',
      quitar_archivo: this.editando ? this.quitarArchivoSeleccionado : undefined,
    };
    if (this.editando && this.egresadoParaEditar) {
      this.actualizar.emit({
        id: this.egresadoParaEditar.id,
        datos,
        archivo: this.archivoSeleccionado,
      });
    } else {
      this.agregar.emit({
        datos,
        archivo: this.archivoSeleccionado,
      });
    }
  }
}
