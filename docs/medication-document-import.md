# Importación asistida de medicación: auditoría, implementación y validación

## Auditoría previa

IRIS es una SPA React 18 / TypeScript / Vite, con rutas hash. Supabase aporta Auth,
PostgREST y funciones Edge; los informes PDF de producción se generan en cliente.
`VisitMedicationsPage` resuelve el paciente mediante `getVisitById` y monta
`MedicationPanel`; el panel carga una instantánea longitudinal y bloquea visitas
históricas. Los controles manuales y las advertencias semánticas se conservan.

`medication_catalog` contiene identidad, concentración, forma y vía.
`patient_medications` referencia paciente y catálogo; admite dosis, frecuencia, vía,
indicación, fechas, activo y notas. `visit_medication_events` referencia visita y
tratamiento, con tipo added/modified/stopped/confirmed_no_change e instantáneas.
Las migraciones activan RLS: propietario del paciente para tratamientos, propietario
de visita y coincidencia paciente/visita para inserción de eventos; catálogo legible
por usuarios autenticados, inserción restringida por origen. Los helpers permiten
el alcance administrativo existente. La auditoría se limita al código: no se han
inspeccionado pacientes reales ni políticas desplegadas.

`createMedicationCatalogItem` crea o devuelve duplicados del catálogo manual.
`importExternalMedicationToVisit` escribe inmediatamente al seleccionar CIMA:
no se usa durante la revisión documental. `saveVisitMedicationChanges` valida
paciente/visita e historial y escribe cada tratamiento y luego su evento. No es
transaccional; un fallo de evento puede dejar un tratamiento sin trazabilidad.
No hay restricción única de tratamiento por paciente; un reintento puede duplicar.
`searchExternalMedicationCatalog` y `searchRemoteCimaMedications` son consultas:
la segunda usa la función Edge existente, que envía a CIMA solo `query`.

## Implementación por fases

1. Auditoría anterior y propuesta de transacción. El usuario autorizó expresamente
   añadir RPC e idempotencia durante esta tarea.
2. PDF.js extrae texto por líneas y páginas. La tabla permite editar identificación,
   concentración, forma, dosis, pauta, vía y estado; conserva el fragmento original.
3. Tesseract.js reconoce imágenes y páginas escaneadas/mixtas en español. Todos
   los recursos se copian desde dependencias fijadas al propio sitio durante
   `postinstall`, `predev` y `prebuild`. No hay CDN durante procesamiento.
4. La integración CIMA existente solo se invoca después de introducir manualmente
   un término farmacológico y confirmar que no contiene datos personales. No se
   rellena automáticamente esa consulta con texto extraído. Se muestran alternativas
   sin elegir presentaciones automáticamente y se mantiene dosis/pauta. Es una
   medida asistida: no puede demostrar que un nombre escrito sea farmacológico;
   la revisión profesional sigue siendo necesaria. Los errores dejan la revisión
   manual disponible. Se exige escoger una entrada del catálogo local existente.
5. Confirmación explícita por fila y por lote. Solo se envían identificador de
   catálogo, dosis, pauta, vía, paciente, visita y clave de operación. El RPC usa
   las tablas clínicas existentes y registra eventos `added`; ninguna actualización
   ni suspensión de tratamientos previos. No se utilizan el insert inmediato de
   CIMA ni el guardado secuencial manual para importar documentos.

## Transacción autorizada

Archivo: `supabase/migrations/20261107100000_atomic_medication_document_import.sql`.
Crea `medication_import_receipts` (clave de operación única, actor, paciente,
visita, hash del lote estructurado y IDs resultantes) con RLS propia, e
`import_visit_medication_document`, SECURITY INVOKER. Mantiene intactas las tablas
y políticas clínicas existentes. Las inserciones siguen sujetas a sus RLS.

La función comprueba autenticación y permiso, bloquea el paciente, valida visita,
rechaza visitas históricas y duplicados (también suspendidos), inserta todo el lote
y sus eventos y devuelve un recibo dentro de una única transacción. Un fallo
revierte todo. Un reintento idéntico recupera el mismo resultado sin escribir;
un cambio de payload con la misma clave se rechaza. La UI conserva la clave
mientras se reintenta el mismo lote. En caso de respuesta de red incierta, no
se anuncia éxito; se pide recuperar el recibo mediante reintento.

La comprobación de visitas replica fecha, número, tipo y creación del servicio
actual; empates absolutos se bloquean conservadoramente. El bloqueo serializa
importaciones; no introduce una unicidad clínica global ni cambia el flujo manual.
Una escritura manual que se complete después de la transacción puede introducir
un duplicado: el flujo manual previo no participa en este protocolo. No se afirma
protección contra todos los escritores concurrentes externos.

