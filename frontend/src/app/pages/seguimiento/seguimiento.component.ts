import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../../layout/header/header.component';
import { EgresadoService, EgresadoDetail } from '../../services/egresado.service';

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
  mensajeProceso = '';
  procesando = false;

  get esResidenciaProfesional(): boolean {
    const m = this.datos?.datos_proyecto?.modalidad?.trim() ?? '';
    return m.toLowerCase() === 'residencia profesional';
  }

  constructor(private egresadoService: EgresadoService) {}

  ngOnInit(): void {
    this.cargarSeguimiento();
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

  /** Formatea una fecha ISO a fecha y hora local (ej. 27/02/2025, 14:30). */
  formatearFechaHora(iso?: string): string {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      const dia = d.getDate().toString().padStart(2, '0');
      const mes = (d.getMonth() + 1).toString().padStart(2, '0');
      const anio = d.getFullYear();
      const h = d.getHours().toString().padStart(2, '0');
      const min = d.getMinutes().toString().padStart(2, '0');
      return `${dia}/${mes}/${anio}, ${h}:${min}`;
    } catch {
      return iso;
    }
  }

  private async blobErrorMessage(err: unknown): Promise<string> {
    if (err && typeof err === 'object' && 'error' in err) {
      const er = (err as { error?: unknown }).error;
      if (er instanceof Blob) {
        try {
          const txt = await er.text();
          const j = JSON.parse(txt) as { error?: string };
          if (j?.error) return j.error;
        } catch {
          /* ignore */
        }
        return 'Error al generar el PDF.';
      }
      const oe = (err as { error?: { error?: string } }).error;
      if (oe && typeof oe === 'object' && typeof oe.error === 'string') return oe.error;
    }
    return 'Error en la operación.';
  }

  private descargarBlob(blob: Blob, nombreArchivo: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
  }

  confirmarEntrega91(): void {
    if (!this.datos || this.procesando) return;
    this.procesando = true;
    this.mensajeProceso = '';
    this.egresadoService.confirmarEntregaAnexo91(this.datos.id).subscribe({
      next: () => {
        this.procesando = false;
        this.mensajeProceso = 'Entrega del anexo 9.1 confirmada.';
        this.cargarSeguimiento();
      },
      error: (err: { error?: { error?: string } }) => {
        this.procesando = false;
        this.mensajeProceso = err?.error?.error ?? 'No se pudo confirmar.';
      },
    });
  }

  descargar92(): void {
    if (!this.datos || this.procesando) return;
    this.procesando = true;
    this.mensajeProceso = '';
    this.egresadoService.descargarAnexo92(this.datos.id).subscribe({
      next: (blob: Blob) => {
        this.procesando = false;
        this.descargarBlob(blob, `Anexo-9.2-${this.datos!.numero_control}.pdf`);
        this.mensajeProceso = 'Constancia 9.2 descargada.';
        this.cargarSeguimiento();
      },
      error: (err: unknown) => {
        this.procesando = false;
        void this.blobErrorMessage(err).then((m) => {
          this.mensajeProceso = m;
        });
      },
    });
  }

  confirmarRecibido92(): void {
    if (!this.datos || this.procesando) return;
    this.procesando = true;
    this.mensajeProceso = '';
    const id = this.datos.id;
    this.egresadoService.confirmarRecibidoAnexo92(id).subscribe({
      next: () => {
        this.procesando = false;
        this.mensajeProceso = 'Recibido 9.2 confirmado.';
        this.cargarSeguimiento();
      },
      error: (err: { error?: { error?: string } }) => {
        this.procesando = false;
        this.mensajeProceso = err?.error?.error ?? 'No se pudo confirmar.';
      },
    });
  }

  solicitarSinodales(): void {
    if (!this.datos || this.procesando) return;
    this.procesando = true;
    this.mensajeProceso = '';
    this.egresadoService.solicitarSinodales(this.datos.id).subscribe({
      next: () => {
        this.procesando = false;
        this.mensajeProceso = 'Solicitud de sinodales registrada.';
        this.cargarSeguimiento();
      },
      error: (err: { error?: { error?: string } }) => {
        this.procesando = false;
        this.mensajeProceso = err?.error?.error ?? 'No se pudo solicitar.';
      },
    });
  }

  confirmarSinodalesRecibidos(): void {
    if (!this.datos || this.procesando) return;
    this.procesando = true;
    this.mensajeProceso = '';
    this.egresadoService.confirmarSinodalesRecibidos(this.datos.id).subscribe({
      next: () => {
        this.procesando = false;
        this.mensajeProceso = 'Sinodales recibidos confirmado.';
        this.cargarSeguimiento();
      },
      error: (err: { error?: { error?: string } }) => {
        this.procesando = false;
        this.mensajeProceso = err?.error?.error ?? 'No se pudo confirmar.';
      },
    });
  }

  agendarActo93(valor: string): void {
    if (!this.datos || this.procesando) return;
    if (!valor?.trim()) {
      this.mensajeProceso = 'Selecciona fecha y hora del acto.';
      return;
    }
    this.procesando = true;
    this.mensajeProceso = '';
    this.egresadoService.agendarActo93(this.datos.id, valor).subscribe({
      next: () => {
        this.procesando = false;
        this.mensajeProceso = 'Acto 9.3 agendado.';
        this.cargarSeguimiento();
      },
      error: (err: { error?: { error?: string } }) => {
        this.procesando = false;
        this.mensajeProceso = err?.error?.error ?? 'No se pudo agendar.';
      },
    });
  }

  descargar93(): void {
    if (!this.datos || this.procesando) return;
    this.procesando = true;
    this.mensajeProceso = '';
    this.egresadoService.descargarAnexo93(this.datos.id).subscribe({
      next: (blob: Blob) => {
        this.procesando = false;
        this.descargarBlob(blob, `Anexo-9.3-${this.datos!.numero_control}.pdf`);
        this.mensajeProceso = 'Anexo 9.3 descargado. ¡Proceso finalizado!';
        this.cargarSeguimiento();
      },
      error: (err: unknown) => {
        this.procesando = false;
        void this.blobErrorMessage(err).then((m) => {
          this.mensajeProceso = m;
        });
      },
    });
  }
}
