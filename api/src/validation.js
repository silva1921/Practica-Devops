/**
 * Validates the structure of a dynamic form definition.
 * @param {string} title 
 * @param {Array} fields 
 * @returns {string|null} Error message if invalid, null if valid.
 */
export function validateFormDefinition(title, fields) {
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return 'Field title is required and must be a non-empty string';
  }
  if (!Array.isArray(fields)) {
    return 'Field fields is required and must be an array';
  }

  for (const field of fields) {
    if (!field.name || typeof field.name !== 'string' || field.name.trim() === '') {
      return 'Each field must have a non-empty name (string)';
    }
    if (!field.label || typeof field.label !== 'string' || field.label.trim() === '') {
      return 'Each field must have a non-empty label (string)';
    }
    const allowedTypes = ['text', 'number', 'date', 'select'];
    if (!allowedTypes.includes(field.type)) {
      return `Field type must be one of: ${allowedTypes.join(', ')}`;
    }
    if (field.type === 'select' && (!Array.isArray(field.options) || field.options.length === 0)) {
      return 'Select fields must include a non-empty array of options';
    }
  }
  return null; // Valid
}
