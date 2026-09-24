# Auditoría funcional y de integridad de datos — IRIS Analytics

Fecha: 24 de septiembre de 2026.

## Mapa técnico previo a la corrección

`DashboardPage` carga una sola vez `loadDashboardData()` y renderiza sus agregados sin
transformaciones adicionales.

| Indicador | Fuente / consulta | Cálculo previo | Criterio temporal | Render |
|---|---|---|---|---|
| Basal / 3M / 6M / extraordinarias | `visits` con relaciones a `cmo_scores`, `clinical_assessments` e `interventions` | Conteo de filas por `visit_type` explícito (`baseline`/legado `basal`, `month_3`, `month_6`, `extra`/legado `extraordinary`) | Ninguno; cuenta registros de visita | `DashboardPage`, bloque Seguimiento |
| Sin seguimiento >90 días | Misma consulta de `visits` y catálogo visible de `patients` | Máximo `visit_date` por `patient_id` y comparación con fecha límite | `visit_date`; se incluían también pacientes sin fecha clínica | `DashboardPage`, bloques Seguimiento y Calidad |
| Mejoran / empeoran nivel | `cmo_scores` unido a `visits` | Mapas por `patient_id` | La consulta estaba ordenada por `cmo_scores.created_at`, no por `visits.visit_date` | `DashboardPage`, Evolución clínica |
| Score medio basal | `cmo_scores` unido a `visits` | Media de todas las filas cuyo tipo era basal | Tipo de visita, sin resolver basales duplicadas por paciente | `DashboardPage`, Evolución clínica |
| Score medio última visita | `cmo_scores` unido a `visits` | Primer score por paciente según el orden de creación del score | `cmo_scores.created_at` | `DashboardPage`, Evolución clínica |

Las relaciones persistidas son: `patients.id -> visits.patient_id` y, desde cada
`visits.id`, `cmo_scores.visit_id`, `clinical_assessments.visit_id`,
`questionnaire_responses.visit_id`, `interventions.visit_id` y
`visit_medication_events.visit_id`. Los cuestionarios conservan además
`patient_id`, `visit_type` y un código canónico; una restricción única evita más de
un resultado del mismo cuestionario por visita. La medicación maestra es temporal
por paciente (`start_date`/`end_date`) y sus cambios quedan vinculados a visita en
`visit_medication_events`.

## Problema, causa, riesgo y solución propuesta (registrados antes del cambio)

### Problema demostrado

1. “Última visita” se infería de la fecha de creación del **score**, no de la fecha
   clínica de la visita. Una visita antigua puntuada después de otra más reciente
   pasaba a ser la última.
2. El mapa basal se sobrescribía con cada score del paciente, incluso cuando la
   visita no era basal. Por ello la comparación podía acabar siendo última contra
   una visita arbitraria del mismo paciente.
3. La media basal agregaba filas, no pacientes; dos visitas basales anómalas
   ponderaban dos veces al paciente.
4. Un paciente sin ninguna `visit_date` se contaba como si se hubiera demostrado
   que su última visita ocurrió hace más de 90 días, aunque la antigüedad es
   desconocida.

### Causa raíz

La agregación mezclaba dos conceptos temporales: `cmo_scores.created_at` (momento
de persistencia/recalculo) y `visits.visit_date` (momento clínico). Además, los
mapas longitudinales se rellenaban recorriendo scores sin seleccionar primero las
visitas basal y última de cada paciente.

### Riesgo

Clasificación invertida o espuria de mejoría/empeoramiento, medias no
representativas y alertas de seguimiento sin fecha demostrable. No existe mezcla
directa entre pacientes porque la clave del mapa sí era `patient_id`, pero sí una
selección incorrecta dentro del historial de un mismo paciente.

### Solución mínima propuesta

Centralizar únicamente la agregación longitudinal en una función pura que:

* agrupe por `patient_id`;
* acepte como clínica válida una visita con `visit_date` y no cancelada/no
  presentada;
