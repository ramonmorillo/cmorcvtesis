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
- El servicio usa `questionnaire_code` como identidad canónica del instrumento.
- `measurement_id -> questionnaire_type` queda únicamente como compatibilidad para datos heredados durante la transición.

## Trazabilidad
- La completitud se calcula por la combinación exacta `visit_id + questionnaire_code`.
- El paciente y el momento de seguimiento se obtienen de la relación `visit_id -> visits(patient_id, visit_type)`.
- La generación de informes valida esa relación y bloquea el PDF si detecta un paciente, una visita o un momento discordantes.
- `total_score` y `secondary_score` no se usan para completitud en esta pantalla; solo para resumen/deltas.
