import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Foto, tutoriaApunteValida } from '../../modelos/foto.model';

type RegistroFoto = Omit<Foto, 'ruta'>;

@Injectable({ providedIn: 'root' })
export class ApuntesLocalService {
  private carpeta(usuario: string | number): string {
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(String(usuario)) ||
      (typeof usuario === 'number' && (!Number.isSafeInteger(usuario) || usuario <= 0))
    )
      throw new Error('Inicia sesión para usar tus apuntes.');
    return `tutolink/apuntes/${usuario}`;
  }

  private async preparar(usuario: string | number): Promise<string> {
    const path = this.carpeta(usuario);
    try {
      await Filesystem.mkdir({ path, directory: Directory.Data, recursive: true });
    } catch {
      await Filesystem.stat({ path, directory: Directory.Data });
    }
    return path;
  }

  private validar(valor: unknown): RegistroFoto {
    const foto = valor as RegistroFoto;
    if (
      !foto ||
      typeof foto.id !== 'string' ||
      !/^[\da-f-]{36}$/.test(foto.id) ||
      typeof foto.titulo !== 'string' ||
      !foto.titulo.trim() ||
      foto.titulo.length > 18 ||
      typeof foto.descripcion !== 'string' ||
      foto.descripcion.length > 50 ||
      typeof foto.favorita !== 'boolean' ||
      !['jpeg', 'png', 'webp', 'gif'].includes(foto.formato) ||
      !Number.isFinite(foto.creada) ||
      !tutoriaApunteValida(foto.tutoria)
    )
      throw new Error('No se pudieron leer los datos de un apunte. No se sobrescribirán.');
    return foto;
  }

  private imagen(usuario: string | number, foto: RegistroFoto): string {
    this.validar(foto);
    return `${this.carpeta(usuario)}/${foto.id}.${foto.formato}`;
  }

  private async mostrar(usuario: string | number, foto: RegistroFoto): Promise<Foto> {
    const path = this.imagen(usuario, foto);
    if (Capacitor.isNativePlatform()) {
      await Filesystem.stat({ path, directory: Directory.Data });
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
      return { ...foto, ruta: Capacitor.convertFileSrc(uri) };
    }
    const { data } = await Filesystem.readFile({ path, directory: Directory.Data });
    if (typeof data !== 'string') throw new Error('No se pudo leer la imagen.');
    return { ...foto, ruta: `data:image/${foto.formato};base64,${data}` };
  }

  async cargar(usuario: string | number): Promise<Foto[]> {
    const carpeta = await this.preparar(usuario);
    const { files } = await Filesystem.readdir({ path: carpeta, directory: Directory.Data });
    for (const file of files.filter((file) => file.name.endsWith('.json.eliminado'))) {
      const path = `${carpeta}/${file.name}`;
      const { data } = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
      if (typeof data !== 'string') throw new Error('No se pudo completar una eliminación pendiente.');
      const foto = this.validar(JSON.parse(data));
      if (file.name !== `${foto.id}.json.eliminado`) throw new Error('El archivo del apunte no es válido.');
      if (files.some((item) => item.name === `${foto.id}.${foto.formato}`)) {
        await Filesystem.deleteFile({ path: this.imagen(usuario, foto), directory: Directory.Data });
      }
      await Filesystem.deleteFile({ path, directory: Directory.Data });
    }
    const fotos: Foto[] = [];
    for (const file of files.filter((file) => file.name.endsWith('.json'))) {
      const { data } = await Filesystem.readFile({
        path: `${carpeta}/${file.name}`,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      if (typeof data !== 'string') throw new Error('No se pudo leer el apunte.');
      const foto = this.validar(JSON.parse(data));
      if (file.name !== `${foto.id}.json`) throw new Error('El archivo del apunte no es válido.');
      fotos.push(await this.mostrar(usuario, foto));
    }
    return fotos.sort((a, b) => b.creada - a.creada);
  }

  async agregar(usuario: string | number, base64: string, formato: string): Promise<Foto> {
    await this.preparar(usuario);
    const foto: RegistroFoto = {
      id: crypto.randomUUID(),
      titulo: 'Nuevo apunte',
      descripcion: '',
      favorita: false,
      formato,
      creada: Date.now(),
    };
    const path = this.imagen(usuario, foto);
    await Filesystem.writeFile({ path, directory: Directory.Data, data: base64 });
    try {
      await this.guardar(usuario, { ...foto, ruta: '' });
    } catch (error) {
      await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => undefined);
      throw error;
    }
    return this.mostrar(usuario, foto);
  }

  async agregarArchivo(usuario: string, ruta: string, formato: string, id: string): Promise<Foto> {
    const carpeta = await this.preparar(usuario);
    const foto = this.validar({
      id,
      titulo: 'Nuevo apunte',
      descripcion: '',
      favorita: false,
      formato,
      creada: Date.now(),
    });
    const { files } = await Filesystem.readdir({ path: carpeta, directory: Directory.Data });
    if (files.some((file) => file.name === id + '.json')) {
      const { data } = await Filesystem.readFile({
        path: carpeta + '/' + id + '.json',
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      if (typeof data !== 'string') throw new Error('No se pudo leer el apunte recuperado.');
      const existente = this.validar(JSON.parse(data));
      if (existente.id !== id) throw new Error('El archivo del apunte no es válido.');
      return this.mostrar(usuario, existente);
    }
    await Filesystem.copy({ from: ruta, to: this.imagen(usuario, foto), toDirectory: Directory.Data });
    await this.guardar(usuario, { ...foto, ruta: '' });
    return this.mostrar(usuario, foto);
  }

  async guardar(usuario: string | number, foto: Foto): Promise<void> {
    const { ruta: _ruta, ...registro } = foto;
    this.validar(registro);
    const path = `${this.carpeta(usuario)}/${foto.id}.json`;
    const temporal = `${path}.tmp`;
    await Filesystem.writeFile({
      path: temporal,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      data: JSON.stringify(registro),
    });
    await Filesystem.rename({ from: temporal, to: path, directory: Directory.Data });
  }

  async leerImagen(usuario: string | number, foto: Foto): Promise<string> {
    const { data } = await Filesystem.readFile({ path: this.imagen(usuario, foto), directory: Directory.Data });
    if (typeof data !== 'string') throw new Error('No se pudo leer la imagen.');
    return data.startsWith('data:') ? data : 'data:image/' + foto.formato + ';base64,' + data;
  }

  async importar(usuario: string, foto: Foto, imagen: string): Promise<void> {
    await this.preparar(usuario);
    await Filesystem.writeFile({ path: this.imagen(usuario, foto), directory: Directory.Data, data: imagen });
    await this.guardar(usuario, foto);
    for (const formato of ['jpeg', 'png', 'webp', 'gif'].filter((item) => item !== foto.formato)) {
      await Filesystem.deleteFile({
        path: this.carpeta(usuario) + '/' + foto.id + '.' + formato,
        directory: Directory.Data,
      }).catch(() => undefined);
    }
  }

  async eliminar(usuario: string | number, foto: Foto): Promise<void> {
    const imagen = this.imagen(usuario, foto);
    const path = `${this.carpeta(usuario)}/${foto.id}.json`;
    const pendiente = `${path}.eliminado`;
    await Filesystem.rename({ from: path, to: pendiente, directory: Directory.Data });
    try {
      await Filesystem.deleteFile({ path: imagen, directory: Directory.Data });
    } catch (error) {
      await Filesystem.rename({ from: pendiente, to: path, directory: Directory.Data });
      throw error;
    }
    await Filesystem.deleteFile({ path: pendiente, directory: Directory.Data }).catch(() => undefined);
  }
}
