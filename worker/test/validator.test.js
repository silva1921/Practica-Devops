import test from 'node:test';
import assert from 'node:assert';
import { isValidDate, validateAndAnalyzeSubmission } from '../src/validator.js';

// ───────────────────────────────────────────────
// Date Validation Tests
// ───────────────────────────────────────────────
test('Date Validation', async (t) => {
  await t.test('should accept valid ISO dates', () => {
    assert.strictEqual(isValidDate('2024-01-15'), true);
    assert.strictEqual(isValidDate('2000-12-31'), true);
  });

  await t.test('should reject invalid date strings', () => {
    assert.strictEqual(isValidDate('15-01-2024'), false);  // Wrong format
    assert.strictEqual(isValidDate('not-a-date'), false);
    assert.strictEqual(isValidDate('2024-13-01'), false);  // Invalid month
    assert.strictEqual(isValidDate('2024-00-10'), false);  // Month zero
  });
});

// ───────────────────────────────────────────────
// Submission Validation & Analytics Tests
// ───────────────────────────────────────────────
test('Submission Validation & Analytics Suite', async (t) => {
  const testFields = [
    { name: 'nombre', label: 'Nombre Completo', type: 'text', required: true },
    { name: 'edad', label: 'Edad', type: 'number', required: true },
    { name: 'nacimiento', label: 'Fecha de Nacimiento', type: 'date', required: false },
    { name: 'pais', label: 'País', type: 'select', required: true, options: ['Colombia', 'España', 'México'] },
    { name: 'comentarios', label: 'Comentarios', type: 'text', required: false },
  ];

  await t.test('should pass and compute correct analytics for a complete valid submission', () => {
    const answers = {
      nombre: 'Cristian Silva',
      edad: '28',
      nacimiento: '1996-05-20',
      pais: 'Colombia',
      comentarios: 'Todo excelente muy bueno',
    };

    const { validationErrors, analysisReport } = validateAndAnalyzeSubmission(testFields, answers);

    assert.strictEqual(validationErrors.length, 0);
    assert.strictEqual(analysisReport.validation.passed, true);
    assert.strictEqual(analysisReport.completion_percentage, '100%');
    assert.strictEqual(analysisReport.fields_summary.answered, 5);
    // "Cristian Silva" = 2 words + "Todo excelente muy bueno" = 4 words = 6
    assert.strictEqual(analysisReport.metrics.total_words_written, 6);
    assert.strictEqual(analysisReport.metrics.average_of_numeric_inputs, 28);
  });

  await t.test('should fail when a required field is missing', () => {
    const answers = {
      // nombre is missing
      edad: '28',
      pais: 'Colombia',
    };

    const { validationErrors } = validateAndAnalyzeSubmission(testFields, answers);
    assert.ok(validationErrors.length > 0);
    assert.ok(validationErrors.some(e => e.includes('Nombre Completo')));
  });

  await t.test('should fail when a number field receives text', () => {
    const answers = {
      nombre: 'Cristian',
      edad: 'veintiocho', // invalid number
      pais: 'Colombia',
    };

    const { validationErrors, analysisReport } = validateAndAnalyzeSubmission(testFields, answers);
    assert.ok(validationErrors.some(e => e.includes('Edad')));
    assert.strictEqual(analysisReport.validation.passed, false);
  });

  await t.test('should fail when a date field has an invalid format', () => {
    const answers = {
      nombre: 'Cristian',
      edad: '28',
      nacimiento: '20/05/1996', // wrong format
      pais: 'Colombia',
    };

    const { validationErrors } = validateAndAnalyzeSubmission(testFields, answers);
    assert.ok(validationErrors.some(e => e.includes('Fecha de Nacimiento')));
  });

  await t.test('should fail when a select answer is not a valid option', () => {
    const answers = {
      nombre: 'Cristian',
      edad: '28',
      pais: 'Australia', // not in options
    };

    const { validationErrors } = validateAndAnalyzeSubmission(testFields, answers);
    assert.ok(validationErrors.some(e => e.includes('País')));
  });

  await t.test('should compute correct numeric average for multiple number fields', () => {
    const numFields = [
      { name: 'a', label: 'A', type: 'number', required: true },
      { name: 'b', label: 'B', type: 'number', required: true },
      { name: 'c', label: 'C', type: 'number', required: true },
    ];
    const answers = { a: '10', b: '20', c: '30' };

    const { analysisReport } = validateAndAnalyzeSubmission(numFields, answers);
    assert.strictEqual(analysisReport.metrics.average_of_numeric_inputs, 20);
  });

  await t.test('should compute correct completion percentage for partial responses', () => {
    const answers = {
      nombre: 'Cristian',
      // edad missing (required), nacimiento missing (not required), pais missing (required)
    };

    const { analysisReport } = validateAndAnalyzeSubmission(testFields, answers);
    // 1 out of 5 answered = 20%
    assert.strictEqual(analysisReport.completion_percentage, '20%');
    assert.strictEqual(analysisReport.fields_summary.answered, 1);
    assert.strictEqual(analysisReport.fields_summary.unanswered, 4);
  });
});
