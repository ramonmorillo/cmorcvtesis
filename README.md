# cmorcvtesis

Primera versión funcional de una app web para tesis doctoral de riesgo cardiovascular en farmacia comunitaria.

## Instalación

```bash
npm install
```

## Variables de entorno

Crea un archivo `.env` a partir de `.env.example`:

```bash
cp .env.example .env
```

Variables requeridas:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Arranque local

```bash
npm run dev
```

La app muestra una pantalla clara de configuración si faltan variables de Supabase.

## Estructura principal

- `src/lib/supabase.ts`: inicialización segura de Supabase y validación de entorno.
- `src/router.tsx`: rutas mínimas requeridas.
- `src/pages/*`: login, pacientes, nuevo paciente, detalle paciente y nueva visita.
- `src/services/*`: capa base para Auth, Patients y Visits.
- `src/components/*`: layout y estados visuales reutilizables.
- `src/styles/main.css`: estilos ligeros y funcionales.
