import { Injectable, inject } from '@angular/core';
import { collection, getDocsFromServer } from 'firebase/firestore';
import { defer } from 'rxjs';
import { FirebaseService } from './firebase.service';
import { Facultad } from '../../modelos/facultad.model';

@Injectable({ providedIn: 'root' })
export class FacultadesService {
  private firebase = inject(FirebaseService);
  consultar() {
    return defer(async (): Promise<Facultad[]> => {
      const datos = await getDocsFromServer(collection(this.firebase.db, 'facultades'));
      return datos.docs
        .map((doc) => ({ id: Number(doc.id), nombre: String(doc.data()['nombre']) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    });
  }
}
