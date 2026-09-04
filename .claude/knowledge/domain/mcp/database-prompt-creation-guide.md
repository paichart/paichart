# Database Prompt Creation Guide for pAIchart MCP System

**Version**: 1.3.0
**Created**: 2025-11-25
**Last Updated**: 2026-04-11 (documented nested-conditional limitation of regex-based prompt engine)
**Category**: Domain Knowledge - MCP System
**Confidence**: 95% (Production-validated, specialist-reviewed)
**Production Validated**: November 25, 2025 (3 bugs fixed, 2-tier system restored)

---

## Executive Summary

Database prompts in pAIchart's MCP system are stored in the `AgentPromptLibrary` table and do NOT require editing `prompt-registry.js`. This enables dynamic, user-created prompts that can be added/modified without code deployment, forming the foundation of the **chameleon platform** that adapts to domain-specific needs (education, devops, medical, finance, legal).

### Two-Tier Prompt System

**After November 25, 2025 Fix**:
- ✅ **Built-in Prompts** (prompt-registry.js): Onboarding, core system functionality, fallback
- ✅ **Database Prompts** (AgentPromptLibrary): User-created, domain-specific, dynamic
- ✅ **Both merged in `list_prompts` response**: Full functionality restored

### Core Capabilities

- **3 Methods to Create** database prompts (seed script, Prisma Studio, API)
- **MCP Visibility Control** via `tags`, `isPublic`, `status` fields
- **Handlebars Templating** for dynamic variable substitution
- **Comprehensive Validation** via Zod schemas (XSS, injection, DoS prevention)
- **Admin-Only Creation** with full audit logging

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [How Database Prompts Are Created](#how-database-prompts-are-created)
3. [Database Schema Reference](#database-schema-reference)
4. [MCP Visibility Requirements](#mcp-visibility-requirements)
5. [Variables and Examples Format](#variables-and-examples-format)
6. [Real Example: list_tasks_guided](#real-example-list_tasks_guided)
7. [Two-Tier System Explanation](#two-tier-system-explanation)
8. [Validation and Security](#validation-and-security)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)
11. [Related Documentation](#related-documentation)

---

## Quick Start

### Create a Simple Database Prompt (3 minutes)

**Option 1: Prisma Studio** (Easiest for non-developers)
```bash
# 1. Open Prisma Studio
npx prisma studio

# 2. Navigate to AgentPromptLibrary model

# 3. Click "Add record"

# 4. Fill required fields:
{
  "name": "my_helpful_prompt",
  "description": "Brief description of what this prompt does",
  "category": "GENERAL",
  "promptText": "Your prompt text here with {{variable}} support",
  "variables": {},
  "examples": {},
  "useCase": "Describe when to use this prompt",
  "tags": ["mcp"],  # CRITICAL for visibility!
  "isPublic": true,
  "status": "ACTIVE"
}

# 5. Save
```

**Option 2: Seed Script** (For bulk creation or durable system prompts)
```bash
# 1. Add to an existing canonical seed in /scripts/ OR create
#    a new /scripts/seed-<domain>-prompts.ts
#
# Canonical seed scripts that target agent_prompt_library:
#   scripts/seed-agent-templates.ts  — agent template backstories
#   scripts/seed-protocol-prompts.ts — orchestration protocols + GUI prompts
#
# DO NOT create one-off seed scripts in /temp-scripts/ — that path
# was retired 2026-04-24 after the rationalisation project found
# it produced DB↔seed drift (prompts seeded from throwaway scripts
# that were never folded back into canonical seeds).
#
# 2. Run the canonical script
npx ts-node scripts/seed-<your-domain>-prompts.ts
```

**Option 3: Admin UI** (Production-ready)
```bash
# 1. Navigate to Admin panel
/admin/templates

# 2. Go to "Prompt Library" tab

# 3. Click "Create Prompt" button

# 4. Fill wizard form

# 5. Submit
```

---

## How Database Prompts Are Created

### Method 1: Seed Script (Recommended for System/Initial Prompts)

**When to Use**:
- Creating multiple prompts at once
- Initial system setup
- Bulk prompt migration
- Automated prompt deployment

**Steps**:

1. **Add entry to a canonical seed script in `/scripts/`** — do NOT create in `/temp-scripts/` (retired 2026-04-24 to prevent DB↔seed drift). Either extend an existing canonical script (`seed-agent-templates.ts`, `seed-protocol-prompts.ts`) or create a new one as `scripts/seed-<domain>-prompts.ts`.
   ```typescript
   import { PrismaClient } from '@prisma/client';
   import { AgentCategory, AgentComplexity, AgentTemplateStatus } from '@prisma/client';

   const prisma = new PrismaClient();

   async function seedMyPrompts() {
     try {
       console.log('🚀 Starting prompt seeding...');

       const prompts = [
         {
           name: 'my_custom_prompt',
           description: 'Helps users do something specific',
           category: AgentCategory.GENERAL,
           promptText: `Your prompt text here with {{variable}} support`,
           variables: {
             variable_name: {
               type: 'string',
               required: false,
               description: 'What this variable is for'
             }
           },
           examples: {
             input: { variable_name: 'example value' },
             output: 'Expected result description'
           },
           useCase: 'Describe specific use case',
           complexity: AgentComplexity.SIMPLE,
           estimatedTime: 30,
           isPublic: true,
           tags: ['mcp', 'domain:general']
         }
       ];

       for (const prompt of prompts) {
         console.log(`📝 Creating prompt: ${prompt.name}`);

         await prisma.agentPromptLibrary.create({
           data: {
             ...prompt,
             status: AgentTemplateStatus.ACTIVE,
             version: '1.0.0',
             usageCount: 0,
             createdBy: 'system'
           }
         });
       }

       console.log(`✅ Successfully created ${prompts.length} prompts`);

     } catch (error) {
       console.error('❌ Error seeding prompts:', error);
       throw error;
     } finally {
       await prisma.$disconnect();
     }
   }

   seedMyPrompts()
     .then(() => process.exit(0))
     .catch(() => process.exit(1));
   ```

2. **Run the seed script**
   ```bash
   npx ts-node temp-scripts/my-prompt-seed.ts
   ```

3. **Verify creation**
   ```bash
   # Check MCP server logs
   tail -f ~/.config/Claude/logs/mcp-server-paichart.log

   # Or test directly
   claude mcp list-prompts paichart
   ```

**Advantages**:
- ✅ Bulk creation (multiple prompts at once)
- ✅ Version control (script is tracked in git)
- ✅ Repeatable (can re-run on fresh database)
- ✅ Validation (TypeScript catches errors)

**Example Script**: `/temp-scripts/seed-mcp-prompts.ts` (6 prompts)

---

### Method 2: Prisma Studio (Easiest for Manual Creation)

**When to Use**:
- Creating 1-3 prompts manually
- Quick testing/prototyping
- Non-developers need to add prompts
- Visual preference over code

**Steps**:

1. **Open Prisma Studio**
   ```bash
   npx prisma studio
   # Opens browser at localhost:5555
   ```

2. **Navigate to AgentPromptLibrary model**
   - Click "AgentPromptLibrary" in left sidebar

3. **Add new record**
   - Click "Add record" button
   - Fill in fields (see schema below)
   - **CRITICAL**: Set `tags: ["mcp"]` for visibility
   - Set `isPublic: true`
   - Set `status: "ACTIVE"`

4. **Save record**
   - Click "Save 1 change"
   - Verify in list

5. **Prompt auto-reloads** (Nov 25, 2025)
   - Real-time event system using PostgreSQL NOTIFY/LISTEN
   - CREATE/UPDATE/DELETE triggers automatic cache reload
   - No MCP restart needed!
   - Check UI: Green "Live Updates" badge confirms event system active

   **Fallback** (if event system offline):
   ```bash
   pm2 restart paichart-mcp  # Production
   claude mcp restart paichart  # Local
   ```

**Advantages**:
- ✅ Visual interface (no coding required)
- ✅ Immediate feedback (see validation errors)
- ✅ Easy editing (click to modify)
- ✅ Database explorer (see all prompts)

**Disadvantages**:
- ❌ Manual process (one at a time)
- ❌ No version control (changes not tracked)
- ❌ Requires database access (local or production)

---

### Method 3: Admin API (Production-Ready)

**When to Use**:
- Production environment
- User-facing prompt creation
- Role-based access control needed
- Audit trail required

**Endpoints**:

**POST /api/agent-templates/prompt-library** - Create new prompt

**Request**:
```bash
curl -X POST https://paichart.app/api/agent-templates/prompt-library \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my_custom_prompt",
    "description": "Helpful description",
    "category": "GENERAL",
    "promptText": "Your prompt with {{variable}} support",
    "variables": {
      "variable": {
        "type": "string",
        "required": false,
        "description": "What this variable does"
      }
    },
    "examples": {
      "input": {"variable": "test"},
      "output": "Expected result"
    },
    "useCase": "When to use this",
    "complexity": "MEDIUM",
    "estimatedTime": 60,
    "tags": ["mcp", "domain:general"],
    "isPublic": true,
    "status": "ACTIVE"
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "cmxxx...",
    "name": "my_custom_prompt",
    "createdAt": "2025-11-25T...",
    "version": "1.0.0"
  }
}
```

**Security Features**:
- ✅ **Authentication required** (JWT token)
- ✅ **Admin-only access** (role check)
- ✅ **Rate limiting** (10 prompts per hour)
- ✅ **Comprehensive validation** (Zod schema)
- ✅ **Audit logging** (who, when, what)
- ✅ **Injection prevention** (XSS, prompt injection detection)

**Admin UI**: Navigate to `/admin/templates` → "Prompt Library" tab → "Create Prompt"

**Advantages**:
- ✅ Production-ready (authentication, validation, audit)
- ✅ User-friendly UI (wizard-based creation)
- ✅ Role-based access (admin-only)
- ✅ Secure (injection prevention, rate limiting)

**Implementation**: See `/app/api/agent-templates/prompt-library/route.ts` and `/components/admin/templates/PromptLibraryTab.tsx`

---

## Database Schema Reference

### AgentPromptLibrary Model (Prisma Schema)

**Location**: `/prisma/schema.prisma` (lines 407-437)

```prisma
model AgentPromptLibrary {
  id              String            @id @default(cuid())
  name            String
  description     String?
  category        AgentCategory

  // Prompt Configuration
  promptText      String            @db.Text
  variables       Json              // Available variables and their types
  examples        Json              // Example inputs and outputs

  // Usage Context
  useCase         String
  complexity      AgentComplexity   @default(MEDIUM)
  estimatedTime   Int?              // Seconds

  // Quality and Performance
  rating          Float?            // 1-5
  usageCount      Int               @default(0)
  successRate     Float?

  // Template Management
  version         String            @default("1.0.0")
  status          AgentTemplateStatus @default(ACTIVE)
  isPublic        Boolean           @default(false)
  tags            String[]          // MUST include 'mcp' for visibility!

  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt
  createdBy       String?
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | String | ✅ Auto | CUID identifier (e.g., `cmxxx...`) |
| `name` | String | ✅ | Unique prompt identifier (e.g., `list_tasks_guided`) |
| `description` | String | ⚠️ | User-facing description (max 5000 chars) |
| `category` | Enum | ✅ | `AgentCategory` enum (GENERAL, DEVELOPMENT, etc.) |
| `promptText` | Text | ✅ | Actual prompt with Handlebars syntax (max 50KB) |
| `variables` | JSON | ❌ | Variable definitions with types/descriptions |
| `examples` | JSON | ❌ | Example inputs and outputs (max 10KB) |
| `useCase` | String | ✅ | Specific use case description (max 2000 chars) |
| `complexity` | Enum | ✅ | `AgentComplexity`: SIMPLE, MEDIUM, COMPLEX, EXPERT |
| `estimatedTime` | Int | ❌ | Estimated execution time in seconds (max 7200) |
| `rating` | Float | ❌ | User rating 1-5 |
| `usageCount` | Int | ✅ Auto | Increments on each use (default: 0) |
| `successRate` | Float | ❌ | Success percentage (0-100) |
| `version` | String | ✅ | Semantic version (default: "1.0.0") |
| `status` | Enum | ✅ | ACTIVE, INACTIVE, DEPRECATED, DRAFT |
| `isPublic` | Boolean | ✅ | Must be `true` for MCP visibility |
| `tags` | String[] | ✅ | **CRITICAL**: Must include `'mcp'` for visibility |
| `createdAt` | DateTime | ✅ Auto | Timestamp of creation |
| `updatedAt` | DateTime | ✅ Auto | Timestamp of last update |
| `createdBy` | String | ❌ | User ID of creator |

### Enums Reference

**AgentCategory** (10 values):
```typescript
enum AgentCategory {
  GENERAL       // General-purpose prompts
  DEVELOPMENT   // Development/coding prompts
  TESTING       // QA and testing prompts
  DOCUMENTATION // Documentation generation
  ANALYSIS      // Data analysis prompts
  AUTOMATION    // Workflow automation
  REVIEW        // Code/content review
  DEPLOYMENT    // Deployment/DevOps
  MONITORING    // System monitoring
  SECURITY      // Security scanning
}
```

**AgentComplexity** (4 values):
```typescript
enum AgentComplexity {
  SIMPLE    // < 1 minute execution
  MEDIUM    // 1-5 minutes
  COMPLEX   // 5-15 minutes
  EXPERT    // 15+ minutes or requires deep knowledge
}
```

**AgentTemplateStatus** (4 values):
```typescript
enum AgentTemplateStatus {
  ACTIVE      // Available for use
  INACTIVE    // Hidden but not deleted
  DEPRECATED  // Shown with warning
  DRAFT       // Work in progress, not visible
}
```

---

## MCP Visibility Requirements

### Critical Fields for MCP Integration

For a database prompt to appear in `list_prompts` output and be callable via MCP:

**✅ REQUIRED**:
1. `tags` array MUST include `'mcp'`
2. `isPublic` must be `true`
3. `status` must be `ACTIVE`

**Example**:
```typescript
await prisma.agentPromptLibrary.create({
  data: {
    name: 'my_prompt',
    // ... other fields ...
    tags: ['mcp', 'interactive', 'workflow'],  // ← 'mcp' is CRITICAL
    isPublic: true,                             // ← Must be true
    status: 'ACTIVE',                           // ← Must be ACTIVE
  }
});
```

### Visibility Query Logic

**Location**: `/lib/mcp/server/prompts/prompt-registry.js` (lines 89-100)

```javascript
const dbPrompts = await tx.agentPromptLibrary.findMany({
  where: {
    status: 'ACTIVE',      // ← Must be ACTIVE
    isPublic: true,        // ← Must be public
    tags: {
      has: 'mcp'           // ← Must have 'mcp' tag
    }
  },
  orderBy: {
    usageCount: 'desc'     // Popular prompts first
  }
});
```

### Domain-Specific Tags

**Tag Format**: `domain:[domain-name]`

**Available Domains**:
- `domain:general` - General-purpose (default)
- `domain:devops` - DevOps/infrastructure
- `domain:education` - Educational institutions
- `domain:medical` - Healthcare/medical
- `domain:finance` - Financial services
- `domain:legal` - Legal services

**Example** (DevOps-specific prompt):
```typescript
{
  tags: ['mcp', 'domain:devops', 'infrastructure', 'deployment']
}
```

**Chameleon Platform**: Database prompts with domain tags enable the platform to transform based on deployment context (see "Two-Tier System" section).

---

## Variables and Examples Format

### Variables Structure

Variables enable dynamic content substitution using Handlebars syntax in `promptText`.

**Format**:
```typescript
variables: {
  [variable_name]: {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object',
    description: string,     // What this variable is for
    required: boolean,       // Is this variable mandatory?
    default?: string | number | boolean,  // Default value (auto-converted to string)
    minLength?: number,      // For strings (min length)
    maxLength?: number,      // For strings (max length)
    min?: number,           // For numbers (min value)
    max?: number,           // For numbers (max value)
    values?: string[]       // For enums (allowed values)
  }
}
```

### Variable Types

**1. String Variables**:
```typescript
{
  "component_name": {
    "type": "string",
    "required": true,
    "description": "Name of the component to review",
    "minLength": 1,
    "maxLength": 100
  }
}
```

**2. Enum Variables** (Dropdown selection):
```typescript
{
  "project_type": {
    "type": "enum",
    "values": ["web", "mobile", "api", "desktop"],
    "required": true,
    "description": "Type of project"
  }
}
```

**3. Number Variables**:
```typescript
{
  "timeout": {
    "type": "number",
    "required": false,
    "default": "30",
    "min": 1,
    "max": 300,
    "description": "Timeout in seconds"
  }
}
```

**4. Boolean Variables**:
```typescript
{
  "include_tests": {
    "type": "boolean",
    "required": false,
    "default": "true",
    "description": "Include test results in output"
  }
}
```

**5. Object Variables** (Complex nested data):
```typescript
{
  "config": {
    "type": "object",
    "required": false,
    "description": "Configuration object with multiple properties"
  }
}
```

### Examples Structure

Examples demonstrate expected inputs and outputs for the prompt.

**Format**:
```typescript
examples: {
  "example_1": {
    "input": {
      "variable_name": "example value"
    },
    "output": "Description of expected result"
  },
  "example_2": {
    "input": {
      "variable_name": "another value"
    },
    "output": "Different expected result"
  }
}
```

### Complete Variables Example

**Real-world code review prompt**:
```typescript
{
  "variables": {
    "component_name": {
      "type": "string",
      "required": true,
      "description": "Name of the component to review",
      "minLength": 1,
      "maxLength": 100
    },
    "project_type": {
      "type": "enum",
      "values": ["web", "mobile", "api", "desktop"],
      "required": true,
      "description": "Type of project"
    },
    "review_areas": {
      "type": "string",
      "required": false,
      "default": "security, performance, maintainability",
      "description": "Specific areas to focus on (comma-separated)"
    },
    "detail_level": {
      "type": "enum",
      "values": ["brief", "detailed", "comprehensive"],
      "required": false,
      "default": "detailed",
      "description": "Level of detail in feedback"
    }
  },
  "examples": {
    "security_review": {
      "input": {
        "component_name": "UserAuthentication",
        "project_type": "web",
        "review_areas": "security, error handling"
      },
      "output": "Comprehensive security analysis with specific recommendations for authentication component"
    },
    "api_review": {
      "input": {
        "component_name": "PaymentProcessor",
        "project_type": "api",
        "detail_level": "comprehensive"
      },
      "output": "Detailed API security review with compliance recommendations for payment processing"
    }
  }
}
```

### Handlebars Syntax in promptText

> **⚠️ IMPORTANT: The prompt engine uses regex-based substitution, NOT the real Handlebars library.**
>
> The template renderer at `lib/mcp/server/prompts/prompt-registry.js:442-450` uses per-variable regex patterns:
> ```javascript
> const ifElsePattern = new RegExp(
>   `{{#if ${key}}}([\\s\\S]*?){{else}}([\\s\\S]*?){{/if}}`, 'g'
> );
> ```
>
> This has a **hard limitation**: the non-greedy `*?` match grabs the *first* `{{else}}` or `{{/if}}` it finds, so **nested `{{#if}}` blocks will render incorrectly** — outer tags leak into the output as literals and both branches of the outer conditional render together.
>
> **Rule: do not nest `{{#if}}` blocks in paichart prompts.** Use flat, sibling blocks instead. See "Nested Conditionals Are Broken" below for the recommended pattern.

**Basic variable substitution**:
```handlebars
Hello {{user_name}}, welcome to {{project_name}}!
```

**Conditional blocks** (flat only, never nested):
```handlebars
{{#if detail_level}}
  Generating {{detail_level}} analysis...
{{else}}
  Generating standard analysis...
{{/if}}
```

**Iteration**:
```handlebars
{{#each review_areas}}
  - Analyzing {{this}}...
{{/each}}
```

**Default values**:
```handlebars
Priority level: {{priority_level}} {{! Defaults to value from variables.priority_level.default }}
```

### Nested Conditionals Are Broken — Use Flat Sibling Blocks Instead

**❌ WRONG — nested blocks**:
```handlebars
{{#if objective}}
  {{#if pov_name}}
    Starting pipeline for {{pov_name}}...
  {{else}}
    Which POV?
  {{/if}}
{{else}}
  What's your objective?
{{/if}}
```

**Symptom**: Literal `{{else}}` and `{{/if}}` appear in the rendered output, and both branches of the outer conditional render together. The regex engine grabs the inner `{{else}}` as if it were the outer one.

**✅ CORRECT — flat sibling blocks**:
```handlebars
{{#if objective}}
  Starting pipeline for {{pov_name}} with objective: {{objective}}...
{{/if}}

{{#if objective}}{{else}}
  What's your objective? Pick one:
  1. I have an objective
  2. Show me an example
{{/if}}
```

**Pattern**: To emulate an `if/else`, write two separate top-level `{{#if X}}...{{/if}}` and `{{#if X}}{{else}}...{{/if}}` blocks on the same variable. The regex engine treats each as an independent pattern match, so they don't interact.

**Verification**: After authoring a prompt, test it via `prompt_command(command: "/prompt <name>")` without variables and confirm no template tags appear as literals in the output.

**Historical note**: This limitation was discovered 2026-04-11 while authoring `pipeline_harness_guide` v1.5. Earlier versions used nested `{{#if}}` blocks and the rendered output contained orphaned `{{else}}` and `{{/if}}` literals plus a dangling "2. Create a PIPELINE task..." mid-document. The fix was to flatten all nested conditionals into sibling blocks.

---

## Real Example: list_tasks_guided

This is a production database prompt that demonstrates all features.

**Location**: Created via seed script `/temp-scripts/seed-mcp-prompts.ts` (lines 16-55)

### Prompt Text (with Handlebars)

```handlebars
I'll help you list tasks with the right filters. {{#if initial_context}}I see you're interested in {{initial_context}}. {{/if}}Let me know what you'd like to filter by:

**Available Filters:**
1. 📁 **POV** - Show tasks for a specific project (I can list available POVs)
2. 📊 **Status** - Filter by: OPEN, IN_PROGRESS, COMPLETED, or BLOCKED
3. 🎯 **Priority** - Filter by: HIGH, MEDIUM, or LOW
4. 👤 **Assignee** - Show tasks assigned to a specific person
5. 👥 **Team** - Show tasks for a specific team
6. 📋 **Phase** - Show tasks in a specific project phase
7. 🏁 **Stage** - Show tasks in a specific stage
8. 🤖 **Agent Role** - Show tasks with specific agent assignments

**Quick Options:**
- "Show all open high priority tasks"
- "List tasks for [POV name]"
- "What's assigned to [person name]?"
- "Show blocked tasks"
- "Tasks ready for agent execution"

What would you like to see?
```

### Variables Definition

```json
{
  "initial_context": {
    "type": "string",
    "required": false,
    "description": "Any initial context like POV ID or status"
  }
}
```

### Examples Definition

```json
{
  "input": {
    "initial_context": "high priority tasks"
  },
  "output": "Focused task list with priority=HIGH filter"
}
```

### Full Record

```typescript
{
  name: 'mcp_list_tasks_guided',
  description: 'Interactive guide for listing tasks with smart filters',
  category: AgentCategory.GENERAL,
  promptText: `[See above]`,
  variables: {
    initial_context: {
      type: 'string',
      description: 'Any initial context like POV ID or status',
      required: false
    }
  },
  examples: {
    input: { initial_context: 'high priority tasks' },
    output: 'Focused task list with priority=HIGH filter'
  },
  useCase: 'Interactive task discovery and filtering',
  complexity: AgentComplexity.SIMPLE,
  estimatedTime: 30,
  isPublic: true,
  tags: ['mcp', 'interactive', 'task-discovery', 'filtering']
}
```

### How It Works

1. **User calls prompt**: `/prompt mcp_list_tasks_guided initial_context="blocked tasks"`
2. **MCP server loads prompt**: Queries `AgentPromptLibrary` for `name='mcp_list_tasks_guided'`
3. **Handlebars substitution**: Replaces `{{initial_context}}` with "blocked tasks"
4. **Returns rendered prompt**: AI receives contextualized guidance
5. **AI responds**: Provides filtered task list based on prompt guidance

---

## Two-Tier System Explanation

After the **November 25, 2025 fix**, both built-in and database prompts work together.

### System Architecture

```
┌─────────────────────────────────────────────────────┐
│  MCP list_prompts Tool                               │
│  (/lib/mcp/server/tools/hub-tools-handler.js)       │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│  PromptRegistry.listAllPrompts()                     │
│  (/lib/mcp/server/prompts/prompt-registry.js:523)   │
└─────────────────────────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
┌──────────────────────┐    ┌──────────────────────┐
│  Built-in Prompts    │    │  Database Prompts    │
│  (prompt-registry.js)│    │  (AgentPromptLibrary)│
│                      │    │                      │
│  • Onboarding (3)    │    │  • User-created      │
│  • Core system (1)   │    │  • Domain-specific   │
│  • Fallback          │    │  • Dynamic           │
└──────────────────────┘    └──────────────────────┘
          │                             │
          └──────────────┬──────────────┘
                         ▼
         ┌───────────────────────────────┐
         │   Merged Prompt List          │
         │   Sent to AI Client           │
         └───────────────────────────────┘
```

### Built-in Prompts (4 prompts)

**File**: `/lib/mcp/server/prompts/prompt-registry.js`

**Purpose**: Core system functionality and fallback

**Prompts**:
1. **discover_paichart_platform** - Main onboarding entry point
2. **create_trial_account** - Signup guidance
3. **explore_mcp_hub** - MCP Hub showcase
4. **audit_all_tasks** - Complete POV task audit (pagination demo)

**Characteristics**:
- ✅ Always available (even if database is down)
- ✅ Code-based (version controlled)
- ✅ Requires deployment to modify
- ✅ Stable, tested, production-ready

**When to Use Built-in**:
- System-critical functionality (authentication, health checks)
- Onboarding flows (new user experience)
- Fallback when database unavailable
- Functionality requiring code execution

### Database Prompts (Dynamic count)

**Storage**: `AgentPromptLibrary` table in PostgreSQL

**Purpose**: User-created, domain-specific, dynamic prompts

**Examples** (6 created via seed script):
1. **mcp_list_tasks_guided** - Interactive task filtering
2. **mcp_select_pov** - POV search and selection
3. **mcp_configure_agent** - Agent configuration wizard
4. **mcp_workflow_assistant** - Common workflow guidance
5. **mcp_create_task_guided** - Task creation wizard
6. **mcp_navigate_phases** - Phase/stage navigation

**Characteristics**:
- ✅ Dynamic (add/edit without deployment)
- ✅ User-created (via admin UI or API)
- ✅ Domain-specific (education, devops, medical, etc.)
- ✅ Chameleon platform foundation

**When to Use Database**:
- Domain-specific guidance (education prompts for schools)
- User-customizable workflows
- A/B testing different prompt variations
- Frequently changing prompts

### Merged Output (listAllPrompts)

**Implementation**: `/lib/mcp/server/prompts/prompt-registry.js` (lines 523-623)

```javascript
async listAllPrompts(userContext = null, filters = {}) {
  // 1. Load database prompts (dynamic, domain-specific)
  await this.loadDatabasePrompts();

  // 2. Get built-in prompts (stable, always available)
  const builtInPrompts = Array.from(this.prompts.values());

  // 3. Get database prompts (user-created, MCP-tagged)
  const dbPrompts = Array.from(this.dbPrompts.values()).map(prompt => ({
    name: prompt.name,
    description: prompt.description,
    arguments: this.extractArgumentsFromVariables(prompt.variables),
    tags: prompt.tags,
    metadata: {
      category: prompt.category,
      complexity: prompt.complexity,
      estimatedTime: prompt.estimatedTime,
      usageCount: prompt.usageCount,
      source: 'database'  // ← Indicates database origin
    }
  }));

  // 4. Merge both sources
  const allPrompts = [...builtInPrompts, ...dbPrompts];

  // 5. Apply filters (domain, category, search)
  return allPrompts.filter(/* filter logic */);
}
```

**Result**: AI clients see both built-in and database prompts in a single unified list.

### Why Two Tiers?

**Stability + Flexibility**:
- Built-in prompts ensure core functionality always works
- Database prompts enable dynamic customization without deployment
- Graceful degradation if database is unavailable
- Best of both worlds: reliability + adaptability

**Chameleon Platform**:
- Database prompts tagged with `domain:education` transform pAIchart for schools
- Same codebase adapts to different industries via domain-specific prompts
- Users can create custom prompts for their specific workflows

---

## Validation and Security

### Zod Schema Validation

**File**: `/lib/validation/prompt-library-validation.ts`

**CreatePromptLibrarySchema** (lines 40-121):

```typescript
export const CreatePromptLibrarySchema = z.object({
  name: z.string()
    .min(1, 'Name required')
    .max(200, 'Name too long (max 200 chars)'),

  description: z.string()
    .min(1, 'Description required')
    .max(5000, 'Description too long (max 5000 chars)'),

  category: z.nativeEnum(AgentCategory),

  promptText: z.string()
    .min(10, 'Prompt too short (min 10 chars)')
    .max(50000, 'Prompt too long (max 50KB)'),
    // Admin-only: Injection checks removed (admins are trusted)

  variables: z.record(/* Variable validation */)
    .refine((vars) => Object.keys(vars).length <= 50, 'Too many variables (max 50)')
    .refine((vars) => JSON.stringify(vars).length <= 20000, 'Variables JSON too large (max 20KB)')
    .optional(),

  examples: z.record(z.any())
    .refine((ex) => JSON.stringify(ex).length <= 10000, 'Examples too large (max 10KB)')
    .optional(),

  tags: z.array(z.string().max(50).regex(/^[a-z0-9-]+$/))
    .max(20, 'Too many tags (max 20)')
    .refine((tags) => new Set(tags).size === tags.length, 'Duplicate tags not allowed'),

  // ... other fields
}).strict();  // ← Prevents extra fields (prototype pollution)
```

### Security Patterns

**Updated November 25, 2025**: Relaxed validation for admin-only creation

**Trust Model**:
- Only ADMIN/SUPER_ADMIN can create/edit prompts (enforced in route.ts)
- Admins are trusted to create quality prompts
- Focus on DoS prevention, not injection (admins may need technical content)

**1. DoS Prevention** (Size Limits):
```typescript
.max(50000, 'Prompt too long (max 50KB)')  // promptText
.refine((vars) => Object.keys(vars).length <= 50, 'Too many variables (max 50)')
.refine((vars) => JSON.stringify(vars).length <= 20000, 'Variables JSON too large (max 20KB)')
```

**5. Injection via Variable Names**:
```typescript
z.string()
  .regex(/^[a-zA-Z0-9_]+$/, 'Invalid variable name (alphanumeric + underscore only)')
```

**6. Duplicate Tags Prevention**:
```typescript
.refine(
  (tags) => new Set(tags).size === tags.length,
  'Duplicate tags not allowed'
)
```

**7. Prototype Pollution Prevention**:
```typescript
.strict()  // ← Rejects extra fields like __proto__, constructor
```

### Rate Limiting

**File**: `/lib/middleware/rate-limit.ts`

**promptCreationLimiter**:
```typescript
export const promptCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 10,                    // 10 prompts per hour
  message: 'Too many prompts created, try again later',
  standardHeaders: true,
  legacyHeaders: false,
});
```

### Audit Logging

**File**: `/app/api/agent-templates/prompt-library/route.ts` (lines 205-218)

**POST endpoint logs**:
```typescript
await trackActivity(user.userId, 'PROMPT_LIBRARY', 'CREATE', {
  resourceType: ResourceType.PROMPT_LIBRARY,
  action: ResourceAction.CREATE,
  success: true,
  details: `Created prompt: ${name}`,
  promptId: newEntry.id,
  category,
  isPublic,
  tags,
  promptTextLength: promptText.length,
  variableCount: variables ? Object.keys(variables).length : 0,
  ip: request.headers.get('x-forwarded-for') || 'unknown',
  userAgent: request.headers.get('user-agent') || 'unknown'
});
```

**Failed attempts also logged**:
```typescript
await trackActivity(user.userId, 'PROMPT_LIBRARY', 'CREATE_DENIED', {
  success: false,
  reason: 'Insufficient permissions',
  requiredRole: 'ADMIN',
  actualRole: user.role,
  ip: request.headers.get('x-forwarded-for') || 'unknown',
});
```

---

## Best Practices

### 1. Prompt Naming

**Format**: Use snake_case with descriptive prefixes

```typescript
// ✅ GOOD
'mcp_list_tasks_guided'
'mcp_configure_agent'
'audit_all_tasks'

// ❌ BAD
'listTasks'  // Not descriptive
'prompt1'    // Not semantic
'LIST-TASKS' // Wrong case
```

**Prefixes**:
- `mcp_` - Interactive MCP prompts requiring user input
- `audit_` - System audit prompts (automated analysis)
- `workflow_` - Multi-step workflow prompts
- `domain_` - Domain-specific prompts (e.g., `domain_education_enrollment`)

### 2. Tag Strategy

**Required Tags**:
- Always include `'mcp'` for visibility
- Add domain tag for chameleon platform: `'domain:devops'`
- Add functional tags: `'interactive'`, `'automation'`, `'guided'`

```typescript
// ✅ GOOD - Comprehensive tagging
tags: ['mcp', 'domain:education', 'interactive', 'student-management', 'enrollment']

// ⚠️ MINIMAL - Works but less discoverable
tags: ['mcp']

// ❌ BAD - Missing 'mcp' tag, won't be visible!
tags: ['interactive', 'student']
```

**Domain Tags**:
```typescript
// Education domain
tags: ['mcp', 'domain:education', ...]

// DevOps domain
tags: ['mcp', 'domain:devops', ...]

// Medical domain
tags: ['mcp', 'domain:medical', ...]
```

### 3. Prompt Text Guidelines

**Structure**:
```handlebars
I'll help you [action]. {{#if context}}Using context: {{context}}{{/if}}

**Options:**
1. Option 1 - Description
2. Option 2 - Description
3. Option 3 - Description

**Quick Commands:**
- "Command 1"
- "Command 2"

What would you like to do?
```

**Best Practices**:
- ✅ Start with clear purpose: "I'll help you..."
- ✅ Use Handlebars for dynamic content: `{{variable}}`
- ✅ Include conditional blocks: `{{#if}}...{{/if}}`
- ✅ Provide numbered options for clarity
- ✅ Give quick command examples
- ✅ End with open-ended question
- ❌ Avoid long paragraphs (use bullet points)
- ❌ Don't hardcode values (use variables)

### 4. Variable Definitions

**Always include**:
- `type` - Variable type (string, enum, number, etc.)
- `description` - Clear explanation of what it's for
- `required` - Whether it's mandatory

**Optional but recommended**:
- `default` - Default value if not provided
- `minLength`/`maxLength` - For strings
- `min`/`max` - For numbers
- `values` - For enums (dropdown options)

**Example**:
```typescript
variables: {
  search_term: {
    type: 'string',
    description: 'Search term for filtering results',
    required: false,
    minLength: 1,
    maxLength: 100,
    default: ''
  },
  limit: {
    type: 'number',
    description: 'Maximum number of results to return',
    required: false,
    min: 1,
    max: 100,
    default: '10'
  },
  sort_order: {
    type: 'enum',
    values: ['asc', 'desc'],
    description: 'Sort order for results',
    required: false,
    default: 'asc'
  }
}
```

### 5. Examples Best Practices

**Provide 2-3 examples**:
- Example 1: Minimal usage (required fields only)
- Example 2: Common usage (typical scenario)
- Example 3: Advanced usage (all fields)

**Format**:
```typescript
examples: {
  minimal: {
    input: { /* Only required fields */ },
    output: 'Basic expected result'
  },
  typical: {
    input: { /* Common scenario */ },
    output: 'Common expected result with more detail'
  },
  advanced: {
    input: { /* All optional fields */ },
    output: 'Comprehensive result with all features'
  }
}
```

### 6. Complexity and Time Estimates

**AgentComplexity Guidelines**:
- `SIMPLE` - < 1 minute, single action, no context needed
- `MEDIUM` - 1-5 minutes, multiple steps, some context
- `COMPLEX` - 5-15 minutes, multi-step workflow, significant context
- `EXPERT` - 15+ minutes, requires deep knowledge, multiple dependencies

**estimatedTime**:
- Base on actual testing, not guesses
- Include time for AI to process and respond
- Round to nearest 30 seconds for consistency

```typescript
// ✅ GOOD
complexity: 'SIMPLE',
estimatedTime: 30

// ✅ GOOD
complexity: 'COMPLEX',
estimatedTime: 600  // 10 minutes

// ❌ BAD
complexity: 'SIMPLE',
estimatedTime: 900  // Inconsistent - should be COMPLEX
```

### 7. Version Management

**Semantic Versioning**:
- **Major** (2.0.0): Breaking changes (variable name changes, removed options)
- **Minor** (1.1.0): New features (new variables, enhanced guidance)
- **Patch** (1.0.1): Bug fixes (typos, clarifications)

**When to update version**:
```typescript
// Patch update (1.0.0 → 1.0.1)
- Fix typo in prompt text
- Clarify existing description
- Add missing punctuation

// Minor update (1.0.0 → 1.1.0)
- Add new optional variable
- Enhance prompt with more options
- Add new example

// Major update (1.0.0 → 2.0.0)
- Rename variable (breaking change)
- Remove existing variable
- Change required/optional status
- Complete prompt rewrite
```

### 8. Testing New Prompts

**Before production**:
```bash
# 1. Create prompt in development database
npx ts-node temp-scripts/test-prompt-seed.ts

# 2. Restart MCP server
claude mcp restart paichart

# 3. Test with required fields only
claude mcp call-prompt paichart "my_prompt_name" '{}'

# 4. Test with all fields
claude mcp call-prompt paichart "my_prompt_name" '{"var1":"test","var2":123}'

# 5. Verify in ChatGPT, Claude Desktop, Gemini
# (Cross-platform compatibility check)

# 6. Monitor MCP logs for errors
tail -f ~/.config/Claude/logs/mcp-server-paichart.log

# 7. Check usageCount increment
# (Verifies prompt is being called successfully)
```

**Production deployment**:
1. Test in dev environment first
2. Create backup of existing prompt (if updating)
3. Deploy during low-traffic window
4. Monitor logs for 24 hours
5. Validate usageCount increments
6. Check successRate metric after 100 uses

---

## Troubleshooting

### Problem: Prompt not visible in list_prompts

**Symptoms**:
- Prompt created successfully in database
- Appears in Prisma Studio
- Not returned by MCP `list_prompts` tool

**Diagnosis Checklist**:
```bash
# 1. Check MCP tag
# Open Prisma Studio
npx prisma studio
# Navigate to AgentPromptLibrary → Find your prompt
# Verify: tags array includes 'mcp'

# 2. Check isPublic flag
# Verify: isPublic = true

# 3. Check status
# Verify: status = 'ACTIVE'

# 4. Real-time reload (Nov 25, 2025) - No restart needed!
# Prompts auto-reload when created/updated via UI or API
# Event system uses PostgreSQL NOTIFY/LISTEN
# Check status indicator in UI: Green "Live Updates" badge

# 5. Manual restart (if event system offline)
claude mcp restart paichart

# 5. Check MCP logs for errors
tail -f ~/.config/Claude/logs/mcp-server-paichart.log
# Look for: "Successfully loaded X MCP prompts"

# 6. Test directly
claude mcp list-prompts paichart | grep "your_prompt_name"
```

**Solution**:
```sql
-- Fix via Prisma Studio or SQL
UPDATE "AgentPromptLibrary"
SET
  "tags" = ARRAY['mcp', 'your', 'other', 'tags'],
  "isPublic" = true,
  "status" = 'ACTIVE'
WHERE "name" = 'your_prompt_name';
```

---

### Problem: Variables not working (Handlebars not substituting)

**Symptoms**:
- Prompt text shows `{{variable}}` literally
- No substitution happening
- Empty values for variables

**Diagnosis**:
```bash
# Check MCP logs for template rendering errors
tail -f ~/.config/Claude/logs/mcp-server-paichart.log | grep "template"

# Verify variable definition matches promptText
# Example: promptText uses {{user_name}} but variables defines "userName"
```

**Common Issues**:
1. Variable name mismatch (case-sensitive!)
   ```typescript
   // ❌ BAD
   promptText: "Hello {{user_name}}"
   variables: { userName: {...} }  // ← Wrong case!

   // ✅ GOOD
   promptText: "Hello {{user_name}}"
   variables: { user_name: {...} }  // ← Matches!
   ```

2. Invalid Handlebars syntax
   ```handlebars
   ❌ {{#if variable}}...{{/else}}  // No /else in Handlebars
   ✅ {{#if variable}}...{{else}}...{{/if}}  // Correct
   ```

3. Missing closing tags
   ```handlebars
   ❌ {{#if variable}}...  // Missing {{/if}}
   ✅ {{#if variable}}...{{/if}}
   ```

4. **Default values not applied** (Fixed Nov 25, 2025)
   ```handlebars
   ❌ Output shows empty when variable not provided
   ✅ Now applies default from variable config automatically
   ```

5. **{{else}} showing in output** (Fixed Nov 25, 2025)
   ```handlebars
   Problem: "analyzing CyberDefense{{else}}a specified POV"
   Cause: Handlebars parser didn't handle {{else}} blocks
   Fix: Enhanced parser now processes {{#if}}...{{else}}...{{/if}} correctly
   ```

**Solution**: Test rendering via the **live prompt command**, not the real Handlebars library. The paichart engine is a regex-based substitute that does NOT match the real Handlebars library's behavior for nested blocks — testing with `npm install handlebars` will give false positives.

```javascript
// From Claude Desktop / ChatGPT / any MCP client connected to paichart
prompt_command(command: "/prompt your_prompt_name")
// Or with variables:
prompt_command(command: "/prompt your_prompt_name user_name=John")

// Inspect the rendered output for literal {{else}}, {{/if}}, or {{#if}} tags.
// If any appear, you have nested conditionals that the regex engine cannot handle.
// See "Nested Conditionals Are Broken" earlier in this guide for the fix.
```

**Common root cause**: Nested `{{#if}}` blocks. The regex engine at `prompt-registry.js:442-450` is not nested-aware — see the warning box at the start of the Handlebars section.

---

### Problem: Validation errors on creation

**Symptoms**:
- API returns 400 Bad Request
- Error message: "Validation failed: ..."
- Prompt not created in database

**Common Validation Errors**:

1. **Prompt text too short** (min 10 chars)
   ```
   Error: Validation failed: promptText: Prompt too short (min 10 chars)
   ```
   **Fix**: Add more content to promptText

2. **Prompt text too long** (max 50KB)
   ```
   Error: Validation failed: promptText: Prompt too long (max 50KB)
   ```
   **Fix**: Reduce prompt text or split into multiple prompts

3. **Invalid category**
   ```
   Error: Validation failed: category: Invalid category
   ```
   **Fix**: Use valid AgentCategory enum value (GENERAL, DEVELOPMENT, etc.)

4. **Variable default type mismatch** (Fixed Nov 25, 2025)
   ```
   Error: variables.x.default: Expected string, received boolean
   ```
   **Fix**: Auto-converts boolean/number to string now (e.g., true → "true")

5. **Too many variables** (max 50)
   ```
   Error: Validation failed: variables: Too many variables (max 50)
   ```
   **Fix**: Reduce number of variables or split into multiple prompts

6. **Invalid tag format**
   ```
   Error: Validation failed: tags.0: Invalid tag format (lowercase, numbers, hyphens only)
   ```
   **Fix**: Use only lowercase letters, numbers, and hyphens in tags

**Debug Process**:
```bash
# 1. Check full error response
curl -X POST /api/agent-templates/prompt-library \
  -H "Content-Type: application/json" \
  -d '{ your json }' \
  -v  # ← Verbose output

# 2. Validate against schema manually
# See /lib/validation/prompt-library-validation.ts

# 3. Test with minimal payload first
{
  "name": "test_prompt",
  "description": "Test description",
  "category": "GENERAL",
  "promptText": "Simple test prompt",
  "useCase": "Testing validation",
  "tags": ["mcp"],
  "isPublic": true
}
```

---

### Problem: Prompt execution crashes MCP server

**Symptoms**:
- MCP server exits unexpectedly
- Log shows "Cannot read property 'warn' of undefined"
- Specific prompt causes crash

**Root Cause**: Logger missing `warn` method (Fixed November 25, 2025)

**Diagnosis**:
```bash
# Check MCP logs for stack trace
tail -n 100 ~/.config/Claude/logs/mcp-server-paichart.log | grep "Cannot read property"

# Verify fix applied
grep -A 5 "createLogger" lib/mcp/server/tools/sdk-native-basic-tools.js
# Should show 4 methods: debug, info, warn, error
```

**Solution**: Update logger implementation
```javascript
// In /lib/mcp/server/tools/sdk-native-basic-tools.js
this.logger = {
  debug: (msg, ...args) => console.debug(`[SDKNativeBasicTools] ${msg}`, ...args),
  info: (msg, ...args) => console.info(`[SDKNativeBasicTools] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[SDKNativeBasicTools] ${msg}`, ...args),  // ← Add this
  error: (msg, ...args) => console.error(`[SDKNativeBasicTools] ${msg}`, ...args)
};
```

---

### Problem: Database connection timeout on startup

**Symptoms**:
- MCP server starts but prompts not loading
- Log shows: "Database connection validation failed"
- Timeout errors in logs

**Diagnosis**:
```bash
# Check database connectivity
psql -h localhost -U your_user -d paichart_db -c "SELECT 1;"

# Check Prisma connection
npx prisma db pull  # Should succeed

# Check MCP logs
tail -f ~/.config/Claude/logs/mcp-server-paichart.log | grep "Database"
```

**Solution**:
```bash
# 1. Verify DATABASE_URL in .env
cat .env | grep DATABASE_URL

# 2. Test connection manually
psql "$(grep DATABASE_URL .env | cut -d= -f2-)"

# 3. Increase timeout in prompt-registry.js
# Line 106: Change timeout from 10000 to 30000 (30 seconds)

# 4. Restart MCP server
claude mcp restart paichart
```

---

## Related Documentation

### Core Files

- **Prisma Schema**: `/prisma/schema.prisma` (lines 407-437)
- **Prompt Registry**: `/lib/mcp/server/prompts/prompt-registry.js`
- **Validation Schema**: `/lib/validation/prompt-library-validation.ts`
- **API Route**: `/app/api/agent-templates/prompt-library/route.ts`
- **Admin UI**: `/components/admin/templates/PromptLibraryTab.tsx`
- **Seed Script Example**: `/temp-scripts/seed-mcp-prompts.ts`

### Knowledge Base

- **MCP Integration Discovery**: `/.claude/knowledge/discoveries/mcp-integration-discovery.md`
- **MCP Prompt Library Examples**: `/.claude/knowledge/prompts/`
  - `pov_health_check.md` - Single POV diagnostic (validated format)
  - `task_audit_and_planning.md` - Portfolio audit with auto-focus (validated format)
  - Both examples show proper Handlebars templating, variable definitions, and usage examples
- **Prompt Construction Patterns**: (To be created based on this guide)
- **Chameleon Platform Guide**: (To be created)

### Specialist Agents

- **prompt-construction-specialist**: Expert in prompt engineering and template design
- **mcp-integration-specialist**: MCP protocol integration expert
- **database-manager-specialist**: Database schema and Prisma expert

### Recent Fixes (November 25, 2025)

- **Review Directory**: `/cline_docs/reviews/mcp-prompt-issues-2025-11-25/`
- **Implementation Plan**: `implementation-plan.md` (3 bugs fixed)
- **Confidence Assessment**: 94% after fixes (was 89%)
- **Specialists Consulted**: prompt-construction (92%), mcp-integration (94%), boundary-contract (82%)

---

## Version History

**1.0.0** (2025-11-25):
- Initial comprehensive guide created
- Based on 3 MCP prompt bugs fixed November 25, 2025
- Validated by 3 specialists (92-94% confidence)
- Production-tested with real database prompts
- Two-tier system fully documented
- Security validation patterns included

---

## Next Steps

### For Users
1. Read this guide fully before creating first prompt
2. Start with Prisma Studio method (easiest)
3. Create 1-2 test prompts in development
4. Validate visibility with `list_prompts`
5. Test with actual AI clients (Claude Desktop, ChatGPT)
6. Graduate to seed scripts for bulk creation
7. Eventually use Admin UI for production prompts

### For Developers
1. Review validation schema in `/lib/validation/prompt-library-validation.ts`
2. Understand two-tier system architecture
3. Study seed script examples in `/temp-scripts/`
4. Implement domain-specific prompts for chameleon platform
5. Add new variable types as needed
6. Enhance Handlebars templating capabilities
7. Build prompt analytics dashboard

### For Specialists
- **prompt-construction-specialist**: Reference this guide for prompt template patterns
- **mcp-integration-specialist**: Use for MCP visibility requirements
- **database-manager-specialist**: Reference schema section for migrations
- **architectural-review-specialist**: Use two-tier system section for reviews

---

**Document Status**: ✅ Production-Ready
**Confidence**: 95%
**Last Validation**: November 25, 2025
**Maintained By**: prompt-construction-specialist, mcp-integration-specialist

## Admin-Only Prompts (Dec 9, 2025)

### How to Create Admin-Only Prompts

**Add 'admin' tag to prompt:**
```sql
-- When creating
INSERT INTO "AgentPromptLibrary" (name, tags, ...)
VALUES ('system_config_wizard', '["mcp", "admin"]', ...);

-- Or update existing
UPDATE "AgentPromptLibrary"
SET tags = tags || '{"admin"}'::jsonb
WHERE name = 'your_admin_prompt';
```

**Effect**: Prompt only visible to ADMIN/SUPER_ADMIN roles

**Filtering**: Automatic in prompt-registry.js lines 636-647

**Examples of admin prompts**:
- System configuration wizards
- Bulk user imports  
- Database maintenance
- Security audits

---
