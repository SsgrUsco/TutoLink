import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, firstValueFrom, take } from 'rxjs';
import { CamaraService } from '../servicios/camara.service';
import { AuthService } from '../servicios/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await firstValueFrom(
    auth.comprobando$.pipe(
      filter((comprobando) => !comprobando),
      take(1),
    ),
  );
  return auth.usuarioActual ? true : router.createUrlTree(['/acceso']);
};

export const accesoGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const camara = inject(CamaraService);
  await firstValueFrom(
    auth.comprobando$.pipe(
      filter((comprobando) => !comprobando),
      take(1),
    ),
  );
  if (!auth.usuarioActual) return true;
  return router.createUrlTree([camara.recuperandoCaptura ? '/tutolink/apuntes' : '/tutolink']);
};
