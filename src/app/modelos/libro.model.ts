export interface Libro {
  id: string;
  titulo: string;
  autores: string[];
  anio: number | null;
  enlace: string;
}

export interface RespuestaOpenLibrary {
  docs: { key: string; title: string; author_name?: string[]; first_publish_year?: number }[];
}
