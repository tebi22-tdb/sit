import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HeaderComponent } from '../../layout/header/header.component';

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
              <h2>Alta de Egresados / Usuarios</h2>
              <p>Registrar nuevos alumnos y administrar usuarios.</p>
            </div>
            <div class="card-icono" aria-hidden="true">Alta</div>
          </button>
          <button type="button" class="card" (click)="irSeguimientoProceso()">
            <div class="card-texto">
              <h2>Seguimiento de proceso de titulacion</h2>
              <p>Monitoreo del proceso de avance en titulacion.</p>
            </div>
            <div class="card-icono" aria-hidden="true">Seg</div>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .coordinador-inicio { min-height: 100vh; background: #f5f7fb; }
    .contenido { padding: 0.6rem 1.5rem 1.5rem; }
    .titulo { margin: 0 0 1rem; text-align: center; font-size: 2.35rem; font-weight: 700; color: #1f2937; letter-spacing: .2px; }
    .cards { max-width: 980px; margin: 0 auto; display: grid; grid-template-columns: repeat(2, minmax(300px, 1fr)); gap: 0.9rem; }
    .card { border: 1px solid #aac7ec; border-radius: 18px; background: #b9d9ff; padding: 1.05rem 1.1rem; min-height: 150px; display: flex; align-items: center; justify-content: space-between; gap: .85rem; text-align: left; cursor: pointer; transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
    .card:hover { transform: translateY(-1px); box-shadow: 0 6px 14px rgba(0,0,0,.10); border-color: #7faedc; }
    .card-texto h2 { margin: 0 0 .4rem; font-size: 2rem; font-weight: 650; color: #1f2937; line-height: 1.05; }
    .card-texto p { margin: 0; font-size: 1.02rem; color: #374151; line-height: 1.3; max-width: 30ch; }
    .card-icono { width: 108px; height: 108px; border-radius: 16px; background: rgba(255,255,255,.78); display: flex; align-items: center; justify-content: center; font-size: 2.55rem; font-weight: 700; color: #1f4c8f; flex-shrink: 0; }
    @media (max-width: 900px) {
      .contenido { padding: 0.6rem 1rem 1.2rem; }
      .titulo { font-size: 1.9rem; }
      .cards { grid-template-columns: 1fr; max-width: 760px; }
      .card { min-height: 132px; }
      .card-texto h2 { font-size: 1.55rem; }
      .card-icono { width: 92px; height: 92px; font-size: 2rem; }
    }
  `],
})
export class CoordinadorInicioComponent {
  constructor(private router: Router) {}

  irAltaEgresadosUsuarios(): void {
    this.router.navigate(['/home/alta']);
  }

  irSeguimientoProceso(): void {
    this.router.navigate(['/home/seguimiento-proceso']);
  }
}