* elija por fecha clínica (con desempate estable), no por ID ni fecha del score;
* seleccione la basal cronológicamente primera por paciente;
* seleccione primero la última visita válida y use el score de esa misma visita
  (si falta, lo omite de la media en vez de fabricar cero o retroceder a un score
  anterior);
* calcule mejoría como aumento de nivel numérico (1→2/3, 2→3) y empeoramiento
  como disminución;
* no clasifique como `>90 días` una antigüedad desconocida.

No se propone cambiar esquema, RLS, UI, dependencias ni flujos de escritura.

## Consultas SQL independientes para contraste

Estas consultas reproducen la semántica auditada sobre las filas visibles por RLS.

```sql
-- Conteos por tipo explícito (incluye alias históricos aún admitidos).
select
  count(*) filter (where visit_type in ('baseline', 'basal')) as baseline,
  count(*) filter (where visit_type = 'month_3') as month_3,
  count(*) filter (where visit_type = 'month_6') as month_6,
  count(*) filter (where visit_type in ('extra', 'extraordinary')) as extraordinary
from visits;

-- Última visita clínica y pacientes con antigüedad conocida > 90 días.
with last_visit as (
  select patient_id, max(visit_date) as visit_date
  from visits
  where visit_date is not null
    and coalesce(visit_status, '') not in ('cancelled', 'cancelada', 'no_show', 'no_presentada')
  group by patient_id
)
select count(*)
from last_visit
where visit_date < current_date - 90;

-- Basal y última visita por paciente; el score se toma de esas visitas exactas.
with valid as (
  select v.id, v.patient_id, v.visit_type, v.visit_date, s.score, s.priority
  from visits v
  left join cmo_scores s on s.visit_id = v.id
  where v.visit_date is not null
    and coalesce(v.visit_status, '') not in ('cancelled', 'cancelada', 'no_show', 'no_presentada')
), baseline as (
  select distinct on (patient_id) * from valid
  where visit_type in ('baseline', 'basal')
  order by patient_id, visit_date, id
), latest as (
  select distinct on (patient_id) * from valid
  order by patient_id, visit_date desc, id desc
)
select
  count(*) filter (where l.priority > b.priority) as improved,
  count(*) filter (where l.priority < b.priority) as worsened,
  avg(b.score) filter (where b.score is not null) as average_baseline_score,
  avg(l.score) filter (where l.score is not null) as average_latest_score
from baseline b join latest l using (patient_id);
```

No había credenciales de una instancia real en el entorno de auditoría (solo
placeholders en `.env.example`), por lo que no fue posible cotejar cifras de una
cohorte desplegada. El contraste ejecutable se cubre con fixtures longitudinales.

## Integridad longitudinal del modelo

* Score/nivel y parámetros clínicos: una fila por `visit_id` mediante claves
  únicas; las nuevas visitas crean snapshots separados. Reabrir la misma visita
  hace `upsert` y, por diseño, corrige ese snapshot, no otra visita.
* IEXPAC, Morisky-Green, EQ-5D-5L y PAM-10: resultado único por
  `(visit_id, questionnaire_code)`, con trigger que valida el código canónico.
  Esto permite reconstruir paciente, fecha y tipo a través de `visits`.
* Factores CMO: `cmo_scores.factors` conserva el snapshot y
  `cmo_score_item_results` conserva detalle por variable y visita cuando existe
  catálogo.
* Medicación: el estado se asocia a paciente y su vigencia a fechas; los eventos
  longitudinales se asocian a `visit_id` y validan que medicación y visita sean
  del mismo paciente. Analytics no usa actualmente medicación en sus KPI.

Riesgos residuales: no hay restricción de base de datos que garantice una sola
visita basal por paciente; la política documentada elige la primera fecha. Las
consultas agregadas del cliente dependen además del máximo de filas configurado
en la API de Supabase; cohortes que superen ese límite requerirán agregación SQL
servidora o paginación para evitar colecciones parciales.
