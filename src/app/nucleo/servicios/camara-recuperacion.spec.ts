import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { AuthService } from './auth.service';
import { ApuntesService } from './apuntes.service';
import { CamaraService } from './camara.service';

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn() } }));

describe('Recuperación de cámara', () => {
  const usuario$ = new BehaviorSubject<{ id: string } | null>(null);
  const auth = {
    usuario$,
    aviso$: new BehaviorSubject(''),
    get usuarioActual() {
      return usuario$.value;
    },
    protegerSesionCamara: vi.fn(),
    finalizarSesionCamara: vi.fn(),
  };
  const agregarArchivo = vi.fn();
  const navigateByUrl = vi.fn();
  let servicio: CamaraService;
  const clave = 'tutolink.captura-pendiente';
  const id = '12345678-abcd-abcd-abcd-123456789abc';
  const evento = {
    pluginId: 'Camera',
    methodName: 'getPhoto',
    success: true,
    data: { path: 'file:///cache/foto.jpg', format: 'jpeg' },
  };
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    vi.mocked(App.addListener).mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) });
    localStorage.clear();
    usuario$.next(null);
    auth.aviso$.next('');
    agregarArchivo.mockResolvedValue({ id });
    navigateByUrl.mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: ApuntesService, useValue: { agregarArchivo } },
        { provide: Router, useValue: { navigateByUrl } },
      ],
    });
    servicio = TestBed.inject(CamaraService);
    localStorage.setItem(clave, JSON.stringify({ uid: '6', id, creada: Date.now() }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });
  it('espera a la cuenta original antes de guardar y regresar a apuntes', async () => {
    await servicio.recibir(evento);
    expect(agregarArchivo).not.toHaveBeenCalled();
    usuario$.next({ id: '6' });
    await servicio.reintentar();
    expect(agregarArchivo).toHaveBeenCalledWith('6', evento.data.path, 'jpeg', id);
    expect(navigateByUrl).toHaveBeenCalledWith('/tutolink/apuntes', { replaceUrl: true });
    expect(localStorage.getItem(clave)).toBeNull();
  });
  it('no guarda una foto en otra cuenta', async () => {
    usuario$.next({ id: '37' });
    await servicio.recibir(evento);
    expect(agregarArchivo).not.toHaveBeenCalled();
    expect(navigateByUrl).not.toHaveBeenCalled();
  });
  it('ignora eventos ajenos y duplicados', async () => {
    usuario$.next({ id: '6' });
    await servicio.recibir({ ...evento, pluginId: 'Otro' });
    expect(agregarArchivo).not.toHaveBeenCalled();
    await servicio.recibir(evento);
    await servicio.recibir(evento);
    expect(agregarArchivo).toHaveBeenCalledTimes(1);
  });
  it('conserva la ruta para reintentar si falla el almacenamiento', async () => {
    usuario$.next({ id: '6' });
    agregarArchivo.mockRejectedValueOnce(new Error('Sin espacio'));
    await servicio.recibir(evento);
    expect(JSON.parse(localStorage.getItem(clave)!).resultado.path).toBe(evento.data.path);
    expect(navigateByUrl).not.toHaveBeenCalled();
    await servicio.reintentar();
    expect(agregarArchivo).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(clave)).toBeNull();
  });
  it('limpia una captura cancelada y restaura la preferencia de sesión', async () => {
    await servicio.recibir({ ...evento, success: false });
    expect(localStorage.getItem(clave)).toBeNull();
    expect(auth.finalizarSesionCamara).toHaveBeenCalled();
    expect(agregarArchivo).not.toHaveBeenCalled();
  });
  it('descarta capturas vencidas', async () => {
    localStorage.setItem(clave, JSON.stringify({ uid: '6', id, creada: Date.now() - 3600001 }));
    usuario$.next({ id: '6' });
    await servicio.recibir(evento);
    expect(agregarArchivo).not.toHaveBeenCalled();
    expect(localStorage.getItem(clave)).toBeNull();
  });
  it('registra el listener una sola vez antes de abrir la cámara', async () => {
    localStorage.clear();
    usuario$.next({ id: '6' });
    await servicio.preparar('6');
    servicio.iniciar();
    expect(App.addListener).toHaveBeenCalledTimes(1);
    expect(auth.protegerSesionCamara).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(clave)!).uid).toBe('6');
  });
  it('descarta una operación sin resultado y permite una nueva captura', async () => {
    usuario$.next({ id: '6' });
    expect(servicio.consultarPendiente()).toEqual({ id, tieneFoto: false });
    expect(await servicio.descartar(id)).toBe(true);
    expect(auth.finalizarSesionCamara).toHaveBeenCalled();
    await servicio.preparar('6');
    expect(JSON.parse(localStorage.getItem(clave)!).id).not.toBe(id);
    expect(agregarArchivo).not.toHaveBeenCalled();
  });
  it('no descarta ni expone una captura de otra cuenta', async () => {
    usuario$.next({ id: '37' });
    expect(servicio.consultarPendiente()).toBeNull();
    expect(await servicio.descartar(id)).toBe(false);
    expect(localStorage.getItem(clave)).not.toBeNull();
  });
  it('no descarta una captura distinta de la confirmada', async () => {
    usuario$.next({ id: '6' });
    expect(await servicio.descartar('otro-id')).toBe(false);
    expect(localStorage.getItem(clave)).not.toBeNull();
  });
  it('conserva la captura si falla restaurar la preferencia de sesión', async () => {
    usuario$.next({ id: '6' });
    auth.finalizarSesionCamara.mockRejectedValueOnce(new Error('Fallo de persistencia'));
    await expect(servicio.descartar(id)).rejects.toThrow('Fallo de persistencia');
    expect(localStorage.getItem(clave)).not.toBeNull();
    expect(await servicio.descartar(id)).toBe(true);
  });
  it('impide descartar mientras se está guardando una foto recuperada', async () => {
    usuario$.next({ id: '6' });
    let resolver!: (foto: { id: string }) => void;
    agregarArchivo.mockReturnValueOnce(
      new Promise((resolve) => {
        resolver = resolve;
      }),
    );
    const guardado = servicio.recibir(evento);
    expect(await servicio.descartar(id)).toBe(false);
    resolver({ id });
    await guardado;
    expect(agregarArchivo).toHaveBeenCalledTimes(1);
  });
});
