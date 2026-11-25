import { authGuard, accesoGuard } from './nucleo/proteccion/auth.guard';
import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'acceso',
    canActivate: [accesoGuard],
    loadComponent: () => import('./paginas/acceso/acceso.page').then((m) => m.AccesoPage),
  },
  {
    path: 'tutolink',
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    loadComponent: () => import('./navegacion/pestanas/tabs.page').then((m) => m.TabsPage),
    children: [
      {
        path: 'tutorias',
        loadComponent: () => import('./paginas/tutorias/tutorias.page').then((m) => m.TutoriasPage),
      },
      {
        path: 'materiales',
        loadComponent: () => import('./paginas/materiales/materiales.page').then((m) => m.MaterialesPage),
      },
      { path: 'apuntes', loadComponent: () => import('./paginas/apuntes/apuntes.page').then((m) => m.ApuntesPage) },
      { path: 'perfil', loadComponent: () => import('./paginas/perfil/perfil.page').then((m) => m.PerfilPage) },
      { path: '', redirectTo: 'tutorias', pathMatch: 'full' },
    ],
  },
  { path: 'home', redirectTo: 'tutolink/apuntes', pathMatch: 'full' },
  { path: '', redirectTo: 'acceso', pathMatch: 'full' },
  { path: '**', redirectTo: 'acceso' },
];
