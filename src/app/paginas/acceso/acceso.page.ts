import { eyeOutline, eyeOffOutline } from 'ionicons/icons';
import { BrandComponent } from '../../compartidos/componentes/marca/brand.component';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { mensajeFirebase } from '../../compartidos/utilidades/firebase-error';
import { AuthService } from '../../nucleo/servicios/auth.service';
import { Usuario } from '../../modelos/usuario.model';
import { Facultad } from '../../modelos/facultad.model';
import { FacultadesService } from '../../nucleo/servicios/facultades.service';
import { firstValueFrom } from 'rxjs';
import { IonSelect, IonSelectOption } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonHeader,
  IonToolbar,
  IonContent,
  IonGrid,
  IonRow,
  IonCol,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonInput,
  IonIcon,
  IonButton,
  IonCheckbox,
  ToastController,
} from '@ionic/angular';

@Component({
  selector: 'app-acceso',
  templateUrl: './acceso.page.html',
  styles: ['.password-toggle { margin: 0; --padding-start: 10px; --padding-end: 10px; --box-shadow: none; }'],
  imports: [
    BrandComponent,
    IonSelect,
    IonSelectOption,
    CommonModule,
    FormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonContent,
    IonGrid,
    IonRow,
    IonCol,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonInput,
    IonIcon,
    IonButton,
    IonCheckbox,
  ],
})
export class AccesoPage {
  readonly eyeOutline = eyeOutline;
  readonly eyeOffOutline = eyeOffOutline;
  facultades: Facultad[] = [];
  cargandoFacultades = false;
  errorFacultades = '';
  private facultadesService = inject(FacultadesService);
  readonly auth = inject(AuthService);
  private router = inject(Router);
  private detector = inject(ChangeDetectorRef);
  enviando = false;
  registro = false;
  verContrasena = false;
  datos = {
    rol: 'estudiante' as Usuario['rol'],
    nombre: '',
    correo: '',
    facultadId: null as number | null,
    contrasena: '',
    confirmarContrasena: '',
    recordarme: false,
  };
  private toast = inject(ToastController);

  cambiarModo(): void {
    if (this.enviando) return;
    this.registro = !this.registro;
    if (this.registro) this.limpiarDatos();
    if (this.registro && !this.facultades.length) void this.cargarFacultades();
    this.verContrasena = false;
    this.datos.contrasena = '';
    this.datos.confirmarContrasena = '';
  }

  async enviar(): Promise<void> {
    if (this.enviando) return;
    let mensaje = '';
    if (!/^[a-z0-9._%+-]+@usco\.edu\.co$/i.test(this.datos.correo.trim()))
      mensaje = 'Escribe tu correo institucional @usco.edu.co.';
    else if (this.datos.contrasena.length < 8) mensaje = 'La contraseña debe tener al menos 8 caracteres.';
    else if (this.registro) {
      if (this.datos.nombre.trim().length < 3) mensaje = 'Completa tu nombre.';
      else if (!this.facultades.some((facultad) => facultad.id === this.datos.facultadId))
        mensaje = 'Selecciona una facultad de la lista.';
      else if (
        !/[A-Z]/.test(this.datos.contrasena) ||
        !/[a-z]/.test(this.datos.contrasena) ||
        !/\d/.test(this.datos.contrasena)
      )
        mensaje = 'Incluye mayúscula, minúscula y número en tu contraseña.';
      else if (this.datos.contrasena !== this.datos.confirmarContrasena) mensaje = 'Las contraseñas no coinciden.';
    }
    if (mensaje) {
      await this.avisar(mensaje, true);
      return;
    }
    this.enviando = true;
    try {
      if (this.registro) {
        const respuesta = await this.auth.registrar({
          rol: this.datos.rol,
          nombre: this.datos.nombre,
          correo: this.datos.correo,
          facultadId: this.datos.facultadId!,
          contrasena: this.datos.contrasena,
          confirmarContrasena: this.datos.confirmarContrasena,
        });
        this.registro = false;
        // Conserva el correo solo para iniciar sesión con la cuenta recién creada.
        this.limpiarDatos(this.datos.correo);
        await this.avisar(respuesta.mensaje);
      } else {
        await this.auth.ingresar(this.datos.correo, this.datos.contrasena, this.datos.recordarme);
        this.datos.contrasena = '';
        await this.router.navigateByUrl('/tutolink');
      }
    } catch (error) {
      const mensajeError = mensajeFirebase(error);
      await this.avisar(mensajeError, true);
    } finally {
      this.enviando = false;
      this.detector.markForCheck();
    }
  }

  async cargarFacultades(): Promise<void> {
    if (this.cargandoFacultades) return;
    this.cargandoFacultades = true;
    this.errorFacultades = '';
    try {
      this.facultades = await firstValueFrom(this.facultadesService.consultar());
      if (!this.facultades.length) this.errorFacultades = 'No hay facultades disponibles para el registro.';
    } catch {
      this.errorFacultades =
        'No se pudieron cargar las facultades. Revisa tu conexión a internet e intenta nuevamente.';
    } finally {
      this.cargandoFacultades = false;
      this.detector.markForCheck();
    }
  }

  private limpiarDatos(correo = ''): void {
    this.datos = {
      rol: 'estudiante',
      nombre: '',
      correo,
      facultadId: null,
      contrasena: '',
      confirmarContrasena: '',
      recordarme: false,
    };
    this.verContrasena = false;
  }

  private async avisar(message: string, error = false): Promise<void> {
    const aviso = await this.toast.create({
      message,
      color: error ? 'danger' : 'success',
      duration: 3500,
      position: 'bottom',
    });
    await aviso.present();
  }
}
