# IRIS · Propuesta técnica de mejora de exportación para investigación/tesis (SPSS + medicación)

## 1) Auditoría rápida del sistema actual

Base revisada: `src/services/exportService.ts` y flujo UI en `src/pages/DashboardPage.tsx`.

Estado detectado previo:
- Exportación solo en CSV (6 ficheros): pacientes, visitas, estratificaciones, intervenciones, cuestionarios y dataset maestro.
- Anonimización ya presente para `patient_id` y `visit_id`.
- CSV con BOM UTF-8 (`\uFEFF`) y separador coma.
- Sin archivo de sintaxis SPSS (`.sps`) ni diccionario de variables/labels.
- Sin dataset relacional de medicación por visita.
- Sin variables resumen de medicación en dataset maestro.

## 2) Problemas de compatibilidad SPSS detectados

1. **Fechas**  
   Salen como texto ISO (`YYYY-MM-DD`) y SPSS puede importarlas como string si no se define formato explícito.

2. **UTF-8**  
   El BOM ayuda en Excel, pero SPSS necesita `ENCODING='UTF8'` en `GET DATA` para evitar caracteres rotos.

3. **Separadores decimales**  
   El CSV usa `.` decimal; en entornos ES de SPSS con coma decimal, sin sintaxis puede haber parseo inconsistente.

4. **Missing values**  
   Valores ausentes van como vacío (`''`), pero no hay instrucción SPSS para marcarlos de forma explícita.

5. **Variables categóricas**  
   No existe bloque `VALUE LABELS` (ej. binarios sí/no), lo que dificulta análisis reproducible.

6. **Nombres de columnas**  
   Mezcla idiomas y convenciones (algunas con mayúsculas como `IEXPAC_basal`, otras snake_case); SPSS lo soporta, pero complica diccionario.

7. **Labels inexistentes**  
   No hay `VARIABLE LABELS`, reduciendo trazabilidad metodológica en tesis.

## 3) Cambios implementados en esta iteración

### 3.1. SPSS syntax sidecar (`CSV + .sps`)

Se añadió generación y descarga automática de:
- `dataset_maestro.sps`
- `medicacion_por_visita.sps`

Incluye:
- `SET UNICODE ON`
- `GET DATA` delimitado por coma y `ENCODING='UTF8'`
- formato de variables (string/numeric/date heurístico)
- `MISSING VALUES ALL ("")`
- labels de variables clave y `VALUE LABELS` para binarios.

### 3.2. Medicación en dataset principal (resumen)

Se incorporaron al `dataset_maestro.csv`:
- `active_medications_count`
- `polypharmacy` (1 si >=5 activos, 0 si no)
- `therapeutic_groups_active` (grupos ATC nivel 1, concatenados con `|`)

### 3.3. Dataset secundario relacional de medicación por paciente/visita

Nuevo archivo:
- `medicacion_por_visita.csv`

Contenido por fila (medicación activa en fecha de visita):
- ids anonimizados (`patient_id`, `visit_id`)
- metadatos de visita
- nombre de medicamento, principio activo, `atc_code`, `atc_group`
- posología/indicación/fechas
- `selection_source`

## 4) Archivos modificados

- `src/services/exportService.ts`
- `docs/iris-propuesta-exportacion-spss-medicacion-2026-04-20.md`

## 5) Nivel de esfuerzo estimado (próximas fases)

- **Quick wins (0.5–1 día):**
  - ampliar labels SPSS para más variables categóricas.
  - añadir README de importación SPSS paso a paso.

- **Esfuerzo medio (1–2 días):**
  - exportación XLSX multi-hoja (`dataset_maestro`, `medicacion_por_visita`, diccionario) con librería `xlsx` o `exceljs`.

- **Esfuerzo alto (3–5 días):**
  - exportación SAV nativa (si se decide vía backend/servicio dedicado), por complejidad de librerías robustas en frontend.

## 6) Quick wins inmediatos recomendados

1. Congelar un diccionario de variables oficial por versión de protocolo.
2. Estandarizar nombres de columna (snake_case completo y sin tildes).
3. Codificar explícitamente binarios en origen (0/1) para minimizar ambigüedades.
4. Añadir validación automática pre-export (campos críticos vacíos, fechas inválidas).

## 7) Riesgos de compatibilidad

1. **Parseo de fecha en SPSS** si el usuario importa CSV sin ejecutar `.sps`.
2. **Locales con coma decimal** pueden requerir ajuste de configuración SPSS regional.
3. **ATC incompleto**: si falta `atc_code`, los grupos terapéuticos pueden infrarepresentar exposición.
4. **Modelo longitudinal**: la relación medicación-visita se infiere por fechas de inicio/fin; puede requerir ajuste si hay cambios sin fecha fiable.

## 8) Anonimización

Se mantiene estrategia actual:
- IDs internos no se exportan.
- Se usan identificadores anonimizados derivados (`Pxxxx`, `Vxxxxx`) en datasets de salida.
