/**
 * Shared inline-output hard-truncation helper. Returns the (possibly truncated) text PLUS a structured
 * truncation FACT (Protocol 10 — never a recovery verdict; the recovery ROUTE lives in nextSteps / resource
 * links, NOT in this marker, and there is no tool name here). Unit is characters.
 *
 * SINGLE SOURCE OF TRUTH for inline-output capping: the connector fetch surface (_capContent delegates here)
 * AND the agent.results verbose ceiling (V1, 2026-06-09). Keeping ONE implementation means the truncation
 * signal stays consistent across tools and the two agent.results guards can't drift on the cap logic.
 *
 * @param {string} text
 * @param {number} maxSize  max chars returned inline
 * @returns {{ text: string, truncation: {truncated:boolean, returnedChars:number, totalChars:number}|null }}
 */
function capText(text, maxSize = 50000) {
  if (!text || typeof text !== 'string' || text.length <= maxSize) {
    return { text, truncation: null };
  }
  const totalChars = text.length;
  return {
    text: text.substring(0, maxSize)
      + `\n\n--- [Truncated: returned ${maxSize} of ${totalChars} characters] ---`,
    truncation: { truncated: true, returnedChars: maxSize, totalChars },
  };
}

module.exports = { capText };
