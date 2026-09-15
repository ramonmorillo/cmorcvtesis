# Auditoría de trazabilidad de cuestionarios en informes

Fecha: 15 de septiembre de 2026

## Alcance

Se revisó el recorrido completo de los datos desde la cumplimentación de IEXPAC, Morisky-Green, EQ-5D-5L y PAM-10 hasta los informes PDF para paciente y profesional médico:

1. formulario y cálculo;
2. persistencia en `questionnaire_responses`;
3. relación con `visits` y `patients`;
4. lectura para una visita concreta;
5. transformación y presentación en ambos informes.

No se modificaron los módulos de estratificación, medicación, intervenciones, proceso, documentos, pacientes ni visitas.

## Hallazgos

### Identidad del cuestionario indirecta

El tipo de cuestionario se infería a partir de un `measurement_id` global. La base real contenía cuatro identificadores globales, usados cada uno en seis visitas diferentes. Además, esos registros de `measurements` conservaban metadatos de un paciente/usuario concreto, aunque las respuestas correspondían a varias visitas y usuarios. La relación correcta con el paciente estaba en `questionnaire_responses.visit_id -> visits.patient_id`, pero el informe no verificaba explícitamente esa concordancia.

### Ausencia de una clave canónica por visita y cuestionario

La base real tenía unicidad por `(visit_id, measurement_id)`, pero no almacenaba el código del cuestionario en cada respuesta. Esto dejaba la identidad clínica del cuestionario dependiente de una tabla de mapeo externa y mutable.

### Presentación incorrecta de resultados

El informe médico trataba todos los instrumentos como si tuvieran una única puntuación total. En EQ-5D-5L esto producía “puntuación no disponible” aunque sí estuvieran registrados el perfil descriptivo y la EVA. Morisky-Green se mostraba como 0/1, sin traducirlo a adherente/no adherente. El informe del paciente solo comunicaba el número de cuestionarios, no sus resultados.

### Datos existentes

La comprobación agregada de la base real encontró 24 respuestas: seis visitas basales con los cuatro cuestionarios completos. No se detectaron respuestas huérfanas, sin mapeo ni duplicadas. Aún no existen respuestas de Mes 12; por ello, la separación basal/Mes 12 queda cubierta por pruebas automatizadas y deberá confirmarse también con el primer caso longitudinal real.

## Corrección aplicada

- Se incorpora `questionnaire_code` como identidad canónica en cada respuesta.
- Se retrocompletan los registros existentes sin alterar sus respuestas.
- Se exige unicidad por `(visit_id, questionnaire_code)`.
- Se mantiene `measurement_id` y su índice de unicidad para compatibilidad con la versión desplegada durante la transición.
- Un trigger privado completa el código en payloads heredados y rechaza códigos incompatibles con el mapeo.
- Antes de construir cualquier PDF se exige coincidencia exacta de `patient_id`, `visit_id` y `visit_type` y ausencia de duplicados. Ante una incoherencia, el informe se bloquea en vez de mezclar datos.
- Ambos informes identifican paciente y momento de seguimiento. Los resultados se presentan según la semántica de cada instrumento.

## Verificación

- Cinco pruebas de regresión cubren paciente distinto, visita distinta, momento distinto, duplicidad y cálculo/presentación de los cuatro cuestionarios.
- `npm test`: correcto.
- `npm run build`: correcto.
- La migración completa se ensayó dentro de una transacción sobre el esquema real y se revirtió; retrocompletado, restricciones, índices y compatibilidad con payloads heredados resultaron correctos.
- La auditoría no mostró errores nuevos de seguridad o rendimiento asociados a esta migración. Los avisos preexistentes del asesor de Supabase quedan fuera del alcance de esta corrección.

## Orden de despliegue

1. Aplicar la migración `20260915074023_add_questionnaire_response_traceability.sql`.
2. Desplegar la aplicación.
3. Ejecutar el caso de aceptación basal y, cuando exista, el caso Mes 12 del mismo paciente.

La migración es compatible con la versión anterior de la aplicación durante el intervalo entre los pasos 1 y 2.
