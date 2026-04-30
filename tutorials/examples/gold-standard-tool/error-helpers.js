/**
 * Centralised error helpers for the weather tool (Gold Standard 8).
 *
 * Helpers RETURN structured Error objects. The transport-boundary catch in
 * server.js converts thrown errors into MCP envelopes — that is the
 * GS7 + GS8 reconciliation: helpers throw deep, the boundary returns the envelope.
 *
 * Each helper produces a four-emoji error format: ❌ failure summary,
 * 🔍 error type, 💡 suggestion, 🔧 recovery. AI clients parse this format
 * reliably without needing JSON.
 */

/**
 * @param {string} city - The city the caller asked for
 * @param {string[]} availableCities - Cities the server has data for
 * @returns {Error} structured NOT_FOUND error with fuzzy suggestions
 */
function weatherNotFoundError(city, availableCities) {
  const suggestions = availableCities
    .map(name => ({ name, score: similarity(city.toLowerCase(), name) }))
    .filter(s => s.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const lines = [
    `❌ Weather lookup failed: no data for "${city}"`,
    '',
    `🔍 Error Type: NOT_FOUND`,
    `💡 Suggestion: city "${city}" is not in the dataset`
  ];

  if (suggestions.length > 0) {
    lines.push(
      '',
      `Did you mean: ${suggestions.map(s => `"${s.name}" (${Math.round(s.score * 100)}%)`).join(', ')}?`
    );
  }

  lines.push(
    '',
    'Available cities:',
    ...availableCities.map(c => `  • ${c}`),
    '',
    '🔧 Recovery: pick one of the cities above, or check spelling.'
  );

  return new Error(lines.join('\n'));
}

/**
 * @param {string} param - Parameter name that failed validation
 * @param {*} value - The value that was passed (or undefined)
 * @param {string} expected - Plain-English description of what was expected
 * @returns {Error} structured VALIDATION error
 */
function weatherValidationError(param, value, expected) {
  return new Error([
    `❌ Weather lookup failed: invalid parameter "${param}"`,
    '',
    `🔍 Error Type: VALIDATION`,
    `💡 Suggestion: parameter "${param}" must be ${expected}, got ${value === undefined ? 'undefined' : `"${value}"`}`,
    '',
    '🔧 Recovery: pass the parameter as described.',
    'Example: get_weather(city: "London")'
  ].join('\n'));
}

// Dice coefficient — simple, no dependencies, good enough for a demo
function similarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const aBigrams = new Set();
  for (let i = 0; i < a.length - 1; i++) aBigrams.add(a.slice(i, i + 2));
  let matches = 0;
  for (let i = 0; i < b.length - 1; i++) {
    if (aBigrams.has(b.slice(i, i + 2))) matches++;
  }
  return (2 * matches) / (a.length + b.length - 2);
}

module.exports = {
  weatherNotFoundError,
  weatherValidationError
};
