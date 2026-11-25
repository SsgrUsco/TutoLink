import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { TutoriasService } from '../../nucleo/servicios/tutorias.service';
import { vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { AlertController, ToastController } from '@ionic/angular';
import { ApuntesPage } from './apuntes.page';
import { AuthService } from '../../nucleo/servicios/auth.service';
import { ApuntesService } from '../../nucleo/servicios/apuntes.service';
import { CamaraService } from '../../nucleo/servicios/camara.service';
import { Usuario } from '../../modelos/usuario.model';
import { Foto } from '../../modelos/foto.model';

describe('ApuntesPage', () => {
  let fixture: ComponentFixture<ApuntesPage>;
  let usuario$: BehaviorSubject<Usuario | null>;
  let cargar: ReturnType<typeof vi.fn>;
  const guardar = vi.fn();
  const consultar = vi.fn();
  const misReservas = vi.fn();
  const solicitar = vi.fn();
  const consultarPendiente = vi.fn();
  const descartar = vi.fn();
  const reintentar = vi.fn();
  const createAlert = vi.fn();
  const onDidDismiss = vi.fn();
  const usuario: Usuario = {
    id: '6',
    nombre: 'Estudiante',
    correo: 'estudiante@usco.edu.co',
    facultadId: 6,
    facultad: 'Ingeniería',
    rol: 'estudiante',
    creado_en: '',
  };
  const foto: Foto = {
    id: '12345678-abcd-abcd-abcd-123456789abc',
    titulo: 'Apunte',
    descripcion: '',
    favorita: false,
    formato: 'jpeg',
    creada: 1,
    ruta: 'foto.jpg',
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    consultarPendiente.mockReturnValue(null);
    solicitar.mockResolvedValue(false);
    createAlert.mockResolvedValue({ present: vi.fn(), onDidDismiss });
    usuario$ = new BehaviorSubject<Usuario | null>(null);
    cargar = vi.fn().mockResolvedValue([foto]);
    consultar.mockReturnValue(of([]));
    misReservas.mockReturnValue(of([]));
    guardar.mockImplementation(async (_uid: string, nueva: Foto) => {
      cargar.mockResolvedValue([nueva]);
    });
    await TestBed.configureTestingModule({
      imports: [ApuntesPage],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            usuario$,
            comprobando$: new BehaviorSubject(false),
            get usuarioActual() {
              return usuario$.value;
            },
          },
        },
        { provide: TutoriasService, useValue: { consultar, misReservas } },
        { provide: ApuntesService, useValue: { cargar, guardar, estado: () => 'Apuntes sincronizados.' } },
        { provide: AlertController, useValue: { create: createAlert } },
        { provide: ToastController, useValue: { create: vi.fn().mockResolvedValue({ present: vi.fn() }) } },
        {
          provide: CamaraService,
          useValue: {
            solicitarPermiso: solicitar,
            recuperada$: new Subject<void>(),
            reintentar,
            consultarPendiente,
            descartar,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ApuntesPage);
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it.each(['estudiante', 'tutor'] as const)('filtra los apuntes por sesión y favoritos para %s', async (rol) => {
    usuario$.next({ ...usuario, rol });
    await vi.waitFor(() => expect(fixture.componentInstance.fotos).toEqual([foto]));
    const pagina = fixture.componentInstance;
    const asignada: Foto = {
      ...foto,
      id: 'otro',
      favorita: true,
      tutoria: { id: 1, materia: 'Álgebra', inicio: '2026-11-23T15:00:00.000Z' },
    };
    pagina.fotos = [foto, asignada];
    pagina.filtroTutoria = 1;
    expect(pagina.fotosFiltradas).toEqual([asignada]);
    pagina.filtroTutoria = 'sin';
    expect(pagina.fotosFiltradas).toEqual([foto]);
    pagina.soloFavoritas = true;
    expect(pagina.fotosFiltradas).toEqual([]);
    pagina.filtroTutoria = 'todas';
    expect(pagina.fotosFiltradas).toEqual([asignada]);
    expect(pagina.opcionesTutorias).toEqual([asignada.tutoria]);
  });

  it('permite al tutor cargar sus sesiones, asignar y quitar la tutoría de un apunte', async () => {
    const tutoria = { id: 7, materia: 'Álgebra', inicio: '2026-11-27T15:00:00.000Z' };
    consultar.mockReturnValue(of([tutoria]));
    usuario$.next({ ...usuario, rol: 'tutor' });
    const pagina = fixture.componentInstance;
    await vi.waitFor(() => {
      expect(pagina.cargando).toBe(false);
      expect(pagina.tutorias).toEqual([tutoria]);
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ion-select[label="Organizar por tutoría"]')).not.toBeNull();
    pagina.abrirFoto(foto);
    pagina.tutoriaEditada = tutoria.id;
    await pagina.guardarCambios();
    expect(guardar).toHaveBeenLastCalledWith(usuario.id, { ...foto, tutoria });
    await vi.waitFor(() => expect(pagina.cargando).toBe(false));
    pagina.abrirFoto({ ...foto, tutoria });
    pagina.tutoriaEditada = null;
    await pagina.guardarCambios();
    expect(guardar).toHaveBeenLastCalledWith(usuario.id, foto);
  });

  it('ofrece solo reservas confirmadas y bloquea una asignación sin reserva', async () => {
    const t1 = { id: 1, materia: 'Álgebra', inicio: '2026-11-27T15:00:00.000Z' };
    const t2 = { ...t1, id: 2 };
    consultar.mockReturnValue(of([t1, t2, { ...t1, id: 3 }]));
    misReservas.mockReturnValue(
      of([
        { tutoriaId: 1, estado: 'confirmada' },
        { tutoriaId: 2, estado: 'cancelada' },
      ]),
    );
    usuario$.next(usuario);
    const pagina = fixture.componentInstance;
    await vi.waitFor(() => expect(pagina.tutorias).toEqual([t1]));
    pagina.abrirFoto(foto);
    pagina.tutoriaEditada = 2;
    await pagina.guardarCambios();
    expect(guardar).not.toHaveBeenCalled();
    pagina.tutoriaEditada = 1;
    await pagina.guardarCambios();
    expect(guardar).toHaveBeenLastCalledWith(usuario.id, { ...foto, tutoria: t1 });
    await vi.waitFor(() => expect(pagina.cargando).toBe(false));
    pagina.abrirFoto({ ...foto, tutoria: t2 });
    pagina.descripcionEditada = 'Anterior';
    await pagina.guardarCambios();
    expect(guardar).toHaveBeenLastCalledWith(usuario.id, { ...foto, descripcion: 'Anterior', tutoria: t2 });
  });

  it('muestra el aviso de sesión sin cargar fotos privadas', () => {
    expect(fixture.componentInstance.bloqueado).toBe(true);
    expect(cargar).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Inicia sesión para guardar');
  });

  it('limpia las fotos y el modal al cerrar sesión', async () => {
    usuario$.next(usuario);
    await vi.waitFor(() => expect(fixture.componentInstance.fotos).toEqual([foto]));
    fixture.componentInstance.abrirFoto(foto);
    usuario$.next(null);
    expect(fixture.componentInstance.fotos).toEqual([]);
    expect(fixture.componentInstance.modalAbierto).toBe(false);
    expect(fixture.componentInstance.fotoSeleccionada).toBeNull();
  });

  it('ignora las fotos que terminan de cargarse después de cerrar sesión', async () => {
    let resolver!: (fotos: Foto[]) => void;
    cargar.mockReturnValue(
      new Promise<Foto[]>((resolve) => {
        resolver = resolve;
      }),
    );
    usuario$.next(usuario);
    usuario$.next(null);
    resolver([foto]);
    await fixture.whenStable();
    expect(fixture.componentInstance.fotos).toEqual([]);
    expect(fixture.componentInstance.usuarioId).toBeNull();
  });
  it('Volver conserva la captura y no solicita abrir la cámara', async () => {
    usuario$.next(usuario);
    await vi.waitFor(() => expect(fixture.componentInstance.cargando).toBe(false));
    consultarPendiente.mockReturnValue({ id: 'pendiente', tieneFoto: false });
    onDidDismiss.mockResolvedValue({ role: 'cancel' });
    await fixture.componentInstance.tomarFotografia();
    expect(descartar).not.toHaveBeenCalled();
    expect(solicitar).not.toHaveBeenCalled();
    expect(fixture.componentInstance.guardando).toBe(false);
  });

  it('descarta la operación confirmada antes de pedir permiso para otra foto', async () => {
    usuario$.next(usuario);
    await vi.waitFor(() => expect(fixture.componentInstance.cargando).toBe(false));
    consultarPendiente.mockReturnValue({ id: 'pendiente', tieneFoto: false });
    onDidDismiss.mockResolvedValue({ role: 'discard' });
    descartar.mockResolvedValue(true);
    await fixture.componentInstance.tomarFotografia();
    expect(descartar).toHaveBeenCalledWith('pendiente');
    expect(solicitar).toHaveBeenCalledOnce();
  });

  it('reintenta guardar sin abrir una segunda captura', async () => {
    usuario$.next(usuario);
    await vi.waitFor(() => expect(fixture.componentInstance.cargando).toBe(false));
    consultarPendiente.mockReturnValue({ id: 'pendiente', tieneFoto: true });
    onDidDismiss.mockResolvedValue({ role: 'retry' });
    reintentar.mockImplementation(async () => {
      consultarPendiente.mockReturnValue(null);
    });
    await fixture.componentInstance.tomarFotografia();
    expect(reintentar).toHaveBeenCalledOnce();
    expect(solicitar).not.toHaveBeenCalled();
    expect(descartar).not.toHaveBeenCalled();
  });
});
