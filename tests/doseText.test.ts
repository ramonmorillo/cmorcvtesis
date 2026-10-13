import { describe, expect, it } from 'vitest';

import { buildDoseText, splitSavedDoseText } from '../src/features/medications/doseText';

describe('dosis de medicación', () => {
  it('reparte una dosis estructurada en cantidad y unidad sin duplicarla en texto libre', () => {
    expect(splitSavedDoseText('850 mg')).toEqual({ dose_amount: '850', dose_unit_hint: 'mg', dose_text: '' });
    expect(splitSavedDoseText('2.5 mg')).toEqual({ dose_amount: '2,5', dose_unit_hint: 'mg', dose_text: '' });
  });

  it('conserva íntegra una dosis descriptiva como texto libre (no la trunca a la cantidad)', () => {
    const fields = splitSavedDoseText('1 comprimido tras desayuno');
    expect(fields).toEqual({ dose_amount: '', dose_unit_hint: '', dose_text: '1 comprimido tras desayuno' });
    expect(buildDoseText(fields)).toBe('1 comprimido tras desayuno');
  });

  it('guarda la edición de una dosis ya guardada', () => {
    const structured = splitSavedDoseText('850 mg');
    expect(buildDoseText({ ...structured, dose_amount: '1000' })).toBe('1000 mg');

    const free = splitSavedDoseText('1 comprimido tras desayuno');
    expect(buildDoseText({ ...free, dose_text: '2 comprimidos tras desayuno' })).toBe('2 comprimidos tras desayuno');
  });

  it('no descarta el texto libre cuando también hay cantidad', () => {
    expect(buildDoseText({ dose_amount: '850', dose_unit_hint: 'mg', dose_text: 'tras desayuno' })).toBe('850 mg · tras desayuno');
    expect(buildDoseText({ dose_amount: '850', dose_unit_hint: 'mg', dose_text: '850 mg' })).toBe('850 mg');
  });

  it('una dosis guardada y releída sin cambios produce el mismo texto', () => {
    for (const saved of ['850 mg', '10 UI', '5 ml', '1 comprimido tras desayuno', '850 mg · tras desayuno', '20']) {
      expect(buildDoseText(splitSavedDoseText(saved))).toBe(saved);
    }
  });
});
