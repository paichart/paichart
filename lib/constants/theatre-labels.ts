/**
 * Sales-theatre display labels — ONE map (2026-09-08).
 *
 * `SalesTheatre` is a Prisma enum (NORTH_AMERICA, LAC, EMEA, APJ) stored in POV, user and country rows; the enum
 * VALUE never changes here — only what people read. Before this file the label lived in six `switch` statements
 * that disagreed with each other (one widget showed "Latin America & Caribbean" next to "EMEA"), and the Bloomberg
 * abbreviation map had keys that are not enum values. Steve (2026-09-08): NORTH_AMERICA reads "America".
 *
 * Use `theatreLabel` where the full name fits (tables, tooltips, legends) and `theatreShort` where a code does
 * (filter chips, compact headers). Both fall back to the raw value with underscores spaced, so an enum value added
 * later still renders — and test:theatre-labels fails until it gets a proper label.
 */
import type { SalesTheatre } from '@prisma/client';

type TheatreKey = SalesTheatre | (string & {});

export const THEATRE_LABELS: Record<SalesTheatre, string> = {
  NORTH_AMERICA: 'America',
  LAC: 'Latin America & Caribbean',
  EMEA: 'Europe, Middle East & Africa',
  APJ: 'Asia Pacific & Japan',
};

export const THEATRE_SHORT: Record<SalesTheatre, string> = {
  NORTH_AMERICA: 'America',
  LAC: 'LAC',
  EMEA: 'EMEA',
  APJ: 'APJ',
};

/** Bloomberg-style abbreviation (2–4 caps) for the dense views. */
export const THEATRE_ABBREV: Record<SalesTheatre, string> = {
  NORTH_AMERICA: 'AMER',
  LAC: 'LAC',
  EMEA: 'EMEA',
  APJ: 'APJ',
};

const fallback = (t: TheatreKey) => String(t).replace(/_/g, ' ');
export const theatreLabel = (t: TheatreKey): string => THEATRE_LABELS[t as SalesTheatre] ?? fallback(t);
export const theatreShort = (t: TheatreKey): string => THEATRE_SHORT[t as SalesTheatre] ?? fallback(t);
export const theatreAbbrev = (t: TheatreKey): string => THEATRE_ABBREV[t as SalesTheatre] ?? String(t);