La RPC solo usa catálogo ya existente. Si falta una presentación, debe darse de
alta mediante el flujo manual existente y repetir la revisión documental.
No se crean entradas de catálogo con fragmentos de documentos.

**Estado de despliegue:** el usuario ejecutó el SQL corregido en el SQL Editor
remoto y compartió un resultado «Success. No rows returned». La aplicación de
la migración se documenta con esa evidencia; no se repite automáticamente ni se
ha verificado el flujo completo contra el Supabase remoto. El frontend requiere
fusionar y desplegar estos cambios. Si falta la RPC en otro entorno, la UI informa
de ello sin recurrir al servicio no transaccional. La siguiente comprobación
remota debe realizarse con una cuenta y un paciente de prueba, sin datos reales.

## Privacidad y límites

El documento, imágenes y texto OCR permanecen en memoria; no se suben ni se
copian a notas, payloads, errores o almacenamiento web. Tesseract tiene desactivada
su caché persistente (`cacheMethod: none`). Al cancelar, cambiar de paciente o
cerrar se borran los estados y se liberan workers, PDF, bitmap y canvas. Un worker
que esté inicializándose se termina en cuanto devuelve su referencia; una llamada
RPC que ya fue confirmada no se puede deshacer cancelando la interfaz.
Los recursos estáticos pueden quedar en la caché HTTP del navegador; no contienen
documentos clínicos. No se ha añadido analítica.

Límites: 20 MB, 10 páginas, 12 MP por imagen y máximo 100 tratamientos por lote.
No se admiten PDF con contraseña, escritura manuscrita fiable ni todos los diseños
de tablas. La extracción es heurística y puede omitir o confundir líneas; siempre
se muestra el texto local de cada página para contrastar con el documento.
Cantidades de envase, alternativas y pautas contradictorias no se convierten en
una dosis prescrita. No se infieren dosis a partir de concentración ni se asume
que un tratamiento es activo por no indicar suspensión.

Solo se incorporan tratamientos confirmados como activos. Los suspendidos se
identifican para revisión pero no generan altas, suspensiones ni reactivaciones.
Campos ausentes pueden quedar vacíos tras revisión expresa. Concentración, forma,
texto original y cualquier dato no representable en el registro longitudinal se
conservan solo durante la revisión; la identidad persistida es el catálogo elegido.

## Archivos

- `src/features/medications/documentImport/`: extracción local, modelo de propuestas,
  revisión, catálogo y llamada transaccional con whitelist de campos.
- `MedicationPanel.tsx`: botón, duplicados contra activos/borradores/históricos y
  refresco tras importación, conservando cambios manuales no guardados.
- `VisitMedicationsPage.tsx`: limpieza al cambiar visita y protección de respuestas
  obsoletas para no reutilizar revisión entre pacientes.
- `scripts/prepare-medication-import-assets.mjs`, `package.json`, `package-lock.json`,
  `.gitignore`: recursos locales, dependencias fijadas y salidas ignoradas.
- `src/styles/main.css`: tabla editable y fragmentos.
- Migración anterior: transacción y recibos, sin modificar RLS anteriores.
- `tests/medicationDocumentImport.test.ts`, `tests/medicationImportTransaction.test.ts`,
  `tests/browser/`, `playwright.config.ts`: fixtures sintéticas, lógica,
  PostgreSQL/PGlite y navegador real.

## Validación reproducible

```sh
npm ci --cache /workspace/.npm-cache --no-audit --no-fund
npm test
npm run build
# Si Chromium no está disponible: npx playwright install chromium
# En esta máquina se usó el Chromium ya instalado:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser
```

Las pruebas de navegador usan una página de test fuera del build de producción,
una URL Supabase ficticia y respuestas interceptadas. Nunca emplean claves ni
documentos clínicos reales. PDF digitales multipágina, JPG, PNG y PDF escaneado
se generan sintéticamente; PDF.js y OCR sí se ejecutan realmente.

Se verifican medicamentos múltiples, dosis/frecuencia/estado, ambigüedad,
duplicados, cancelación y cambio de paciente, ausencia de escrituras durante
revisión, campos de red permitidos, CIMA opt-in y alternativas, reintento con
la misma clave, regresión del formulario manual y ausencia de solicitudes
externas o caché de documentos durante extracción/OCR. Las llamadas CIMA están
simuladas: no se afirma conectividad real con su función Edge.

