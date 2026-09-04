# Endpoint Security Audit Protocol

**Purpose**: Systematic endpoint security assessment to identify unvalidated endpoints and security gaps
**When to Use**: Quarterly reviews, before security audits, after major feature releases, or when security concerns arise
**Time Required**: 2-3 hours (3 specialists in parallel)
**Success Pattern**: Proven Nov 3, 2025 (found 12 vulnerabilities, 96% confidence achieved)

---

## When to Run This Audit

### Required Triggers (MUST run):
- **Quarterly Security Review** (every 3 months)
- **Before Security Compliance Audits** (SOC 2, penetration testing, etc.)
- **After Security Incidents** (breach, vulnerability disclosure, insider threat)
- **Major Release Preparation** (v1.0, major feature launches)

### Recommended Triggers (SHOULD run):
- **After Adding 20+ New Endpoints** (significant API surface expansion)
- **After Authentication/Authorization Changes** (security model changes)
- **When Insider Threat Concerns Arise** (employee terminations, suspicious activity)
- **Before Third-Party Integrations** (exposing APIs externally)

### Optional Triggers (MAY run):
- **Monthly Security Check** (proactive monitoring)
- **After Validation Framework Changes** (when helpers/patterns updated)
- **Developer Request** (when security questions arise)

---

## Which Specialists to Consult

**Always Consult These 3 Specialists** (in parallel):

### 1. api-efficiency-specialist
**Focus**: Endpoint mapping and categorization

**Responsibilities**:
- Map all API endpoints (app/api/**/route.ts)
- Categorize by HTTP method (GET/POST/PUT/DELETE/PATCH)
- Identify endpoints accepting user input (JSON body, query params)
- Calculate validation coverage percentages
- Identify patterns of missing validation

**Questions to Ask**:
1. How many endpoints accept JSON body input (POST/PUT/PATCH)?
2. How many have Zod validation schemas?
3. What's the validation coverage percentage?
4. Which unvalidated endpoints accept user text input (XSS risk)?
5. Which unvalidated endpoints are user-facing (high priority)?
6. Are there patterns of missing validation (by domain or operation)?

---

### 2. sec-ops-specialist
**Focus**: Security risk assessment

**Responsibilities**:
- Assess attack surface for each unvalidated endpoint
- Identify attack vectors (XSS, SQL injection, DoS, prompt injection)
- Calculate security risk scores
- Prioritize vulnerabilities (CRITICAL/HIGH/MEDIUM/LOW)
- Recommend security hardening measures

**Questions to Ask**:
1. How many endpoints have CRITICAL security risk (unvalidated text)?
2. What are the top 5 most dangerous unvalidated endpoints?
3. Are there authentication bypasses or authorization issues?
4. What attack vectors are unmitigated?
5. Should we add rate limiting to more endpoints?
6. Overall security posture score?

---

### 3. validation-engine-specialist
**Focus**: Validation pattern assessment

