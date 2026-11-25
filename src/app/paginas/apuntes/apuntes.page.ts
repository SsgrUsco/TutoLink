import { BrandComponent } from '../../compartidos/componentes/marca/brand.component';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, HostListener, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../nucleo/servicios/auth.service';
import { ApuntesService } from '../../nucleo/servicios/apuntes.service';
import { Capacitor } from '@capacitor/core';
import { CamaraService } from '../../nucleo/servicios/camara.service';
import { Foto, TutoriaApunte } from '../../modelos/foto.model';
import { TutoriasService } from '../../nucleo/servicios/tutorias.service';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { CameraSource } from '@capacitor/camera';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonCard,
  IonCardHeader,
  IonCardSubtitle,
  IonCol,
  IonContent,
  IonGrid,
  IonHeader,
  IonIcon,
  IonImg,
  IonInput,
  IonModal,
  IonRow,
  IonSearchbar,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cameraOutline, imagesOutline, star, starOutline, refreshOutline } from 'ionicons/icons';

@Component({
  selector: 'app-apuntes',
  templateUrl: 'apuntes.page.html',
  styleUrls: ['apuntes.page.scss'],
  imports: [
    BrandComponent,
    CommonModule,
    RouterLink,
    FormsModule,
    IonButton,
    IonButtons,
    IonCard,
    IonCardHeader,
    IonCardSubtitle,
    IonCol,
    IonContent,
    IonGrid,
    IonHeader,
    IonIcon,
    IonImg,
    IonInput,
    IonModal,
    IonRow,
    IonSearchbar,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonTitle,
    IonToolbar,
  ],
})
export class ApuntesPage {
  readonly refreshOutline = refreshOutline;
  fotos: Foto[] = [];
  fotoSeleccionada: Foto | null = null;
  modalAbierto = false;
  busqueda = '';
  soloFavoritas = false;
  tituloEditado = '';
  descripcionEditada = '';
  tutoriaEditada: number | null = null;
  filtroTutoria: 'todas' | 'sin' | number = 'todas';
  tutorias: TutoriaApunte[] = [];
  cargandoTutorias = false;
  errorTutorias = '';
  private tutoriasService = inject(TutoriasService);
  private revisionTutorias = 0;
  get puedeOrganizarPorTutoria(): boolean {
    const rol = this.auth.usuarioActual?.rol;
    return rol === 'estudiante' || rol === 'tutor';
  }

  get asignacionAnteriorFueraDeLista(): boolean {
    const anterior = this.fotoSeleccionada?.tutoria;
    return !!anterior && !this.tutorias.some((t) => t.id === anterior.id);
  }

  get opcionesTutorias(): TutoriaApunte[] {
    const opciones = new Map<number, TutoriaApunte>();
    for (const foto of this.fotos) if (foto.tutoria) opciones.set(foto.tutoria.id, foto.tutoria);
    for (const tutoria of this.tutorias) opciones.set(tutoria.id, tutoria);
    return [...opciones.values()].sort(
      (a, b) => b.inicio.localeCompare(a.inicio) || a.materia.localeCompare(b.materia),
    );
  }

  async cargarTutorias(): Promise<void> {
    if (!this.usuarioId || !this.puedeOrganizarPorTutoria || this.cargandoTutorias) return;
    const revision = ++this.revisionTutorias;
    this.cargandoTutorias = true;
    this.errorTutorias = '';
    this.tutorias = [];
    try {
      const esEstudiante = this.auth.usuarioActual?.rol === 'estudiante';
      const [catalogo, reservas] = await Promise.all([
        firstValueFrom(this.tutoriasService.consultar()),
        esEstudiante ? firstValueFrom(this.tutoriasService.misReservas()) : Promise.resolve([]),
      ]);
      const confirmadas = new Set(reservas.filter((r) => r.estado === 'confirmada').map((r) => r.tutoriaId));
      const tutorias = esEstudiante ? catalogo.filter((t) => confirmadas.has(t.id)) : catalogo;
      if (revision === this.revisionTutorias)
        this.tutorias = tutorias.map(({ id, materia, inicio }) => ({ id, materia, inicio }));
    } catch {
      if (revision === this.revisionTutorias)
        this.errorTutorias =
          'No se pudo actualizar la lista de tutorías. Puedes seguir usando tus apuntes y sus asignaciones guardadas.';
    } finally {
      if (revision === this.revisionTutorias) this.cargandoTutorias = false;
      this.changeDetector.markForCheck();
    }
  }
  readonly limiteTitulo = 18;
  readonly limiteDescripcion = 50;
  usuarioId: string | null = null;
  cargando = false;
  guardando = false;
  errorCarga = '';
  readonly auth = inject(AuthService);
  private servicio = inject(ApuntesService);
  private camara = inject(CamaraService);
  private destroyRef = inject(DestroyRef);
  private revision = 0;
  private alertController = inject(AlertController);
  private toastController = inject(ToastController);
  private changeDetector = inject(ChangeDetectorRef);

