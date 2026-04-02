import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

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

  constructor(
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const u = this.auth.getUsuario();
    const username = u?.username ?? '';
    const rol = u?.rol ?? '';
    if (username === 'coordinador' || rol === 'coordinador') {
      this.nombreUsuario = 'Div. estudios profesionales administrativo';
    } else if (username === 'academico' || rol === 'academico') {
      this.nombreUsuario = 'Departamento académico';
    } else if (rol === 'servicios_escolares') {
      this.nombreUsuario = 'Departamento de servicios escolares';
    } else {
      this.nombreUsuario = username;
    }
  }

  logout(): void {
    this.auth.logout().subscribe(() => this.router.navigate(['/login']));
  }
}
