import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ApuntesService, firmaFoto } from './apuntes.service';
import { ApuntesLocalService } from './apuntes-local.service';
import { FirebaseService } from './firebase.service';
import { Foto } from '../../modelos/foto.model';

const remoto = vi.hoisted(() => ({
  datos: new Map<string, Record<string, unknown>>(),
  falla: false,
  rechazados: new Set<string>(),
}));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...partes: string[]) => partes.join('/'),
  doc: (_db: unknown, ...partes: string[]) => partes.join('/'),
  serverTimestamp: () => 123,
  getDocsFromServer: async (ruta: string) => {
    if (remoto.falla) throw new Error('Sin conexión');
    return {
      docs: [...remoto.datos]
        .filter(([p]) => p.startsWith(ruta + '/'))
        .map(([p, dato]) => ({ id: p.split('/').pop(), data: () => dato })),
    };
  },
  runTransaction: async (_db: unknown, ejecutar: (tx: unknown) => Promise<unknown>) => {
    if (remoto.falla) throw new Error('Sin conexión');
    return ejecutar({
      get: async (p: string) => ({ data: () => remoto.datos.get(p) }),
      set: (p: string, d: Record<string, unknown>) => {
        if (remoto.rechazados.has(p)) throw Object.assign(new Error('Sin permiso'), { code: 'permission-denied' });
        remoto.datos.set(p, d);
      },
    });
  },
}));

