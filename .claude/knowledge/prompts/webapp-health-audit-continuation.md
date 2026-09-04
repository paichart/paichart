# Continuation Prompt: pAIchart Web App Health Audit

> **Created**: 2026-01-06 | **Purpose**: Browser-based testing POV for paichart.app
> **Prerequisites**: Browser-automation-service access, authentication token

## Goal

Create a POV in pAIchart to systematically test, debug, and fix the paichart.app
web application using the browser-automation-service.

## Previous Session Accomplishments

- Created MCP Service Quality Assessment Protocol
- Enhanced `registry(action: "tools")` with qualityAssessment grades (A/B/C/D)
- Enhanced `register_service_wizard` with Quality Registration Guide
- Gold Standard compliance test script: `scripts/test-gold-standard-compliance.js`
- Commits: `3b7debd`, `2a630b6`, `7669b9a`

## POV Structure to Create

### POV: "pAIchart Web App Health Audit Q1 2026"

**Phase 1: Route & Component Audit**
- Stage: Orphaned Routes Discovery
  - Task: Scan /app directory for all route.tsx files
  - Task: Compare routes to navigation/sidebar links
  - Task: Identify orphaned routes (exist but unreachable)

- Stage: Component Cleanup
  - Task: Find unused components (not imported anywhere)
  - Task: Check package.json for unused dependencies (jest, puppeteer, etc.)
  - Task: Generate cleanup report

**Phase 2: Security & Validation Testing**
- Stage: Auth Flow Testing
  - Task: Test OAuth login flows (Microsoft, Google, GitHub)
  - Task: Test session persistence and refresh
  - Task: Test unauthorized access attempts

- Stage: Form Validation Testing
  - Task: Test POV creation form validation
  - Task: Test task creation validation
  - Task: Test injection prevention (XSS, SQL)

**Phase 3: UI/UX Testing**
- Stage: Screenshot Baseline
  - Task: Capture dashboard screenshots (light/dark mode)
  - Task: Capture POV detail page screenshots
  - Task: Capture task management screenshots

- Stage: Interactive Testing
  - Task: Test navigation flow (sidebar → pages)
  - Task: Test form submissions
  - Task: Test error states and feedback

**Phase 4: Performance & Health**
- Stage: Load Testing
  - Task: Test page load times
  - Task: Test API response times
  - Task: Identify slow routes

## Browser Service Tools Available

```
services(action: "call", targetService: 'browser-automation-service', tool: '<tool>', arguments: {...})
```

| Tool | Use Case |
|------|----------|
| `scrape_page` | Extract route lists, component usage |
| `fill_form` | Test form validation |
| `click_element` | Test navigation, buttons |
| `take_screenshot` | Capture UI states |
| `generate_pdf` | Create audit reports |
| `run_script` | Execute DOM analysis |
| `trace_session` | Record user flows |

## Authentication Required

To access paichart.app via browser-automation-service, provide one of:

1. **Session Cookie**: Copy from browser (DevTools → Application → Cookies)
   - Need: `next-auth.session-token` or similar auth cookie

2. **API Key**: pAIchart API key with appropriate scopes

3. **OAuth Flow**: Guide through OAuth if browser service supports it

## First Actions

1. Authenticate with browser-automation-service
2. Create the POV: `perform(action: "execute")(action: 'pov.create', ...)`
3. Set up phases and stages
4. Create initial audit tasks
5. Begin with orphaned route discovery using `run_script` or `scrape_page`

## Codebase Analysis Commands

Before browser testing, run local analysis:

```bash
# Find all routes
find app -name "route.tsx" -o -name "page.tsx" | head -50

# Find unused exports
grep -r "export " components/ --include="*.tsx" | wc -l

# Check package.json for test frameworks
grep -E "jest|puppeteer|playwright|cypress" package.json

# Find components not imported anywhere
for f in components/**/*.tsx; do
  name=$(basename "$f" .tsx)
  count=$(grep -r "$name" --include="*.tsx" | wc -l)
  if [ "$count" -lt 2 ]; then echo "Potentially unused: $f"; fi
done
```

## Success Criteria

- [ ] All routes mapped and orphans identified
- [ ] Unused dependencies flagged for removal
- [ ] Auth flows tested across all providers
- [ ] Form validation coverage verified
- [ ] Screenshot baseline captured
- [ ] Performance benchmarks established
