import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  collection,
  doc,
  getDocsFromServer,
  getDocFromServer,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { defer, firstValueFrom, Observable, timeout } from 'rxjs';
import { NuevaTutoria, Reserva, Tutoria } from '../../modelos/tutoria.model';
import { AuthService } from './auth.service';
import { FirebaseService } from './firebase.service';

@Injectable({ providedIn: 'root' })
export class TutoriasService {
  private firebase = inject(FirebaseService);
  private auth = inject(AuthService);

  async crear(id: number, datos: NuevaTutoria): Promise<void> {
    const uid = this.uid();
    const usuario = this.auth.usuarioActual!;
    if (usuario.rol !== 'tutor') throw this.error('Solo los tutores pueden publicar tutorías.');
    const materia = datos.materia.trim();
    const lugar = datos.lugar.trim();
    // Los controles usan hora de Colombia, independientemente de la zona del dispositivo.
    const patron = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
    if (!patron.test(datos.inicio) || !patron.test(datos.fin)) throw this.error('Completa las fechas y horas.');
    const inicio = new Date(`${datos.inicio}:00-05:00`);
    const fin = new Date(`${datos.fin}:00-05:00`);
    const minutos = (fin.getTime() - inicio.getTime()) / 60000;
    if (!materia || materia.length > 100 || !lugar || lugar.length > 150)
      throw this.error('Completa la materia (hasta 100 caracteres) y el lugar (hasta 150).');
    if (
      !Number.isFinite(inicio.getTime()) ||
      inicio.getTime() <= Date.now() ||
      !Number.isInteger(minutos) ||
      minutos < 1 ||
      minutos > 1440
    )
      throw this.error('El inicio debe ser futuro y el fin posterior, con una duración máxima de 24 horas.');
    if (!Number.isInteger(datos.cupos) || datos.cupos < 1 || datos.cupos > 10)
      throw this.error('Indica entre 1 y 10 cupos enteros.');
    if (!usuario.facultadId || !usuario.facultad || !Number.isSafeInteger(id) || id <= 0)
      throw this.error('No se pudo identificar la facultad o la tutoría.');
    const referencia = doc(this.firebase.db, 'tutorias', String(id));
    await runTransaction(this.firebase.db, async (transaction) => {
      const existente = await transaction.get(referencia);
      // Mantener el ID del formulario permite reintentar sin publicar duplicados.
      if (existente.exists()) {
        if (existente.data()['tutorUid'] === uid) return;
        throw this.error('No se pudo asignar el identificador. Cierra y vuelve a abrir el formulario.');
      }
      transaction.set(referencia, {
        materia,
        lugar,
        tutor: usuario.nombre,
        tutorUid: uid,
        facultadId: usuario.facultadId,
        facultad: usuario.facultad,
        inicio: Timestamp.fromDate(inicio),
        fin: Timestamp.fromDate(fin),
        cupos: datos.cupos,
        cuposDisponibles: datos.cupos,
        estado: 'programada',
        bloques: Array.from({ length: minutos }, (_, indice) => String(inicio.getTime() / 60000 + indice)),
        creado_en: serverTimestamp(),
      });
    });
  }

  async cancelarTutoria(id: number): Promise<void> {
    const uid = this.uid();
    if (this.auth.usuarioActual?.rol !== 'tutor') throw this.error('Solo el tutor puede cancelar su tutoría.');
    const referencia = doc(this.firebase.db, 'tutorias', String(id));
    await runTransaction(this.firebase.db, async (tx) => {
      const documento = await tx.get(referencia);
      const t = documento.data();
      if (!t || t['tutorUid'] !== uid) throw this.error('No puedes cancelar esta tutoría.');
      if (t['estado'] === 'cancelada') return;
      if (t['estado'] !== 'programada' || (t['inicio'] as Timestamp).toMillis() <= Date.now())
        throw this.error('Solo puedes cancelar tutorías programadas que aún no han comenzado.');
      tx.update(referencia, { estado: 'cancelada' });
    });
  }

