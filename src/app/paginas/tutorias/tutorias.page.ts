import { refreshOutline } from 'ionicons/icons';
import { BrandComponent } from '../../compartidos/componentes/marca/brand.component';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, firstValueFrom, forkJoin, of } from 'rxjs';
import { mensajeFirebase } from '../../compartidos/utilidades/firebase-error';
import { AlertController, ToastController } from '@ionic/angular';
import { TutoriasService } from '../../nucleo/servicios/tutorias.service';
import { AuthService } from '../../nucleo/servicios/auth.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonInput,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonGrid,
  IonRow,
  IonCol,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonList,
  IonItem,
  IonLabel,
  IonBadge,
  IonButton,
  IonIcon,
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonContent,
  IonSegment,
  IonSegmentButton,
} from '@ionic/angular';
import { EstadoTutoria, NuevaTutoria, Reserva, Tutoria } from '../../modelos/tutoria.model';

@Component({
  selector: 'app-tutorias-page',
  templateUrl: './tutorias.page.html',
  styleUrls: ['./tutorias.page.scss'],
  imports: [
    IonSegment,
    IonSegmentButton,
    BrandComponent,
    CommonModule,
    FormsModule,
    IonInput,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonGrid,
    IonRow,
    IonCol,
    IonSearchbar,
    IonSelect,
    IonSelectOption,
    IonList,
    IonItem,
    IonLabel,
    IonBadge,
    IonButton,
    IonIcon,
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
  ],
})
export class TutoriasPage implements OnInit {
  readonly refreshOutline = refreshOutline;
  private servicio = inject(TutoriasService);
  private detector = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  readonly auth = inject(AuthService);
  private alertas = inject(AlertController);
  private mensajes = inject(ToastController);
  private revision = 0;
  private usuarioId: string | null = null;
  reservas: Reserva[] = [];
  soloMisReservas = false;
  readonly vistaTutor = signal<'lista' | 'crear'>('lista');
  readonly avisoPublicacion = signal('');
  get esTutor(): boolean {
    return this.auth.usuarioActual?.rol === 'tutor';
  }
  readonly guardando = signal(false);
  tutorias: Tutoria[] = [];
  servicioDisponible = false;
  cargando = false;
  error = '';
  busqueda = '';
  estado: EstadoTutoria | 'todas' = 'todas';
  seleccionada: Tutoria | null = null;
  modalAbierto = false;
  ngOnInit(): void {
    this.auth.usuario$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((usuario) => {
      this.usuarioId = usuario?.id ?? null;
      ++this.revision;
      this.cargando = false;
      this.reservas = [];
      this.tutorias = [];
      this.seleccionada = null;
      this.servicioDisponible = false;
      this.error = '';
      this.busqueda = '';
      this.estado = 'todas';
      this.soloMisReservas = false;
      this.modalAbierto = false;
      this.vistaTutor.set('lista');
      this.avisoPublicacion.set('');
      this.reiniciarFormulario();
      this.cargar();
    });
  }

  readonly publicando = signal(false);
  readonly errorCreacion = signal('');
  private nuevaTutoriaId = 0;
  nuevaTutoria: NuevaTutoria = { materia: '', inicio: '', fin: '', lugar: '', cupos: 1 };

