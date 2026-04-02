import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { DomSanitizer, SafeResourceUrl, SafeUrl } from '@angular/platform-browser';
import { HeaderComponent } from '../../../layout/header/header.component';
import { EgresadoService, RevisionApi } from '../../../services/egresado.service';

@Component({
  selector: 'app-revision-documento',
  standalone: true,
  imports: [CommonModule, FormsModule, HeaderComponent],
  templateUrl: './revision-documento.component.html',
  styleUrl: './revision-documento.component.css',
})
export class RevisionDocumentoComponent implements OnInit, OnDestroy {
  id = '';
  cargandoDocumento = false;
  errorDocumento = '';
  documentoUrl: string | null = null;
  documentoUrlSeguro: SafeResourceUrl | null = null;
  documentoHrefSeguro: SafeUrl | null = null;
  documentoContentType = '';
  documentoFileName = '';

  cargandoRevisiones = false;
  revisiones: RevisionApi[] = [];
  revisionSeleccionada: RevisionApi | null = null;

  observacionesNueva = '';
  guardando = false;
  mensaje = '';
  resultadoNueva: 'observaciones' | 'aprobado' = 'observaciones';

  subiendoDocumento = false;
  mensajeSubidaArchivo = '';
  errorSubidaArchivo = false;

  private subs = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private egresadoService: EgresadoService,
    private sanitizer: DomSanitizer,
  ) {}

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    if (this.id) {
      this.cargarDocumento();
      this.cargarRevisiones();
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.documentoUrl) URL.revokeObjectURL(this.documentoUrl);
  }

  cargarDocumento(): void {
    this.cargandoDocumento = true;
    this.errorDocumento = '';
    if (this.documentoUrl) URL.revokeObjectURL(this.documentoUrl);
    this.documentoUrl = null;
    this.documentoUrlSeguro = null;
    this.documentoHrefSeguro = null;
    this.subs.add(
      this.egresadoService.getDocumento(this.id).subscribe({
        next: ({ blob, contentType, fileName }) => {
          this.cargandoDocumento = false;
          this.documentoContentType = contentType || '';
          this.documentoFileName = fileName || 'documento';
          const url = URL.createObjectURL(blob);
          this.documentoUrl = url;
          this.documentoUrlSeguro = this.sanitizer.bypassSecurityTrustResourceUrl(url);
          this.documentoHrefSeguro = this.sanitizer.bypassSecurityTrustUrl(url);
        },
        error: (err) => {
          this.cargandoDocumento = false;
          const msg = err?.error?.error ?? err?.error?.message ?? err?.message ?? err?.statusText;
          this.errorDocumento = msg ? `No se pudo cargar el documento: ${msg}` : 'No se pudo cargar el documento.';
        },
      }),
    );
  }

  /**
   * @param seleccionarMasReciente Si true (p. ej. tras guardar), selecciona la primera de la lista (asumida la más reciente).
   */
  cargarRevisiones(seleccionarMasReciente = false): void {
    this.cargandoRevisiones = true;
    this.revisiones = [];
    this.subs.add(
      this.egresadoService.listarRevisiones(this.id).subscribe({
        next: (lista) => {
          this.cargandoRevisiones = false;
          this.revisiones = lista;
          this.revisionSeleccionada =
            seleccionarMasReciente && lista.length > 0 ? lista[0] : null;
        },
        error: (err) => {
          this.cargandoRevisiones = false;
          const msg = err?.error?.error ?? err?.error?.message ?? err?.message ?? err?.statusText;
          this.mensaje = msg ? `No se pudieron cargar las revisiones: ${msg}` : 'No se pudieron cargar las revisiones.';
        },
      }),
    );
  }

  get esPDF(): boolean {
    return (this.documentoContentType || '').toLowerCase().includes('pdf');
  }

  volver(): void {
    this.router.navigate(['/departamento-academico']);
  }

  seleccionarRevision(r: RevisionApi): void {
    this.revisionSeleccionada = r;
  }

  /** Limpia el formulario para escribir una nueva revisión. */
  nuevaRevisionClick(): void {
    this.observacionesNueva = '';
    this.mensaje = '';
  }

  onArchivoReemplazo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.id || this.subiendoDocumento) return;
    this.subiendoDocumento = true;
    this.mensajeSubidaArchivo = '';
    this.errorSubidaArchivo = false;
    this.subs.add(
      this.egresadoService.reemplazarDocumentoAdjunto(this.id, file).subscribe({
        next: () => {
          this.subiendoDocumento = false;
          this.errorSubidaArchivo = false;
          this.mensajeSubidaArchivo = 'Documento reemplazado. Se muestra el archivo nuevo arriba.';
          input.value = '';
          this.cargarDocumento();
        },
        error: (err) => {
          this.subiendoDocumento = false;
          this.errorSubidaArchivo = true;
          const msg =
            err?.error?.error ??
            (typeof err?.error === 'string' ? err.error : null) ??
            err?.message ??
            err?.statusText;
          this.mensajeSubidaArchivo = msg ? `No se pudo subir: ${msg}` : 'No se pudo subir el archivo.';
        },
      }),
    );
  }

  guardarRevision(resultado: 'observaciones' | 'aprobado'): void {
    if (this.guardando) return;
    this.guardando = true;
    this.mensaje = '';
    this.resultadoNueva = resultado;

    const cuerpo =
      resultado === 'aprobado'
        ? { resultado: 'aprobado' }
        : { resultado: 'observaciones', observaciones: this.observacionesNueva };

    this.subs.add(
      this.egresadoService.crearRevision(this.id, cuerpo).subscribe({
        next: () => {
          this.guardando = false;
          this.observacionesNueva = '';
          this.mensaje = resultado === 'aprobado' ? 'Documento aprobado.' : 'Revisión guardada con observaciones.';
          this.cargarRevisiones(true);
        },
        error: (err) => {
          this.guardando = false;
          const msg = err?.error?.error ?? err?.error?.message ?? err?.message ?? err?.statusText;
          this.mensaje = msg ? `No se pudo guardar la revisión: ${msg}` : 'No se pudo guardar la revisión.';
        },
      }),
    );
  }
}
