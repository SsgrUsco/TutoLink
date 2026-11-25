const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium, expect: baseExpect } = require('@playwright/test');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { doc, setDoc, Timestamp } = require('firebase/firestore');
const expect = baseExpect.configure({ timeout: 30000 });

(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-tutolink', firestore: { rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'facultades', '1'), { nombre: 'Ingeniería' }));
  await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'tutorias', '999'), {
    materia: 'Sesión de otro tutor', tutor: 'Otro tutor', tutorUid: 'otro-tutor',
    facultadId: 1, facultad: 'Ingeniería', lugar: 'Sala 101', estado: 'programada',
    inicio: Timestamp.fromMillis(Date.now() + 86400000), fin: Timestamp.fromMillis(Date.now() + 90000000),
    cupos: 2, cuposDisponibles: 2, bloques: ['otra-hora'],
  }));
  const root = path.resolve('www-emulator');
  const server = http.createServer((req, res) => {
    let file = path.join(root, new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' })[path.extname(file)] || 'text/html');
    fs.createReadStream(file).pipe(res);
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const errors = [];
    const base = `http://127.0.0.1:${server.address().port}`;
    async function registrar(rol) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/acceso');
      await page.getByRole('button', { name: 'Quiero registrarme', exact: true }).click();
      if (rol === 'tutor') {
        await page.locator('ion-select[name="rol"]').click();
        await page.getByText('Tutor — crear tutorías', { exact: true }).last().click();
        await page.getByRole('button', { name: 'Seleccionar', exact: true }).click();
      }
      await page.locator('ion-input[name="nombre"] input').fill(rol === 'tutor' ? 'Tutor de prueba' : 'Estudiante de prueba');
      await page.locator('ion-select[name="facultad"]').click();
      await page.getByText('Ingeniería', { exact: true }).last().click();
      await page.getByRole('button', { name: 'Seleccionar', exact: true }).click();
      await page.locator('ion-input[name="correo"] input').fill(`${rol}@usco.edu.co`);
      await page.locator('ion-input[name="contrasena"] input').fill('PruebaSegura123');
      await page.locator('ion-input[name="confirmacion"] input').fill('PruebaSegura123');
      await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible();
      await page.locator('ion-input[name="contrasena"] input').fill('PruebaSegura123');
      await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
      await expect(page).toHaveURL(/tutolink/);
      return page;
    }
    const tutor = await registrar('tutor');
    await expect(tutor.getByText('Aún no has publicado tutorías', { exact: true })).toBeVisible();
    await expect(tutor.locator('ion-item').filter({ hasText: 'Sesión de otro tutor' })).toHaveCount(0);
    await expect(tutor.locator('ion-input[name="materia"]')).toBeHidden();
    await tutor.locator('ion-segment-button[value="crear"]').click();
    await tutor.locator('ion-input[name="materia"] input').fill('Álgebra de prueba');
    await tutor.locator('ion-segment-button[value="lista"]').click();
    await expect(tutor.locator('ion-input[name="materia"]')).toBeHidden();
    await tutor.locator('ion-segment-button[value="crear"]').click();
    await expect(tutor.locator('ion-input[name="materia"] input')).toHaveValue('Álgebra de prueba');
    const fecha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await tutor.locator('#tutoria-inicio').fill(fecha + 'T10:00');
    await tutor.locator('#tutoria-fin').fill(fecha + 'T11:00');
    await tutor.locator('ion-input[name="lugar"] input').fill('Sala 205');
    await tutor.locator('ion-input[name="cupos"] input').fill('3');
    await tutor.getByRole('button', { name: 'Publicar tutoría', exact: true }).click();
    await expect(tutor.getByText('Tutoría publicada.', { exact: false })).toBeVisible();
    await expect(tutor.locator('ion-item').filter({ hasText: 'Álgebra de prueba' })).toContainText('3 cupos disponibles');
    await expect(tutor.getByRole('button', { name: 'Ver todas', exact: true })).toHaveCount(0);
    await expect(tutor.locator('ion-item').filter({ hasText: 'Álgebra de prueba' })).toBeVisible();
    await expect(tutor.locator('ion-item').filter({ hasText: 'Sesión de otro tutor' })).toHaveCount(0);
    const estudiante = await registrar('estudiante');
    await expect(estudiante.locator('ion-item').filter({ hasText: 'Sesión de otro tutor' })).toBeVisible();
    await expect(estudiante.getByRole('button', { name: 'Crear tutoría', exact: true })).toHaveCount(0);
    await estudiante.locator('ion-item').filter({ hasText: 'Álgebra de prueba' }).click();
    await expect(estudiante.locator('ion-modal')).toContainText('Tutor de prueba');
    await expect(estudiante.locator('ion-modal')).toContainText('Sala 205');
    await expect(estudiante.locator('ion-modal')).toContainText('10:00');
    await estudiante.getByRole('button', { name: 'Reservar cupo', exact: true }).click();
    await estudiante.getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect(estudiante.getByRole('button', { name: 'Cancelar mi reserva', exact: true })).toBeEnabled();
    await tutor.getByRole('button', { name: 'Actualizar tutorías', exact: true }).click();
    await expect(tutor.locator('ion-item').filter({ hasText: 'Álgebra de prueba' })).toContainText('2 cupos disponibles');
    if (process.env.TEST_ARTIFACT_DIR) {
      fs.mkdirSync(process.env.TEST_ARTIFACT_DIR, { recursive: true });
      await tutor.screenshot({ path: path.join(process.env.TEST_ARTIFACT_DIR, 'tutor-mobile.png') });
      await tutor.setViewportSize({ width: 1100, height: 850 });
      await tutor.screenshot({ path: path.join(process.env.TEST_ARTIFACT_DIR, 'tutor-desktop.png') });
      await tutor.setViewportSize({ width: 390, height: 844 });
    }
    await tutor.locator('ion-item').filter({ hasText: 'Álgebra de prueba' }).click();
    await expect(tutor.getByRole('button', { name: 'Reservar cupo', exact: true })).toHaveCount(0);
    await estudiante.locator('ion-modal').getByRole('button', { name: 'Cerrar', exact: true }).click();
    await estudiante.locator('ion-tab-button[tab="materiales"]').click();
    await expect(estudiante.locator('app-materiales-page h1')).toHaveText('Materiales');
    await expect(estudiante.locator('app-materiales-page ion-searchbar')).toBeVisible();
    assert.deepEqual(errors, []);
    console.log('PASS: registro de ambos roles, publicación, catálogo del estudiante, horario, reserva y cupos actualizados.');
  } finally {
    await browser.close(); server.closeAllConnections(); server.close(); await env.cleanup();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
