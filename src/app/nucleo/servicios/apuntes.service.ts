import { Injectable, inject } from '@angular/core';
import { collection, doc, getDocsFromServer, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Foto, tutoriaApunteValida } from '../../modelos/foto.model';
import { FirebaseService } from './firebase.service';
import { ApuntesLocalService } from './apuntes-local.service';
const LIMITE_IMAGEN_APUNTE = 600_000;

type Registro = Omit<Foto, 'ruta'>;
interface ApunteRemoto extends Registro {
  imagen: string;
  eliminado: false;
}
interface Borrado {
  id: string;
  eliminado: true;
}

export function firmaFoto(foto: Registro): string {
  // Mantiene la firma anterior de los apuntes sin tutoría para no sobrescribir cambios remotos al actualizar.
  return JSON.stringify([
    foto.id,
    foto.titulo,
    foto.descripcion,
    foto.favorita,
    foto.formato,
    foto.creada,
    ...(foto.tutoria ? [foto.tutoria.id, foto.tutoria.materia, foto.tutoria.inicio] : []),
  ]);
}

@Injectable({ providedIn: 'root' })
export class ApuntesService {
  private local = inject(ApuntesLocalService);
  private firebase = inject(FirebaseService);
  private cola: Promise<unknown> = Promise.resolve();
  private avisos = new Map<string, string>();

  estado(usuario: string): string {
    return this.avisos.get(usuario) ?? 'Los cambios se sincronizan al abrir o actualizar tus apuntes.';
  }

  private exclusivo<T>(operacion: () => Promise<T>): Promise<T> {
    const resultado = this.cola.then(operacion);
    this.cola = resultado.catch(() => undefined);
    return resultado;
  }

