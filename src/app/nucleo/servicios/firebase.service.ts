import { environment } from '../../../environments/environment';
import { Injectable } from '@angular/core';
import { getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { firebaseConfig } from '../../../environments/firebase.config';

@Injectable({ providedIn: 'root' })
export class FirebaseService {
  private readonly app =
    getApps().find((app) => app.name === 'tutolink') ??
    initializeApp(
      environment.firebaseEmulators
        ? { apiKey: 'demo-key', projectId: 'demo-tutolink', authDomain: 'demo-tutolink.firebaseapp.com' }
        : firebaseConfig,
      'tutolink',
    );

  readonly auth = getAuth(this.app);
  readonly db = getFirestore(this.app);

  constructor() {
    if (environment.firebaseEmulators) {
      connectAuthEmulator(this.auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(this.db, '127.0.0.1', 8080);
    }
  }
}
