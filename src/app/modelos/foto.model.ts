export interface TutoriaApunte {
  id: number;
  materia: string;
  inicio: string;
}

export function tutoriaApunteValida(valor: unknown): boolean {
  if (valor === undefined) return true;
  if (!valor || typeof valor !== 'object') return false;
  const t = valor as TutoriaApunte;
  return (
    Number.isSafeInteger(t.id) &&
    t.id > 0 &&
    typeof t.materia === 'string' &&
    t.materia.trim().length > 0 &&
    t.materia.length <= 100 &&
    typeof t.inicio === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(t.inicio) &&
    Number.isFinite(Date.parse(t.inicio))
  );
}

export interface Foto {
  id: string;
  ruta: string;
  titulo: string;
  descripcion: string;
  favorita: boolean;
  formato: string;
  creada: number;
  tutoria?: TutoriaApunte;
}
