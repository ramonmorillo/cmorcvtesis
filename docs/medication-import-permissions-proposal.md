# Propuesta: permisos de importación coherentes con el registro manual

Estado: autorizada expresamente por el usuario y probada localmente; pendiente de aplicación en Supabase.

## Problema reproducido

La función de importación actual exige `app_private.patient_is_owner(patient_id)`
además de las políticas RLS de los datos clínicos. En el proyecto remoto, las
políticas compartidas por el usuario permiten lectura/escritura a usuarios
autenticados; por tanto, un paciente de otro creador, o sin `created_by`, puede
admitir registro manual y rechazar la importación con SQLSTATE 42501. Abrir una
visita extraordinaria no cambia quién creó el paciente.

Se ha reproducido ese rechazo con datos sintéticos: paciente de otro creador,
visita extraordinaria y las políticas clínicas permisivas observadas. Esto
identifica un requisito adicional real; no sustituye la comprobación de los
permisos concretos de la sesión remota ni demuestra que todos los errores 42501
tengan la misma causa.

## Cambio propuesto y límites

Archivo: `supabase/migrations/20261107120000_align_medication_import_with_clinical_rls.sql`.

- Actualiza únicamente la RPC de importación y las dos políticas de su tabla
  `medication_import_receipts`.
- Conserva SECURITY INVOKER: los SELECT/INSERT se ejecutan con el rol del usuario
  y siguen sujetos a las políticas clínicas existentes. No utiliza privilegios
  de administrador ni desactiva RLS.
- Comprueba autenticación, visibilidad del paciente, correspondencia de visita y
  todas las políticas de inserción de tratamientos/eventos. Retira la condición
  adicional de que el usuario sea el creador del paciente.
- Los recibos solo son visibles/escribibles por su actor y requieren que el
  paciente/visita sean visibles bajo sus políticas actuales.
- Sustituye el bloqueo FOR UPDATE del paciente por un bloqueo asesor de
  transacción por paciente: serializa importaciones sin exigir UPDATE sobre la
  tabla de pacientes. Los demás flujos manuales no participan de ese bloqueo,
  como ya ocurría con la prevención global de duplicados documentada.
- No reasigna `created_by`, no cambia pacientes, visitas o tratamientos existentes,
  ni modifica ninguna política RLS clínica. No amplía el alcance que las políticas
  clínicas ya conceden al registro manual.
- Mantiene atomicidad, idempotencia, comprobación histórica y duplicados. Los
  permisos anónimos sobre la RPC siguen revocados.

Con las políticas clínicas actuales (`true`), más de un usuario autenticado puede
trabajar sobre el mismo paciente. Esta propuesta permite la misma operación de
importación en ese alcance; no añade aislamiento por propietario donde el modelo
actual no lo establece. Si se desea otro alcance de colaboración, debe definirse
por separado, con autorización expresa para cambiar esas políticas clínicas.

## Validación

`tests/medicationImportClinicalPermissions.test.ts` ejecuta el SQL previo y el
propuesto en PostgreSQL/PGlite. Reproduce primero el rechazo anterior y verifica
el caso compartido autorizado por RLS y los casos denegados por políticas
restrictivas. Incluye pacientes sin creador, anonimato, actor de recibo,
correspondencia de visita, rollback de eventos, idempotencia, duplicados y bloqueo
histórico. Todos los registros son sintéticos y no se ha escrito en Supabase remoto.

## Aplicación

El usuario ha autorizado expresamente esta actualización de la RPC y las dos
políticas RLS de recibos. Se verificaron 110 pruebas, incluidas las 12 específicas
de esta actualización. La autorización está concedida; no hace falta solicitarla
de nuevo para ejecutar este archivo. No
hay que volver a aplicar la migración original, crear usuarios ni conceder acceso
público. Aplicar el archivo completo en el SQL Editor y validar con
una cuenta y un paciente de prueba. No requiere cambios del frontend.
