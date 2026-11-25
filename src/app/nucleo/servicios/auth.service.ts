import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDocFromServer, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { HttpErrorResponse } from '@angular/common/http';
import { FirebaseService } from './firebase.service';
import { Registro, Usuario } from '../../modelos/usuario.model';
import { mensajeFirebase } from '../../compartidos/utilidades/firebase-error';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private firebase = inject(FirebaseService);
  private revision = 0;
  private registrando = false;
  private readonly claveCaptura = 'tutolink.sesion-camara';
  private usuarioSubject = new BehaviorSubject<Usuario | null>(null);
  readonly usuario$ = this.usuarioSubject.asObservable();
  readonly aviso$ = new BehaviorSubject('');
  readonly comprobando$ = new BehaviorSubject(true);
  get usuarioActual(): Usuario | null {
    return this.usuarioSubject.value;
  }

  constructor() {
    onAuthStateChanged(this.firebase.auth, (user) => {
      if (this.registrando || (user && user.uid === this.usuarioActual?.id)) return;
      void this.cargarPerfil(user);
    });
  }

  async registrar(datos: Registro): Promise<{ mensaje: string; usuario: Usuario }> {
    if (datos.rol !== 'estudiante' && datos.rol !== 'tutor') throw this.error('Selecciona un rol válido.');
    if (this.firebase.auth.currentUser) throw this.error('Cierra tu sesión antes de crear otra cuenta.');
    const correo = datos.correo.trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+@usco\.edu\.co$/.test(correo)) throw this.error('Usa tu correo institucional.');
    if (datos.nombre.trim().length < 3 || datos.nombre.trim().length > 100) throw this.error('Revisa tu nombre.');
    if (
      datos.contrasena.length < 8 ||
      datos.contrasena.length > 30 ||
      !/[A-Z]/.test(datos.contrasena) ||
      !/[a-z]/.test(datos.contrasena) ||
      !/\d/.test(datos.contrasena)
    )
      throw this.error('Incluye mayúscula, minúscula y número en una contraseña de 8 a 30 caracteres.');
    if (datos.contrasena !== datos.confirmarContrasena) throw this.error('Las contraseñas no coinciden.');
    const facultad = await getDocFromServer(doc(this.firebase.db, 'facultades', String(datos.facultadId)));
    if (!facultad.exists()) throw this.error('Selecciona una facultad válida.');
    this.registrando = true;
    let creada: User | undefined;
    try {
      await setPersistence(this.firebase.auth, browserSessionPersistence);
      const credencial = await createUserWithEmailAndPassword(this.firebase.auth, correo, datos.contrasena);
      creada = credencial.user;
      await setDoc(doc(this.firebase.db, 'usuarios', creada.uid), {
        nombre: datos.nombre.trim(),
        correo,
        facultadId: datos.facultadId,
        rol: datos.rol,
        creado_en: serverTimestamp(),
      });
      const usuario = await this.leerPerfil(creada);
      return { mensaje: 'Cuenta creada. Ya puedes iniciar sesión.', usuario };
    } catch (error) {
      if (creada) {
        // La cuenta y el perfil pertenecen a servicios distintos: limpiar una creación incompleta.
        const perfil = await getDocFromServer(doc(this.firebase.db, 'usuarios', creada.uid)).catch(() => null);
        if (perfil && !perfil.exists()) await deleteUser(creada).catch(() => undefined);
      }
      throw error;
    } finally {
      await signOut(this.firebase.auth).catch(() => undefined);
      this.registrando = false;
      this.usuarioSubject.next(null);
      this.comprobando$.next(false);
    }
  }

  async ingresar(correo: string, contrasena: string, recordar: boolean): Promise<void> {
    await setPersistence(this.firebase.auth, recordar ? browserLocalPersistence : browserSessionPersistence);
    const { user } = await signInWithEmailAndPassword(this.firebase.auth, correo.trim().toLowerCase(), contrasena);
    const perfil = await this.leerPerfil(user);
    if (this.firebase.auth.currentUser?.uid !== user.uid) return;
    localStorage.setItem('tutolink.recordar', String(recordar));
    this.usuarioSubject.next(perfil);
    this.aviso$.next('');
    this.comprobando$.next(false);
  }

  async restaurar(): Promise<void> {
    await this.firebase.auth.authStateReady();
    await this.cargarPerfil(this.firebase.auth.currentUser);
  }

  async protegerSesionCamara(): Promise<void> {
    const uid = this.firebase.auth.currentUser?.uid;
    if (!uid) throw this.error('Inicia sesión para tomar una foto.');
    localStorage.setItem(
      this.claveCaptura,
      JSON.stringify({
        uid,
        recordar: localStorage.getItem('tutolink.recordar') === 'true',
        vence: Date.now() + 3600000,
      }),
    );
    await setPersistence(this.firebase.auth, browserLocalPersistence);
  }

  async finalizarSesionCamara(): Promise<void> {
    const valor = localStorage.getItem(this.claveCaptura);
    if (!valor) return;
    const captura = JSON.parse(valor) as { uid: string; recordar: boolean; vence: number };
    if (this.firebase.auth.currentUser?.uid === captura.uid && !captura.recordar) {
      await setPersistence(this.firebase.auth, browserSessionPersistence);
    }
    localStorage.removeItem(this.claveCaptura);
  }

  cerrar(): void {
    localStorage.removeItem(this.claveCaptura);
    localStorage.removeItem('tutolink.captura-pendiente');
    ++this.revision;
    this.usuarioSubject.next(null);
    this.aviso$.next('');
    this.comprobando$.next(false);
    void signOut(this.firebase.auth).catch(() => this.aviso$.next('No se pudo cerrar la sesión. Intenta nuevamente.'));
  }

  private async cargarPerfil(user: User | null): Promise<void> {
    const revision = ++this.revision;
    this.comprobando$.next(true);
    if (!user || user.uid !== this.usuarioActual?.id) this.usuarioSubject.next(null);
    try {
      if (!user) return;
      const pendiente = localStorage.getItem(this.claveCaptura);
      if (pendiente) {
        const captura = JSON.parse(pendiente) as { uid: string; recordar: boolean; vence: number };
        if (captura.uid === user.uid && !captura.recordar && captura.vence < Date.now()) {
          localStorage.removeItem(this.claveCaptura);
          await signOut(this.firebase.auth);
          return;
        }
        await this.finalizarSesionCamara();
      }
      const usuario = await this.leerPerfil(user);
      if (revision === this.revision) {
        this.usuarioSubject.next(usuario);
        this.aviso$.next('');
      }
    } catch (error) {
      if (revision === this.revision)
        this.aviso$.next(mensajeFirebase(error, 'No pudimos cargar tu perfil. Revisa la conexión y pulsa Reintentar.'));
    } finally {
      if (revision === this.revision) this.comprobando$.next(false);
    }
  }

  private async leerPerfil(user: User): Promise<Usuario> {
    const perfil = await getDocFromServer(doc(this.firebase.db, 'usuarios', user.uid));
    if (!perfil.exists())
      throw this.error('Tu cuenta no tiene un perfil completo. Contacta al responsable del proyecto.');
    const datos = perfil.data();
    if (datos['rol'] !== 'estudiante' && datos['rol'] !== 'tutor')
      throw this.error('Tu cuenta no tiene un rol válido. Contacta al responsable del proyecto.');
    const facultadId = Number(datos['facultadId']);
    const facultad = await getDocFromServer(doc(this.firebase.db, 'facultades', String(facultadId)));
    return {
      id: user.uid,
      nombre: String(datos['nombre']),
      correo: user.email ?? '',
      facultadId,
      facultad: facultad.exists() ? String(facultad.data()['nombre']) : null,
      rol: datos['rol'],
      creado_en: datos['creado_en'] instanceof Timestamp ? datos['creado_en'].toDate().toISOString() : '',
    };
  }

  private error(mensaje: string): HttpErrorResponse {
    return new HttpErrorResponse({ status: 400, error: { mensaje } });
  }
}
