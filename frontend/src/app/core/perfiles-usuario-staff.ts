import { obtenerSegmentoAcademicoDef } from './segmentos-academicos';

/** Opción del formulario «Agregar usuario» (etiqueta institucional → rol + segmento en backend). */
export type PerfilCreacionUsuario =
  | 'apoyo_titulacion'
  | 'division_estudios_prof_admin'
  | 'academico_general'
  | 'academico_ingenierias'
  | 'academico_virtuales'
  | 'academico_ciencias_basicas'
  | 'academico_economico_administrativo'
  | 'servicios_escolares';

export const PERFILES_CREACION_USUARIO: { id: PerfilCreacionUsuario; etiqueta: string }[] = [
  { id: 'apoyo_titulacion', etiqueta: 'División de Estudios Profesionales — Apoyo a Titulación' },
  { id: 'division_estudios_prof_admin', etiqueta: 'División de Estudios Profesionales — Administrativo' },
  { id: 'academico_general', etiqueta: 'Coordinacion de apoyo a la titulacion' },
  { id: 'academico_ingenierias', etiqueta: 'Departamento de Ingenierías' },
  { id: 'academico_virtuales', etiqueta: 'Carreras Virtuales' },
  { id: 'academico_ciencias_basicas', etiqueta: 'Departamento de Ciencias Básicas' },
  { id: 'academico_economico_administrativo', etiqueta: 'Departamento Económico Administrativo' },
  { id: 'servicios_escolares', etiqueta: 'Departamento de Servicios Escolares' },
];

export interface DatosRolDesdePerfil {
  rol: string;
  segmento_academico: string;
  carreras_asignadas: string[];
}

/** Convierte la opción del desplegable en lo que guarda Mongo y el API de usuarios. */
export function datosRolDesdePerfil(perfil: string): DatosRolDesdePerfil {
  switch (perfil as PerfilCreacionUsuario) {
    case 'apoyo_titulacion':
      return { rol: 'apoyo_titulacion', segmento_academico: '', carreras_asignadas: [] };
    case 'division_estudios_prof_admin':
      return { rol: 'division_estudios_prof_admin', segmento_academico: '', carreras_asignadas: [] };
    case 'servicios_escolares':
      return { rol: 'servicios_escolares', segmento_academico: '', carreras_asignadas: [] };
    case 'academico_general':
      return { rol: 'academico', segmento_academico: '', carreras_asignadas: [] };
    case 'academico_ingenierias':
      return armarAcademico('ingenierias');
    case 'academico_virtuales':
      return armarAcademico('virtuales');
    case 'academico_ciencias_basicas':
      return armarAcademico('ciencias_basicas');
    case 'academico_economico_administrativo':
      return armarAcademico('economico_administrativo');
    default:
      return { rol: 'division_estudios_prof_admin', segmento_academico: '', carreras_asignadas: [] };
  }
}

function armarAcademico(segmentoId: string): DatosRolDesdePerfil {
  const def = obtenerSegmentoAcademicoDef(segmentoId);
  return {
    rol: 'academico',
    segmento_academico: segmentoId,
    carreras_asignadas: def ? [...def.carreras] : [],
  };
}