  private comprobar(usuario: string): void {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(usuario) || this.firebase.auth.currentUser?.uid !== usuario)
      throw new Error('La sesión cambió. Vuelve a iniciar sesión.');
  }

  private clave(usuario: string): string {
    return `tutolink.apuntes.sincronizados.v1.${usuario}`;
  }

  private conocidos(usuario: string): Record<string, string> {
    const datos: unknown = JSON.parse(localStorage.getItem(this.clave(usuario)) ?? '{}');
    if (
      !datos ||
      typeof datos !== 'object' ||
      Array.isArray(datos) ||
      Object.entries(datos).some(([id, firma]) => !/^[\da-f-]{36}$/.test(id) || typeof firma !== 'string')
    )
      throw new Error('No se pudo leer el estado de sincronización. Tus fotos se conservan.');
    return datos as Record<string, string>;
  }

  private async limite<T>(operacion: Promise<T>): Promise<T> {
    let reloj: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operacion,
        new Promise<never>((_, reject) => {
          reloj = setTimeout(() => reject(new Error('No se pudo conectar con TutoLink.')), 12000);
        }),
      ]);
    } finally {
      clearTimeout(reloj);
    }
  }

  private remoto(id: string, dato: unknown): ApunteRemoto | Borrado {
    const d = dato as ApunteRemoto | Borrado;
    if (!d || d.id !== id || !/^[\da-f-]{36}$/.test(id)) throw new Error('Apunte remoto inválido.');
    if (d.eliminado === true) return { id, eliminado: true };
    if (
      d.eliminado !== false ||
      typeof d.titulo !== 'string' ||
      !d.titulo.trim() ||
      d.titulo.length > 18 ||
      typeof d.descripcion !== 'string' ||
      d.descripcion.length > 50 ||
      typeof d.favorita !== 'boolean' ||
      d.formato !== 'jpeg' ||
      !Number.isFinite(d.creada) ||
      typeof d.imagen !== 'string' ||
      !d.imagen.startsWith('data:image/jpeg;base64,') ||
      d.imagen.length > LIMITE_IMAGEN_APUNTE ||
      !tutoriaApunteValida(d.tutoria)
    )
      throw new Error('Apunte remoto inválido.');
    return {
      id,
      titulo: d.titulo,
      descripcion: d.descripcion,
      favorita: d.favorita,
      formato: d.formato,
      creada: d.creada,
      imagen: d.imagen,
      ...(d.tutoria ? { tutoria: d.tutoria } : {}),
      eliminado: false,
    };
  }

  private async comprimirFoto(origen: string): Promise<string> {
    const imagen = new Image();
    imagen.src = origen;
    await imagen.decode();
    const canvas = document.createElement('canvas');
    const contexto = canvas.getContext('2d');
    if (!contexto || !imagen.naturalWidth || !imagen.naturalHeight)
      throw new Error('No se pudo preparar la foto para sincronizar.');
    const mayor = Math.max(imagen.naturalWidth, imagen.naturalHeight);
    for (const limite of [1600, 1280, 1024, 800]) {
      const escala = Math.min(1, limite / mayor);
      canvas.width = Math.max(1, Math.round(imagen.naturalWidth * escala));
      canvas.height = Math.max(1, Math.round(imagen.naturalHeight * escala));
      contexto.fillStyle = '#ffffff';
      contexto.fillRect(0, 0, canvas.width, canvas.height);
      contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height);
      for (const calidad of [0.86, 0.74, 0.62]) {
        const resultado = canvas.toDataURL('image/jpeg', calidad);
        if (resultado.startsWith('data:image/jpeg;base64,') && resultado.length <= LIMITE_IMAGEN_APUNTE)
          return resultado;
      }
    }
    throw new Error('La foto es demasiado grande para sincronizar. Su copia local se conserva.');
  }

  private async enviar(usuario: string, id: string, dato: ApunteRemoto | Borrado): Promise<boolean> {
    this.comprobar(usuario);
    const referencia = doc(this.firebase.db, 'usuarios', usuario, 'apuntes', id);
    return this.limite(
      runTransaction(
        this.firebase.db,
        async (tx) => {
          const anterior = await tx.get(referencia);
          this.comprobar(usuario);
          if (anterior.data()?.['eliminado'] === true && !dato.eliminado) return false;
          tx.set(referencia, { ...dato, actualizada: serverTimestamp() });
          return true;
        },
        { maxAttempts: 2 },
      ),
    );
  }

  async cargar(usuario: string | number): Promise<Foto[]> {
    return this.exclusivo(async () => {
      const uid = String(usuario);
      this.comprobar(uid);
      this.avisos.set(uid, 'Sincronizando tus apuntes…');
      const fotos = await this.local.cargar(uid);
      if (!navigator.onLine) {
        this.avisos.set(uid, 'Sin conexión. Los cambios quedan en este dispositivo hasta sincronizar.');
        return fotos;
      }
      try {
        const conocidos = this.conocidos(uid);
        const borrados = this.borrados(uid);
        const respuesta = await this.limite(
          getDocsFromServer(collection(this.firebase.db, 'usuarios', uid, 'apuntes')),
        );
        this.comprobar(uid);
        const remotos = new Map(respuesta.docs.map((d) => [d.id, this.remoto(d.id, d.data())]));
        const rechazados = new Set<string>();
        for (const foto of fotos) {
          this.comprobar(uid);
          if (borrados.includes(foto.id) || remotos.get(foto.id)?.eliminado) continue;
          if (conocidos[foto.id] === firmaFoto(foto)) continue;
          const existente = remotos.get(foto.id);
          const imagen =
            existente && !existente.eliminado
              ? existente.imagen
              : await this.comprimirFoto(await this.local.leerImagen(uid, foto));
          const dato: ApunteRemoto = {
            id: foto.id,
            titulo: foto.titulo,
            ...(foto.tutoria ? { tutoria: foto.tutoria } : {}),
            descripcion: foto.descripcion,
            favorita: foto.favorita,
            creada: foto.creada,
            formato: 'jpeg',
            imagen,
            eliminado: false,
          };
          try {
            const enviada = await this.enviar(uid, foto.id, dato);
            remotos.set(foto.id, enviada ? dato : { id: foto.id, eliminado: true });
          } catch (error) {
            if ((error as { code?: string })?.code !== 'permission-denied') throw error;
            this.comprobar(uid);
            rechazados.add(foto.id);
          }
        }
        for (const id of new Set([...Object.keys(conocidos), ...borrados])) {
          if ((!borrados.includes(id) && fotos.some((f) => f.id === id)) || remotos.get(id)?.eliminado) continue;
          const borrado: Borrado = { id, eliminado: true };
          await this.enviar(uid, id, borrado);
          remotos.set(id, borrado);
        }
        const siguiente = { ...conocidos };
        for (const [id, remoto] of remotos) {
          if (rechazados.has(id)) continue;
          this.comprobar(uid);
          const existente = fotos.find((f) => f.id === id);
          if (remoto.eliminado) {
            if (existente) await this.local.eliminar(uid, existente);
            delete siguiente[id];
          } else {
            const foto: Foto = {
              id,
              titulo: remoto.titulo,
              ...(remoto.tutoria ? { tutoria: remoto.tutoria } : {}),
              descripcion: remoto.descripcion,
              favorita: remoto.favorita,
              creada: remoto.creada,
              formato: remoto.formato,
              ruta: '',
            };
            if (!existente || firmaFoto(existente) !== firmaFoto(foto))
              await this.local.importar(uid, foto, remoto.imagen);
            siguiente[id] = firmaFoto(foto);
          }
          localStorage.setItem(this.clave(uid), JSON.stringify(siguiente));
        }
        localStorage.removeItem(this.clave(uid) + '.borrados');
        this.avisos.set(
          uid,
          rechazados.size
            ? 'Hay apuntes pendientes por permisos. Revisa su tutoría y tu reserva, o elige Sin tutoría. Los demás se sincronizaron y tus cambios locales se conservan.'
            : 'Apuntes sincronizados con tu cuenta.',
        );
      } catch (error) {
        this.comprobar(uid);
        const codigo = (error as { code?: string })?.code;
        this.avisos.set(
          uid,
          codigo === 'permission-denied'
            ? 'No se pudo sincronizar: revisa los permisos de tu cuenta. Tus fotos locales se conservan.'
            : 'No se pudo completar la sincronización. Tus cambios locales se conservan; pulsa Sincronizar para reintentar.',
        );
      }
      return this.local.cargar(uid);
    });
  }

  agregar(usuario: string | number, base64: string, formato: string): Promise<Foto> {
    return this.exclusivo(() => {
      this.comprobar(String(usuario));
      return this.local.agregar(usuario, base64, formato);
    });
  }

  agregarArchivo(usuario: string, ruta: string, formato: string, id: string): Promise<Foto> {
    return this.exclusivo(() => {
      this.comprobar(usuario);
      return this.local.agregarArchivo(usuario, ruta, formato, id);
    });
  }

  guardar(usuario: string | number, foto: Foto): Promise<void> {
    return this.exclusivo(() => {
      this.comprobar(String(usuario));
      return this.local.guardar(usuario, foto);
    });
  }

  private borrados(uid: string): string[] {
    const datos: unknown = JSON.parse(localStorage.getItem(this.clave(uid) + '.borrados') ?? '[]');
    if (!Array.isArray(datos) || !datos.every((id) => typeof id === 'string' && /^[\da-f-]{36}$/.test(id)))
      throw new Error('No se pudo leer una eliminación pendiente.');
    return datos;
  }

  eliminar(usuario: string | number, foto: Foto): Promise<void> {
    return this.exclusivo(async () => {
      const uid = String(usuario);
      this.comprobar(uid);
      const anteriores = this.borrados(uid);
      const clave = this.clave(uid) + '.borrados';
      localStorage.setItem(clave, JSON.stringify([...new Set([...anteriores, foto.id])]));
      try {
        await this.local.eliminar(uid, foto);
      } catch (error) {
        localStorage.setItem(clave, JSON.stringify(anteriores));
        throw error;
      }
    });
  }
}
