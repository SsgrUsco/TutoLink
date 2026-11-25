import { BrandComponent } from '../../compartidos/componentes/marca/brand.component';
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
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
  IonButton,
} from '@ionic/angular';
import { AuthService } from '../../nucleo/servicios/auth.service';
@Component({
  selector: 'app-perfil',
  templateUrl: './perfil.page.html',
  imports: [
    BrandComponent,
    CommonModule,
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
    IonButton,
  ],
})
export class PerfilPage {
  readonly auth = inject(AuthService);
}
