# TutoLink con Firebase

Proyecto: tutolink-ca331. La app usa Firebase Authentication (correo/contraseña) y Cloud Firestore. No necesita iniciar Express, PostgreSQL ni adb reverse para acceder por internet.

## Datos

- facultades: catálogo institucional, administrado desde Firebase.
- usuarios/{uid}: perfil privado, facultad y rol `estudiante` o `tutor`.
- tutorias/{id}: catálogo, fechas Timestamp, cupos y bloques de horario.
- usuarios/{uid}/reservas/{id}: reservas de cada estudiante.
- agendas/{uid}: bloques ocupados para impedir cruces de horario.

Los cambios de reserva actualizan reserva, agenda y cupos en una sola transacción. Las reglas comprueban facultad, fecha, cupos y que los tres documentos se actualicen juntos. Los estudiantes no pueden editar el catálogo ni cambiar su facultad o rol desde el cliente.

Los bloques del catálogo representan minutos UTC entre inicio (incluido) y fin (excluido). Al publicar o cambiar una tutoría desde una herramienta administrativa, hay que mantener los bloques coherentes con sus fechas. No cambiar el horario de sesiones con reservas sin reconciliar agendas.

## Rol tutor

El registro permite elegir `estudiante` o `tutor`, según la decisión del usuario para esta aplicación. No hay aprobación administrativa del tutor. El rol se guarda en `usuarios/{uid}` y se lee al iniciar sesión; no se puede cambiar después desde la app. Para convertir una cuenta existente, el responsable puede cambiar su campo `rol` en Firestore y la persona debe cerrar sesión y volver a ingresar.

En Tutorías, el tutor verá «Crear tutoría» y únicamente sus propias sesiones en «Mis tutorías», sin opción para ver las de otros tutores. La consulta filtra por `tutorUid` y facultad; los estudiantes conservan el catálogo de su facultad. Define materia, inicio y fin en hora de Colombia (UTC−5), lugar o enlace y cupos. Nombre, UID y facultad proceden del perfil; estado inicial `programada` y cupos disponibles iguales al total. Las sesiones aparecen en el catálogo de los estudiantes de esa facultad al abrirlo o pulsar Actualizar. El tutor no reserva cupos. Esta entrega no incluye edición ni borrado de sesiones publicadas.

Los límites técnicos del formulario son 100 caracteres para materia, 150 para lugar, 1–10 cupos y hasta 24 horas por sesión, para limitar el tamaño de los bloques de minutos. No son requisitos académicos de las guías. El formulario genera esos bloques; las reglas permiten publicar únicamente a cuentas con rol tutor y validan autor, facultad, fechas, cupos y campos. La coherencia de cada bloque generado depende del cliente del tutor; las reglas no recorren cada minuto de la lista. No se debe interpretar esta validación como una certificación académica del tutor.

Después de cambiar las reglas, publicarlas con `npx firebase deploy --only firestore:rules --project tutolink-ca331`. No es necesario publicar índices nuevos. Compilar la web y sincronizar Android para que el APK incluya el formulario. Cambiar solo el rol en Firebase no actualiza un APK antiguo.

## Migración

Se importaron 2 cuentas, 7 facultades, 15 tutorías y 3 reservas desde PostgreSQL, conservando UID iguales al ID anterior para reutilizar las carpetas de apuntes. Las contraseñas se importaron con BCRYPT. El acceso desde el celular fue confirmado por el usuario.

La arquitectura anterior y los archivos privados de migración se retiraron del proyecto. Se conserva un respaldo local en Documents/Codex con nombre TutoLink-legacy-2026-11-17. Ese respaldo contiene datos privados; no compartirlo ni incluirlo en el APK.

Los apuntes se sincronizan en usuarios/{uid}/apuntes/{id}, con una copia local por cuenta. Cada foto se comprime a JPEG (hasta 1600 píxeles y 600.000 caracteres Base64); el documento queda por debajo de 1 MiB. El campo imagen no se indexa. No se utiliza Cloud Storage ni se requiere Blaze dentro de las cuotas gratuitas de Firestore.

Al abrir Apuntes o pulsar Sincronizar se suben las fotos locales existentes y los cambios pendientes, y se descargan los apuntes de la cuenta. Sin conexión se puede trabajar con la copia local. Las eliminaciones dejan una marca remota sin imagen para evitar que un dispositivo desconectado la resucite. Ante ediciones simultáneas del mismo apunte, prevalece la última escritura recibida; una eliminación prevalece sobre las ediciones. Los cambios pendientes se conservan entre reinicios. Las fotos originales del dispositivo no se borran. Los materiales de Open Library siguen en almacenamiento local.

