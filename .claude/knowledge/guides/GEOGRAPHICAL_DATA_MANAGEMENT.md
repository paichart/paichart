# Geographical Data Management Guide

**Purpose:** Step-by-step instructions for adding/changing geographical data in the pAIchart system

**Last Updated:** 2025-12-16
**Architecture:** Single-tenant with hard-coded SalesTheatre enum

---

## 📚 Table of Contents

1. [System Overview](#system-overview)
2. [Adding a New Sales Theatre](#adding-a-new-sales-theatre) (Rare - Initial Setup)
3. [Adding a New Country](#adding-a-new-country) (Common)
4. [Adding a New Region](#adding-a-new-region) (Common)
5. [Modifying Existing Data](#modifying-existing-data)
6. [Testing Changes](#testing-changes)
7. [Troubleshooting](#troubleshooting)

---

## System Overview

### Current Architecture

```
SalesTheatre (Hard-coded Enum) ← Requires code changes
    ↓
Country (Database Table) ← Just update seed script
    ↓
Region (Database Table) ← Just update seed script
```

### Files You'll Work With

| File | Purpose | Frequency |
|------|---------|-----------|
| `/prisma/schema.prisma` | Define SalesTheatre enum | Rare (setup only) |
| `/scripts/seed-geographical-data.js` | Define countries & regions | Common |
| `/lib/validation/enum-validation.ts` | Theatre validation | Rare (if needed) |

---

## ⭐ New Feature: Optional Region Types (2025-12-16)

**Summary:** RegionType is now OPTIONAL, giving you flexibility to use custom region names without forced directional types.

### What Changed

**Schema Change:**
```prisma
// BEFORE (Required)
model Region {
  type      RegionType   // Must be: NORTH, SOUTH, EAST, WEST, or CENTRAL
}

// AFTER (Optional)
model Region {
  type      RegionType?  // Can be directional type OR null for custom names
}
```

**Impact:** Zero breaking changes - existing regions keep their types, new regions can choose.

---

### Why This Matters

**Problem Before:**
You were **forced** to pick from 5 directional types even when they didn't fit your business structure:

```javascript
// Forced to use geographic type when you really meant business division
{
  name: 'Metropolitan Hub',
  type: RegionType.CENTRAL  // ← Doesn't really fit, but required
}
```

**Solution Now:**
You can use `type: null` for custom region names that match your actual business structure:

```javascript
// Use custom names without forced directional types
{
  name: 'Metropolitan Hub',
  type: null  // ← Now allowed!
}
```

---

### Before & After Examples

#### Example 1: Business Unit Structure

**BEFORE (Forced directional types):**
```javascript
{
  name: 'Canada',
  code: 'CA',
  regions: [
    { name: 'Enterprise Division', type: RegionType.EAST },    // ← Forced choice
    { name: 'SMB Division', type: RegionType.WEST },           // ← Forced choice
    { name: 'Public Sector', type: RegionType.CENTRAL },       // ← Forced choice
  ]
}
```

**Problem:** Division names have nothing to do with EAST/WEST/CENTRAL

**AFTER (Optional types):**
```javascript
{
  name: 'Canada',
  code: 'CA',
  regions: [
    { name: 'Enterprise Division', type: null },  // ✅ Makes sense!
    { name: 'SMB Division', type: null },         // ✅ Clear meaning
    { name: 'Public Sector', type: null },        // ✅ No confusion
  ]
}
```

**Benefit:** Region names match your actual business structure

---

#### Example 2: Metropolitan Areas

**BEFORE (Awkward fit):**
```javascript
{
  name: 'United States',
  code: 'US',
  regions: [
    { name: 'New York Metro', type: RegionType.NORTH },    // ← Actually East Coast
    { name: 'San Francisco Bay', type: RegionType.WEST },  // ✅ This one fits
    { name: 'Chicago Metro', type: RegionType.CENTRAL },   // ✅ This one fits
    { name: 'Miami Metro', type: RegionType.SOUTH },       // ✅ This one fits
  ]
}
```

**AFTER (Consistent naming):**
```javascript
{
  name: 'United States',
  code: 'US',
  regions: [
    { name: 'New York Metro', type: null },      // ✅ No forced geography
    { name: 'San Francisco Bay', type: null },   // ✅ Clear metro name
    { name: 'Chicago Metro', type: null },       // ✅ Consistent pattern
    { name: 'Miami Metro', type: null },         // ✅ Easy to understand
  ]
}
```

**Benefit:** Consistent naming pattern, no geographic confusion

---

#### Example 3: Industry-Specific Regions

**Healthcare Example:**
```javascript
{
  name: 'United Kingdom',
  code: 'GB',
  regions: [
    { name: 'NHS England', type: null },
    { name: 'NHS Scotland', type: null },
    { name: 'NHS Wales', type: null },
    { name: 'Private Healthcare Sector', type: null },
  ]
}
```

**Finance Example:**
```javascript
{
  name: 'Singapore',
  code: 'SG',
  regions: [
    { name: 'Investment Banking', type: null },
    { name: 'Wealth Management', type: null },
    { name: 'Retail Banking', type: null },
  ]
}
```

**Manufacturing Example:**
```javascript
{
  name: 'Germany',
  code: 'DE',
  regions: [
    { name: 'Automotive Sector', type: null },
    { name: 'Industrial Equipment', type: null },
    { name: 'Consumer Goods', type: null },
  ]
}
```

---

#### Example 4: Mixed Approach (Best of Both)

You can **mix directional types with custom names** in the same country:

```javascript
{
  name: 'Australia',
  code: 'AU',
  regions: [
    // Use directional types where they make sense
    { name: 'Eastern Australia', type: RegionType.EAST },
    { name: 'Western Australia', type: RegionType.WEST },

    // Use custom names for special territories
    { name: 'Key Accounts Territory', type: null },
    { name: 'Strategic Partners Region', type: null },
  ]
}
```

**Benefit:** Flexibility to use the right approach for each region

---

### Real-World Use Cases

#### Use Case 1: Sales Territory Redesign

**Scenario:** Your sales team reorganizes from geographic regions to account size segments

**Before (stuck with geography):**
```javascript
regions: [
  { name: 'North Region', type: RegionType.NORTH },
  { name: 'South Region', type: RegionType.SOUTH },
]
```

**After (match actual structure):**
```javascript
regions: [
  { name: 'Enterprise Accounts ($1M+)', type: null },
  { name: 'Mid-Market Accounts ($100K-$1M)', type: null },
  { name: 'SMB Accounts (<$100K)', type: null },
]
```

---

#### Use Case 2: City-State Countries

**Scenario:** Singapore, Monaco, Vatican City (countries without sub-regions)

**Before (awkward):**
```javascript
{
  name: 'Singapore',
  code: 'SG',
  regions: [
    { name: 'Singapore Central', type: RegionType.CENTRAL },  // ← Redundant
  ]
}
```

**After (clean):**
```javascript
{
  name: 'Singapore',
  code: 'SG',
  regions: [
    { name: 'Singapore', type: null },  // ✅ Simple and clear
  ]
}
```

---

#### Use Case 3: Partner Channel Structure

**Scenario:** Different region types for partner channels

```javascript
{
  name: 'India',
  code: 'IN',
  regions: [
    // Direct sales by geography
    { name: 'Northern India', type: RegionType.NORTH },
    { name: 'Southern India', type: RegionType.SOUTH },

    // Partner channels by type
    { name: 'System Integrators', type: null },
    { name: 'Value Added Resellers', type: null },
    { name: 'Technology Partners', type: null },
  ]
}
```

---

### When to Use Each Approach

**✅ Use Directional Types (NORTH/SOUTH/EAST/WEST/CENTRAL):**
- When geography actually matters for your business
- When regions align with physical locations
- When sales territories are geographic
- Example: "Northern California" (type: NORTH)

**✅ Use `type: null` (Custom Names):**
- When region names represent business structure, not geography
- When using metros, divisions, segments, or industries
- When directional types create confusion
- Example: "Enterprise Division" (type: null)

**✅ Mix Both:**
- When you have both geographic and non-geographic regions
- When some regions fit directional types, others don't
- Most flexible approach

---

### How to Add Custom Regions

**Via Seed Script:**
```javascript
// In scripts/seed-geographical-data.js
{
  name: 'United Kingdom',
  code: 'GB',
  regions: [
    // Old style (still works)
    { name: 'England', type: RegionType.SOUTH },

    // New style (custom)
    { name: 'Financial Services Sector', type: null },  // ← Just use null
    { name: 'Healthcare Sector', type: null },
  ]
}
```

**Via Direct SQL:**
```sql
-- Add custom region with null type
INSERT INTO "Region" (id, name, type, "countryId", "createdAt", "updatedAt")
VALUES (
  'cm_custom_001',
  'Strategic Accounts Territory',
  NULL,  -- ← Use NULL for custom
  'country_id_here',
  NOW(),
  NOW()
);
```

**Via Prisma Client:**
```typescript
await prisma.region.create({
  data: {
    name: 'Technology Partners Region',
    type: null,  // ← Just omit or set to null
    countryId: countryId
  }
});
```

---

### Technical Details

**Unique Constraint Behavior:**
```prisma
model Region {
  type      RegionType?
  countryId String

  @@unique([type, countryId])  // ← NULL values are ignored!
}
```

**What this means:**
- ✅ Can have only ONE region with `type: NORTH` per country
- ✅ Can have MULTIPLE regions with `type: null` per country
- ✅ Prisma automatically ignores NULL in unique constraints

**Example:**
```javascript
// This is ALLOWED (multiple nulls)
{ name: 'Enterprise', type: null, countryId: 'cm_us' },
{ name: 'SMB', type: null, countryId: 'cm_us' },
{ name: 'Public', type: null, countryId: 'cm_us' },

// This is NOT ALLOWED (duplicate type)
{ name: 'Northern Region', type: RegionType.NORTH, countryId: 'cm_us' },
{ name: 'North Territory', type: RegionType.NORTH, countryId: 'cm_us' },  // ❌ Error!
```

---

### Backward Compatibility

**✅ Zero Breaking Changes:**
- All existing regions keep their types
- APIs return `type: "NORTH"` or `type: null` (both valid)
- UI components handle both cases automatically
- Seed script still works with existing data

**TypeScript Type:**
```typescript
// Generated by Prisma
type Region = {
  id: string;
  name: string;
  type: RegionType | null;  // ← Can be enum or null
  countryId: string;
}
```

---

### Testing & Verification

**Verify the change worked:**
```bash
# Run test script
node scripts/test-optional-region-type.js
```

**Expected output:**
```
✓ Test 1: Existing regions with types
Found 5 regions with types:
  - East Coast (EAST) in United States
  - West Coast (WEST) in United States
  ...

✓ Test 2: Create region without type (custom)
  Created: Test Custom Region (type: null)

✓ Test 3: Multiple regions with null type (should work)
  Created 2 regions with null type

✅ All tests passed! RegionType is now optional.
```

---

## Adding a New Sales Theatre

**Frequency:** Rare (typically only during initial setup or major expansion)
**Time Required:** 2-4 hours
**Requires:** Code changes + database migration + deployment

### When You Need This

- Expanding to a new major geography (e.g., AFRICA, MIDDLE_EAST, OCEANIA)
- Restructuring global sales territories
- Initial setup for new deployment

### Step-by-Step Instructions

#### Step 1: Update Prisma Schema (5 minutes)

**File:** `/prisma/schema.prisma`

**Before:**
```prisma
enum SalesTheatre {
  NORTH_AMERICA
  LAC
  EMEA
  APJ
}
```

**After (Example: Adding AFRICA):**
```prisma
enum SalesTheatre {
  NORTH_AMERICA
  LAC
  EMEA
  APJ
  AFRICA        // ← Add your new theatre here
}
```

**Location in file:** Lines 874-879

---

#### Step 2: Update Seed Script (10 minutes)

**File:** `/scripts/seed-geographical-data.js`

**Add your theatre data:**

```javascript
const geographicalData = {
  [SalesTheatre.NORTH_AMERICA]: [ /* existing */ ],
  [SalesTheatre.LAC]: [ /* existing */ ],
  [SalesTheatre.EMEA]: [ /* existing */ ],
  [SalesTheatre.APJ]: [ /* existing */ ],

  // ← Add your new theatre here
  [SalesTheatre.AFRICA]: [
    {
      name: 'Kenya',
      code: 'KE',
      regions: [
        { name: 'Nairobi Region', type: null },
        { name: 'Mombasa Region', type: null },
      ]
    },
    {
      name: 'South Africa',
      code: 'ZA',
      regions: [
        { name: 'Gauteng', type: null },
        { name: 'Western Cape', type: null },
      ]
    },
    {
      name: 'Nigeria',
      code: 'NG',
      regions: [
        { name: 'Lagos Region', type: null },
        { name: 'Abuja Region', type: null },
      ]
    }
  ]
};
```

**Location in file:** Lines 10-138

---

#### Step 3: Generate Prisma Client (1 minute)

```bash
cd /home/steve/copov15
npx prisma generate
```

**What this does:** Updates TypeScript types so your code knows about the new theatre

---

#### Step 4: Create Database Migration (2 minutes)

```bash
npx prisma db push
```

**What this does:** Updates the database enum to include the new value

**Alternative (if you want migration history):**
```bash
npx prisma migrate dev --name add_africa_theatre
```

---

#### Step 5: Run Seed Script (1 minute)

```bash
npm run seed
# OR
node scripts/seed-geographical-data.js
```

**What this does:** Creates the countries and regions for your new theatre

---

#### Step 6: Verify in Database (2 minutes)

```bash
# Option 1: Using Prisma Studio (GUI)
npx prisma studio
# Browse to Country table, filter by theatre = AFRICA

# Option 2: Using psql (Command line)
psql -U postgres -d copov15
SELECT * FROM "Country" WHERE theatre = 'AFRICA';
\q
```

**Expected output:**
```
 id   | name         | code | theatre
------+--------------+------+---------
 cm1  | Kenya        | KE   | AFRICA
 cm2  | South Africa | ZA   | AFRICA
 cm3  | Nigeria      | NG   | AFRICA
```

---

#### Step 7: Test in UI (5 minutes)

1. Start development server: `npm run dev`
2. Navigate to POV creation form
3. Check "Sales Theatre" dropdown
4. Verify "AFRICA" appears in the list
5. Select "AFRICA" → verify countries appear

---

#### Step 8: Update Validation (Optional, 5 minutes)

**Only needed if you have custom validation logic**

**File:** `/lib/validation/enum-validation.ts`

Check if there's any hardcoded validation:

```typescript
// If you see this pattern, update it:
const validTheatres = ['NORTH_AMERICA', 'LAC', 'EMEA', 'APJ'];

// Change to:
const validTheatres = ['NORTH_AMERICA', 'LAC', 'EMEA', 'APJ', 'AFRICA'];

// OR better, use the enum:
import { SalesTheatre } from '@prisma/client';
const validTheatres = Object.values(SalesTheatre);
```

---

#### Step 9: Commit Changes (5 minutes)

```bash
git add prisma/schema.prisma
git add scripts/seed-geographical-data.js
git add prisma/migrations/  # if you used migrate dev
git commit -m "feat: Add AFRICA sales theatre

- Added AFRICA to SalesTheatre enum
- Added Kenya, South Africa, Nigeria countries
- Added regions for each country"

git push origin main
```

---

#### Step 10: Deploy to Production (varies by setup)

**If using GitHub Actions:**
- Push will trigger automatic deployment
- Monitor at: https://github.com/steveterryp/copov15/actions

**Manual deployment:**
```bash
# SSH to production server
ssh <PROD_USER>@<PROD_HOST>

# Navigate to app directory
cd /var/www/paichart-app/current

# Pull latest changes
git pull origin main

# Run migrations
npx prisma db push

# Regenerate Prisma client
npx prisma generate

# Run seed script
node scripts/seed-geographical-data.js

# Restart application
pm2 restart all
```

---

### Complete Example: Adding MIDDLE_EAST Theatre

**Scenario:** You want to add Middle East as a separate theatre from EMEA

#### Files to Change:

**1. `/prisma/schema.prisma`**
```prisma
enum SalesTheatre {
  NORTH_AMERICA
  LAC
  EMEA
  APJ
  MIDDLE_EAST    // ← Add this
}
```

**2. `/scripts/seed-geographical-data.js`**
```javascript
const geographicalData = {
  // ... existing theatres ...

  [SalesTheatre.MIDDLE_EAST]: [
    {
      name: 'United Arab Emirates',
      code: 'AE',
      regions: [
        { name: 'Dubai', type: null },
        { name: 'Abu Dhabi', type: null },
      ]
    },
    {
      name: 'Saudi Arabia',
      code: 'SA',
      regions: [
        { name: 'Riyadh Region', type: null },
        { name: 'Jeddah Region', type: null },
      ]
    },
    {
      name: 'Israel',
      code: 'IL',
      regions: [
        { name: 'Tel Aviv District', type: null },
        { name: 'Jerusalem District', type: null },
      ]
    }
  ]
};
```

**Commands to run:**
```bash
npx prisma generate
npx prisma db push
node scripts/seed-geographical-data.js
npm run dev  # Test locally
```

**Verification:**
```bash
psql -U postgres -d copov15
SELECT name, code, theatre FROM "Country" WHERE theatre = 'MIDDLE_EAST';
```

---

### Files That Auto-Update

**These files automatically pick up the new enum value** (no changes needed):

✅ **API Endpoints**
- `/app/api/geographical/countries/route.ts` - Returns all countries
- `/app/api/geographical/theatre/[theatre]/countries/route.ts` - Filters by theatre
- `/app/api/pov/route.ts` - POV creation with theatre validation

✅ **UI Components**
- `/components/pov/BasicInfoSection.tsx` - Theatre dropdown automatically includes new value
- `/components/geographical/GeographicalSelect.tsx` - Country filtering works automatically
- `/components/geographical/GeographicalFilter.tsx` - Needs update only for display names

✅ **Validation Schemas**
- `/lib/validation/geographical-validation.ts` - `z.nativeEnum(SalesTheatre)` automatically validates new value
- `/lib/validation/pov.ts` - POV validation schema auto-updates

---

### Potential Issues

#### Issue 1: Display Name Formatting

**File:** `/components/geographical/GeographicalFilter.tsx` (Lines 74-87)

**Current code:**
```typescript
const formatTheatreName = (theatre: SalesTheatre) => {
  switch (theatre) {
    case 'NORTH_AMERICA': return 'North America';
    case 'LAC': return 'Latin America & Caribbean';
    case 'EMEA': return 'Europe, Middle East & Africa';
    case 'APJ': return 'Asia Pacific & Japan';
    // ← Add your new theatre here
  }
}
```

**Update to:**
```typescript
const formatTheatreName = (theatre: SalesTheatre) => {
  switch (theatre) {
    case 'NORTH_AMERICA': return 'North America';
    case 'LAC': return 'Latin America & Caribbean';
    case 'EMEA': return 'Europe, Middle East & Africa';
    case 'APJ': return 'Asia Pacific & Japan';
    case 'AFRICA': return 'Africa';  // ← Add this
    case 'MIDDLE_EAST': return 'Middle East';  // ← Or this
  }
}
```

**Why:** Display names should be human-readable, not SCREAMING_SNAKE_CASE

---

#### Issue 2: Existing Data Migration

**Scenario:** You already have POVs/Countries in EMEA, now splitting out MIDDLE_EAST

**Migration script:**
```sql
-- Move UAE, Saudi Arabia, Israel from EMEA to MIDDLE_EAST
UPDATE "Country"
SET theatre = 'MIDDLE_EAST'
WHERE code IN ('AE', 'SA', 'IL');

-- Update POVs in those countries
UPDATE "POV"
SET "salesTheatre" = 'MIDDLE_EAST'
WHERE "countryId" IN (
  SELECT id FROM "Country" WHERE theatre = 'MIDDLE_EAST'
);
```

**Run via:**
```bash
psql -U postgres -d copov15 < migration.sql
```

---

### Rollback Procedure

**If something goes wrong:**

#### Option 1: Revert Code Changes
```bash
git revert HEAD
npx prisma db push
git push origin main
```

#### Option 2: Remove Theatre from Enum
```prisma
enum SalesTheatre {
  NORTH_AMERICA
  LAC
  EMEA
  APJ
  // AFRICA  ← Comment out or remove
}
```

```bash
# Delete countries for that theatre first
psql -U postgres -d copov15
DELETE FROM "Country" WHERE theatre = 'AFRICA';
\q

# Then push schema change
npx prisma db push
```

⚠️ **Warning:** This will fail if any POVs reference that theatre!

---

## Adding a New Country

**Frequency:** Common (as business expands)
**Time Required:** 10-20 minutes
**Requires:** Seed script update only (no code changes)

### When You Need This

- Expanding sales to a new country
- Adding more detail to existing theatre
- Customer requests specific country

### Step-by-Step Instructions

#### Step 1: Update Seed Script (5 minutes)

**File:** `/scripts/seed-geographical-data.js`

**Find the appropriate theatre section** and add your country:

**Example: Adding Thailand to APJ**

```javascript
[SalesTheatre.APJ]: [
  // ... existing countries ...
  {
    name: 'South East Asia',  // ← Existing entry
    code: 'SEA',
    regions: [
      { name: 'Thailand', type: RegionType.CENTRAL },
      { name: 'Vietnam', type: RegionType.EAST },
      { name: 'Indonesia', type: RegionType.SOUTH },
    ]
  },
  // ← Add new standalone country here
  {
    name: 'Thailand',
    code: 'TH',
    regions: [
      { name: 'Bangkok Metropolitan', type: null },
      { name: 'Chiang Mai Region', type: null },
      { name: 'Phuket Region', type: null },
    ]
  }
]
```

**Important:**
- `name`: Full country name (must be unique)
- `code`: ISO 3166-1 alpha-2 code (2 letters, must be unique)
- Use https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2 for codes
- Include at least 1 region per country

---

#### Step 2: Run Seed Script (1 minute)

```bash
node scripts/seed-geographical-data.js
```

**Expected output:**
```
Seeding data for theatre: APJ
Country South East Asia (SEA) already exists, skipping...
Created country: Thailand (TH)
  Created region: Bangkok Metropolitan (null)
  Created region: Chiang Mai Region (null)
  Created region: Phuket Region (null)
```

---

#### Step 3: Verify in Database (1 minute)

```bash
psql -U postgres -d copov15
SELECT name, code, theatre FROM "Country" WHERE code = 'TH';
```

**Expected output:**
```
   name   | code | theatre
----------+------+---------
 Thailand | TH   | APJ
```

---

#### Step 4: Test in UI (5 minutes)

1. Start dev server: `npm run dev`
2. Go to POV creation form
3. Select "APJ" theatre
4. Verify "Thailand" appears in country dropdown
5. Select "Thailand" → verify regions appear

---

### Multiple Countries at Once

**Example: Adding 5 African countries**

```javascript
[SalesTheatre.EMEA]: [  // Using EMEA since AFRICA theatre doesn't exist yet
  // ... existing countries ...
  {
    name: 'Kenya',
    code: 'KE',
    regions: [
      { name: 'Nairobi County', type: null },
      { name: 'Mombasa County', type: null },
    ]
  },
  {
    name: 'Nigeria',
    code: 'NG',
    regions: [
      { name: 'Lagos State', type: null },
      { name: 'Abuja FCT', type: null },
    ]
  },
  {
    name: 'South Africa',
    code: 'ZA',
    regions: [
      { name: 'Gauteng', type: null },
      { name: 'Western Cape', type: null },
    ]
  },
  {
    name: 'Egypt',
    code: 'EG',
    regions: [
      { name: 'Cairo Governorate', type: null },
      { name: 'Alexandria Governorate', type: null },
    ]
  },
  {
    name: 'Ghana',
    code: 'GH',
    regions: [
      { name: 'Greater Accra', type: null },
      { name: 'Ashanti Region', type: null },
    ]
  }
]
```

**Run seed:**
```bash
node scripts/seed-geographical-data.js
```

**Verify:**
```bash
psql -U postgres -d copov15
SELECT name, code FROM "Country" WHERE code IN ('KE', 'NG', 'ZA', 'EG', 'GH');
```

---

### Country Name Guidelines

**✅ Use Official English Name:**
- "United States" not "USA" or "America"
- "United Kingdom" not "UK" or "Britain"
- "South Korea" not "Korea" (to distinguish from North Korea)

**✅ Use ISO Codes:**
- Always use official 2-letter codes
- "US" not "USA"
- "GB" not "UK"
- Check: https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2

**❌ Avoid:**
- Abbreviations in names ("USA" → use "United States")
- Non-standard codes ("UK" → use "GB")
- Duplicate codes (will fail unique constraint)

---

### Handling Edge Cases

#### Case 1: Country with No Sub-Regions

**Example: Singapore (city-state)**

```javascript
{
  name: 'Singapore',
  code: 'SG',
  regions: [
    { name: 'Singapore', type: null }  // ← Just use country name
  ]
}
```

---

#### Case 2: Country with Many Regions

**Example: USA with all 50 states**

```javascript
{
  name: 'United States',
  code: 'US',
  regions: [
    // Option A: Group by region
    { name: 'Northeast', type: RegionType.NORTH },
    { name: 'Southeast', type: RegionType.SOUTH },
    { name: 'Midwest', type: RegionType.CENTRAL },
    { name: 'West Coast', type: RegionType.WEST },

    // Option B: List major metros
    { name: 'New York Metro', type: null },
    { name: 'Los Angeles Metro', type: null },
    { name: 'Chicago Metro', type: null },
    { name: 'Houston Metro', type: null },

    // Option C: All 50 states (verbose but complete)
    { name: 'Alabama', type: RegionType.SOUTH },
    { name: 'Alaska', type: null },
    // ... all 50
  ]
}
```

**Recommendation:** Use groupings that match your sales territories

---

#### Case 3: Special Administrative Regions

**Example: Hong Kong, Macau (part of China but separate business entities)**

```javascript
{
  name: 'China',
  code: 'CN',
  regions: [
    { name: 'Northern China', type: RegionType.NORTH },
    { name: 'Southern China', type: RegionType.SOUTH },
    { name: 'Eastern China', type: RegionType.EAST },
  ]
},
{
  name: 'Hong Kong',  // ← Separate country entry
  code: 'HK',
  regions: [
    { name: 'Hong Kong', type: null }
  ]
},
{
  name: 'Macau',  // ← Separate country entry
  code: 'MO',
  regions: [
    { name: 'Macau', type: null }
  ]
}
```

---

### Files That Auto-Update

**These automatically work with new countries** (no changes needed):

✅ `/app/api/geographical/countries/route.ts` - Returns all countries
✅ `/app/api/geographical/theatre/[theatre]/countries/route.ts` - Filters by theatre
✅ `/components/geographical/GeographicalSelect.tsx` - Country dropdown
✅ All POV creation/edit forms - Country selection

**No code changes required!** Just run the seed script.

---

## Adding a New Region

**Frequency:** Common (for detailed territory management)
**Time Required:** 5-10 minutes
**Requires:** Seed script update only

### When You Need This

- Adding more sales territories within a country
- Splitting large regions into smaller ones
- Customer requests specific regional detail

### Step-by-Step Instructions

#### Step 1: Update Seed Script (3 minutes)

**File:** `/scripts/seed-geographical-data.js`

**Find the country** and add regions to its `regions` array:

**Example: Adding regions to Australia**

**Before:**
```javascript
{
  name: 'Australia',
  code: 'AU',
  regions: [
    { name: 'Eastern Australia', type: RegionType.EAST },
    { name: 'Western Australia', type: RegionType.WEST },
    { name: 'Southern Australia', type: RegionType.SOUTH },
  ]
}
```

**After:**
```javascript
{
  name: 'Australia',
  code: 'AU',
  regions: [
    { name: 'Eastern Australia', type: RegionType.EAST },
    { name: 'Western Australia', type: RegionType.WEST },
    { name: 'Southern Australia', type: RegionType.SOUTH },
    // ← Add new regions here
    { name: 'Queensland', type: null },
    { name: 'New South Wales', type: null },
    { name: 'Victoria', type: null },
  ]
}
```

---

#### Step 2: Handle Existing Data

**Important:** If the country already exists in your database, the seed script will **skip it** (to avoid duplicates).

**Two options:**

**Option A: Delete and Re-Seed Country**
```bash
psql -U postgres -d copov15

-- Delete existing country (cascades to regions and POVs!)
DELETE FROM "Country" WHERE code = 'AU';

-- Exit and re-run seed
\q
node scripts/seed-geographical-data.js
```

⚠️ **Warning:** This deletes all POVs in that country!

---

**Option B: Add Regions via Direct SQL** (Safer)
```bash
psql -U postgres -d copov15

-- Get country ID
SELECT id FROM "Country" WHERE code = 'AU';
-- Result: cm2abc123...

-- Add new regions
INSERT INTO "Region" (id, name, type, "countryId", "createdAt", "updatedAt")
VALUES
  ('cm_qld_001', 'Queensland', NULL, 'cm2abc123...', NOW(), NOW()),
  ('cm_nsw_001', 'New South Wales', NULL, 'cm2abc123...', NOW(), NOW()),
  ('cm_vic_001', 'Victoria', NULL, 'cm2abc123...', NOW(), NOW());

\q
```

**Generate IDs:** Use https://www.cuid2.com/ or let Prisma generate:
```javascript
const { cuid } = require('@paralleldrive/cuid2');
console.log(cuid()); // cm2abc123...
```

---

#### Step 3: Verify in Database (1 minute)

```bash
psql -U postgres -d copov15

SELECT r.name, r.type, c.name as country
FROM "Region" r
JOIN "Country" c ON r."countryId" = c.id
WHERE c.code = 'AU';
```

**Expected output:**
```
       name        | type  |  country
-------------------+-------+-----------
 Eastern Australia | EAST  | Australia
 Western Australia | WEST  | Australia
 Southern Australia| SOUTH | Australia
 Queensland        | null  | Australia
 New South Wales   | null  | Australia
 Victoria          | null  | Australia
```

---

### Region Naming Best Practices

**✅ Use Clear Names:**
- "Northern California" not "NorCal"
- "Greater London" not "London Area"
- "Gauteng Province" not "GP"

**✅ Be Specific:**
- "Tokyo Metropolitan Area" (specific)
- vs "Tokyo Region" (vague)

**✅ Match Business Territories:**
If your sales team divides by:
- States → Use state names
- Cities → Use city names
- Custom territories → Use custom names (RegionType null)

**❌ Avoid:**
- Abbreviations ("NYC" → use "New York Metro")
- Overlapping regions (confuses users)
- Too many regions (keep it manageable, 3-10 per country ideal)

---

### Region Type Guidelines

**RegionType is OPTIONAL** (as of 2025-12-16). You can:

**Option 1: Use Directional Types** (when geography matters)
```javascript
regions: [
  { name: 'Northern Territory', type: RegionType.NORTH },
  { name: 'Southern Territory', type: RegionType.SOUTH },
]
```

**Option 2: Use Custom Names** (when business structure matters)
```javascript
regions: [
  { name: 'Enterprise Division', type: null },
  { name: 'SMB Division', type: null },
  { name: 'Public Sector', type: null },
]
```

**Option 3: Mix Both**
```javascript
regions: [
  { name: 'Northern California', type: RegionType.NORTH },
  { name: 'Southern California', type: RegionType.SOUTH },
  { name: 'Key Accounts Territory', type: null },
]
```

---

### Complex Example: US States

**Scenario:** Add all 50 US states as regions

```javascript
{
  name: 'United States',
  code: 'US',
  regions: [
    // Northeast
    { name: 'Maine', type: RegionType.NORTH },
    { name: 'New Hampshire', type: RegionType.NORTH },
    { name: 'Vermont', type: RegionType.NORTH },
    { name: 'Massachusetts', type: RegionType.NORTH },
    { name: 'Rhode Island', type: RegionType.NORTH },
    { name: 'Connecticut', type: RegionType.NORTH },
    { name: 'New York', type: RegionType.NORTH },
    { name: 'New Jersey', type: RegionType.NORTH },
    { name: 'Pennsylvania', type: RegionType.NORTH },

    // Southeast
    { name: 'Delaware', type: RegionType.SOUTH },
    { name: 'Maryland', type: RegionType.SOUTH },
    { name: 'Virginia', type: RegionType.SOUTH },
    { name: 'West Virginia', type: RegionType.SOUTH },
    { name: 'North Carolina', type: RegionType.SOUTH },
    { name: 'South Carolina', type: RegionType.SOUTH },
    { name: 'Georgia', type: RegionType.SOUTH },
    { name: 'Florida', type: RegionType.SOUTH },
    { name: 'Kentucky', type: RegionType.SOUTH },
    { name: 'Tennessee', type: RegionType.SOUTH },
    { name: 'Alabama', type: RegionType.SOUTH },
    { name: 'Mississippi', type: RegionType.SOUTH },
    { name: 'Louisiana', type: RegionType.SOUTH },
    { name: 'Arkansas', type: RegionType.SOUTH },

    // Midwest
    { name: 'Ohio', type: RegionType.CENTRAL },
    { name: 'Indiana', type: RegionType.CENTRAL },
    { name: 'Illinois', type: RegionType.CENTRAL },
    { name: 'Michigan', type: RegionType.CENTRAL },
    { name: 'Wisconsin', type: RegionType.CENTRAL },
    { name: 'Minnesota', type: RegionType.CENTRAL },
    { name: 'Iowa', type: RegionType.CENTRAL },
    { name: 'Missouri', type: RegionType.CENTRAL },
    { name: 'North Dakota', type: RegionType.CENTRAL },
    { name: 'South Dakota', type: RegionType.CENTRAL },
    { name: 'Nebraska', type: RegionType.CENTRAL },
    { name: 'Kansas', type: RegionType.CENTRAL },

    // Southwest
    { name: 'Oklahoma', type: RegionType.CENTRAL },
    { name: 'Texas', type: RegionType.SOUTH },
    { name: 'New Mexico', type: RegionType.WEST },
    { name: 'Arizona', type: RegionType.WEST },

    // West
    { name: 'Montana', type: RegionType.WEST },
    { name: 'Idaho', type: RegionType.WEST },
    { name: 'Wyoming', type: RegionType.WEST },
    { name: 'Colorado', type: RegionType.WEST },
    { name: 'Utah', type: RegionType.WEST },
    { name: 'Nevada', type: RegionType.WEST },
    { name: 'California', type: RegionType.WEST },
    { name: 'Oregon', type: RegionType.WEST },
    { name: 'Washington', type: RegionType.WEST },

    // Non-contiguous
    { name: 'Alaska', type: RegionType.NORTH },
    { name: 'Hawaii', type: null },
  ]
}
```

**Run seed:**
```bash
# Since US already exists, need to delete first
psql -U postgres -d copov15
DELETE FROM "Country" WHERE code = 'US';
\q

node scripts/seed-geographical-data.js
```

---

### Files That Auto-Update

**These automatically work with new regions** (no changes needed):

✅ `/app/api/geographical/countries/route.ts` - Returns regions with countries
✅ `/components/geographical/GeographicalSelect.tsx` - Region dropdown
✅ All POV creation/edit forms - Region selection

---

## Modifying Existing Data

### Renaming a Country

**Option 1: Via Seed Script + Re-seed**
```javascript
// Change in seed script
{
  name: 'Türkiye',  // ← Changed from 'Turkey'
  code: 'TR',
  regions: [ /* ... */ ]
}
```

```bash
# Delete and re-seed
psql -U postgres -d copov15
DELETE FROM "Country" WHERE code = 'TR';
\q
node scripts/seed-geographical-data.js
```

**Option 2: Direct SQL Update**
```sql
UPDATE "Country" SET name = 'Türkiye' WHERE code = 'TR';
```

---

### Renaming a Region

**Direct SQL Update (no seed script change needed):**
```sql
UPDATE "Region"
SET name = 'New Region Name'
WHERE name = 'Old Region Name'
  AND "countryId" = (SELECT id FROM "Country" WHERE code = 'XX');
```

---

### Moving a Country to Different Theatre

**Example: Move Israel from EMEA to MIDDLE_EAST**

**Prerequisites:** MIDDLE_EAST theatre must exist in enum

```sql
-- Update country
UPDATE "Country" SET theatre = 'MIDDLE_EAST' WHERE code = 'IL';

-- Update existing POVs in that country
UPDATE "POV"
SET "salesTheatre" = 'MIDDLE_EAST'
WHERE "countryId" = (SELECT id FROM "Country" WHERE code = 'IL');
```

---

### Deleting a Country

⚠️ **Warning:** This cascades to regions and POVs!

```bash
psql -U postgres -d copov15

-- Check what will be deleted
SELECT
  c.name as country,
  COUNT(DISTINCT r.id) as regions,
  COUNT(DISTINCT p.id) as povs
FROM "Country" c
LEFT JOIN "Region" r ON r."countryId" = c.id
LEFT JOIN "POV" p ON p."countryId" = c.id
WHERE c.code = 'XX'
GROUP BY c.name;

-- If safe, delete
DELETE FROM "Country" WHERE code = 'XX';
```

---

### Deleting a Region

⚠️ **Warning:** This will break POVs that reference this region!

```sql
-- Check POVs using this region
SELECT COUNT(*) FROM "POV" WHERE "regionId" = 'cm_region_id';

-- If count = 0, safe to delete
DELETE FROM "Region" WHERE id = 'cm_region_id';
```

---

## Testing Changes

### Local Testing Checklist

Before deploying geographical changes:

- [ ] **Seed script runs without errors**
  ```bash
  node scripts/seed-geographical-data.js
  ```

- [ ] **Data appears in database**
  ```bash
  psql -U postgres -d copov15
  SELECT * FROM "Country" WHERE code = 'NEW_CODE';
  ```

- [ ] **UI dropdowns show new data**
  - Start dev server: `npm run dev`
  - Go to POV creation form
  - Check theatre/country/region dropdowns

- [ ] **Can create POV with new geography**
  - Select new theatre/country/region
  - Save POV
  - Verify it saves correctly

- [ ] **Existing POVs still load**
  - Navigate to POV list
  - Verify existing POVs display correctly

---

### Validation Queries

**Check data integrity:**

```sql
-- Countries without regions (should be 0 or very few)
SELECT c.name, c.code, COUNT(r.id) as region_count
FROM "Country" c
LEFT JOIN "Region" r ON r."countryId" = c.id
GROUP BY c.id, c.name, c.code
HAVING COUNT(r.id) = 0;

-- Regions orphaned from countries (should be 0)
SELECT r.name, r."countryId"
FROM "Region" r
LEFT JOIN "Country" c ON r."countryId" = c.id
WHERE c.id IS NULL;

-- POVs with invalid geography (should be 0)
SELECT p.title, p."countryId", p."regionId"
FROM "POV" p
LEFT JOIN "Country" c ON p."countryId" = c.id
WHERE c.id IS NULL;

-- Theatre distribution (verify data looks reasonable)
SELECT theatre, COUNT(*) as country_count
FROM "Country"
GROUP BY theatre
ORDER BY country_count DESC;
```

---

## Troubleshooting

### Issue: Seed script says "Country already exists"

**Problem:** Country with that code already exists in database

**Solutions:**

**Option 1: Delete existing country first**
```bash
psql -U postgres -d copov15
DELETE FROM "Country" WHERE code = 'XX';
\q
node scripts/seed-geographical-data.js
```

**Option 2: Just add regions to existing country** (see [Adding Regions](#adding-a-new-region))

---

### Issue: "Invalid enum value" error

**Problem:** Trying to use a theatre that doesn't exist in the enum

**Error message:**
```
Invalid value for enum SalesTheatre: "AFRICA"
```

**Solution:** Add theatre to enum first (see [Adding Sales Theatre](#adding-a-new-sales-theatre))

---

### Issue: Dropdown doesn't show new country

**Possible causes:**

**1. Browser cache** (most common)
```bash
# Clear browser cache or hard refresh
# Chrome/Firefox: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
```

**2. React Query cache**
```typescript
// Force refetch in browser console
queryClient.invalidateQueries(['countries']);
```

**3. Server not restarted**
```bash
# Restart dev server
npm run dev
```

**4. Data not actually in database**
```bash
psql -U postgres -d copov15
SELECT * FROM "Country" WHERE code = 'XX';
```

---

### Issue: Unique constraint violation

**Error:**
```
ERROR: duplicate key value violates unique constraint "Country_code_key"
```

**Cause:** Country code already exists

**Solution:**
```bash
# Check existing countries
psql -U postgres -d copov15
SELECT name, code FROM "Country" WHERE code = 'XX';

# If it's the wrong country, delete it
DELETE FROM "Country" WHERE code = 'XX' AND name = 'Wrong Name';

# Then re-run seed
\q
node scripts/seed-geographical-data.js
```

---

### Issue: POVs broken after geography change

**Symptoms:**
- POV list doesn't load
- "Country not found" errors
- Regions missing

**Causes:**
1. Deleted country that had POVs
2. Changed country code (breaks foreign key)
3. Moved country to different theatre but POVs still reference old theatre

**Fix:**
```sql
-- Find POVs with invalid countries
SELECT p.id, p.title, p."countryId", c.name as country
FROM "POV" p
LEFT JOIN "Country" c ON p."countryId" = c.id
WHERE c.id IS NULL;

-- Option A: Delete broken POVs (if test data)
DELETE FROM "POV" WHERE "countryId" NOT IN (SELECT id FROM "Country");

-- Option B: Reassign to valid country
UPDATE "POV"
SET "countryId" = (SELECT id FROM "Country" WHERE code = 'US' LIMIT 1)
WHERE "countryId" NOT IN (SELECT id FROM "Country");
```

---

## Quick Reference

### Common Commands

```bash
# Run seed script
node scripts/seed-geographical-data.js

# Check countries
psql -U postgres -d copov15 -c "SELECT name, code, theatre FROM \"Country\" ORDER BY theatre, name;"

# Check regions
psql -U postgres -d copov15 -c "SELECT c.name as country, r.name as region FROM \"Region\" r JOIN \"Country\" c ON r.\"countryId\" = c.id ORDER BY c.name, r.name;"

# Delete all geographical data (CAREFUL!)
psql -U postgres -d copov15 -c "DELETE FROM \"Country\";"

# Re-seed everything
node scripts/seed-geographical-data.js
```

---

### File Quick Links

| Task | File | Lines |
|------|------|-------|
| Add theatre (enum) | `/prisma/schema.prisma` | 874-879 |
| Add countries/regions | `/scripts/seed-geographical-data.js` | 10-138 |
| Format theatre names | `/components/geographical/GeographicalFilter.tsx` | 74-87 |
| Validate geography | `/lib/validation/geographical-validation.ts` | All |

---

### Theatre Quick Reference

| Code | Display Name | Current Countries |
|------|--------------|-------------------|
| `NORTH_AMERICA` | North America | US, Canada, Mexico |
| `LAC` | Latin America & Caribbean | Brazil, Argentina, Colombia |
| `EMEA` | Europe, Middle East & Africa | UK, Germany, France |
| `APJ` | Asia Pacific & Japan | Australia, Japan, India, Singapore, China, SEA |

---

## Best Practices

1. **✅ Test locally first** - Always run seed script on local database before production
2. **✅ Use ISO country codes** - Standard 2-letter codes (US, GB, JP, etc.)
3. **✅ Make regions optional** - Use `type: null` for custom region names
4. **✅ Add 1+ regions per country** - Even if just the country name
5. **✅ Check existing data** - Before deleting, verify no POVs reference it
6. **✅ Commit seed script changes** - Track changes in git for history
7. **❌ Don't delete in-use geography** - Check POVs first!
8. **❌ Don't use non-standard codes** - Stick to ISO standards

---

## Getting Help

**Database issues:**
```bash
# Check Prisma logs
npx prisma studio

# Check PostgreSQL logs
psql -U postgres -d copov15
\q
```

**Seed script issues:**
```bash
# Run with verbose logging
node scripts/seed-geographical-data.js 2>&1 | tee seed-debug.log
```

**Contact:**
- Refer to `/docs/PRODUCTION_OPERATIONS_GUIDE.md` for production deployment
- Refer to `/cline_docs/reviews/multi-customer-enum-migration-2025-12-16/` for multi-customer migration plans

---

## Addendum: MCP Geographical Filtering for Managers

**Purpose:** How managers use ChatGPT/Claude Desktop to filter POVs by geography via MCP tools
**Key Insight:** Custom regions work perfectly - filtering uses `Region.name`, not `Region.type`

### MCP Tools That Support Geographical Filtering

**Tool 1: `project(action: "pov.list")`**
```javascript
project(action: "pov.list")({
  theatre_name: "APJ",           // Filter by sales theatre
  country_name: "Australia",     // Filter by country
  region_name: "Enterprise Division",  // Filter by region (custom or directional)
  status: "IN_PROGRESS",         // Combine with other filters
  limit: 100
})
```

**Tool 2: `project(action: "pov.details")`**
```javascript
project(action: "pov.details")({
  country_name: "Singapore",
  region_name: "Investment Banking"  // Find POV in custom region
})
```

**Location:** `/lib/mcp/server/config/tool-schemas.js:44-80`

---

### How Filtering Works (Technical)

**API Implementation:** `/app/api/pov/route.ts:103-174`

#### Theatre Filtering
```javascript
// Maps friendly names to enum values
theatre_name: "Asia Pacific" → salesTheatre: "APJ"
theatre_name: "Europe" → salesTheatre: "EMEA"
theatre_name: "North America" → salesTheatre: "NORTH_AMERICA"

// Supports aliases:
"Asia", "asia pacific", "APJ" → all map to "APJ"
"Europe", "emea", "EMEA" → all map to "EMEA"
```

#### Country Filtering
```javascript
// Searches by country name (partial, case-insensitive)
country_name: "Australia"
→ WHERE country.name ILIKE '%Australia%'
→ Finds: "Australia" ✅

country_name: "Aus"  // Partial match
→ Finds: "Australia", "Austria" (both match!)
```

#### Region Filtering (Works with Custom Regions!)
```javascript
// Searches by region NAME (not type!)
region_name: "Enterprise Division"
→ WHERE region.name ILIKE '%Enterprise Division%'
→ Finds: { name: "Enterprise Division", type: null } ✅

region_name: "Eastern Australia"
→ Finds: { name: "Eastern Australia", type: EAST } ✅

// Type field is IGNORED in filtering!
```

**Key Point:** Region filtering uses `Region.name` field, so `Region.type` is irrelevant. Custom regions with `type: null` work identically to regions with directional types.

---

### Manager Usage Examples (ChatGPT)

#### Example 1: Filter by Custom Region

**Setup in Database:**
```javascript
// Australia has both directional and custom regions
{
  name: 'Australia',
  code: 'AU',
  regions: [
    { name: 'Eastern Australia', type: RegionType.EAST },      // Standard
    { name: 'Western Australia', type: RegionType.WEST },      // Standard
    { name: 'Enterprise Division', type: null },               // Custom ✨
    { name: 'SMB Division', type: null }                       // Custom ✨
  ]
}
```

**Manager in ChatGPT:**
```
"Show me all POVs in our Enterprise Division"
```

**What Happens Behind the Scenes:**
```javascript
// ChatGPT → MCP
project(action: "pov.list", { region_name: "Enterprise Division" })

// MCP → API
GET /api/pov?region_name=Enterprise%20Division

// API → Database
SELECT * FROM "Region" WHERE name ILIKE '%Enterprise Division%'
// Returns: { id: "cm_reg_123", name: "Enterprise Division", type: null }

SELECT * FROM "POV" WHERE "regionId" = 'cm_reg_123'
// Returns: POVs in Enterprise Division
```

**ChatGPT Response to Manager:**
```
I found 3 POVs in the Enterprise Division:

1. **Acme Corp CRM Project**
   - Status: In Progress
   - Priority: High
   - Region: Enterprise Division ← Custom region displayed

2. **Global Industries Migration**
   - Status: Validation
   - Priority: Medium
   - Region: Enterprise Division

3. **TechStart Onboarding**
   - Status: Projected
   - Priority: Low
   - Region: Enterprise Division
```

**Result:** ✅ Custom regions work perfectly!

---

#### Example 2: Filter by Industry Sector (Custom)

**Setup in Database:**
```javascript
{
  name: 'Singapore',
  code: 'SG',
  regions: [
    { name: 'Investment Banking', type: null },      // Industry-based
    { name: 'Wealth Management', type: null },       // Industry-based
    { name: 'Retail Banking', type: null }           // Industry-based
  ]
}
```

**Manager in ChatGPT:**
```
"What projects do we have in our Investment Banking division in Singapore?"
```

**MCP Tool Call:**
```javascript
project(action: "pov.list")({
  country_name: "Singapore",
  region_name: "Investment Banking"  // Custom region search
})
```

**Result:** ✅ Filters by custom industry-based region

---

#### Example 3: Partial Matching with Custom Names

**Setup in Database:**
```javascript
{
  name: 'United States',
  code: 'US',
  regions: [
    { name: 'Strategic Accounts Territory', type: null },
    { name: 'Key Accounts Territory', type: null },
    { name: 'SMB Accounts Territory', type: null }
  ]
}
```

**Manager in ChatGPT:**
```
"Show me POVs in Strategic Accounts"
```

**MCP Tool Call:**
```javascript
project(action: "pov.list")({
  region_name: "Strategic Accounts"
})
```

**API Behavior:**
```javascript
// Partial match search
WHERE region.name ILIKE '%Strategic Accounts%'

// Matches: "Strategic Accounts Territory" ✅
```

**Result:** ✅ Finds "Strategic Accounts Territory" with partial match

---

#### Example 4: Combined Geographical + Status Filtering

**Manager in ChatGPT:**
```
"Show me high-priority in-progress POVs in Australia's Enterprise Division"
```

**MCP Tool Call:**
```javascript
project(action: "pov.list")({
  priority: "HIGH",
  status: "IN_PROGRESS",
  country_name: "Australia",
  region_name: "Enterprise Division"  // Custom region
})
```

**API Query:**
```javascript
WHERE
  priority = 'HIGH'
  AND status = 'IN_PROGRESS'
  AND countryId IN (SELECT id FROM "Country" WHERE name ILIKE '%Australia%')
  AND regionId IN (SELECT id FROM "Region" WHERE name ILIKE '%Enterprise Division%')
```

**Result:** ✅ Multi-criteria filtering with custom regions works perfectly

---

#### Example 5: Theatre-Level View

**Manager in ChatGPT:**
```
"Give me an overview of all projects in Asia Pacific"
```

**MCP Tool Call:**
```javascript
project(action: "pov.list")({
  theatre_name: "Asia Pacific"  // or "APJ", "Asia", etc.
})
```

**API Behavior:**
```javascript
// Maps friendly name to enum
"Asia Pacific" → "APJ"

WHERE salesTheatre = 'APJ'
```

**Result:** Returns all POVs in APJ theatre (includes all countries and all regions, both directional and custom)

---

### Supported Filter Combinations

**All three geographical parameters can be combined:**

| theatre_name | country_name | region_name | Result |
|--------------|--------------|-------------|--------|
| ✅ APJ | - | - | All POVs in Asia Pacific |
| ✅ APJ | ✅ Australia | - | All POVs in Australia (APJ) |
| ✅ APJ | ✅ Australia | ✅ Enterprise Division | POVs in Australia's Enterprise Division |
| - | ✅ Australia | - | All POVs in Australia (any theatre) |
| - | ✅ Australia | ✅ Enterprise Division | POVs in Australia's Enterprise Division |
| - | - | ✅ Enterprise Division | POVs in Enterprise Division (any country) |

**Filtering is cumulative** - each parameter narrows the results further.

---

### What Custom Region Types Support

**✅ Fully Supported (Works Identically to Directional Types):**
- Filtering via `project(action: "pov.list", { region_name: "..." })`
- Filtering via `project(action: "pov.details", { region_name: "..." })`
- Partial name matching
- Case-insensitive search
- Combined with other filters (status, priority, customer)
- Display in API responses
- Display in ChatGPT formatted results

**❌ Not Different (No Special Handling):**
- Custom regions don't need any special treatment
- API doesn't care if type is NORTH or null
- Filtering logic is identical for all regions

---

### Practical Manager Workflows

#### Workflow 1: Territory Manager Review

**Manager:** "I manage the Enterprise Division in Australia. Show me my portfolio."

**ChatGPT Interaction:**
```
Manager: "Show me all POVs in Australia's Enterprise Division"

ChatGPT: [Calls project(action: "pov.list") with region_name filter]

Response: "I found 5 POVs in the Enterprise Division:

1. **Acme Corp CRM** (In Progress, High Priority)
2. **Banking Platform** (Validation, Medium Priority)
3. **Healthcare Integration** (Projected, High Priority)
4. **Insurance Portal** (Won, Low Priority)
5. **Logistics System** (In Progress, Medium Priority)"

Manager: "Show me just the high-priority ones"

ChatGPT: [Calls project(action: "pov.list") with region + priority filter]

Response: "2 high-priority POVs in Enterprise Division:
1. Acme Corp CRM
2. Healthcare Integration"
```

---

#### Workflow 2: Regional Performance Review

**Manager:** "I want to compare our Strategic Accounts vs Key Accounts performance."

**ChatGPT Interaction:**
```
Manager: "How many POVs do we have in Strategic Accounts Territory?"

ChatGPT: [Calls project(action: "pov.list", { region_name: "Strategic Accounts" })]

Response: "12 POVs in Strategic Accounts Territory:
- 4 In Progress
- 3 Won
- 2 Projected
- 2 Validation
- 1 Lost"

Manager: "And in Key Accounts Territory?"

ChatGPT: [Calls project(action: "pov.list", { region_name: "Key Accounts" })]

Response: "8 POVs in Key Accounts Territory:
- 3 In Progress
- 2 Won
- 2 Projected
- 1 Stalled"

Manager: "Show me the in-progress ones in Key Accounts"

ChatGPT: [Calls project(action: "pov.list", { region_name: "Key Accounts", status: "IN_PROGRESS" })]
```

---

#### Workflow 3: Industry Sector Analysis

**Setup:** Healthcare customer using industry-based regions
```javascript
{
  name: 'United Kingdom',
  code: 'GB',
  regions: [
    { name: 'NHS England', type: null },
    { name: 'NHS Scotland', type: null },
    { name: 'Private Healthcare Sector', type: null }
  ]
}
```

**Manager in ChatGPT:**
```
"Show me all POVs in the NHS England sector"
```

**Result:** ✅ Filters by custom industry region perfectly

---

### Key Benefits for Managers

**Natural Language:**
- Manager doesn't need to know region IDs
- Can use partial names ("Enterprise" finds "Enterprise Division")
- Case doesn't matter ("strategic accounts" = "Strategic Accounts")

**Flexible Structure:**
- Works with geographic regions (Eastern Australia)
- Works with business divisions (Enterprise Division)
- Works with industry sectors (Investment Banking)
- Works with any custom naming scheme

**Powerful Filtering:**
- Combine geography with status, priority, customer
- Drill down from theatre → country → region
- Or jump directly to region (country optional)

**Consistent Experience:**
- Custom regions (`type: null`) work identically to standard regions
- No special syntax or handling needed
- Manager doesn't need to know if region is "custom" or not

---

### Technical Implementation Notes

**Why Custom Regions Work:**

1. **Filtering Logic:**
   ```javascript
   // API searches by name, not type
   WHERE region.name ILIKE '%{region_name}%'

   // This query doesn't care about the type field:
   { name: 'Enterprise Division', type: null }      // ✅ Found
   { name: 'Eastern Australia', type: 'EAST' }      // ✅ Found
   ```

2. **API Response:**
   ```json
   {
     "region": {
       "id": "cm_reg_123",
       "name": "Enterprise Division",
       "type": null  // ← Type is included in response but not used for filtering
     }
   }
   ```

3. **Zero Special Handling:**
   - No "if type === null" logic needed
   - No different code paths
   - Works out of the box

**Files Implementing This:**
- **MCP Schema:** `/lib/mcp/server/config/tool-schemas.js:44-80`
- **API Handler:** `/app/api/pov/route.ts:103-174`
- **MCP Tool:** `/lib/mcp/server/tools/sdk-native-basic-tools.js:99-112`

---

### Manager Training Examples

**Example Commands for Managers to Try:**

**By Theatre:**
```
"Show me all POVs in Asia Pacific"
"List projects in EMEA"
"What's happening in North America?"
```

**By Country:**
```
"Show me Australian POVs"
"List all projects in Singapore"
"What POVs do we have in the UK?"
```

**By Region (Works with ANY region name!):**
```
"Show me POVs in Enterprise Division"          // ✅ Custom region
"List projects in Strategic Accounts"          // ✅ Custom region
"What's in Eastern Australia?"                 // ✅ Directional region
"Show me the Investment Banking portfolio"     // ✅ Industry region
"List POVs in Key Accounts Territory"          // ✅ Custom territory
```

**Combined:**
```
"Show me high-priority in-progress POVs in Australia's Enterprise Division"
"List completed projects in Singapore's Wealth Management sector"
"What urgent POVs do we have in the Strategic Accounts Territory?"
```

---

### Troubleshooting Manager Queries

#### Issue: "No POVs found" but you know they exist

**Cause 1: Region name typo or mismatch**
```
Manager: "Show me POVs in Strategic region"
→ Searches for: "Strategic" (partial match)
→ Might match: "Strategic Accounts Territory" ✅
→ Or no match if region is named "Key Accounts Strategic" ❌
```

**Solution:** Check exact region name in database
```sql
SELECT name FROM "Region" WHERE name ILIKE '%Strategic%';
```

---

**Cause 2: POVs not actually assigned to that region**
```sql
-- Check which regions have POVs
SELECT
  r.name as region,
  COUNT(p.id) as pov_count
FROM "Region" r
LEFT JOIN "POV" p ON p."regionId" = r.id
GROUP BY r.id, r.name
ORDER BY pov_count DESC;
```

---

**Cause 3: Access control (manager can't see those POVs)**
- MCP respects user permissions
- Manager only sees POVs they have access to
- Check `UserPOV` table for access grants

---

### Custom Region Naming Best Practices for MCP

**✅ Use Clear, Searchable Names:**
- "Enterprise Division" (easy to search)
- "Strategic Accounts Territory" (descriptive)
- "Investment Banking Sector" (clear)

**✅ Avoid Special Characters:**
- Use: "Healthcare & Life Sciences" → "Healthcare and Life Sciences"
- Reason: Some MCP clients escape special characters inconsistently

**✅ Use Consistent Patterns:**
```javascript
// Good: Consistent pattern across regions
{ name: 'Enterprise Accounts Division', type: null },
{ name: 'Mid-Market Accounts Division', type: null },
{ name: 'SMB Accounts Division', type: null }

// Avoid: Inconsistent naming
{ name: 'Enterprise Division', type: null },
{ name: 'Mid-Market Region', type: null },
{ name: 'Small Business Territory', type: null }
```

**✅ Test with Partial Matches:**
```javascript
// If region is "Strategic Accounts Territory"
// Manager should be able to find it with:
region_name: "Strategic"          // ✅ Partial match
region_name: "Strategic Accounts" // ✅ Partial match
region_name: "Accounts"           // ✅ Partial match (but might match other "Accounts" regions)
```

---

### Real-World Custom Region Examples

#### Healthcare Industry
```javascript
{
  name: 'United Kingdom',
  code: 'GB',
  regions: [
    { name: 'NHS England Trusts', type: null },
    { name: 'NHS Scotland Boards', type: null },
    { name: 'Private Healthcare Providers', type: null },
    { name: 'Pharmaceutical Sector', type: null }
  ]
}
```

**Manager queries that work:**
```
"Show me POVs in NHS England"           // Partial match
"List projects in Private Healthcare"   // Partial match
"What's in the Pharmaceutical Sector?"  // Exact match
```

---

#### Financial Services
```javascript
{
  name: 'Singapore',
  code: 'SG',
  regions: [
    { name: 'Investment Banking Division', type: null },
    { name: 'Wealth Management Division', type: null },
    { name: 'Retail Banking Division', type: null },
    { name: 'Fintech Partnerships', type: null }
  ]
}
```

**Manager queries that work:**
```
"Show me Investment Banking POVs"       // Partial match
"List Wealth Management projects"       // Partial match
"What Fintech partnerships are active?" // Partial match
```

---

#### Account Size Segmentation
```javascript
{
  name: 'United States',
  code: 'US',
  regions: [
    { name: 'Enterprise Accounts ($1M+ ARR)', type: null },
    { name: 'Mid-Market Accounts ($100K-$1M ARR)', type: null },
    { name: 'SMB Accounts (<$100K ARR)', type: null },
    { name: 'Strategic Partnerships', type: null }
  ]
}
```

**Manager queries that work:**
```
"Show me Enterprise Accounts POVs"      // Partial match
"List Mid-Market projects"              // Partial match
"What Strategic Partnerships are won?"  // Partial + status filter
```

---

### Summary for Managers

**What Works with Custom Regions:**
✅ All MCP filtering (`project(action: "pov.list")`, `project(action: "pov.details")`)
✅ Natural language queries via ChatGPT
✅ Partial name matching
✅ Case-insensitive search
✅ Combined filters (region + status + priority)
✅ Same experience as directional regions

**What Doesn't Care About Type:**
- MCP filtering (uses name only)
- API filtering (uses name only)
- ChatGPT search (uses name only)

**Manager Takeaway:**
Your managers can use ChatGPT to filter POVs by ANY region name you create - whether it's:
- Geographic ("Eastern Australia")
- Business division ("Enterprise Division")
- Industry sector ("Investment Banking")
- Custom territory ("Strategic Accounts Territory")

**It all works the same way!**

---

**Document Version:** 1.1
**Last Updated:** 2025-12-16
**Maintained By:** Development Team
**Addendum Added:** 2025-12-16 (MCP Geographical Filtering)
