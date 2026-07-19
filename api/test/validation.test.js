import test from 'node:test';
import assert from 'node:assert';
import { validateFormDefinition } from '../src/validation.js';

test('Form Validation Suite', async (t) => {
  await t.test('should validate a correct form definition', () => {
    const title = 'Encuesta de Satisfacción';
    const fields = [
      { name: 'nombre', label: 'Nombre Completo', type: 'text', required: true },
      { name: 'edad', label: 'Edad', type: 'number', required: false },
      { name: 'pais', label: 'País', type: 'select', required: true, options: ['España', 'Chile'] }
    ];

    const error = validateFormDefinition(title, fields);
    assert.strictEqual(error, null);
  });

  await t.test('should fail if title is missing or empty', () => {
    const fields = [{ name: 'nombre', label: 'Nombre', type: 'text' }];

    assert.strictEqual(
      validateFormDefinition('', fields),
      'Field title is required and must be a non-empty string'
    );
    assert.strictEqual(
      validateFormDefinition(null, fields),
      'Field title is required and must be a non-empty string'
    );
  });

  await t.test('should fail if fields is not an array', () => {
    assert.strictEqual(
      validateFormDefinition('Test Form', 'not-an-array'),
      'Field fields is required and must be an array'
    );
  });

  await t.test('should fail if a field is missing a name', () => {
    const fields = [{ label: 'Nombre', type: 'text' }];
    assert.strictEqual(
      validateFormDefinition('Test Form', fields),
      'Each field must have a non-empty name (string)'
    );
  });

  await t.test('should fail if a field is missing a label', () => {
    const fields = [{ name: 'nombre', type: 'text' }];
    assert.strictEqual(
      validateFormDefinition('Test Form', fields),
      'Each field must have a non-empty label (string)'
    );
  });

  await t.test('should fail if a field has an invalid type', () => {
    const fields = [{ name: 'nombre', label: 'Nombre', type: 'invalid_type' }];
    assert.strictEqual(
      validateFormDefinition('Test Form', fields),
      'Field type must be one of: text, number, date, select'
    );
  });

  await t.test('should fail if select field type does not have options', () => {
    const fields = [{ name: 'pais', label: 'País', type: 'select' }];
    assert.strictEqual(
      validateFormDefinition('Test Form', fields),
      'Select fields must include a non-empty array of options'
    );

    const fieldsEmptyOptions = [{ name: 'pais', label: 'País', type: 'select', options: [] }];
    assert.strictEqual(
      validateFormDefinition('Test Form', fieldsEmptyOptions),
      'Select fields must include a non-empty array of options'
    );
  });
});
