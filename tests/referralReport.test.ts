import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildParameterOptions,
  buildReferralBlocks,
  buildReferralChrome,
  emptyProblem,
  validateReferralDraft,
  type ReferralDraft,
} from '../src/features/referral-report/referralModel';
import { layoutDocument, serializePdf, type DrawOp } from '../src/features/referral-report/referralPdf';

// Datos 100 % ficticios.
function draft(problemCount: number, longText = false): ReferralDraft {
  const filler = longText
    ? ' Se documenta el hallazgo con detalle para comprobar el ajuste de línea y los saltos de página del documento en informes extensos.'.repeat(4)
    : '';
  return {
    serviceName: 'Servicio de Atención Farmacéutica (ficticio)',
    professionals: 'Farmacéutica responsable: Profesional Ficticia',
    reportDate: '2026-11-03',
    recipient: 'Médico/a de Atención Primaria',
    patientDetails: 'Código de estudio: TEST-01\nEdad en la inclusión: 70 años · Sexo: mujer',
    originVisitLabel: 'Mes 6 · 23/10/2026',
    reason: 'Revisión farmacoterapéutica y optimización del tratamiento crónico.',
    parameters: buildParameterOptions({ systolic_bp: 150, diastolic_bp: 90, heart_rate: null, ldl_mg_dl: 110, hba1c_pct: 7.2 }).map((p) => ({ ...p, include: true })),
    problems: Array.from({ length: problemCount }, (_, i) => ({
      ...emptyProblem(`p${i}`),
      title: `Problema ficticio ${i + 1}`,
      priority: i === 0 ? 'Valoración preferente' : '',
      findings: `La paciente refiere un síntoma ficticio ${i + 1}; no consta registro objetivo.${filler}`,
      relatedMedications: i % 2 === 0 ? 'Medicamento ficticio A 10 mg' : '',
      evidence: i === 0 ? 'Información referida por la paciente, sin confirmación objetiva.' : '',
      interventionDone: i === 2 ? 'Educación sobre el uso correcto del dispositivo.' : '',
      proposal: i !== 2 ? `Valorar la actuación ficticia ${i + 1} según criterio médico.` : '',
    })),
    registeredInterventions: [{ id: 'i1', text: 'Revisión de la medicación (registrada en IRIS)', include: true }],
    generalProposals: '',
    conclusion: 'Se solicita valoración de los problemas descritos.',
    followUp: 'Revisión en la próxima visita del programa.',
    signatureName: 'Profesional Ficticia',
    signatureLicense: '0000',
    signaturePlace: 'Ciudad ficticia',
  };
}

const textOf = (ops: DrawOp[]) => ops.filter((op): op is Extract<DrawOp, { type: 'text' }> => op.type === 'text').map((op) => op.text).join(' ');
const OUT = process.env.REFERRAL_PDF_OUT;

function render(d: ReferralDraft, name: string) {
  const pages = layoutDocument(buildReferralBlocks(d), buildReferralChrome(d, 'TEST-01'));
  const bytes = serializePdf(pages, 'Informe de derivación');
  if (OUT) writeFileSync(`${OUT}/${name}.pdf`, bytes);
  return { pages, bytes };
}

describe('informe de derivación a MAP', () => {
  it('un único problema (informe breve): una página, numerada "Página 1 de 1"', () => {
    const { pages, bytes } = render({ ...draft(1), parameters: [], registeredInterventions: [] }, 'un-problema');
    expect(pages).toHaveLength(1);
    expect(textOf(pages[0].chrome)).toContain('Página 1 de 1');
    expect(new TextDecoder('latin1').decode(bytes.slice(0, 8))).toBe('%PDF-1.4');
  });

  it('cinco problemas: secciones separadas de hallazgos, intervenciones realizadas y propuestas', () => {
    const { pages } = render(draft(5), 'cinco-problemas');
    const all = pages.map((page) => textOf(page.body)).join(' ');
    for (let i = 1; i <= 5; i += 1) expect(all).toContain(`Problema ficticio ${i}`);
    const done = all.indexOf('Intervenciones farmacéuticas realizadas');
    const proposals = all.indexOf('Propuestas para valoración médica');
    expect(done).toBeGreaterThan(all.indexOf('Problemas detectados'));
    expect(proposals).toBeGreaterThan(done);
    expect(all).toContain('VALORACIÓN PREFERENTE'.normalize('NFC').replace('Ó', 'Ó'));
  });

  it('varias páginas: numeración "X de N" coherente, sin páginas vacías ni bloques de problema partidos', () => {
    const { pages } = render(draft(8, true), 'varias-paginas');
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((page, index) => {
      expect(textOf(page.chrome)).toContain(`Página ${index + 1} de ${pages.length}`);
      expect(page.body.some((op) => op.type === 'text')).toBe(true); // ninguna página vacía
    });
    // Cada título de problema está en la misma página que el inicio de sus hallazgos.
    for (let i = 1; i <= 8; i += 1) {
      const page = pages.find((p) => textOf(p.body).includes(`Problema ficticio ${i}`) && textOf(p.body).includes('.'))!;
      expect(textOf(page.body)).toContain(`síntoma ficticio ${i};`.replace('í', 'í'));
    }
    // La firma no se separa de su fecha.
    const signaturePage = pages.find((p) => textOf(p.body).includes('Fdo.:'))!;
    expect(textOf(signaturePage.body)).toContain('Ciudad ficticia');
  });

  it('sin parámetros clínicos: omite la sección y renumera las siguientes', () => {
    const d = { ...draft(1), parameters: [] };
    const all = render(d, 'sin-parametros').pages.map((p) => textOf(p.body)).join(' ');
    expect(all).not.toContain('Parámetros clínicos'.replace('á', 'á'));
    expect(all).toContain('3. Problemas detectados');
  });

  it('parámetros: solo los que constan, con unidades y referencia a la visita de origen', () => {
    const options = buildParameterOptions({ systolic_bp: 163, diastolic_bp: 93, heart_rate: null, hba1c_pct: 6.9, ldl_mg_dl: 93 });
    expect(options.map((o) => `${o.label}: ${o.valueText}`)).toEqual(['Presión arterial: 163/93 mmHg', 'HbA1c: 6,9 %', 'LDL-colesterol: 93 mg/dl']);
    const all = render(draft(1), 'param').pages.map((p) => textOf(p.body)).join(' ');
    expect(all).toContain('(Mes 6 · 23/10/2026)'.replace('·', '·'));
  });

  it('los problemas excluidos o sin título no se incluyen; la validación exige motivo, problema y firmante', () => {
    const d = draft(2);
    d.problems[1].include = false;
    const all = render(d, 'excluido').pages.map((p) => textOf(p.body)).join(' ');
    expect(all).not.toContain('Problema ficticio 2');
    expect(validateReferralDraft(d)).toEqual([]);
    expect(validateReferralDraft({ ...d, reason: '', signatureName: '', problems: [] })).toHaveLength(3);
  });

  it('codifica caracteres españoles y símbolos en WinAnsi (sin "?")', () => {
    const d = { ...draft(1), reason: 'Glucemia ≥ 126 mg/dl; coste 6,90 €; “adherencia” — revisión; µg' };
    const all = render(d, 'caracteres').pages.map((p) => textOf(p.body)).join(' ');
    expect(all).toContain('>= 126');
    expect(all).not.toContain('?');
    expect(all).toContain('\u0080'); // € en WinAnsi
  });
});