## Apuntes organizados por tutoría

Estudiantes y tutores pueden organizar sus apuntes por tutoría. El estudiante puede abrir un apunte, elegir una sesión de su facultad con reserva confirmada en «Tutoría del apunte» y pulsar «Guardar cambios». En la galería, «Organizar por tutoría» permite ver todas, una sesión concreta o las fotos sin asignar, junto con búsqueda y favoritos. Puede quitar la asignación eligiendo «Sin tutoría». Las nuevas asignaciones requieren reserva confirmada. Las asignaciones existentes se conservan si se cancela la reserva; se permite editar el apunte sin cambiar esa asociación o quitarla. El tutor puede elegir entre sus propias sesiones publicadas y usar los mismos filtros, cambiar la asignación o dejar el apunte sin tutoría; sus apuntes también son privados.

La asociación opcional `tutoria` guarda ID, materia y fecha/hora de inicio. Se conserva en el archivo local y en Firestore, junto con el apunte privado; no da acceso al tutor ni a otros estudiantes. Los apuntes anteriores siguen funcionando sin ese campo. Si no se carga el catálogo, permanecen disponibles las asignaciones de las fotos locales; los cambios se sincronizan al recuperar la conexión. Las reglas comprueban la facultad y exigen reserva confirmada para nuevas asignaciones del estudiante, o autoría de la sesión para el tutor. Una asociación existente puede conservarse sin cambios.

## Desarrollo y Android

Cada pantalla está organizada en `src/app/paginas/<pantalla>/<pantalla>.page.html` y su `.page.ts`, con un `.page.scss` cuando tiene estilos propios. Materiales y Tutorías ya incluyen su contenido completo en esos archivos; el formulario de creación está dentro de Tutorías. Los servicios de datos permanecen en `nucleo/servicios` y la marca institucional sigue siendo un componente compartido.

Desde la raíz: ionic serve. Para actualizar Android: ionic build y npx cap sync android, luego Run en Android Studio. No compilar firebase-emulator para instalar en el celular: es una configuración exclusiva de pruebas.

## Reglas y pruebas

Publicar reglas: npx firebase deploy --only firestore --project tutolink-ca331

Pruebas de reglas: npx firebase emulators:exec --only firestore --project demo-tutolink "node firebase/rules.test.cjs"

Prueba de interfaz: npx ng build --configuration firebase-emulator, después npx firebase emulators:exec --only auth,firestore --project demo-tutolink "node firebase/ui.test.cjs"

Prueba del nuevo rol: tras compilar `firebase-emulator`, ejecutar `npx firebase emulators:exec --only auth,firestore --project demo-tutolink "node firebase/tutor-ui.test.cjs"`. Registra ambos roles, publica una tutoría desde el formulario, comprueba el catálogo del estudiante, reserva y verifica la reducción de cupos desde la cuenta del tutor. Usa solamente datos de prueba en emuladores.

Los emuladores requieren Java. Usar JDK 25 instalado en este equipo. Los datos de prueba se crean exclusivamente en demo-tutolink.

## Verificación realizada

Reglas aprobadas en emulador, incluido último cupo concurrente y cruces de horario. Flujo de interfaz aprobado en emuladores: registro, login, recordar sesión, facultad, reserva/cancelación, perfil, acceso protegido y fotos entre dos sesiones independientes, incluida visualización, edición offline, favoritos y borrado sincronizado. Las reglas impiden leer fotos de otra cuenta, subir imágenes fuera del límite y restaurar documentos eliminados. La aplicación consulta el catálogo de Firebase sin peticiones al backend local. Compilación de producción y sincronización Android completadas. El usuario confirmó que la versión Firebase funciona en el dispositivo físico sin cable.

## Limpieza posterior

Se retiraron el servidor Express, sus dependencias y migraciones, la configuración de compilación wifi, la excepción HTTP de Android y la antigua prueba basada en tokens del backend. Las pruebas actuales de integración están en firebase/ui.test.cjs y firebase/rules.test.cjs. La compilación normal usa Firebase por internet; los puertos locales de firebase.json pertenecen exclusivamente a los emuladores de pruebas.

## Servicios y utilidades

Los ocho servicios están en `src/app/nucleo/servicios`: autenticación, Firebase, facultades, tutorías, materiales, apuntes, almacenamiento local de apuntes y cámara. `CamaraService` reúne permisos, apertura de cámara/galería y recuperación de capturas. `comprimirFoto` es un método privado de `ApuntesService`, junto con el límite de tamaño de las imágenes, porque solo lo utiliza la sincronización de apuntes. Las pruebas de cámara se separan por permisos y recuperación, pero comprueban el mismo servicio.