Las pruebas PostgreSQL/PGlite ejecutan la migración longitudinal original y la
nueva RPC con autenticación, propietarios y políticas sintéticas; demuestran
rollback ante fallo del evento, atomicidad de lote, replay, duplicados, validación
de payload, aislamiento por paciente y bloqueo histórico. No sustituyen una
prueba contra el Supabase desplegado y sus políticas actuales.

Resultado final y recuentos se informan al entregar; la compilación conserva la
advertencia previa de tamaño del bundle. No se han usado datos clínicos reales.

### Resultado de esta entrega

- Instalación limpia con `npm ci`: correcta, incluidos recursos locales.
- `npm test`: 86 pruebas superadas en 10 archivos (62 preexistentes y 24 nuevas).
- `npm run test:browser`: 11 pruebas superadas con Chromium, incluidos OCR real,
  trazabilidad de solicitudes y preservación de ediciones manuales pendientes.
- `npm run build`: correcto; advertencia de bundle grande ya existente.
- `git diff --check`: sin errores de whitespace.
- SQL aplicado por el usuario con resultado satisfactorio en Supabase; pendiente
  de despliegue del frontend y de prueba funcional remota autenticada.

Una ejecución intermedia de navegador se vio afectada por cambios de módulos en
caliente durante la prueba del PDF escaneado. Se repitió la suite completa con el
código estable; las 11 pruebas terminaron correctamente.


### Compatibilidad con bases anteriores

La inspección del esquema remoto compartida por el usuario confirmó políticas
clínicas `ALL TO authenticated USING (true) WITH CHECK (true)` y la columna
`patients.created_by`, pero ningún helper de propietario. La migración añade
`app_private.patient_is_owner(uuid)` solo si no existe, SECURITY INVOKER,
comparando ese campo con `auth.uid()` y denegando propietarios nulos. No reemplaza
helpers existentes, no asigna propietarios y mantiene las políticas clínicas sin
cambios. Esta comprobación limita la nueva RPC a su propietario; no corrige el
acceso amplio que ya permiten las políticas del resto de la aplicación.

Las pruebas verifican compatibilidad tanto con el helper original como con el
esquema permisivo observado sin helpers, denegación a otros usuarios y
reejecución de la migración sin borrar datos. La migración está envuelta en
BEGIN/COMMIT. No se propone reinstalar migraciones anteriores ni reemplazar
políticas clínicas existentes para resolver compatibilidad.

## Refinamiento de tablas de prescripción y confirmación

La lectura conserva ahora posiciones de palabras tanto en PDF digital como en OCR.
Cuando reconoce encabezados de prescripciones/posología, códigos de medicamento
y columnas de fechas, agrupa el contenido por filas y separa descripción y pauta.
Los códigos de prescripción y catálogo no se incorporan al nombre; las cantidades
de envase no se tratan como dosis. Las combinaciones conservan sus dos nombres
y concentraciones. En texto sin tabla, las líneas «1 cápsula cada» y «24 horas»
se unen al medicamento anterior en lugar de generar nuevas propuestas.

En imágenes/escaneos se realiza una segunda lectura OCR local de cada celda de
posología, ampliada, retirando líneas largas de la cuadrícula del recorte. Se usa
una lectura coherente por página, sin concatenar dos lecturas completas que puedan
duplicar las propuestas. Los recortes se liberan al terminar. No se inventa una
dosis ante texto ilegible y las fechas no convierten el estado en activo.
Este reconocimiento de tabla exige evidencia explícita de columnas y códigos;
formatos diferentes, códigos mal reconocidos o tablas deformadas pueden seguir
requiriendo corrección manual. No se ha usado el documento clínico del usuario en
el repositorio ni en las pruebas: las reproducciones son completamente sintéticas.

Junto al botón final aparecen el número de tratamientos seleccionados y los motivos
que bloquean cada fila: catálogo sin elegir, estado no determinado o suspendido,
revisión profesional pendiente y duplicados. Los errores del servidor también se
muestran ahí y reciben foco, evitando avisos fuera de vista. La casilla final no
sustituye la selección y revisión de cada tratamiento. No se relajan validaciones.

Validación de esta corrección: 92 pruebas de lógica/base de datos, 15 pruebas de
navegador y compilación correctas. Incluye una tabla sintética de cinco recetas en
PDF digital, JPEG y PDF escaneado, reconocimiento de sus cinco dosis/pautas,
ausencia de solicitudes externas durante extracción y una prueba que reproduce
la confirmación incompleta, verifica el aviso visible y completa el mismo lote con
un solo guardado simulado. No cambia tablas, RPC ni RLS; requiere desplegar el
frontend. El flujo remoto autenticado permanece sujeto a validación en el sitio.
