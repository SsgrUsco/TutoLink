# Cámara y permisos en Android

La declaración está en `android/app/src/main/AndroidManifest.xml`: `android.permission.CAMERA`. El hardware se declara opcional para permitir usar la galería en dispositivos sin cámara.

`CamaraService` comprueba el estado con `Camera.checkPermissions()` cuando el estudiante toca Tomar foto. Solicita únicamente `camera` con `Camera.requestPermissions()` si procede. Un permiso concedido permite continuar; una denegación impide llamar a `getPhoto`. Si Android requiere una explicación previa, se ofrece Continuar o Ahora no. Si el permiso está bloqueado, se indican los pasos para habilitarlo en Ajustes. Cada nueva captura vuelve a comprobarlo.

La galería usa el selector del sistema, que concede acceso a la imagen elegida. Los apuntes se guardan en `Directory.Data`, el almacenamiento privado de la app. No se solicitan permisos generales de lectura/escritura de almacenamiento ni de micrófono. `saveToGallery` está desactivado.

## Comprobación en el celular

1. Instalar la versión actualizada desde Android Studio y abrir una cuenta.
2. Si la cámara ya está autorizada, quitar ese permiso en Ajustes del teléfono, sin borrar los datos de la app.
3. Entrar en Apuntes y tocar Tomar foto: debe aparecer la solicitud del sistema.
4. Denegar: no debe abrirse la cámara; debe aparecer la explicación. Abrir galería debe seguir funcionando.
5. Volver a intentar: aceptar la explicación si aparece y conceder el permiso. Tomar una foto y comprobar su guardado.
6. Con el permiso concedido, tomar otra foto: no debe solicitarse otra vez.
7. Si Android bloquea nuevas solicitudes, habilitar Cámara en Ajustes y volver a intentar.

Las pruebas automatizadas del servicio cubren navegador, permiso concedido, primera solicitud aceptada o denegada, bloqueo y cancelación de la explicación. El diálogo real de Android se verifica en dispositivo.

## Recuperación al volver de la cámara

En Android se solicita `CameraResultType.Uri`, con calidad 85 y dimensiones máximas de 1600 × 1600. El archivo se copia a `Directory.Data` sin transportar la imagen completa como Base64 por JavaScript. El navegador conserva Base64.

`CamaraService` escucha `appRestoredResult` desde el componente raíz. Antes de abrir la cámara guarda el identificador de la cuenta y un identificador único de foto. Si Android recrea la app, espera al perfil de esa misma cuenta, guarda la imagen y regresa a Apuntes. El identificador evita crear duplicados al reintentar; una escritura fallida conserva la ruta pendiente. Cerrar sesión elimina la recuperación pendiente.

La sesión de Firebase se hace persistente temporalmente antes de la captura. Al regresar se restaura la preferencia de Recordar mi sesión. Una sesión temporal abandonada vence tras una hora y se cierra en el siguiente arranque.

Prueba manual adicional: iniciar sesión sin marcar Recordar, tomar una foto, confirmar y verificar que se conserva la cuenta y aparece un solo apunte. Repetir con Recordar marcado y con una imagen de la galería. Para comprobar la recreación, en un dispositivo de pruebas se puede activar temporalmente No conservar actividades en opciones de desarrollador y repetir; desactivarlo al terminar. Esta simulación complementa la prueba normal y no sustituye revisar logcat si vuelve a fallar.

Si queda una captura pendiente, al tocar Tomar foto o Abrir galería se muestra un aviso. Volver conserva la operación. Reintentar guardado aparece cuando Android devolvió una imagen. Descartar captura libera la operación para iniciar otra, sin eliminar fotos ya guardadas ni la imagen original. No se permite descartar mientras se recupera el archivo ni desde una cuenta diferente. Las pruebas automatizadas cubren estos casos.

Al restaurar la app, la ruta de acceso espera a que Firebase termine de comprobar el perfil. Si hay una captura en recuperación y la sesión es válida, dirige a Apuntes. Las notificaciones repetidas de la misma cuenta no vacían el perfil ni reinician las páginas. El cierre explícito de sesión continúa invalidando el acceso.

