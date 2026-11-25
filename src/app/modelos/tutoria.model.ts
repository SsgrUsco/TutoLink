export type EstadoTutoria = 'programada' | 'cancelada' | 'finalizada';
export interface NuevaTutoria {
  materia: string;
  inicio: string;
  fin: string;
  lugar: string;
  cupos: number;
}
export interface Reserva {
  tutoriaId: number;
  estado: 'confirmada' | 'cancelada' | 'asistida';
}

export interface Tutoria {
  facultadId: number | null;
  facultad: string | null;
  id: number;
  materia: string;
  tutor: string;
  tutorUid?: string;
  inicio: string;
  fin: string;
  lugar: string;
  cuposDisponibles: number;
  estado: EstadoTutoria;
}
