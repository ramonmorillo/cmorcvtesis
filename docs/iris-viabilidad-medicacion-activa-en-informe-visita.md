# IRIS · Viabilidad conservadora para añadir “Medicación activa en el momento de la visita”

## Alcance y objetivo

Este documento evalúa **cómo añadir una sección de solo lectura** en el informe de visita con enfoque conservador, sin romper la arquitectura actual y priorizando que los informes históricos no cambien al modificarse la medicación posteriormente.

## 1) Cómo se generan actualmente los informes de visita

### Flujo funcional actual

1. La pantalla `VisitReportsPage` carga datos con `loadVisitReportData(visitId)` y permite descargar PDF de paciente y médico.
2. `loadVisitReportData` compone DTOs en memoria combinando visita, paciente, CMO, intervenciones y cuestionarios.
3. La descarga PDF actual en frontend (`downloadPatientVisitReportPdf` / `downloadClinicianVisitReportPdf`) genera un PDF simple línea a línea, sin persistir snapshot del informe.

### Observaciones arquitectónicas relevantes

- Los informes no se guardan como entidad/versionado en BD; se recalculan “al vuelo” en cada descarga.
- Existe infraestructura alternativa en `server/pdf` (plantillas HTML + Playwright), pero el flujo activo de la UI usa el generador local del frontend.
- Por tanto, cualquier dato adicional leído en tiempo real (p. ej., medicación activa actual del paciente) produciría **deriva histórica** en informes antiguos.

## 2) Estado actual del módulo de medicación y encaje con informes

- El módulo longitudinal de medicación ya existe (`medication_catalog`, `patient_medications`, `visit_medication_events`).
- La función `listActivePatientMedications(patientId)` define activo de forma simple por `is_active = true`.
- Existe `listVisitMedicationSnapshot(visitId)`, pero hoy resuelve el paciente y retorna la **activa actual** (no snapshot real de la visita).
- La trazabilidad por visita (`visit_medication_events`) sí registra cambios, pero no representa por sí misma el “estado completo” de medicación activa en una fecha dada sin reconstrucción.

## 3) Viabilidad técnica (conservadora)

**Viable**, con riesgo **medio-bajo** si se introduce un snapshot explícito por visita y se consume ese snapshot en informes.

### Por qué es viable sin romper arquitectura

- El patrón actual de informes ya agrega múltiples fuentes en `loadVisitReportData`; añadir una fuente más (snapshot de medicación) es incremental.
- Se puede evitar impacto transversal limitando cambios a:
  - nueva tabla de snapshot por visita,
  - servicio de snapshot acoplado a `reportService`,
  - render condicional de sección en ambos templates PDF de visita.

### Por qué no conviene leer `patient_medications` en vivo desde el informe

- Rompe inmutabilidad histórica del informe.
- Genera diferencias entre descargas del mismo informe en fechas distintas.
- Dificulta auditoría clínica y legal.

## 4) Estrategia recomendada (snapshot al cerrar/generar visita)

## Recomendación principal

Crear snapshot inmutable por visita y consumirlo siempre en informes.

### Diseño mínimo seguro

1. **Nueva tabla** `visit_medication_snapshots` (1 fila por medicamento incluido en snapshot):
   - `id`, `visit_id`, `patient_medication_id` (nullable),
   - `medication_display_name_snapshot`,
   - `active_ingredient_snapshot`, `strength_snapshot`, `form_snapshot`, `route_snapshot`,
   - `dose_text_snapshot`, `frequency_text_snapshot`, `route_text_snapshot`, `indication_snapshot`,
   - `start_date_snapshot`, `end_date_snapshot`,
   - `snapshot_taken_at`, `snapshot_source` (`close_visit` | `manual_report_generation` fallback).

2. **Momento de snapshot (prioridad):**
   - Preferente: al cambiar visita a estado cerrada/realizada (`visit_status = realizada`) en el flujo de visita.
   - Fallback conservador: al generar informe, **solo si no existe snapshot** para esa visita (write-once).

3. **Consumo en informe:**
   - `loadVisitReportData` primero consulta snapshot por `visit_id`.
   - Si hay filas > 0, añade sección “Medicación activa en el momento de la visita”.
   - Si no hay filas, **no mostrar sección**.