describe('Sincronización de apuntes', () => {
  let servicio: ApuntesService;
  let archivos: Map<string, Foto>;
  let auth: { currentUser: { uid: string } | null };
  let online: boolean;
  const foto: Foto = {
    id: '12345678-abcd-abcd-abcd-123456789abc',
    titulo: 'Clase',
    descripcion: '',
    favorita: false,
    creada: 123,
    formato: 'jpeg',
    ruta: 'local.jpg',
  };
  const ruta = 'usuarios/a/apuntes/' + foto.id;
  beforeEach(() => {
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        naturalWidth = 100;
        naturalHeight = 100;
        decode(): Promise<void> {
          return Promise.resolve();
        }
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,/9j/AA==');
    localStorage.clear();
    remoto.datos.clear();
    remoto.falla = false;
    remoto.rechazados.clear();
    archivos = new Map();
    auth = { currentUser: { uid: 'a' } };
    online = true;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
    TestBed.configureTestingModule({
      providers: [
        { provide: FirebaseService, useValue: { auth, db: {} } },
        {
          provide: ApuntesLocalService,
          useValue: {
            cargar: async () => [...archivos.values()].map((f) => ({ ...f })),
            leerImagen: async () => 'original',
            importar: async (_uid: string, f: Foto) => archivos.set(f.id, { ...f, ruta: 'copia.jpg' }),
            guardar: async (_uid: string, f: Foto) => archivos.set(f.id, { ...f }),
            eliminar: async (_uid: string, f: Foto) => archivos.delete(f.id),
          },
        },
      ],
    });
    servicio = TestBed.inject(ApuntesService);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('un rechazo conserva el apunte local y no bloquea las demás fotos', async () => {
    archivos.set(foto.id, foto);
    await servicio.cargar('a');
    await servicio.guardar('a', { ...foto, titulo: 'Cambio pendiente' });
    const otra = { ...foto, id: '87654321-abcd-abcd-abcd-123456789abc' };
    archivos.set(otra.id, otra);
    remoto.rechazados.add(ruta);
    await servicio.cargar('a');
    expect(archivos.get(foto.id)?.titulo).toBe('Cambio pendiente');
    expect(remoto.datos.get(ruta)?.['titulo']).toBe('Clase');
    expect(remoto.datos.has('usuarios/a/apuntes/' + otra.id)).toBe(true);
    expect(servicio.estado('a')).toContain('pendientes por permisos');
    remoto.rechazados.clear();
    await servicio.cargar('a');
    expect(remoto.datos.get(ruta)?.['titulo']).toBe('Cambio pendiente');
  });

  it('conserva la firma de apuntes anteriores sin tutoría', () => {
    expect(firmaFoto(foto)).toBe(
      JSON.stringify([foto.id, foto.titulo, foto.descripcion, foto.favorita, foto.formato, foto.creada]),
    );
  });

  it('sincroniza la tutoría, la recupera en otro dispositivo y permite quitarla', async () => {
    const tutoria = { id: 12, materia: 'Álgebra', inicio: '2026-11-23T15:00:00.000Z' };
    archivos.set(foto.id, foto);
    await servicio.cargar('a');
    online = false;
    await servicio.guardar('a', { ...foto, tutoria });
    expect((await servicio.cargar('a'))[0].tutoria).toEqual(tutoria);
    online = true;
    await servicio.cargar('a');
    expect(remoto.datos.get(ruta)?.['tutoria']).toEqual(tutoria);
    archivos.clear();
    localStorage.clear();
    expect((await servicio.cargar('a'))[0].tutoria).toEqual(tutoria);
    await servicio.guardar('a', foto);
    await servicio.cargar('a');
    expect(remoto.datos.get(ruta)?.['tutoria']).toBeUndefined();
  });

  it('sube las fotos existentes y las descarga en un dispositivo sin copia local', async () => {
    archivos.set(foto.id, foto);
    await servicio.cargar('a');
    expect(remoto.datos.get(ruta)?.['imagen']).toContain('data:image/jpeg;base64,');
    archivos.clear();
    localStorage.clear();
    expect(await servicio.cargar('a')).toEqual([expect.objectContaining({ id: foto.id, titulo: 'Clase' })]);
  });

  it('conserva cambios offline y los sube al reconectar', async () => {
    archivos.set(foto.id, foto);
    await servicio.cargar('a');
    online = false;
    await servicio.guardar('a', { ...foto, titulo: 'Editado', favorita: true });
    expect((await servicio.cargar('a'))[0].titulo).toBe('Editado');
    expect(remoto.datos.get(ruta)?.['titulo']).toBe('Clase');
    online = true;
    await servicio.cargar('a');
    expect(remoto.datos.get(ruta)?.['titulo']).toBe('Editado');
  });

  it('una eliminación remota gana a una edición offline y no resucita', async () => {
    archivos.set(foto.id, foto);
    await servicio.cargar('a');
    await servicio.guardar('a', { ...foto, titulo: 'Cambio offline' });
    remoto.datos.set(ruta, { id: foto.id, eliminado: true });
    expect(await servicio.cargar('a')).toEqual([]);
    expect(remoto.datos.get(ruta)?.['eliminado']).toBe(true);
    expect(await servicio.cargar('a')).toEqual([]);
  });

  it('mantiene una eliminación pendiente hasta que el servidor la confirma', async () => {
    archivos.set(foto.id, foto);
    await servicio.cargar('a');
    online = false;
    await servicio.eliminar('a', foto);
    await servicio.cargar('a');
    expect(remoto.datos.get(ruta)?.['eliminado']).toBe(false);
    online = true;
    remoto.falla = true;
    await servicio.cargar('a');
    expect(localStorage.getItem('tutolink.apuntes.sincronizados.v1.a.borrados')).toContain(foto.id);
    remoto.falla = false;
    await servicio.cargar('a');
    expect(remoto.datos.get(ruta)?.['eliminado']).toBe(true);
    expect(remoto.datos.get(ruta)?.['imagen']).toBeUndefined();
  });

  it('rechaza el acceso cuando cambió la cuenta', async () => {
    auth.currentUser = { uid: 'b' };
    await expect(servicio.cargar('a')).rejects.toThrow('sesión');
    await expect(servicio.guardar('a', foto)).rejects.toThrow('sesión');
  });

  it('conserva las fotos locales si falla el servidor', async () => {
    archivos.set(foto.id, foto);
    remoto.falla = true;
    expect(await servicio.cargar('a')).toEqual([foto]);
    expect(servicio.estado('a')).toContain('No se pudo completar');
  });
});
