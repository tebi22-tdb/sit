import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HeaderComponent } from '../../layout/header/header.component';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-coordinador-inicio',
  standalone: true,
  imports: [CommonModule, HeaderComponent],
  template: `
    <div class="coordinador-inicio">
      <app-header [showNuevoButton]="false" [showAgregarUsuarioButton]="false"></app-header>
      <div class="contenido">
        <h1 class="titulo">Bienvenido</h1>
        <div class="cards">
          <button type="button" class="card" (click)="irAltaEgresadosUsuarios()">
            <div class="card-texto">
              <h2>{{ tituloCardAlta }}</h2>
              <p>{{ descripcionCardAlta }}</p>
            </div>
            <div class="card-icono" aria-hidden="true">Alta</div>
          </button>
          <button type="button" class="card" (click)="irSeguimientoProceso()">
            <div class="card-texto">
              <h2>Seguimiento del proceso</h2>
              <p>Envíos a académicos, anexos 9.1 / 9.3, sinodales y acto protocolario.</p>
            </div>
            <div class="card-icono" aria-hidden="true">Seg</div>
          </button>
          <button type="button" class="card">
            <div class="card-texto">
              <h2>Revisiones</h2>
              <p>Consulta el estado de revisión académica .</p>
            </div>
            <div class="card-icono" aria-hidden="true">Rev</div>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .coordinador-inicio { min-height: 100vh; background: #f5f7fb; }
    .contenido { padding: 0.6rem 1.5rem 1.5rem; }
    .titulo { margin: 0 0 .9rem; text-align: center; font-size: 2.05rem; font-weight: 700; color: #1f2937; letter-spacing: .2px; }
    .cards { max-width: 1060px; margin: 1.05rem auto 0; display: grid; grid-template-columns: repeat(3, minmax(220px, 1fr)); gap: 0.75rem; }
    .card { border: 1px solid #aac7ec; border-radius: 16px; background: #b9d9ff; padding: .82rem .9rem; min-height: 122px; display: flex; align-items: center; justify-content: space-between; gap: .72rem; text-align: left; cursor: pointer; transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
    .card:hover { transform: translateY(-1px); box-shadow: 0 6px 14px rgba(0,0,0,.10); border-color: #7faedc; }
    .card-texto h2 { margin: 0 0 .3rem; font-size: 1.7rem; font-weight: 650; color: #1f2937; line-height: 1.02; }
    .card-texto p { margin: 0; font-size: .9rem; color: #374151; line-height: 1.25; max-width: 28ch; }
    .card-icono { width: 88px; height: 88px; border-radius: 14px; background: rgba(255,255,255,.78); display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 700; color: #1f4c8f; flex-shrink: 0; }
    @media (max-width: 900px) {
      .contenido { padding: 0.6rem 1rem 1.2rem; }
      .titulo { font-size: 1.8rem; }
      .cards { grid-template-columns: 1fr; max-width: 760px; }
      .card { min-height: 116px; }
      .card-texto h2 { font-size: 1.45rem; }
      .card-icono { width: 78px; height: 78px; font-size: 1.7rem; }
    }
  `],
})
export class CoordinadorInicioComponent {
  constructor(
    private router: Router,
    private auth: AuthService,
  ) {}

  get tituloCardAlta(): string {
    return this.auth.puedeAdministrarUsuariosStaff()
      ? 'Alta de egresados y usuarios'
      : 'Alta de egresados';
  }

  get descripcionCardAlta(): string {
    return this.auth.puedeAdministrarUsuariosStaff()
      ? 'Registro de alumnos, documentos y usuarios del personal.'
      : 'Registro de alumnos y documentos de titulación.';
  }

  irAltaEgresadosUsuarios(): void {
    this.router.navigate(['/home/alta']);
  }

  irSeguimientoProceso(): void {
    this.router.navigate(['/home/seguimiento-proceso']);
  }
}
