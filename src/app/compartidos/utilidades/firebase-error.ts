import { HttpErrorResponse } from '@angular/common/http';

export function mensajeFirebase(
  error: unknown,
  alternativa = 'No se pudo completar la operación. Revisa tu conexión e intenta nuevamente.',
): string {
  if (error instanceof HttpErrorResponse && typeof error.error?.mensaje === 'string') return error.error.mensaje;
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const mensajes: Record<string, string> = {
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/invalid-login-credentials': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/user-not-found': 'Correo o contraseña incorrectos.',
    'auth/email-already-in-use': 'Este correo ya tiene una cuenta. Inicia sesión.',
    'auth/network-request-failed': 'No se pudo conectar con TutoLink. Revisa tu conexión a internet.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento e intenta de nuevo.',
    'auth/weak-password': 'La contraseña no cumple los requisitos de seguridad.',
    'auth/operation-not-allowed': 'El inicio de sesión no está disponible en este momento. Intenta más tarde.',
    'auth/user-disabled': 'Esta cuenta está deshabilitada.',
    'permission-denied': 'No tienes permiso para completar esta operación.',
    unavailable: 'No se pudo conectar. Revisa tu conexión a internet.',
  };
  return mensajes[code] ?? alternativa;
}
