import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { App, RestoredListenerEvent } from '@capacitor/app';
import { Capacitor, PluginListenerHandle } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource, Photo } from '@capacitor/camera';
import { AlertController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { ApuntesService } from './apuntes.service';
import { Foto } from '../../modelos/foto.model';

interface CapturaPendiente {
  uid: string;
  id: string;
  creada: number;
  resultado?: { path: string; format: string };
}

@Injectable({ providedIn: 'root' })
export class CamaraService {
  private alertas = inject(AlertController);

  async solicitarPermiso(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return true;
    let { camera } = await Camera.checkPermissions();
    if (camera === 'granted') return true;
    if (camera === 'prompt-with-rationale') {
      const aviso = await this.alertas.create({
        header: 'Permiso de cámara',
        message:
          'TutoLink necesita la cámara para fotografiar tus apuntes. También puedes elegir una imagen desde la galería.',
        cssClass: 'tl-action-alert',
        buttons: [
          { text: 'Ahora no', role: 'cancel', cssClass: 'tl-alert-neutral' },
          { text: 'Continuar', role: 'confirm', cssClass: 'tl-alert-neutral' },
        ],
      });
      await aviso.present();
      if ((await aviso.onDidDismiss()).role !== 'confirm') return false;
    }
    ({ camera } = await Camera.requestPermissions({ permissions: ['camera'] }));
    if (camera === 'granted') return true;
    const aviso = await this.alertas.create({
      header: 'Cámara sin permiso',
      message:
        'No se abrió la cámara. Puedes usar Abrir galería o habilitar el permiso en Ajustes del teléfono → Aplicaciones → TutoLink → Permisos → Cámara. Después vuelve a tocar Tomar foto.',
      cssClass: 'tl-action-alert',
      buttons: [{ text: 'Entendido', role: 'cancel', cssClass: 'tl-alert-neutral' }],
    });
    await aviso.present();
    return false;
  }

  abrir(source: CameraSource): Promise<Photo> {
    return Camera.getPhoto({
      quality: 85,
      width: 1600,
      height: 1600,
      allowEditing: false,
      saveToGallery: false,
      resultType: Capacitor.isNativePlatform() ? CameraResultType.Uri : CameraResultType.Base64,
      source,
    });
  }

  private auth = inject(AuthService);
  private apuntes = inject(ApuntesService);
  private router = inject(Router);
  private readonly clave = 'tutolink.captura-pendiente';
  private listener?: Promise<PluginListenerHandle>;
  private procesando = false;
  readonly recuperada$ = new Subject<void>();

  iniciar(): void {
    if (!Capacitor.isNativePlatform() || this.listener) return;
    this.listener = App.addListener('appRestoredResult', (evento) => {
      void this.recibir(evento).catch(() =>
        this.auth.aviso$.next('No se pudo recuperar la foto. Vuelve a Mis apuntes para reintentar.'),
      );
    });
    void this.listener.catch(() => this.auth.aviso$.next('No se pudo preparar la recuperación de la cámara.'));
    this.auth.usuario$.subscribe(() => {
      void this.reintentar();
    });
  }

  private pendiente(): CapturaPendiente | null {
    const valor = localStorage.getItem(this.clave);
    if (!valor) return null;
    try {
      const captura = JSON.parse(valor) as CapturaPendiente;
      if (
        typeof captura.uid !== 'string' ||
        !/^[\da-f-]{36}$/.test(captura.id) ||
        !Number.isFinite(captura.creada) ||
        Date.now() - captura.creada > 3600000
      ) {
        localStorage.removeItem(this.clave);
        return null;
      }
      return captura;
    } catch {
      localStorage.removeItem(this.clave);
      return null;
    }
  }

  get recuperandoCaptura(): boolean {
    return this.procesando || this.consultarPendiente() !== null;
  }

  consultarPendiente(): { id: string; tieneFoto: boolean } | null {
    const captura = this.pendiente();
    return captura && captura.uid === this.auth.usuarioActual?.id
      ? { id: captura.id, tieneFoto: !!captura.resultado }
      : null;
  }

  async descartar(id: string): Promise<boolean> {
    const captura = this.pendiente();
    if (this.procesando || !captura || captura.id !== id || captura.uid !== this.auth.usuarioActual?.id) return false;
    this.procesando = true;
    try {
      await this.auth.finalizarSesionCamara();
      if (this.pendiente()?.id !== id || captura.uid !== this.auth.usuarioActual?.id) return false;
      localStorage.removeItem(this.clave);
      return true;
    } finally {
      this.procesando = false;
    }
  }

  async preparar(uid: string): Promise<void> {
    this.iniciar();
    await this.listener;
    if (this.pendiente()) throw new Error('Hay una foto pendiente de recuperar. Abre de nuevo Mis apuntes.');
    await this.auth.protegerSesionCamara();
    localStorage.setItem(this.clave, JSON.stringify({ uid, id: crypto.randomUUID(), creada: Date.now() }));
  }

  async guardar(image: Photo): Promise<Foto> {
    const captura = this.pendiente();
    if (!captura || captura.uid !== this.auth.usuarioActual?.id || !image.path) {
      throw new Error('La foto no corresponde a la sesión actual.');
    }
    captura.resultado = { path: image.path, format: image.format };
    localStorage.setItem(this.clave, JSON.stringify(captura));
    const foto = await this.apuntes.agregarArchivo(captura.uid, image.path, image.format, captura.id);
    if (this.pendiente()?.id === captura.id) localStorage.removeItem(this.clave);
    return foto;
  }

  async finalizar(): Promise<void> {
    const captura = this.pendiente();
    if (captura && !captura.resultado) localStorage.removeItem(this.clave);
    await this.auth.finalizarSesionCamara();
  }

  async recibir(evento: RestoredListenerEvent): Promise<void> {
    if (evento.pluginId !== 'Camera' || evento.methodName !== 'getPhoto' || !this.pendiente()) return;
    if (!evento.success) {
      await this.finalizar();
      return;
    }
    const image = evento.data as Partial<Photo> | undefined;
    if (typeof image?.path !== 'string' || typeof image.format !== 'string') {
      await this.finalizar();
      this.auth.aviso$.next('La cámara no devolvió una imagen válida. Intenta tomarla otra vez.');
      return;
    }
    const captura = this.pendiente()!;
    captura.resultado = { path: image.path, format: image.format };
    localStorage.setItem(this.clave, JSON.stringify(captura));
    await this.reintentar();
  }

  async reintentar(): Promise<void> {
    const captura = this.pendiente();
    if (this.procesando || !captura?.resultado || captura.uid !== this.auth.usuarioActual?.id) return;
    this.procesando = true;
    try {
      await this.guardar({ ...captura.resultado, saved: false });
      await this.auth.finalizarSesionCamara();
      if (captura.uid === this.auth.usuarioActual?.id) {
        await this.router.navigateByUrl('/tutolink/apuntes', { replaceUrl: true });
        this.recuperada$.next();
      }
    } catch {
      this.auth.aviso$.next('No se pudo recuperar la foto. Revisa el espacio disponible y vuelve a Mis apuntes.');
    } finally {
      this.procesando = false;
    }
  }
}
