# IRIS · Auditoría técnica breve del modelo de medicación (catálogo/CIMA)

Fecha: 2026-04-20  
Alcance: diagnóstico conservador tras merges de catálogo/CIMA, sin cambios destructivos.

## 1) Mapa de entidades/tablas/tipos/componentes implicados

### A. Catálogo de medicación (local longitudinal)
- **Tabla**: `public.medication_catalog`
  - Campos clave actuales: `id`, `source`, `source_code`, `display_name`, `active_ingredient`, `strength`, `form`, `route`, `atc_code`.
- **Tipos frontend**:
  - `MedicationCatalogItem`, `MedicationCatalogSource`, `MedicationOrigin`.
- **Servicios/componentes**:
  - `searchMedicationCatalog`, `createMedicationCatalogItem`, `ensureExternalMedicationCatalogItem`.
  - `MedicationPanel` (alta interna, visualización de origen y código técnico).

### B. Medicación registrada en paciente/visita
- **Tabla**: `public.patient_medications`
  - Núcleo longitudinal por paciente: `patient_id`, `medication_catalog_id`, pauta (`dose_text`, `frequency_text`, etc.), vigencia (`start_date`, `end_date`, `is_active`).
  - Metadata de selección añadida por merge catálogo normalizado: `catalog_concept_id`, `catalog_product_id`, `selection_source`, `selected_label_snapshot`, `selected_source_payload`.
- **Tabla**: `public.visit_medication_events`
  - Trazabilidad por visita: `event_type` (`added|modified|stopped|confirmed_no_change`) + snapshots `old_value/new_value`.
- **Tipos frontend**:
  - `PatientMedication`, `PatientMedicationDraft`, `VisitMedicationEvent`, `MedicationEventType`.
- **Servicios/componentes**:
  - `saveVisitMedicationChanges`, `listActivePatientMedications`, `listVisitMedicationSnapshot`, `listVisitMedicationEvents`, `importExternalMedicationToVisit`.
  - `MedicationPanel`, `PatientMedicationSummary`, `VisitMedicationsPage`, `PatientDetailPage`.

### C. Datos importados desde CIMA
- **Edge Function**: `supabase/functions/search-cima-medications`
  - Consulta CIMA remoto y normaliza payload (CN, nregistro, nombre, forma, ATC, vías, etc.).
- **Catálogo normalizado (si existe en entorno)**:
  - `med_catalog_ingredients`, `med_catalog_concepts`, `med_catalog_products`, `med_catalog_aliases`, `med_catalog_concept_ingredients`.
- **Tipos/mapper/servicios**:
  - `CimaMedicationSearchDto`, `mapExternalMedicationPayloadToNormalizedCandidate`, `upsertNormalizedMedicationFromExternal`.

### D. Informes (si consumen medicación)
- **Estado actual**: `loadVisitReportData` no consulta tablas de medicación; solo visita/paciente/CMO/intervenciones/cuestionarios.
- **Consumo actual relacionado**: en informes solo aparecen textos genéricos sobre “medicación”, no lista real de tratamientos.
- **Documento de diseño existente**: propone snapshot por visita para evitar deriva histórica (`visit_medication_snapshots`).

---

## 2) Verificación de separación conceptual

### ✅ Bien separado (parcialmente)
- **ID interno**: `id` UUID en `medication_catalog` y `patient_medications` está separado de código externo.
- **Source**: existe en catálogo (`source`) y también `selection_source` en `patient_medications`.
- **Source code externo**: existe `source_code` en catálogo local y `cima_cn/cima_nregistro` en catálogo normalizado.

### ⚠️ Separación incompleta / ambigua
1. **Nombre original/raw vs display**
   - En `medication_catalog` solo se conserva `display_name`; el nombre original externo se guarda de forma indirecta en `selected_source_payload` (paciente) o `raw_payload` (producto normalizado), no en columna explícita del catálogo local.
2. **“Activo” vs “histórico”**
   - Operativamente “activo” hoy = `is_active = true` (lectura principal).
   - Existen `start_date/end_date`, pero no forman parte de la definición de activo en consulta estándar.
