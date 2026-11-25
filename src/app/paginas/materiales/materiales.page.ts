import { BrandComponent } from '../../compartidos/componentes/marca/brand.component';
import { ChangeDetectorRef, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import {
  IonGrid,
  IonRow,
  IonCol,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonSearchbar,
  IonButton,
  IonList,
  IonItem,
  IonLabel,
  IonSpinner,
  IonSegment,
  IonSegmentButton,
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonContent,
  ToastController,
  AlertController,
} from '@ionic/angular';
import { MaterialesService } from '../../nucleo/servicios/materiales.service';
import { Libro } from '../../modelos/libro.model';

@Component({
  selector: 'app-materiales-page',
  templateUrl: './materiales.page.html',
  imports: [
    BrandComponent,
    CommonModule,
    FormsModule,
    IonGrid,
    IonRow,
    IonCol,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonSearchbar,
    IonButton,
    IonList,
    IonItem,
    IonLabel,
    IonSpinner,
    IonSegment,
    IonSegmentButton,
    IonModal,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
  ],
})
export class MaterialesPage {
  private servicio = inject(MaterialesService);
  private detector = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private toast = inject(ToastController);
  private alert = inject(AlertController);
  consulta = '';
  ultimaConsulta = '';
  vista = 'buscar';
  cargando = false;
  consultado = false;
  error = '';
  errorLocal = '';
  resultados: Libro[] = [];
  guardados: Libro[] = [];
  seleccionado: Libro | null = null;
  modalAbierto = false;

  constructor() {
    try {
      this.guardados = this.servicio.leerGuardados();
    } catch {
      this.errorLocal = 'No se pudieron leer tus materiales guardados. No se sobrescribirán.';
    }
  }

  buscar(): void {
    if (this.cargando) return;
    const texto = this.consulta.trim();
    if (texto.length < 3 || texto.length > 120) {
      this.error = 'Escribe entre 3 y 120 caracteres para buscar.';
      return;
    }
    this.error = '';
    this.cargando = true;
    this.consultado = true;
    this.ultimaConsulta = texto;
    this.resultados = [];
    this.servicio
      .buscar(texto)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.cargando = false;
          this.detector.markForCheck();
        }),
      )
      .subscribe({
        next: (libros) => {
          this.resultados = libros;
        },
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse && (error.status === 400 || error.status === 422)) {
            this.error =
              'Open Library rechazó la búsqueda. Usa al menos 3 caracteres y prueba con un título, autor o tema.';
          } else if (error instanceof HttpErrorResponse && error.status === 429) {
            this.error = 'Open Library recibió demasiadas consultas. Espera un momento y vuelve a intentarlo.';
          } else {
            this.error =
              'Open Library no respondió o no hay conexión. Intenta nuevamente. Tus guardados siguen disponibles.';
          }
        },
      });
  }

  get librosVisibles(): Libro[] {
    return this.vista === 'buscar' ? this.resultados : this.guardados;
  }
  estaGuardado(libro: Libro): boolean {
    return this.guardados.some((item) => item.id === libro.id);
  }
  abrir(libro: Libro): void {
    this.seleccionado = libro;
    this.modalAbierto = true;
  }

  async guardar(libro: Libro): Promise<void> {
    if (this.estaGuardado(libro) || this.errorLocal) return;
    try {
      const nuevos = [libro, ...this.guardados];
      this.servicio.guardar(nuevos);
      this.guardados = nuevos;
      await this.avisar('Referencia guardada para consultar sin conexión.');
    } catch {
      await this.avisar('No se pudo guardar. El almacenamiento puede estar lleno o bloqueado.', true);
    }
    this.detector.markForCheck();
  }

  async quitar(libro: Libro): Promise<void> {
    const confirmacion = await this.alert.create({
      header: 'Quitar material',
      cssClass: 'tl-action-alert',
      message: 'Se eliminará la referencia guardada en este dispositivo.',
      buttons: [
        { text: 'Cancelar', role: 'cancel', cssClass: 'tl-alert-neutral' },
        { text: 'Quitar', role: 'confirm', cssClass: 'tl-alert-danger' },
      ],
    });
    await confirmacion.present();
    if ((await confirmacion.onDidDismiss()).role !== 'confirm') return;
    try {
      const nuevos = this.guardados.filter((item) => item.id !== libro.id);
      this.servicio.guardar(nuevos);
      this.guardados = nuevos;
      this.modalAbierto = false;
      await this.avisar('Material quitado de guardados.');
    } catch {
      await this.avisar('No se pudo quitar el material.', true);
    }
    this.detector.markForCheck();
  }

  private async avisar(message: string, error = false): Promise<void> {
    const aviso = await this.toast.create({
      message,
      color: error ? 'danger' : 'success',
      duration: 2500,
      position: 'bottom',
    });
    await aviso.present();
  }
}
