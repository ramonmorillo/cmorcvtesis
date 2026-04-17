# cmorcvtesis

Aplicación web ligera para la tesis doctoral de riesgo cardiovascular en farmacia comunitaria.

## Arquitectura implementada

- **Frontend**: React + Vite (SPA ligera con `createHashRouter` para servir correctamente en GitHub Pages).
- **Backend real**: Supabase (Auth + tablas `patients`, `visits`, `clinical_assessments`, `interventions`, `cmo_config`).
- **Despliegue**: GitHub Pages mediante GitHub Actions, publicando `dist/`.

## Requisitos

```bash
npm install
cp .env.example .env
```

Variables obligatorias:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Si faltan variables, la app muestra pantalla explícita de configuración (sin pantalla en blanco).

## Desarrollo

```bash
npm run dev
```

## Build producción

```bash
npm run build
```

La configuración `base: '/cmorcvtesis/'` evita rutas rotas en Pages.

## GitHub Pages

Workflow: `.github/workflows/deploy-pages.yml`.

1. Configura en el repositorio:
   - **Settings → Pages → Build and deployment → Source = GitHub Actions**.
2. Añade secrets del repo:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Haz push a `main`.

## Pantallas incluidas

1. Login
2. Dashboard
3. Listado de pacientes
4. Alta de paciente
5. Ficha de paciente
6. Nueva visita
7. Estratificación basal (evaluación clínica + cálculo prioridad)
8. Registro de intervenciones

## Motor CMO (v1 operativa)

- Fuente de configuración principal: `cmo_config.config_json`.
- Si no hay configuración activa en DB, se inserta una configuración inicial editable.
- Cálculo transparente por contribuciones:
  - SCORE2, Framingham, PA sistólica, LDL, HbA1c, IMC, cintura
  - tabaquismo, actividad física baja, dieta desfavorable
  - medicación de alto riesgo y eventos adversos
- Resultado:
  - puntuación total
  - prioridad 1/2/3
  - recomendaciones por nivel (siendo Prioridad 1 la de mayor intensidad de intervención)