3. **Doble capa de catálogo (legacy + normalizado)**
   - Convivencia de `medication_catalog` (legacy operativo) y `med_catalog_*` (normalizado) sin contrato único de sincronización bidireccional.

---

## 3) Riesgos reales detectados

### Alta
1. **Duplicados en catálogo local `medication_catalog`**
   - No hay constraint único por `(source, source_code)` ni por nombre normalizado.
   - `ensureExternalMedicationCatalogItem` inserta directo si no encuentra coincidencia exacta por `source_code`; con `source_code` nulo o variable puede duplicar.

2. **Definición de “activo” potencialmente inconsistente**
   - `listActivePatientMedications` filtra solo por `is_active = true`.
   - Si existen `start_date/end_date`, pueden quedar tratamientos técnicamente fuera de rango pero aún “activos” para UI y futuros informes.

3. **Mezcla de responsabilidades catálogo vs medicación paciente**
   - `patient_medications` guarda referencias de catálogo + snapshot de payload externo + label snapshot.
   - Útil para traza, pero sin contrato formal puede inducir a usar `selected_label_snapshot` como verdad clínica en lugar de `medication_catalog`/concepto normalizado.

### Media
4. **`source_code` con semántica inestable**
   - En importación externa se usa `candidate.cimaCn ?? normalizedProductId`; si no hay CN, el `source_code` local pasa a ser UUID interno de producto normalizado (no código externo real).

5. **Riesgo de UUID técnico visible a usuario (indirecto)**
   - En modo debug/admin se muestra “Código técnico” (`row.source_code`); si el caso anterior ocurre, puede verse UUID en UI como si fuera código de medicamento.

6. **Dependencia implícita de tablas normalizadas no versionadas en esta rama**
   - Hay migración de RLS/metadata para `med_catalog_*`, pero no se observa en el set actual una migración de creación de esas tablas.
   - Riesgo de entornos parcialmente migrados (feature flags de hecho, no declarados).

### Baja
7. **Source taxonomía múltiple no totalmente homogénea**
   - Coexisten literales `external_cima_remote`, `external_cima`, `cima`, `internal`, `manual` en distintas capas; hoy funciona por mapeo, pero aumenta coste cognitivo y riesgo de edge cases.

---

## 4) Propuesta mínima segura (antes de tocar informes)

1. **Congelar contrato operativo de “activo” (MVP explícito)**
   - Documentar y aplicar en una única función utilitaria:
     - Opción A (mínima): activo = `is_active = true`.
     - Opción B (siguiente paso): activo = `is_active` + validación de rango `start/end`.
   - No mezclar criterios entre pantallas/servicios.

2. **Blindaje anti-duplicados sin refactor grande**
   - Añadir índice único parcial conservador para externos con código real:
     - `unique (source, source_code) where source_code is not null`.
   - Mantener chequeo de nombre para internos, pero no usarlo como única barrera.

3. **Corregir semántica de `source_code`**
   - Regla mínima: `source_code` debe ser **solo código externo real** (CN/nregistro).
   - Si no existe código externo, dejar `source_code = null` y confiar en `catalog_product_id` para trazabilidad técnica.

4. **Aislar contrato catálogo vs paciente en documentación técnica breve**
   - Catálogo = diccionario (nombres/fármaco).
   - Paciente = exposición clínica temporal (dosis, frecuencia, activo, notas).
   - Snapshot de selección (`selected_*`) = auditoría UI, no fuente clínica principal.

5. **Precondición antes de informes con medicación**
   - No leer `patient_medications` en vivo en PDF histórico.
   - Adoptar snapshot por visita (como ya propone `docs/iris-viabilidad-medicacion-activa-en-informe-visita.md`) una vez cerrado el contrato de “activo”.

---

## Conclusión ejecutiva

El modelo actual **ya tiene buena base estructural** (catálogo local, longitudinal por paciente, eventos por visita, y capa normalizada CIMA), pero aún presenta **riesgos de consistencia de identidad y semántica** (duplicados, `source_code`, definición de activo) que conviene cerrar **antes** de acoplar medicación a informes.

Diagnóstico conservador: avanzar primero con **contrato de activo + unicidad técnica + semántica estricta de `source_code`**, y después integrar snapshot de medicación en informes.
