# Trazabilidad de completitud de cuestionarios (ficha paciente)

## Pantalla implicada
- `src/pages/PatientDetailPage.tsx`

## Cálculo de estado "Completos/Pendientes"
- La función `isVisitQuestionnaireComplete` decide completitud por `visit_id` y por presencia de los tipos requeridos `iexpac`, `morisky`, `eq5d`.
- El estado de la tabla "Longitudinalidad" usa esa función para mostrar `Completos` o `Pendientes`.
- El aviso "Faltan cuestionarios obligatorios" usa esa misma función sobre visitas basal/final.

## Lectura de `questionnaire_responses`
- La pantalla llama `getQuestionnairesByPatient(id)`.
- `getQuestionnairesByPatient` consulta `questionnaire_responses` por `visit_id`.
- El servicio resuelve `measurement_id -> questionnaire_type` mediante `questionnaire_measurement_map`.

## Acoplamiento al modelo viejo
- La completitud NO usa `questionnaire_type` de BD directamente; lo deriva desde `measurement_id`.
- Sí existe acoplamiento interno a la etiqueta lógica `questionnaire_type` (derivada) porque la completitud se basa en `Set<questionnaire_type>`.
- `total_score` y `secondary_score` no se usan para completitud en esta pantalla; solo para resumen/deltas.
