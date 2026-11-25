import { AuthService } from './auth.service';
import { ApuntesService } from './apuntes.service';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { AlertController } from '@ionic/angular';
import { CamaraService } from './camara.service';

vi.mock('@capacitor/camera', () => ({ Camera: { checkPermissions: vi.fn(), requestPermissions: vi.fn() } }));

describe('Permisos de cámara', () => {
  const present = vi.fn();
  const onDidDismiss = vi.fn();
  const create = vi.fn();
  let servicio: CamaraService;
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    vi.spyOn(Capacitor, 'isNativePlatform');
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    create.mockResolvedValue({ present, onDidDismiss });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: {} },
        { provide: ApuntesService, useValue: {} },
        { provide: AlertController, useValue: { create } },
      ],
    });
    servicio = TestBed.inject(CamaraService);
  });
  afterEach(() => vi.restoreAllMocks());
  it('no solicita permiso nativo en navegador', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    expect(await servicio.solicitarPermiso()).toBe(true);
    expect(Camera.checkPermissions).not.toHaveBeenCalled();
  });
  it('reutiliza el permiso concedido', async () => {
    vi.mocked(Camera.checkPermissions).mockResolvedValue({ camera: 'granted', photos: 'granted' });
    expect(await servicio.solicitarPermiso()).toBe(true);
    expect(Camera.requestPermissions).not.toHaveBeenCalled();
  });
  it('solicita únicamente cámara y respeta la denegación', async () => {
    vi.mocked(Camera.checkPermissions).mockResolvedValue({ camera: 'prompt', photos: 'granted' });
    vi.mocked(Camera.requestPermissions).mockResolvedValue({ camera: 'denied', photos: 'granted' });
    expect(await servicio.solicitarPermiso()).toBe(false);
    expect(Camera.requestPermissions).toHaveBeenCalledWith({ permissions: ['camera'] });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ header: 'Cámara sin permiso' }));
  });
  it('permite continuar tras conceder el permiso', async () => {
    vi.mocked(Camera.checkPermissions).mockResolvedValue({ camera: 'prompt', photos: 'granted' });
    vi.mocked(Camera.requestPermissions).mockResolvedValue({ camera: 'granted', photos: 'granted' });
    expect(await servicio.solicitarPermiso()).toBe(true);
  });
  it('solicita al sistema aunque la comprobación conserve una denegación anterior', async () => {
    vi.mocked(Camera.checkPermissions).mockResolvedValue({ camera: 'denied', photos: 'granted' });
    vi.mocked(Camera.requestPermissions).mockResolvedValue({ camera: 'granted', photos: 'granted' });
    expect(await servicio.solicitarPermiso()).toBe(true);
    expect(Camera.requestPermissions).toHaveBeenCalledExactlyOnceWith({ permissions: ['camera'] });
    expect(create).not.toHaveBeenCalled();
  });
  it('no repite la solicitud si Android mantiene el permiso bloqueado', async () => {
    vi.mocked(Camera.checkPermissions).mockResolvedValue({ camera: 'denied', photos: 'granted' });
    vi.mocked(Camera.requestPermissions).mockResolvedValue({ camera: 'denied', photos: 'granted' });
    expect(await servicio.solicitarPermiso()).toBe(false);
    expect(Camera.requestPermissions).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ header: 'Cámara sin permiso' }));
  });
  it('vuelve a solicitar después de que caduque un permiso temporal', async () => {
    vi.mocked(Camera.checkPermissions)
      .mockResolvedValueOnce({ camera: 'granted', photos: 'granted' })
      .mockResolvedValueOnce({ camera: 'denied', photos: 'granted' });
    vi.mocked(Camera.requestPermissions).mockResolvedValue({ camera: 'granted', photos: 'granted' });
    expect(await servicio.solicitarPermiso()).toBe(true);
    expect(Camera.requestPermissions).not.toHaveBeenCalled();
    expect(await servicio.solicitarPermiso()).toBe(true);
    expect(Camera.requestPermissions).toHaveBeenCalledTimes(1);
  });
  it('respeta Ahora no en la explicación previa', async () => {
    vi.mocked(Camera.checkPermissions).mockResolvedValue({ camera: 'prompt-with-rationale', photos: 'granted' });
    onDidDismiss.mockResolvedValue({ role: 'cancel' });
    expect(await servicio.solicitarPermiso()).toBe(false);
    expect(Camera.requestPermissions).not.toHaveBeenCalled();
  });
});
