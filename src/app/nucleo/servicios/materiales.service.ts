import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, defer, map, timeout } from 'rxjs';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Libro, RespuestaOpenLibrary } from '../../modelos/libro.model';

@Injectable({ providedIn: 'root' })
export class MaterialesService {
  private http = inject(HttpClient);
  private clave = 'tutolink.materiales.v1';

  buscar(texto: string): Observable<Libro[]> {
    const params = { q: texto.trim(), limit: '20', lang: 'es', fields: 'key,title,author_name,first_publish_year' };
    const solicitud = Capacitor.isNativePlatform()
      ? defer(async () => {
          const respuesta = await CapacitorHttp.get({
            url: 'https://openlibrary.org/search.json',
            params,
            connectTimeout: 15000,
            readTimeout: 20000,
          });
          if (respuesta.status !== 200) throw new Error('No se pudo consultar Open Library.');
          return respuesta.data as RespuestaOpenLibrary;
        })
      : this.http.get<RespuestaOpenLibrary>('https://openlibrary.org/search.json', { params });
    return solicitud.pipe(
      timeout(20000),
      map((respuesta) =>
        respuesta.docs
          .filter((libro) => /^(\/works\/)?OL\d+W$/.test(libro.key))
          .map((libro) => {
            const id = libro.key.replace('/works/', '');
            return {
              id,
              titulo: libro.title,
              autores: libro.author_name ?? [],
              anio: libro.first_publish_year ?? null,
              enlace: `https://openlibrary.org/works/${id}`,
            };
          }),
      ),
    );
  }

  leerGuardados(): Libro[] {
    const datos: unknown = JSON.parse(localStorage.getItem(this.clave) ?? '[]');
    if (
      !Array.isArray(datos) ||
      !datos.every(
        (libro) =>
          libro &&
          typeof libro.id === 'string' &&
          /^OL\d+W$/.test(libro.id) &&
          typeof libro.titulo === 'string' &&
          Array.isArray(libro.autores) &&
          libro.autores.every((autor: unknown) => typeof autor === 'string') &&
          (libro.anio === null || typeof libro.anio === 'number'),
      )
    )
      throw new Error('Formato de materiales inválido.');
    return datos.map((libro) => ({ ...libro, enlace: `https://openlibrary.org/works/${libro.id}` }));
  }

  guardar(libros: Libro[]): void {
    localStorage.setItem(this.clave, JSON.stringify(libros));
  }
}
