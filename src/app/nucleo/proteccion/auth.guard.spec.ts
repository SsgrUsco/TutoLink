import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../servicios/auth.service';
import { CamaraService } from '../servicios/camara.service';
import { accesoGuard } from './auth.guard';

describe('Acceso durante la restauración de sesión', () => {
  it('espera el perfil y regresa a Apuntes sin mostrar el acceso', async () => {
    const comprobando$ = new BehaviorSubject(true);
    const auth = { comprobando$, usuarioActual: null as { id: string } | null };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: CamaraService, useValue: { recuperandoCaptura: true } },
      ],
    });
    let terminado = false;
    const resultado = Promise.resolve(
      TestBed.runInInjectionContext(() => accesoGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)),
    );
    void resultado.then(() => (terminado = true));
    await Promise.resolve();
    expect(terminado).toBe(false);
    auth.usuarioActual = { id: '6' };
    comprobando$.next(false);
    expect(TestBed.inject(Router).serializeUrl((await resultado) as import('@angular/router').UrlTree)).toBe(
      '/tutolink/apuntes',
    );
  });
  it('permite iniciar sesión cuando no hay una cuenta restaurada', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { comprobando$: new BehaviorSubject(false), usuarioActual: null } },
        { provide: CamaraService, useValue: { recuperandoCaptura: false } },
      ],
    });
    expect(
      await TestBed.runInInjectionContext(() => accesoGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)),
    ).toBe(true);
  });
});
