# Diagnóstico: por qué no se aprecia el “cambio estético” en PDFs tras el merge

## 1) Archivos realmente modificados en el commit del cambio estético

Commit analizado: `53efa7a` (`style(pdf): refine institutional visual presentation`).

Archivos modificados:
- `server/pdf/templates.js`

No se modificó ningún archivo de `src/` en ese commit.

## 2) Alcance real de los cambios

El commit `53efa7a` cambia únicamente estilos CSS del renderer HTML de servidor:
- márgenes de página,
- bordes/radios/sombras de tarjetas,
- tipografías/tamaños/colores,
- espaciados,
- ajuste visual de cabecera y footer.

Estos cambios sí afectan a la **plantilla HTML de PDF del servidor** (`server/pdf/templates.js`), pero **no** al generador de PDF que hoy usa la app en GitHub Pages.

## 3) Qué código genera actualmente el PDF en producción (según el repositorio)

El flujo activo en frontend genera el PDF **en cliente**, sin backend:
- `src/pages/VisitReportsPage.tsx` llama a:
  - `downloadPatientVisitReportPdf(...)`
  - `downloadClinicianVisitReportPdf(...)`
- ambas funciones viven en `src/services/reportService.ts`.
- en `reportService.ts` se construye un PDF “manual” con texto plano (`composePdfDocument`) usando Helvetica Type1 y líneas fijas.

Además, el cambio previo `405a64a` reemplazó la llamada a `/api/reports/pdf` por ese generador cliente.

## 4) Conclusión técnica

El “rediseño visual” no se ve porque se aplicó en `server/pdf/templates.js`, pero el PDF visible al usuario se genera desde `src/services/reportService.ts` con un motor de texto plano que no consume esas plantillas.

En otras palabras:
- Plantilla nueva: existe, en servidor.
- PDF real descargado en producción GitHub Pages: lo genera el cliente con layout de texto plano.
- Resultado: apariencia casi igual aunque se haya mergeado el commit estético.

## 5) Plan mínimo para aplicar polish visual sin tocar lógica funcional

Objetivo: mantener el mismo contenido/derivación de datos, cambiando solo capa de presentación PDF.

### Opción A (recomendada para GitHub Pages, sin backend)
1. Mantener `loadVisitReportData` y toda la lógica de negocio actual.
2. Sustituir únicamente `buildPdfBlob/composePdfDocument` por generación HTML+CSS en cliente.
3. Renderizar una plantilla HTML institucional (equivalente a `server/pdf/templates.js`) y convertir a PDF con una librería client-side fiable.
4. Reutilizar los mismos campos/textos actuales para no alterar reglas funcionales.

### Opción B (si se habilita backend)
1. Reactivar endpoint `/api/reports/pdf`.
2. Usar `server/pdf/generator.js` + `server/pdf/templates.js` como fuente única visual.
3. Frontend solo solicita el binario PDF al backend.

### Criterio de cierre
- Misma información clínica que hoy.
- Diferencia visible en cabecera, tarjetas, tipografía y footer institucional.
- Validación visual con 2 muestras (paciente y médico) sobre la misma visita.
