import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { obtenerSegmentoAcademicoDef, SEGMENTOS_ACADEMICOS } from '../../core/segmentos-academicos';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.css',
})
export class HeaderComponent implements OnInit {
  nombreUsuario = '';
  /** Si es false, no se muestra el botón "Nuevo" (ej. en la interfaz de seguimiento del egresado). */
  @Input() showNuevoButton = true;
  @Output() nuevoClick = new EventEmitter<void>();
  /** Muestra el botón "Agregar usuario" (solo en home para coordinador). */
  @Input() showAgregarUsuarioButton = false;
  @Output() agregarUsuarioClick = new EventEmitter<void>();
  /** Muestra botón para volver al inicio principal (/home). */
  @Input() showVolverInicioButton = false;
  @Output() volverInicioClick = new EventEmitter<void>();

  constructor(
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const u = this.auth.getUsuario();
    const username = u?.username ?? '';
    const rol = (u?.rol ?? '').toLowerCase();
    const nombre = this.obtenerNombreMostrable(u?.nombre, username);
    const segmento = obtenerSegmentoAcademicoDef(u?.segmento_academico ?? '');

    if (rol === 'academico') {
      const area =
        segmento?.nombre ??
        this.inferirAreaAcademicaPorCarreras(u?.carreras_asignadas) ??
        'Coordinacion de apoyo a la titulacion';
      this.nombreUsuario = `${nombre} - ${area}`;
    } else if (username === 'coordinador' || rol === 'coordinador') {
      this.nombreUsuario = `${nombre} - Administrador`;
    } else if (rol === 'apoyo_titulacion') {
      this.nombreUsuario = `${nombre} - Apoyo titulación`;
    } else if (rol === 'division_estudios_prof_admin') {
      this.nombreUsuario = `${nombre} - Administrativo`;
    } else if (rol === 'servicios_escolares') {
      this.nombreUsuario = `${nombre} - Servicios escolares`;
    } else {
      this.nombreUsuario = nombre;
    }
  }

  private obtenerNombreMostrable(nombre: string | undefined, username: string): string {
    const limpio = (nombre ?? '').trim();
    if (limpio) return limpio;
    const base = username.split('@')[0]?.split('+')[0]?.trim();
    if (!base) return 'Usuario';
    return base;
  }

  private inferirAreaAcademicaPorCarreras(carreras?: string[]): string | null {
    const normalizadas = (carreras ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean);
    if (!normalizadas.length) return null;
    for (const seg of SEGMENTOS_ACADEMICOS) {
      const set = new Set(seg.carreras.map((c) => c.trim().toLowerCase()));
      if (normalizadas.every((c) => set.has(c))) {
        return seg.nombre;
      }
    }
    return null;
  }

  logout(): void {
    this.auth.logout().subscribe(() => this.router.navigate(['/login']));
  }
}