**Responsibilities**:
- Inventory all validation schemas (lib/validation/*.ts)
- Map endpoints to validation schemas
- Assess validation pattern consistency
- Identify validation anti-patterns (.parse vs .safeParse, missing .nullable, etc.)
- Recommend validation improvements

**Questions to Ask**:
1. How many centralized validation schemas exist?
2. Which endpoints use centralized vs inline validation?
3. What percentage of user-input endpoints have validation?
4. Are there inconsistent validation patterns?
5. Which unvalidated endpoints should get schemas first?
6. Overall validation coverage confidence score?

---

## Preventing False Positives: Injection Detection Decision Framework

**Critical Guidance** (Added Nov 28, 2025 - P2.1 Learnings):

Before flagging endpoints for "missing prompt injection detection", determine **what threat model applies**:

### Step 1: Is This Data Sent to LLMs?

**Check Method**:
```bash
# Search if field appears in LLM prompt building
grep -r "field_name" lib/services/agentExecutionEngine.ts
grep -A 50 "buildAgentPrompt\|parts.push" lib/services/agentExecutionEngine.ts
```

**Common LLM-Facing Data** (Needs Prompt Injection Detection):
- ✅ Agent template prompts, roles, instructions
- ✅ Task titles, descriptions (used for AI context)
- ✅ POV titles, descriptions, objectives (used for AI context)
- ✅ Phase names, descriptions (used for AI context)
- ✅ User-provided prompts for agent execution

**Common UI-Only Data** (Needs XSS, NOT Prompt Injection):
- ❌ Notifications (displayed in UI, never sent to LLMs)
- ❌ Team member notes (management UI only)
- ❌ User preferences/settings (configuration)
- ❌ Support requests (unless AI-triaged - verify!)
- ❌ Comments, activity logs (display only)

### Step 2: Apply Correct Protection

**If LLM-Facing** → Use `detectPromptInjection()`:
```typescript
import { detectPromptInjection } from '@/lib/security/prompt-injection-prevention';

title: z.string()
  .max(500)
  .refine((val) => detectPromptInjection(val).isSafe, {
    message: 'Contains prompt injection patterns. Use plain text.'
  })
```
- **Coverage**: 31 patterns (instruction override, role switching, jailbreaks, etc.)
- **Cost**: Higher validation overhead
- **Justified**: Prevents LLM manipulation

**If UI-Only** → Use XSS sanitization:
```typescript
// Simpler, focused XSS protection
const XSSSafeString = (maxLength: number) => z.string()
  .max(maxLength)
  .refine((val) => {
    const xssPatterns = [
      /<script[\s>]/i,
      /javascript:/i,
      /on(click|load|error|mouseover)\s*=/i,
      /<iframe[\s>]/i,
      /<object[\s>]/i,
      /<embed[\s>]/i
    ];
    return !xssPatterns.some(pattern => pattern.test(val));
  }, {
    message: 'Contains unsafe HTML/JavaScript. Use plain text.'
  });
```
- **Coverage**: 6 patterns (script tags, event handlers, iframes)
- **Cost**: Lower validation overhead (5x faster)
- **Justified**: Prevents XSS attacks in UI

### Step 3: Document Decision

When reviewing endpoints, note:
- "Notification endpoints: XSS protection applied (not LLM-facing)"
- "Task description: Prompt injection applied (sent to agentExecutionEngine)"

**False Positive Prevention**:
- ✅ Verify data flow before recommending prompt injection detection
- ✅ Use grep to confirm if field sent to LLM
- ✅ Distinguish XSS (UI threat) from prompt injection (LLM threat)
- ✅ Avoid over-engineering (31 patterns when 6 suffice)

**Proven Impact** (Nov 28, 2025):
- Notification domain: Changed from prompt injection → XSS (60% faster validation)
- False positive rate: Reduced from ~15% → <5%
- Precision: Injection detection only where threats exist

---

## Expected Outputs

### From Each Specialist:

**1. Comprehensive Assessment Report**
- Discovery findings summary
- Answers to all 6 questions
- Categorized findings (CRITICAL/HIGH/MEDIUM/LOW)
- Confidence score with justification
- **NEW**: Data flow analysis (LLM-facing vs UI-only) for injection findings

**2. Risk Matrix**
- Endpoint × Risk Level × Attack Vectors
- Validation coverage by domain
- Top 10 highest-risk findings

**3. Prioritized Recommendations**
- Immediate fixes (P0 - this week)
- Short-term fixes (P1 - next week)
- Long-term improvements (P2/P3 - next month)

---

## How to Execute the Audit

### Step 1: Create Review Directory (5 min)
```bash
mkdir -p cline_docs/reviews/endpoint-security-audit-$(date +%Y-%m-%d)
```

### Step 2: Launch 3 Specialists in Parallel (2-3 hours)

**Instruct each specialist to**:
1. **Run discovery FIRST** (discovery-first protocol)
2. Execute endpoint-security-audit discovery prompt
3. Answer all 6 questions specific to their domain
4. Provide confidence score
5. Create assessment report in review directory

**Command**:
```
Please run an endpoint security audit following the endpoint-security-audit-protocol.
Launch api-efficiency-specialist, sec-ops-specialist, and validation-engine-specialist
in parallel. Instruct them to run discovery-first and use the endpoint-security-audit
discovery prompt. Have them save reports to cline_docs/reviews/endpoint-security-audit-YYYY-MM-DD/
```

### Step 3: Compile Findings (30 min)

After all 3 specialists complete:
- Aggregate findings into comprehensive report
- Calculate overall security score (average of 3 specialists)
- Identify consensus top 10 risks
- Create prioritized fix list (P0/P1/P2)

---

## Success Criteria

### Confidence Thresholds

**< 70%**: CRITICAL - Immediate action required
- Multiple CRITICAL vulnerabilities
- Low validation coverage (< 20%)
- High-risk endpoints unprotected

**70-85%**: NEEDS IMPROVEMENT - Plan remediation
- Some CRITICAL vulnerabilities
- Moderate validation coverage (20-50%)
- Key endpoints need protection

**85-92%**: GOOD - Minor improvements
- No CRITICAL vulnerabilities
- Good validation coverage (50-70%)
- Security posture acceptable

**92-100%**: EXCELLENT - Maintain and monitor
- Zero CRITICAL vulnerabilities
- High validation coverage (70%+)
- Security posture strong

---

## Action Based on Findings

### If Security Score < 70% (CRITICAL)

**Immediate Actions**:
1. Create emergency fix plan (< 1 week)
2. Fix all CRITICAL vulnerabilities
3. Add basic validation to top 10 risks
4. Deploy with monitoring
5. Re-audit after fixes

**Timeline**: 1-2 weeks maximum

---

### If Security Score 70-85% (NEEDS IMPROVEMENT)

**Planned Actions**:
1. Create phased fix plan (2-4 weeks)
2. Phase 1: Fix CRITICAL (week 1)
3. Phase 2: Fix HIGH (weeks 2-3)
4. Phase 3: Fix MEDIUM (week 4)
5. Re-audit quarterly

**Timeline**: 1 month

---

### If Security Score 85-92% (GOOD)

**Incremental Actions**:
1. Track findings as technical debt
2. Fix opportunistically (with related work)
3. Prioritize new features
4. Re-audit quarterly or semi-annually

**Timeline**: 2-3 months

---

### If Security Score 92%+ (EXCELLENT)

**Maintenance Actions**:
1. Document findings for awareness
2. Monitor for regression
3. Maintain current practices
4. Re-audit quarterly or annually

**Timeline**: Ongoing monitoring

---

## Integration with Other Protocols

### Works WITH:
- **Specialist-Review-Protocol**: Use for implementing fixes found
- **Discovery-First Workflow**: All specialists run discovery first
- **Boundary-Crossing Development**: When fixing endpoints affecting multiple layers

### Complements:
- Regular validation improvements
- Security hardening initiatives
- Compliance preparation (SOC 2, etc.)

---

## Proven Results (Nov 3, 2025)

**What It Found**:
- 12 security vulnerabilities (4 CRITICAL)
- 155/189 endpoints lack validation (82% gap)
- 187/189 endpoints lack rate limiting (99% gap)
- Top 5 dangerous endpoints identified

**What It Enabled**:
- Fixed 4 CRITICAL security gaps (support, feature, settings, builder)
- Improved security score 72→96 (+24 points)
- Prevented insider threat attacks
- Established comprehensive protection (6 layers)

**Time Investment**: 3 hours audit → 2 hours fixes → 5 hours total
**ROI**: 100-500x (prevented months of security incidents)

---

## Quick Reference

**Run Audit**:
```
Please run endpoint-security-audit-protocol with api-efficiency-specialist,
sec-ops-specialist, and validation-engine-specialist (discovery-first).
```

**Review Results**:
```
cat cline_docs/reviews/endpoint-security-audit-YYYY-MM-DD/comprehensive-findings.md
```

**Track Progress**:
- Use specialist-review-protocol for implementing fixes
- Create implementation plan with phases
- Monitor security score improvement

---

## Post-Audit Actions (After Specialist Reports)

After receiving specialist reports and implementing security fixes, consider these optimization steps:

### Step 1: Review Implementation Results

**Assess**:
- Security score improvement (before → after)
- Validation coverage % (target: >70%)
- Endpoints secured (CRITICAL → HIGH → MEDIUM)
- Tests passing (all validation tests should pass)

### Step 2: Middleware Consolidation (Optional)

For domains with many secured endpoints:

**Consider**: Domain-specific middleware wrapper
- **Pattern**: `.claude/knowledge/patterns/api-security-withPOVAccess-pattern.md`
- **Discovery**: Run `middleware-patterns-discovery.md` to find opportunities
- **When**: After securing 15+ endpoints in same domain
- **Benefit**: Eliminate 60-70% boilerplate per route
- **Time**: 5 min per route conversion

**Example from POV Domain** (Nov 6-7, 2025):
- Created: withPOVAccess middleware (lib/auth/validate-pov-access.ts)
- Applied: 21 routes
- Eliminated: ~650 lines boilerplate
- Pattern: Reusable for Task/Agent domains

**Discovery Command**:
```bash
# Find routes with repetitive auth boilerplate
grep -r "const user = await getAuthUser" app/api/[domain] --include="*.ts" -l | \
  xargs -I {} sh -c 'grep -q "validatePOVAccess" {} && echo {}'
```

### Step 3: Testing & Validation

**Add Domain-Specific Security Tests**:
- **Pattern**: scripts/test-pov-security.js (file-based validation)
- **What to test**: XSS prevention, prompt injection, DoS limits, CUID enforcement
- **Integration**: Add to npm run test:all-validation
- **Time**: ~30 min to create, permanent value

### Step 4: Documentation

**Update Knowledge Base**:
- **Toolkit**: Add new patterns as optional steps (if discovered)
- **Patterns**: Document new middleware/validation patterns
- **Specialists**: Reference discoveries (not hardcode learnings)
- **Discovery-Driven**: Use grep commands, not static knowledge

### Step 5: Continuous Monitoring

**Quarterly Re-Audit**:
- Run this protocol every 3 months
- Track security score trends
- Update validation schemas as Prisma evolves
- Maintain >85% security score

**Incident Response**:
- Security breach → Immediate re-audit
- New vulnerabilities → Prioritized fixes
- Compliance audit → Verification audit

---

## Complete Workflow Cycle

**Full cycle** (see `.claude/knowledge/PROTOCOL-to-TOOLKIT-Workflow.md` for detailed example):

1. **Protocol triggers** → Quarterly schedule, incident response, new endpoints
2. **Discovery analyzes** → Grep commands find current state
3. **Specialists audit** → Comprehensive assessment (3 parallel)
4. **Protocol guides post-audit** → Middleware consolidation, testing
5. **Toolkit implements** → 5-step pattern (or batch)
6. **Patterns detail** → How to code (withPOVAccess, etc.)
7. **Tests validate** → Security measures working
8. **Deploy** → Monitor → Repeat quarterly

**Reference**: Complete workflow with POV domain example documented in workflow guide.

---

**Protocol Version**: 1.1
**Date Created**: November 3, 2025
**Last Updated**: November 7, 2025 (added post-audit section)
**Success Rate**: 100% (2/2 audits successful - POV domain + original)
**Pattern Validated**: ✅ Proven effective