  private reiniciarFormulario(): void {
    this.nuevaTutoria = { materia: '', inicio: '', fin: '', lugar: '', cupos: 1 };
    this.nuevaTutoriaId = Date.now() * 1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 1000);
    this.errorCreacion.set('');
  }

  cancelarCreacion(): void {
    if (this.publicando()) return;
    this.reiniciarFormulario();
    this.vistaTutor.set('lista');
  }

  async publicarTutoria(): Promise<void> {
    if (this.publicando() || !this.esTutor) return;
    this.publicando.set(true);
    this.errorCreacion.set('');
    const usuarioId = this.usuarioId;
    try {
      await this.servicio.crear(this.nuevaTutoriaId, { ...this.nuevaTutoria });
      if (usuarioId !== this.usuarioId) return;
      this.reiniciarFormulario();
      this.tutoriaPublicada();
    } catch (error) {
      if (usuarioId === this.usuarioId)
        this.errorCreacion.set(
          mensajeFirebase(error, 'No se pudo publicar. Revisa la conexión y vuelve a intentarlo.'),
        );
    } finally {
      this.publicando.set(false);
    }
  }

  tutoriaPublicada(): void {
    this.vistaTutor.set('lista');
    this.avisoPublicacion.set('Tutoría publicada. Los estudiantes de tu facultad ya pueden consultarla.');
    this.cargar();
  }

  cargar(): void {
    if (this.cargando || !this.usuarioId) return;
    this.cargando = true;
    this.error = '';
    const revision = ++this.revision;
    forkJoin({
      tutorias: this.servicio.consultar(),
      reservas: !this.esTutor ? this.servicio.misReservas() : of([] as Reserva[]),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (revision === this.revision) this.cargando = false;
          this.detector.markForCheck();
        }),
      )
      .subscribe({
        next: ({ tutorias, reservas }) => {
          if (revision !== this.revision) return;
          this.tutorias = tutorias;
          this.reservas = reservas;
          this.servicioDisponible = true;
          this.seleccionada = tutorias.find((t) => t.id === this.seleccionada?.id) ?? null;
        },
        error: () => {
          if (revision !== this.revision) return;
          this.servicioDisponible = false;
          this.tutorias = [];
          this.error = 'No pudimos cargar las tutorías. Comprueba tu conexión a internet.';
        },
      });
  }

  get filtradas(): Tutoria[] {
    const texto = this.normalizar(this.busqueda.trim());
    return this.tutorias.filter(
      (tutoria) =>
        this.normalizar(`${tutoria.materia} ${tutoria.tutor}`).includes(texto) &&
        (this.estado === 'todas' || tutoria.estado === this.estado) &&
        (!this.soloMisReservas || this.reservada(tutoria.id)),
    );
  }

  get programadas(): number {
    return this.tutorias.filter((tutoria) => tutoria.estado === 'programada').length;
  }

  abrir(tutoria: Tutoria): void {
    this.seleccionada = tutoria;
    this.modalAbierto = true;
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.estado = 'todas';
    this.soloMisReservas = false;
  }

  reservada(id: number): boolean {
    return this.reservas.some((r) => r.tutoriaId === id && r.estado === 'confirmada');
  }

  futura(tutoria: Tutoria): boolean {
    return tutoria.estado === 'programada' && new Date(tutoria.inicio).getTime() > Date.now();
  }

  async cambiarReserva(tutoria: Tutoria): Promise<void> {
    if (this.guardando() || this.cargando || !this.usuarioId || this.esTutor) return;
    this.guardando.set(true);
    const usuario = this.usuarioId;
    const cancelar = this.reservada(tutoria.id);
    try {
      const alerta = await this.alertas.create({
        header: cancelar ? 'Cancelar reserva' : 'Reservar cupo',
        message: cancelar
          ? 'Tu cupo quedará disponible para otro estudiante.'
          : 'Confirma que deseas reservar un cupo en esta tutoría.',
        cssClass: 'tl-action-alert',
        buttons: [
          { text: 'Volver', role: 'cancel', cssClass: 'tl-alert-neutral' },
          { text: 'Confirmar', role: 'confirm', cssClass: cancelar ? 'tl-alert-danger' : 'tl-alert-neutral' },
        ],
      });
      await alerta.present();
      if ((await alerta.onDidDismiss()).role !== 'confirm' || usuario !== this.usuarioId) return;
      const respuesta = await firstValueFrom(this.servicio.cambiarReserva(tutoria.id, cancelar));
      if (usuario !== this.usuarioId) return;
      const toast = await this.mensajes.create({ message: respuesta.mensaje, duration: 3000, color: 'success' });
      await toast.present();
      this.cargar();
    } catch (error) {
      const mensaje = mensajeFirebase(
        error,
        'No pudimos confirmar el resultado. Actualiza las tutorías antes de volver a intentarlo.',
      );
      const toast = await this.mensajes.create({ message: mensaje, duration: 5000, color: 'danger' });
      await toast.present();
      this.cargar();
    } finally {
      this.guardando.set(false);
      this.detector.markForCheck();
    }
  }

  async cancelarTutoria(tutoria: Tutoria): Promise<void> {
    if (!this.esTutor || this.guardando() || this.cargando || !this.futura(tutoria)) return;
    const usuario = this.usuarioId;
    this.guardando.set(true);
    try {
      const alerta = await this.alertas.create({
        header: 'Cancelar tutoría',
        message: 'La sesión dejará de estar disponible para los estudiantes. Esta acción no se puede deshacer.',
        cssClass: 'tl-action-alert',
        buttons: [
          { text: 'Volver', role: 'cancel', cssClass: 'tl-alert-neutral' },
          { text: 'Cancelar tutoría', role: 'confirm', cssClass: 'tl-alert-danger' },
        ],
      });
      await alerta.present();
      if ((await alerta.onDidDismiss()).role !== 'confirm' || usuario !== this.usuarioId) return;
      await this.servicio.cancelarTutoria(tutoria.id);
      if (usuario !== this.usuarioId) return;
      this.tutorias = this.tutorias.map((t) => (t.id === tutoria.id ? { ...t, estado: 'cancelada' } : t));
      this.seleccionada = this.tutorias.find((t) => t.id === tutoria.id) ?? null;
      const aviso = await this.mensajes.create({ message: 'Tutoría cancelada.', color: 'success', duration: 3000 });
      await aviso.present();
    } catch (error) {
      if (usuario !== this.usuarioId) return;
      const aviso = await this.mensajes.create({
        message: mensajeFirebase(error, 'No pudimos confirmar la cancelación. Actualiza las tutorías.'),
        color: 'danger',
        duration: 5000,
      });
      await aviso.present();
      this.cargar();
    } finally {
      this.guardando.set(false);
      this.detector.markForCheck();
    }
  }

  colorEstado(estado: EstadoTutoria): string {
    return estado === 'cancelada' ? 'danger' : estado === 'finalizada' ? 'medium' : 'success';
  }

  private normalizar(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
}