  consultar(): Observable<Tutoria[]> {
    return defer(async () => {
      const usuario = this.auth.usuarioActual;
      if (!usuario) throw this.error('Inicia sesión nuevamente.');
      const catalogo = collection(this.firebase.db, 'tutorias');
      const facultad = where('facultadId', '==', usuario.facultadId);
      const consulta =
        usuario.rol === 'tutor'
          ? query(catalogo, facultad, where('tutorUid', '==', usuario.id))
          : query(catalogo, facultad);
      const resultado = await getDocsFromServer(consulta);
      return resultado.docs
        .map((documento) => {
          const t = documento.data();
          const fin = (t['fin'] as Timestamp).toDate();
          return {
            id: Number(documento.id),
            materia: String(t['materia']),
            tutor: String(t['tutor']),
            tutorUid: typeof t['tutorUid'] === 'string' ? t['tutorUid'] : undefined,
            facultadId: Number(t['facultadId']),
            facultad: String(t['facultad']),
            inicio: (t['inicio'] as Timestamp).toDate().toISOString(),
            fin: fin.toISOString(),
            lugar: String(t['lugar']),
            cuposDisponibles: Number(t['cuposDisponibles']),
            estado: t['estado'] === 'programada' && fin.getTime() <= Date.now() ? 'finalizada' : t['estado'],
          } as Tutoria;
        })
        .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id - b.id);
    }).pipe(timeout(15000));
  }

  misReservas(): Observable<Reserva[]> {
    return defer(async () => {
      const uid = this.uid();
      const resultado = await getDocsFromServer(collection(this.firebase.db, 'usuarios', uid, 'reservas'));
      const reservas = resultado.docs.map((r) => ({ tutoriaId: Number(r.id), estado: r.data()['estado'] }) as Reserva);
      for (const reserva of reservas.filter((r) => r.estado === 'confirmada')) {
        const tutoria = await getDocFromServer(doc(this.firebase.db, 'tutorias', String(reserva.tutoriaId)));
        if (tutoria.data()?.['estado'] === 'cancelada') {
          await firstValueFrom(this.cambiarReserva(reserva.tutoriaId, true));
          reserva.estado = 'cancelada';
        }
      }
      return reservas;
    }).pipe(timeout(15000));
  }

  cambiarReserva(id: number, cancelar: boolean): Observable<{ mensaje: string }> {
    return defer(async () => {
      if (this.auth.usuarioActual?.rol !== 'estudiante') throw this.error('Las reservas son para estudiantes.');
      const uid = this.uid();
      if (!cancelar) await firstValueFrom(this.misReservas());
      const db = this.firebase.db;
      await runTransaction(db, async (transaction) => {
        const tutoriaRef = doc(db, 'tutorias', String(id));
        const reservaRef = doc(db, 'usuarios', uid, 'reservas', String(id));
        const agendaRef = doc(db, 'agendas', uid);
        const [tutoria, reserva, agenda, perfil] = await Promise.all([
          transaction.get(tutoriaRef),
          transaction.get(reservaRef),
          transaction.get(agendaRef),
          transaction.get(doc(db, 'usuarios', uid)),
        ]);
        if (!tutoria.exists() || !perfil.exists()) throw this.error('No se encontró la tutoría o el perfil.');
        const t = tutoria.data();
        const canceladaPorTutor = cancelar && t['estado'] === 'cancelada';
        if (!canceladaPorTutor && (t['estado'] !== 'programada' || (t['inicio'] as Timestamp).toMillis() <= Date.now()))
          throw this.error('Esta tutoría ya comenzó o no está disponible.');
        if (t['facultadId'] !== perfil.data()['facultadId'])
          throw this.error('Solo puedes reservar tutorías de tu facultad.');
        const estado = reserva.data()?.['estado'];
        if (canceladaPorTutor && estado === 'cancelada') return;
        const bloques = t['bloques'] as string[];
        const ocupados = (agenda.data()?.['bloques'] ?? []) as string[];
        if (cancelar) {
          if (estado !== 'confirmada') throw this.error('No tienes una reserva activa en esta tutoría.');
        } else {
          if (estado && estado !== 'cancelada') throw this.error('Ya reservaste esta tutoría.');
          if (Number(t['cuposDisponibles']) <= 0) throw this.error('Ya no quedan cupos disponibles.');
          if (bloques.some((b) => ocupados.includes(b)))
            throw this.error('Ya tienes una reserva que coincide con este horario.');
        }
        transaction.set(reservaRef, {
          tutoriaId: id,
          estado: cancelar ? 'cancelada' : 'confirmada',
          actualizada: serverTimestamp(),
        });
        transaction.set(agendaRef, {
          bloques: cancelar ? ocupados.filter((b) => !bloques.includes(b)) : [...ocupados, ...bloques],
          ultimaTutoriaId: id,
        });
        transaction.update(tutoriaRef, {
          cuposDisponibles: Number(t['cuposDisponibles']) + (cancelar ? 1 : -1),
          ultimaReservaUid: uid,
        });
      });
      return {
        mensaje: cancelar ? 'Reserva cancelada. El cupo vuelve a estar disponible.' : 'Tu cupo quedó reservado.',
      };
    }).pipe(timeout(20000));
  }

  private uid(): string {
    const usuario = this.auth.usuarioActual;
    if (!usuario || this.firebase.auth.currentUser?.uid !== usuario.id) throw this.error('Inicia sesión nuevamente.');
    return usuario.id;
  }
  private error(mensaje: string): HttpErrorResponse {
    return new HttpErrorResponse({ status: 409, error: { mensaje } });
  }
}
