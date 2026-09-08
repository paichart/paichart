#!/usr/bin/env node
/**
 * Seed sales theatres' countries and regions — DATA-DRIVEN (2026-09-08, self-host option A).
 *
 *   node scripts/seed-geographical-data.js                       # ships data/geographical-default.json
 *   node scripts/seed-geographical-data.js --file my-geo.json     # your own set, same shape
 *
 * Shape:  { "<SalesTheatre>": [ { "name", "code", "regions": [ { "name", "type": "<RegionType>|null" } ] } ] }
 * Rules:  ADD-ONLY — a country whose `code` already exists is skipped (its regions untouched); nothing is renamed
 *         or deleted (edit those in the database or a future admin page). Theatres are the Prisma `SalesTheatre`
 *         ENUM — a key that is not an enum value fails loudly here: adding a theatre is a schema change
 *         (`prisma/schema.prisma` → `npx prisma db push`), see .claude/knowledge/guides/GEOGRAPHICAL_DATA_MANAGEMENT.md.
 * Env:    reads DATABASE_URL from the environment (db:seed provides it; run alone: `set -a; . ./.env; set +a`).
 * Exit:   non-zero on any error (the previous version swallowed errors and exited 0).
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient, SalesTheatre, RegionType } = require('@prisma/client');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'geographical-default.json');

function parseArgs(argv) {
  const i = argv.indexOf('--file');
  return { file: i !== -1 && argv[i + 1] ? path.resolve(argv[i + 1]) : DEFAULT_FILE };
}

/** Pure validation — exported for the gate test. Returns a list of problems (empty = valid). */
function validateGeographicalData(data) {
  const problems = [];
  const theatres = new Set(Object.values(SalesTheatre));
  const types = new Set(Object.values(RegionType));
  const codes = new Map();
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['top level must be an object keyed by SalesTheatre'];
  for (const [theatre, countries] of Object.entries(data)) {
    if (!theatres.has(theatre)) { problems.push(`unknown theatre "${theatre}" — SalesTheatre is an enum (${[...theatres].join(', ')}); adding one is a schema change`); continue; }
    if (!Array.isArray(countries)) { problems.push(`${theatre}: must be an array of countries`); continue; }
    countries.forEach((c, i) => {
      const where = `${theatre}[${i}]`;
      if (!c || typeof c.name !== 'string' || !c.name.trim()) problems.push(`${where}: name required`);
      if (typeof c.code !== 'string' || !/^[A-Z]{2,3}$/.test(c.code)) problems.push(`${where}: code must be 2–3 upper-case letters (an ISO code, or a short pseudo-code such as SEA; got ${JSON.stringify(c.code)})`);
      else if (codes.has(c.code)) problems.push(`${where}: duplicate code ${c.code} (also ${codes.get(c.code)})`);
      else codes.set(c.code, where);
      if (c.regions !== undefined && !Array.isArray(c.regions)) problems.push(`${where}: regions must be an array`);
      (Array.isArray(c.regions) ? c.regions : []).forEach((r, j) => {
        if (!r || typeof r.name !== 'string' || !r.name.trim()) problems.push(`${where}.regions[${j}]: name required`);
        if (r.type !== undefined && r.type !== null && !types.has(r.type)) problems.push(`${where}.regions[${j}]: type must be one of ${[...types].join(', ')} or null (custom region)`);
      });
    });
  }
  return problems;
}

async function seedGeographicalData(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  const problems = validateGeographicalData(data);
  if (problems.length) {
    console.error(`❌ ${file} is not valid:\n  - ${problems.join('\n  - ')}`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  let created = 0, skipped = 0, regions = 0;
  try {
    console.log(`Seeding geographical data from ${file}`);
    for (const [theatre, countries] of Object.entries(data)) {
      console.log(`\nTheatre ${theatre}`);
      for (const countryData of countries) {
        const existing = await prisma.country.findFirst({ where: { code: countryData.code } });
        if (existing) { console.log(`  ${countryData.name} (${countryData.code}) exists — skipped`); skipped++; continue; }
        const country = await prisma.country.create({ data: { name: countryData.name, code: countryData.code, theatre } });
        created++;
        console.log(`  created ${country.name} (${country.code})`);
        for (const regionData of countryData.regions || []) {
          await prisma.region.create({ data: { name: regionData.name, type: regionData.type ?? null, countryId: country.id } });
          regions++;
          console.log(`    region ${regionData.name}${regionData.type ? ` (${regionData.type})` : ''}`);
        }
      }
    }
    console.log(`\n✅ Geographical data: ${created} countries created (${regions} regions), ${skipped} already present — add-only, nothing renamed or deleted.`);
  } finally {
    await prisma.$disconnect();
  }
}

module.exports = { validateGeographicalData, DEFAULT_FILE };

if (require.main === module) {
  seedGeographicalData(parseArgs(process.argv).file).catch((err) => {
    console.error('❌ Error seeding geographical data:', err && err.message ? err.message : err);
    process.exit(1);
  });
}
