/**
 * Validates if a date string is a valid YYYY-MM-DD date.
 * @param {string} dateString
 * @returns {boolean}
 */
export function isValidDate(dateString) {
  const regEx = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateString.match(regEx)) return false;
  const d = new Date(dateString);
  const dNum = d.getTime();
  if (!dNum && dNum !== 0) return false;
  return d.toISOString().slice(0, 10) === dateString;
}

/**
 * Validates and computes statistics for a submission given a form definition.
 * Pure function — no database calls.
 * @param {Array} fields   - form.fields from DB
 * @param {Object} answers - submission.answers from DB
 * @returns {{ validationErrors: string[], statistics: object, analysisReport: object }}
 */
export function validateAndAnalyzeSubmission(fields, answers) {
  const validationErrors = [];
  const statistics = {
    total_fields: fields.length,
    answered_fields: 0,
    text_word_count: 0,
    numeric_values: [],
  };

  for (const field of fields) {
    const answer = answers[field.name];
    const hasValue = answer !== undefined && answer !== null && String(answer).trim() !== '';

    if (hasValue) {
      statistics.answered_fields++;

      if (field.type === 'number') {
        const numVal = Number(answer);
        if (isNaN(numVal)) {
          validationErrors.push(`Field '${field.label}' must be a valid number.`);
        } else {
          statistics.numeric_values.push(numVal);
        }
      } else if (field.type === 'date') {
        if (!isValidDate(String(answer))) {
          validationErrors.push(`Field '${field.label}' must be a valid date in YYYY-MM-DD format.`);
        }
      } else if (field.type === 'select') {
        if (!field.options.includes(answer)) {
          validationErrors.push(`Field '${field.label}' selected value is not among permissible options.`);
        }
      } else if (field.type === 'text') {
        const words = String(answer).trim().split(/\s+/).filter(w => w.length > 0);
        statistics.text_word_count += words.length;
      }
    } else {
      if (field.required) {
        validationErrors.push(`Field '${field.label}' is required.`);
      }
    }
  }

  const completion_percentage = fields.length > 0
    ? Math.round((statistics.answered_fields / statistics.total_fields) * 100)
    : 0;

  const numeric_average = statistics.numeric_values.length > 0
    ? Number((statistics.numeric_values.reduce((a, b) => a + b, 0) / statistics.numeric_values.length).toFixed(2))
    : 0;

  const analysisReport = {
    analyzed_at: new Date().toISOString(),
    completion_percentage: `${completion_percentage}%`,
    fields_summary: {
      total: statistics.total_fields,
      answered: statistics.answered_fields,
      unanswered: statistics.total_fields - statistics.answered_fields,
    },
    metrics: {
      total_words_written: statistics.text_word_count,
      numeric_inputs_count: statistics.numeric_values.length,
      average_of_numeric_inputs: numeric_average,
    },
    validation: {
      passed: validationErrors.length === 0,
      errors_count: validationErrors.length,
    },
  };

  return { validationErrors, analysisReport };
}
