import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

type CimaMedicationDto = {
  external_id: string;
  source: 'external_cima';
  source_code: string | null;
  display_name: string;
  active_ingredient: string | null;
  strength: string | null;
  form: string | null;
  route: string | null;
  atc_code: string | null;
  authorization_status: string | null;
  commercialized: boolean | null;
  labtitular: string | null;
  cima_nregistro: string | null;
  raw_payload: Record<string, unknown>;
};

type CimaApiRecord = Record<string, unknown>;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function pickText(record: CimaApiRecord, keys: string[]): string | null {
  for (const key of keys) {
    const candidate = asText(record[key]);
    if (candidate) return candidate;
  }
  return null;
}

function pickBoolean(record: CimaApiRecord, keys: string[]): boolean | null {
  for (const key of keys) {
    const candidate = asBoolean(record[key]);
    if (candidate !== null) return candidate;
  }
  return null;
}

function mapCimaRecordToDto(record: CimaApiRecord, index: number): CimaMedicationDto | null {
  const displayName = pickText(record, ['nombre', 'name', 'nombre_comercial', 'descripcion']);
  if (!displayName) {
    return null;
  }

  const sourceCode = pickText(record, ['cn', 'codigo', 'codigo_nacional']);
  const nregistro = pickText(record, ['nregistro']);
  const externalId = sourceCode ?? nregistro ?? `${displayName.toLowerCase()}-${index}`;

  return {
    external_id: externalId,
    source: 'external_cima',
    source_code: sourceCode,
    display_name: displayName,
    active_ingredient: pickText(record, ['pactivos', 'principio_activo', 'active_ingredient']),
    strength: pickText(record, ['dosis', 'strength', 'concentracion']),
    form: pickText(record, ['formaFarmaceutica', 'forma_farmaceutica', 'form']),
    route: pickText(record, ['viasAdministracion', 'via_administracion', 'route']),
    atc_code: pickText(record, ['atc', 'atc_code']),
    authorization_status: pickText(record, ['estado', 'authorization_status']),
    commercialized: pickBoolean(record, ['comerc', 'commercialized']),
    labtitular: pickText(record, ['labtitular', 'laboratorio']),
    cima_nregistro: nregistro,
    raw_payload: record,
  };
}

function extractCimaRecords(payload: unknown): CimaApiRecord[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const asObject = payload as Record<string, unknown>;
  const candidates = [asObject.resultados, asObject.results, asObject.items, asObject].find((value) => Array.isArray(value));
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates.filter((item): item is CimaApiRecord => Boolean(item && typeof item === 'object'));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = (await req.json()) as { query?: unknown; limit?: unknown };
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    const limit = typeof body.limit === 'number' && Number.isFinite(body.limit) ? Math.max(1, Math.min(50, body.limit)) : 20;

    if (query.length < 2) {
      return new Response(JSON.stringify({ items: [] }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const url = `https://cima.aemps.es/cima/rest/medicamentos?nombre=${encodeURIComponent(query)}`;
    const cimaResponse = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!cimaResponse.ok) {
      return new Response(JSON.stringify({ error: `CIMA response ${cimaResponse.status}` }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const payload = (await cimaResponse.json()) as unknown;
    const items = extractCimaRecords(payload)
      .map((record, index) => mapCimaRecordToDto(record, index))
      .filter((item): item is CimaMedicationDto => Boolean(item))
      .slice(0, limit);

    return new Response(JSON.stringify({ items }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
