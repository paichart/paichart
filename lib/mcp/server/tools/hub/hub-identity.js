/**
 * Which install is this hub? — a FACT the hub reports about itself (2026-11-14, register SELFHOST-CONNECTION-NAME).
 *
 * WHY. An AI client names its connections itself, and the hosted site and every self-host answer `initialize` with the same
 * `serverInfo` and the same instructions. So a session that holds two pAIchart connections (a self-host, and the hosted site
 * through an account connector) had only the NAME the user chose to tell them apart — a hint, not a fact (Protocol 10). The hub
 * knows its own public origin (`APP_BASE_URL`, lib/auth/public-base-url.ts); this states it, on the call a client already makes
 * to learn who it is (`registry(action:'list')`).
 *
 * THE ONE RULE: never report the built-in fallback origin as this hub's address. An env-blind process derives the hosted origin
 * as its fallback; a self-host that left `APP_BASE_URL` unset would otherwise announce itself as the hosted site — the exact
 * confusion this exists to remove. Unset ⇒ `baseUrl: null`, `source: 'not-set'`.
 *
 * It is information, not a control: it lets a client KNOW which hub it is on; it does not stop a call to another one.
 */
const { PUBLIC_BASE_URL, PUBLIC_BASE_URL_SOURCE } = require('../../../../auth/public-base-url');

function getHubIdentity() {
  if (PUBLIC_BASE_URL_SOURCE === 'env') {
    return { baseUrl: PUBLIC_BASE_URL, source: 'APP_BASE_URL' };
  }
  return {
    baseUrl: null,
    source: 'not-set',
    note: 'APP_BASE_URL is not set on this hub, so it cannot state its own address.'
  };
}

module.exports = { getHubIdentity };