4. **No edición desde informe:**
   - La sección se renderiza como lista/tabla textual sin acciones.
   - No enlazar a `VisitMedicationsPage` desde el PDF.

## 5) Definición operativa de “activo” (riesgo principal)

Para MVP seguro y consistente con el código actual:

- Activo = `is_active = true` en el instante de snapshot.
- Ignorar en primera iteración reglas temporales complejas (`start_date`, `end_date` futuras/pasadas), salvo que negocio lo exija formalmente.

Si se desea mayor rigor en fase posterior:

- Activo en fecha de visita = `is_active = true` **y** (`start_date` nula o `start_date <= fecha_visita`) **y** (`end_date` nula o `end_date >= fecha_visita`).

## 6) Riesgos técnicos reales y mitigación

1. **Definición de activo ambigua**
   - Riesgo: discrepancias entre clínica y lógica técnica.
   - Mitigación: fijar contrato MVP explícito (`is_active`) y documentarlo.

2. **Duplicados de medicación**
   - Riesgo: mismo fármaco repetido por distintas entradas de catálogo u origen.
   - Mitigación: en snapshot, deduplicar por clave estable (prioridad: `patient_medication_id`; fallback nombre normalizado + pauta).

3. **Formato de nombres**
   - Riesgo: variaciones (`display_name`, ingredientes, mayúsculas/acentos) en PDF.
   - Mitigación: construir etiqueta de snapshot en momento de captura y guardarla textual (ej. `Nombre — dosis — frecuencia — vía`).

4. **Impacto en plantillas**
   - Riesgo: desbordes de maquetación por listados largos.
   - Mitigación: sección opcional con bullets simples y salto de página natural; evitar tablas complejas en MVP.

5. **Sin snapshot previo en visitas antiguas**
   - Riesgo: informes antiguos sin sección o con fallback inconsistente.
   - Mitigación: política clara: no backfill automático; mostrar sección solo si snapshot existe. Opcional: script manual de backfill controlado.

## 7) Archivos a tocar (propuesta mínima)

### Base de datos (nuevo)

- `supabase/migrations/<timestamp>_add_visit_medication_report_snapshot.sql`
  - Crear tabla snapshot + índices + RLS alineada con acceso por visita/paciente.

### Servicios frontend

- `src/features/medications/medicationsService.ts`
  - Añadir función read-only `listVisitMedicationReportSnapshot(visitId)`.
  - Añadir función idempotente `ensureVisitMedicationReportSnapshot(visitId)` (si no existe, crea).

- `src/services/reportService.ts`
  - Extender DTOs de informe con `activeMedicationAtVisit?: string[]`.
  - Integrar lectura de snapshot y render condicional.
  - **No** modificar edición ni flujos clínicos fuera de informe.

### Render PDF

- Si se mantiene generador actual (recomendado para mínima invasión):
  - `src/services/reportService.ts` (función `buildPdfLines`) para insertar sección condicional.

- Solo si se reactiva servidor Playwright (no necesario ahora):
  - `server/pdf/templates.js` para sección equivalente.

## 8) Nivel de riesgo

- **Riesgo global:** **Medio-bajo**.
- **Riesgo funcional:** Bajo (sección opcional y read-only).
- **Riesgo de datos históricos:** Bajo si snapshot es write-once.
- **Riesgo de regresión visual PDF:** Medio (controlable con pruebas de casos con/ sin medicación y listado largo).

## 9) Propuesta de implementación mínima segura (orden sugerido)

1. Migración BD con tabla snapshot + RLS.
2. Servicio de snapshot idempotente.
3. Integración en `loadVisitReportData`.
4. Render condicional en PDF paciente y médico.
5. Pruebas manuales:
   - Visita con snapshot y 0 medicaciones => sección oculta.
   - Visita con snapshot y N medicaciones => sección visible.
   - Cambiar medicación tras snapshot => informe previo no cambia.

## 10) Decisiones conservadoras explícitas

- No tocar todavía informe médico/paciente más allá de la sección opcional de visita y solo si comparten el mismo pipeline (sí lo comparten en `reportService`).
- No introducir edición de medicación desde informe.
- No reemplazar infraestructura de PDF actual.
- No hacer backfill automático de histórico en esta fase.