  constructor() {
    this.camara.recuperada$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => void this.cargar());
    addIcons({ cameraOutline, imagesOutline, star, starOutline, refreshOutline });
    this.auth.usuario$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((usuario) => {
      ++this.revision;
      this.usuarioId = usuario?.id ?? null;
      this.fotos = [];
      this.fotoSeleccionada = null;
      this.modalAbierto = false;
      this.busqueda = '';
      this.soloFavoritas = false;
      ++this.revisionTutorias;
      this.tutorias = [];
      this.cargandoTutorias = false;
      this.errorTutorias = '';
      this.filtroTutoria = 'todas';
      this.tutoriaEditada = null;
      this.errorCarga = '';
      this.cargando = false;
      if (this.usuarioId) void this.cargar();
      if (this.usuarioId) void this.cargarTutorias();
      this.changeDetector.markForCheck();
    });
  }

  ionViewDidEnter(): void {
    void this.cargarTutorias();
    void this.camara.reintentar();
    if (!this.cargando) void this.cargar();
  }

  @HostListener('window:online')
  alRecuperarConexion(): void {
    void this.cargarTutorias();
    if (!this.cargando) void this.cargar();
  }

  get estadoSincronizacion(): string {
    return this.usuarioId ? this.servicio.estado(this.usuarioId) : '';
  }

  get bloqueado(): boolean {
    return !this.usuarioId || this.cargando || this.guardando || !!this.errorCarga;
  }

  async cargar(): Promise<void> {
    if (!this.usuarioId || this.guardando) return;
    const usuario = this.usuarioId;
    const revision = ++this.revision;
    this.cargando = true;
    this.errorCarga = '';
    try {
      const fotos = await this.servicio.cargar(usuario);
      if (revision === this.revision) this.fotos = fotos;
    } catch {
      if (revision === this.revision)
        this.errorCarga = 'No pudimos leer tus apuntes. Tus archivos no se han sobrescrito. Intenta nuevamente.';
    } finally {
      if (revision === this.revision) this.cargando = false;
      this.changeDetector.markForCheck();
    }
  }

  get fotosFiltradas(): Foto[] {
    const texto = this.busqueda.trim().toLowerCase();
    return this.fotos.filter(
      (foto) =>
        foto.titulo.toLowerCase().includes(texto) &&
        (!this.soloFavoritas || foto.favorita) &&
        (!this.puedeOrganizarPorTutoria ||
          this.filtroTutoria === 'todas' ||
          (this.filtroTutoria === 'sin' ? !foto.tutoria : foto.tutoria?.id === this.filtroTutoria)),
    );
  }

  tomarFotografia(): Promise<void> {
    return this.capturar(CameraSource.Camera);
  }
  elegirDeGaleria(): Promise<void> {
    return this.capturar(CameraSource.Photos);
  }

  private async resolverCapturaPendiente(): Promise<boolean> {
    const pendiente = this.camara.consultarPendiente();
    if (!pendiente) return true;
    const usuario = this.usuarioId;
    const alerta = await this.alertController.create({
      header: 'Captura pendiente',
      message: pendiente.tieneFoto
        ? 'Una foto no terminó de guardarse. Puedes reintentar o descartar esta captura para tomar otra.'
        : 'La cámara se interrumpió sin devolver una foto. Descarta esta captura para volver a intentarlo.',
      cssClass: 'tl-action-alert',
      buttons: [
        { text: 'Volver', role: 'cancel', cssClass: 'tl-alert-neutral' },
        ...(pendiente.tieneFoto ? [{ text: 'Reintentar guardado', role: 'retry', cssClass: 'tl-alert-neutral' }] : []),
        { text: 'Descartar captura', role: 'discard', cssClass: 'tl-alert-danger' },
      ],
    });
    await alerta.present();
    const { role } = await alerta.onDidDismiss();
    if (usuario !== this.usuarioId) return false;
    if (role === 'retry') {
      await this.camara.reintentar();
      if (this.camara.consultarPendiente())
        await this.avisar('No se pudo guardar la foto. Puedes reintentar o descartar la captura.', true);
      return false;
    }
    if (role !== 'discard') return false;
    if (await this.camara.descartar(pendiente.id)) return true;
    await this.avisar('La captura cambió o se está recuperando. Vuelve a intentarlo.');
    return false;
  }

  private async capturar(source: CameraSource): Promise<void> {
    if (this.bloqueado || !this.usuarioId) return;
    const usuario = this.usuarioId;
    const revision = this.revision;
    this.guardando = true;
    let capturada = false;
    const nativa = Capacitor.isNativePlatform();
    let preparada = false;
    const teniaPendiente = nativa && !!this.camara.consultarPendiente();
    try {
      if (nativa && !(await this.resolverCapturaPendiente())) return;
      if (revision !== this.revision) return;
      if (source === CameraSource.Camera && !(await this.camara.solicitarPermiso())) return;
      if (revision !== this.revision) return;
      if (nativa) {
        await this.camara.preparar(usuario);
        preparada = true;
      }
      const image = await this.camara.abrir(source);
      if (revision !== this.revision) return;
      capturada = true;
      const foto = nativa
        ? await this.camara.guardar(image)
        : await this.servicio.agregar(usuario, image.base64String!, image.format);
      if (revision !== this.revision) return;
      this.fotos = [foto, ...this.fotos];
      // Una captura nueva aún no está clasificada: mostrarla aunque hubiera un filtro activo.
      this.filtroTutoria = 'todas';
      this.soloFavoritas = false;
      this.busqueda = '';
      await this.avisar('Apunte guardado.');
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      if (revision === this.revision && !/cancel/i.test(mensaje)) {
        await this.avisar(
          capturada
            ? 'No se pudo guardar el apunte. Revisa el espacio disponible.'
            : 'No se pudo abrir la cámara o galería. Revisa los permisos.',
          true,
        );
      }
    } finally {
      if (preparada)
        await this.camara
          .finalizar()
          .catch(() => this.auth.aviso$.next('No se pudo restaurar la preferencia de sesión.'));
      this.guardando = false;
      if ((capturada || teniaPendiente || revision !== this.revision) && this.usuarioId) void this.cargar();
      this.changeDetector.markForCheck();
    }
  }

  abrirFoto(foto: Foto): void {
    if (this.bloqueado) return;
    this.fotoSeleccionada = foto;
    this.tituloEditado = foto.titulo;
    this.descripcionEditada = foto.descripcion;
    this.tutoriaEditada = foto.tutoria?.id ?? null;
    this.modalAbierto = true;
  }

  cerrarFoto(): void {
    this.modalAbierto = false;
  }

  async guardarCambios(): Promise<void> {
    const titulo = this.tituloEditado.trim();
    const descripcion = this.descripcionEditada.trim();
    if (
      !this.fotoSeleccionada ||
      !titulo ||
      titulo.length > this.limiteTitulo ||
      descripcion.length > this.limiteDescripcion
    )
      return;
    const { tutoria: anterior, ...foto } = this.fotoSeleccionada;
    const tutoria =
      this.tutoriaEditada === anterior?.id ? anterior : this.tutorias.find((t) => t.id === this.tutoriaEditada);
    if (this.puedeOrganizarPorTutoria && this.tutoriaEditada !== null && !tutoria) {
      await this.avisar('Selecciona una tutoría de la lista o Sin tutoría.', true);
      return;
    }
    await this.actualizar({ ...foto, titulo, descripcion, ...(tutoria ? { tutoria } : {}) }, true);
  }

  async alternarFavorita(): Promise<void> {
    if (this.fotoSeleccionada)
      await this.actualizar({ ...this.fotoSeleccionada, favorita: !this.fotoSeleccionada.favorita }, false);
  }

  private async actualizar(foto: Foto, cerrar: boolean): Promise<void> {
    if (this.bloqueado || !this.usuarioId) return;
    const usuario = this.usuarioId,
      revision = this.revision;
    this.guardando = true;
    try {
      await this.servicio.guardar(usuario, foto);
      if (revision !== this.revision) return;
      this.fotos = this.fotos.map((item) => (item.id === foto.id ? foto : item));
      this.fotoSeleccionada = foto;
      if (cerrar) {
        this.cerrarFoto();
        await this.avisar('Cambios guardados.');
      }
    } catch {
      if (revision === this.revision)
        await this.avisar('No se pudieron guardar los cambios. Intenta nuevamente.', true);
    } finally {
      this.guardando = false;
      if (this.usuarioId) void this.cargar();
      this.changeDetector.markForCheck();
    }
  }

  async eliminarFoto(): Promise<void> {
    const foto = this.fotoSeleccionada;
    if (!foto || this.bloqueado || !this.usuarioId) return;
    const usuario = this.usuarioId,
      revision = this.revision;
    this.guardando = true;
    try {
      const alerta = await this.alertController.create({
        header: 'Eliminar apunte',
        message:
          'Se eliminará de tu cuenta y de los otros dispositivos cuando se sincronicen. La imagen original de tu galería no se eliminará.',
        cssClass: 'tl-action-alert',
        buttons: [
          { text: 'Cancelar', role: 'cancel', cssClass: 'tl-alert-neutral' },
          { text: 'Eliminar', role: 'confirm', cssClass: 'tl-alert-danger' },
        ],
      });
      await alerta.present();
      if ((await alerta.onDidDismiss()).role !== 'confirm' || revision !== this.revision) return;
      await this.servicio.eliminar(usuario, foto);
      if (revision !== this.revision) return;
      this.fotos = this.fotos.filter((item) => item.id !== foto.id);
      this.fotoSeleccionada = null;
      this.cerrarFoto();
      await this.avisar('Apunte eliminado. Se sincronizará la eliminación con tu cuenta.');
    } catch {
      if (revision === this.revision) await this.avisar('No se pudo eliminar el apunte. Intenta nuevamente.', true);
    } finally {
      this.guardando = false;
      if (this.usuarioId) void this.cargar();
      this.changeDetector.markForCheck();
    }
  }

  private async avisar(message: string, error = false): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      color: error ? 'danger' : 'success',
      position: 'bottom',
    });
    await toast.present();
  }
}
