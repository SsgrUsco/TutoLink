import { getDocFromServer } from 'firebase/firestore';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  setPersistence,
  signOut,
} from 'firebase/auth';
import { FirebaseService } from './firebase.service';
import { AuthService } from './auth.service';

vi.mock('firebase/auth', () => ({
  browserLocalPersistence: 'local',
  browserSessionPersistence: 'session',
  onAuthStateChanged: vi.fn(),
  setPersistence: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  Timestamp: class {},
  getDocFromServer: vi
    .fn()
    .mockResolvedValue({ exists: () => true, data: () => ({ nombre: 'Samuel', facultadId: 6, rol: 'estudiante' }) }),
}));

describe('Sesión durante la captura', () => {
  const firebase = { auth: { currentUser: { uid: '6' } }, db: {} };
  let servicio: AuthService;
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: FirebaseService, useValue: firebase }] });
    servicio = TestBed.inject(AuthService);
  });
  it('mantiene temporalmente la sesión y después restaura la preferencia desmarcada', async () => {
    localStorage.setItem('tutolink.recordar', 'false');
    await servicio.protegerSesionCamara();
    expect(setPersistence).toHaveBeenLastCalledWith(firebase.auth, browserLocalPersistence);
    await servicio.finalizarSesionCamara();
    expect(setPersistence).toHaveBeenLastCalledWith(firebase.auth, browserSessionPersistence);
    expect(localStorage.getItem('tutolink.sesion-camara')).toBeNull();
  });
  it('conserva la sesión permanente si el usuario pidió recordarla', async () => {
    localStorage.setItem('tutolink.recordar', 'true');
    await servicio.protegerSesionCamara();
    await servicio.finalizarSesionCamara();
    expect(setPersistence).toHaveBeenCalledExactlyOnceWith(firebase.auth, browserLocalPersistence);
  });
  it('restaura el perfil tras reiniciarse durante una captura sin recordar sesión', async () => {
    localStorage.setItem(
      'tutolink.sesion-camara',
      JSON.stringify({ uid: '6', recordar: false, vence: Date.now() + 10000 }),
    );
    const callback = vi.mocked(onAuthStateChanged).mock.calls[0]![1] as (user: unknown) => void;
    callback(firebase.auth.currentUser);
    await vi.waitFor(() => expect(servicio.usuarioActual?.id).toBe('6'));
    expect(setPersistence).toHaveBeenCalledWith(firebase.auth, browserSessionPersistence);
    expect(signOut).not.toHaveBeenCalled();
  });
  it('no conserva indefinidamente una sesión temporal abandonada', async () => {
    localStorage.setItem(
      'tutolink.sesion-camara',
      JSON.stringify({ uid: '6', recordar: false, vence: Date.now() - 1 }),
    );
    const callback = vi.mocked(onAuthStateChanged).mock.calls[0]![1] as (user: unknown) => void;
    callback(firebase.auth.currentUser);
    await vi.waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(servicio.usuarioActual).toBeNull();
  });
  it('no vacía ni vuelve a publicar el perfil ante una notificación de la misma sesión', async () => {
    const callback = vi.mocked(onAuthStateChanged).mock.calls[0]![1] as (user: unknown) => void;
    callback(firebase.auth.currentUser);
    await vi.waitFor(() => expect(servicio.usuarioActual?.id).toBe('6'));
    const eventos: Array<string | null> = [];
    const subscription = servicio.usuario$.subscribe((u) => eventos.push(u?.id ?? null));
    const lecturas = vi.mocked(getDocFromServer).mock.calls.length;
    callback(firebase.auth.currentUser);
    expect(eventos).toEqual(['6']);
    expect(getDocFromServer).toHaveBeenCalledTimes(lecturas);
    callback(null);
    expect(servicio.usuarioActual).toBeNull();
    subscription.unsubscribe();
  });

  it('el cierre explícito elimina cualquier recuperación pendiente', () => {
    localStorage.setItem('tutolink.sesion-camara', '{}');
    localStorage.setItem('tutolink.captura-pendiente', '{}');
    servicio.cerrar();
    expect(localStorage.getItem('tutolink.sesion-camara')).toBeNull();
    expect(localStorage.getItem('tutolink.captura-pendiente')).toBeNull();
  });
});
