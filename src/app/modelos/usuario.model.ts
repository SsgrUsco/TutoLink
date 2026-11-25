export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  facultadId: number | null;
  facultad: string | null;
  rol: 'estudiante' | 'tutor';
  creado_en: string;
}

export interface Registro {
  rol: Usuario['rol'];
  nombre: string;
  correo: string;
  facultadId: number;
  contrasena: string;
  confirmarContrasena: string;
}
