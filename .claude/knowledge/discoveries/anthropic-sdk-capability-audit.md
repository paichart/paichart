# Anthropic SDK Capability Audit

> **Purpose**: Detect feature drift between the installed Anthropic SDK and our provider/types layer. Finds unsurfaced response fields, unhandled content block types, missing streaming delta types, and parity gaps between `generateText()` and `streamText()`.
> **Specialists**: agent-execution-specialist, mcp-tool-architecture-specialist
> **Estimated Time**: 20-40 minutes
> **When to Run**: After SDK upgrades, when Anthropic announces new API features, quarterly health check, or when a feature gap is discovered by chance (e.g., the `functionCalls[]` streaming gap found Mar 2026)

---

## Current State — implemented 2026-06 (SDK 0.51 → 0.105)

This audit drove the 0.51→0.105 upgrade. Outcome (all shipped; **Opus 4.8 proven live** 2026-06-19). The phase greps
below still apply for ongoing drift detection, but the provider layer is now MODEL-CONDITIONAL — expect these:
- **Capability map** `lib/services/llm/model-capabilities.ts` (`capabilitiesFor`, fail-loud on unknown; `clampEffort`):
  per-model temperature acceptance, thinking mode (adaptive / always-on / none), allowed-effort set, output ceiling.
- **Single request builder** `buildAnthropicRequest` (`anthropic-sdk-provider.ts`) — both paths; drops temperature for
  Opus 4.7/4.8/Fable, adaptive thinking, `output_config.effort`. **`normalizeStopReason`** replaced the dual `stop_reason as` cast.
- **Shared terminal finalizer** `lib/services/llm/finalize-response.ts` (`finalizeTextForStopReason`) — engine↔stream
  parity for max-turns / max_tokens / refusal.
- **Loop chokepoint** `normalizeModelConfig` (`agentic-tool-loop.ts`) — capability-conditional temp/effort; `pause_turn` resume.
- Registry `anthropicModels` (opus-4-8) + `LLM_STOP_REASONS`/`LLMStopReason` (types.ts); picker derives via `toModelOptions`.
- **PARKED**: WU-10 Fable (beta `fallbacks`/`betas`) pending Anthropic availability — `cline_docs/follow-ups/wu-10-fable-plan.md`
  (has its own Phase-0 re-validation gate). The dual-path `streamText`/`generateText` model + 128K streaming were the
  prior gaps this audit found; both are resolved (Phase-0-deep: `cline_docs/reviews/anthropic-sdk-upgrade-2026-06-19/`).

---

## Phase 0: SDK Version Check and Upgrade Assessment

### 0.1 Compare installed vs latest available
```bash
echo "=== Installed ==="
cat node_modules/@anthropic-ai/sdk/package.json | grep '"version"'

echo ""
echo "=== Declared in package.json ==="
cat package.json | grep anthropic

echo ""
echo "=== Latest available ==="
npm view @anthropic-ai/sdk version

echo ""
echo "=== All available versions (recent) ==="
npm view @anthropic-ai/sdk versions --json 2>/dev/null | tail -10
```

### 0.2 Check for breaking changes
```bash
# Compare major/minor version jump
echo "=== Changelog (check for BREAKING CHANGES) ==="
echo "Review: https://github.com/anthropics/anthropic-sdk-typescript/releases"
echo ""
# If upgrade candidate, check what changed in types
echo "=== Current SDK type exports ==="
grep "^export" node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts | wc -l
```

### 0.3 Check Gemini SDK version too
```bash
echo "=== Gemini SDK ==="
cat node_modules/@google/generative-ai/package.json | grep '"version"' 2>/dev/null
npm view @google/generative-ai version 2>/dev/null
```

### 0.4 Upgrade risk assessment
**Decision matrix**:
| Version Jump | Risk | Action |
|-------------|------|--------|
| Patch (0.51.0 → 0.51.1) | Low | Upgrade, run audit phases 1-3, test |
| Minor (0.51.0 → 0.52.0) | Medium | Upgrade, run FULL audit, check breaking changes |
| Major (0.x → 1.0) | High | Full audit + specialist review + staging test |

**Before upgrading**:
1. Run this full audit FIRST (baseline current state)
2. `npm update @anthropic-ai/sdk` (or `npm install @anthropic-ai/sdk@latest`)
3. Run audit AGAIN (diff against baseline)
4. `npx tsc --noEmit` (type check)
5. Test both `generateText()` and `streamText()` paths
6. Test agentic tool loop (multi-turn)

---

## Phase 1: SDK Version and Surface Area

### 1.1 Check installed SDK version
```bash
cat node_modules/@anthropic-ai/sdk/package.json | grep '"version"'
cat package.json | grep anthropic
```
**Record**: SDK version for comparison against https://github.com/anthropics/anthropic-sdk-typescript/releases

### 1.2 List all SDK content block types (response)
```bash
grep "ContentBlock =" node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts
```
**Expected (v0.51.0)**: `TextBlock | ToolUseBlock | ServerToolUseBlock | WebSearchToolResultBlock | ThinkingBlock | RedactedThinkingBlock`
**Check**: Does our provider handle ALL of these in both `generateText()` and `streamText()`?

### 1.3 List all SDK content block param types (request)
```bash
grep "ContentBlockParam =" node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts
```
**Expected**: `TextBlockParam | ImageBlockParam | ToolUseBlockParam | ServerToolUseBlockParam | WebSearchToolResultBlockParam | ToolResultBlockParam | DocumentBlockParam | ThinkingBlockParam | RedactedThinkingBlockParam`
**Check**: Can our provider SEND all of these? (Image, Document/PDF blocks especially)

### 1.4 List all SDK stop reasons
```bash
grep "StopReason =" node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts
```
**Expected**: `'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | 'pause_turn' | 'refusal'`
**Check against**: Our `LLMResponse.stopReason` type in `types.ts` and provider mapping

### 1.5 List all SDK streaming delta types
```bash
grep "RawContentBlockDelta =" node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts
```
**Expected**: `TextDelta | InputJSONDelta | CitationsDelta | ThinkingDelta | SignatureDelta`
**Check**: Which of these does our `streamText()` handle in the `content_block_delta` case?

### 1.6 List all SDK tool types
```bash
grep "ToolUnion =" node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts
```
**Expected**: `Tool | ToolBash20250124 | ToolTextEditor20250124 | WebSearchTool20250305`
**Check**: Do we support computer use tools (Bash, TextEditor) or only standard Tool?

---

## Phase 2: Provider Coverage Audit

### 2.1 Content block handling in generateText()
```bash
# What content block types does our provider check for?
grep -n "type.*===\|\.type ==" lib/services/llm/anthropic-sdk-provider.ts | grep -v "//\|mergedOptions"
```
**Check each against Phase 1.2 list**: Mark as HANDLED / UNHANDLED / PARTIALLY_HANDLED

### 2.2 Content block handling in streamText()
```bash
# What content_block_start types does streamText handle?
grep -n "content_block.type\|delta.type" lib/services/llm/anthropic-sdk-provider.ts
```
**Check each against Phase 1.2 and 1.5 lists**

### 2.3 Unhandled SDK types in our provider
```bash
# These SDK types should appear somewhere in our provider if we handle them
for type in "RedactedThinking" "SignatureDelta" "InputJSONDelta" "CitationsDelta" "DocumentBlock" "ToolBash" "ToolTextEditor" "pause_turn" "URLPDFSource" "Base64PDFSource" "WebSearchTool20250305"; do
  count=$(grep -c "$type" lib/services/llm/anthropic-sdk-provider.ts 2>/dev/null || echo 0)
  echo "$type: $count references"
done
```
**Expected findings**: Several types with 0 references = potential gaps

### 2.4 Stop reason mapping completeness
```bash
# Our provider's stop reason handling
grep -n "stop_reason\|stopReason\|end_turn\|max_tokens\|stop_sequence\|tool_use\|pause_turn\|refusal" lib/services/llm/anthropic-sdk-provider.ts
```
**Check**: Every SDK `StopReason` value must be mapped to our `LLMResponse.stopReason`

---

## Phase 3: Type Parity Audit (generateText vs streamText)

### 3.1 Compare response fields
```bash
# Fields set in generateText response
grep -A 1 "result\.\|return {" lib/services/llm/anthropic-sdk-provider.ts | grep -E "functionCall|stopReason|rawContent|usage|thinking|webSearch|citation|searchQuer" | head -20

# Fields yielded in streamText chunks
grep -B 1 -A 1 "yield {" lib/services/llm/anthropic-sdk-provider.ts | grep -E "functionCall|stopReason|rawContent|usage|thinking|webSearch|citation|searchQuer" | head -20
```
**Check**: Every field in `LLMResponse` that the `generateText()` path populates should have a corresponding field in `LLMStreamChunk` that `streamText()` populates.

### 3.2 Compare LLMResponse vs LLMStreamChunk interfaces (Type-to-Type)
```bash
# Extract field names from both interfaces and diff them
echo "=== LLMResponse fields ==="
sed -n '/^export interface LLMResponse/,/^export/p' lib/services/llm/types.ts | grep "^\s\+\w\+[?]\?:" | sed 's/[?]\?:.*//' | sed 's/^\s\+//' | sort -u > /tmp/llm_response_fields.txt
cat /tmp/llm_response_fields.txt

echo ""
echo "=== LLMStreamChunk fields ==="
sed -n '/^export interface LLMStreamChunk/,/^export/p' lib/services/llm/types.ts | grep "^\s\+\w\+[?]\?:" | sed 's/[?]\?:.*//' | sed 's/^\s\+//' | sort -u > /tmp/llm_chunk_fields.txt
cat /tmp/llm_chunk_fields.txt

echo ""
echo "=== In LLMResponse but NOT in LLMStreamChunk ==="
comm -23 /tmp/llm_response_fields.txt /tmp/llm_chunk_fields.txt
```
**Check**: Fields present in `LLMResponse` but missing from `LLMStreamChunk` are potential gaps. Intentionally absent: `metadata`, `isMock`. Everything else should be justified or added.

### 3.3 Compare type definitions against SDK types (Type-to-SDK)
```bash
# Our stopReason values vs SDK StopReason
echo "=== Our stopReason type ==="
grep "stopReason" lib/services/llm/types.ts | head -3

echo ""
echo "=== SDK StopReason type ==="
grep "StopReason =" node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts

# Our content block handling vs SDK ContentBlock union
echo ""
echo "=== SDK ContentBlock (response) ==="
grep "^export type ContentBlock =" node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts

echo ""
echo "=== SDK ContentBlockParam (request) ==="
grep "^export type ContentBlockParam =" node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts

echo ""
echo "=== SDK streaming deltas ==="
grep "^export type RawContentBlockDelta =" node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts
```
**Check**: Every value in SDK's `StopReason` must appear in our type. Every type in SDK's `ContentBlock` must be handled or explicitly documented as skipped.

### 3.3 Check Gemini provider parity
```bash
echo "=== Gemini generateText response fields ==="
grep -n "functionCall\|stopReason\|rawContent\|usage\|return {" lib/services/llm/gemini-sdk-provider.ts | head -15

echo ""
echo "=== Gemini streamText yield fields ==="
grep -n "functionCall\|stopReason\|usage\|yield {" lib/services/llm/gemini-sdk-provider.ts | head -15
```
**Check**: Same parity requirements as Anthropic provider

---

## Phase 4: Request Capability Audit

### 4.1 Prompt caching support
```bash
grep -n "cache_control\|cacheControl\|prompt.cache\|ephemeral" lib/services/llm/anthropic-sdk-provider.ts
grep -n "cache\|Cache" lib/services/llm/types.ts | grep -v "cacheRead\|cacheCreation"
```
**Check**: SDK supports `cache_control: { type: 'ephemeral' }` on system prompts and tools. Are we using it?

### 4.2 Extended thinking configuration
```bash
grep -n "thinking\|budget_tokens\|thinking_budget" lib/services/llm/anthropic-sdk-provider.ts
```
**Check**: Are we exposing `budget_tokens` control? Or using the SDK default?

### 4.3 Tool choice modes
```bash
grep -n "tool_choice\|functionCall.*auto\|functionCall.*none\|functionCall.*any" lib/services/llm/anthropic-sdk-provider.ts
```
**Check**: SDK supports `auto`, `any`, `none`, and `{ type: 'tool', name: '...' }`. Do we expose all modes?

### 4.4 Document/PDF input support
```bash
grep -n "DocumentBlock\|PDFSource\|pdf\|document" lib/services/llm/anthropic-sdk-provider.ts
grep -n "DocumentBlock\|PDFSource\|pdf\|document" lib/services/llm/types.ts
```
**Check**: SDK supports PDF and document input via `DocumentBlockParam`. Do we surface this capability?

### 4.5 Image input support
```bash
grep -n "ImageBlock\|image\|base64\|media_type" lib/services/llm/anthropic-sdk-provider.ts
grep -n "ImageBlock\|image" lib/services/llm/types.ts
```
**Check**: SDK supports image input. Do we pass through image content blocks?

### 4.6 Web search tool configuration
```bash
grep -n "WebSearchTool\|web_search\|server_tool" lib/services/llm/anthropic-sdk-provider.ts
```
**Check**: SDK has `WebSearchTool20250305` with `user_location`, `allowed_domains`, `blocked_domains`. Are we configuring any of these?

---

## Phase 5: Error Handling Audit

### 5.1 SDK error class handling
```bash
# What error types does the SDK export?
grep "Error" node_modules/@anthropic-ai/sdk/error.d.ts 2>/dev/null | head -20

# What errors does our provider catch specifically?
grep -n "catch\|instanceof\|Error\|error" lib/services/llm/anthropic-sdk-provider.ts | grep -v "//\|log\.\|err:" | head -20
```
**Check**: SDK exports `APIError`, `AuthenticationError`, `RateLimitError`, `BadRequestError`, etc. Do we catch any specifically for retry logic or better error messages?

### 5.2 Rate limit header handling
```bash
grep -n "rate.limit\|retry.after\|429\|x-ratelimit" lib/services/llm/anthropic-sdk-provider.ts
```
**Check**: SDK may expose rate limit headers. Are we using them for backoff?

### 5.3 Overloaded error handling
```bash
grep -n "overloaded\|529\|APIConnectionError" lib/services/llm/anthropic-sdk-provider.ts
```
**Check**: Anthropic returns 529 when overloaded. Do we handle this distinctly?

---

## Phase 6: Streaming Event Completeness

### 6.1 All streaming event types handled
```bash
# SDK streaming event types
grep "RawMessageStreamEvent =" node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts

# Our switch cases
grep -n "case '" lib/services/llm/anthropic-sdk-provider.ts | grep -v "//"
```
**Check**: Every SDK event type should have a `case` in our `streamText()` switch, or be explicitly documented as intentionally skipped.

### 6.2 content_block_stop handling
```bash
grep -n "content_block_stop\|block_stop" lib/services/llm/anthropic-sdk-provider.ts
```
**Check**: SDK fires `content_block_stop` after each block. We may need this for tool_use argument accumulation (InputJSONDelta assembles arguments incrementally).

### 6.3 InputJSONDelta handling (streaming tool arguments) -- KNOWN RISK

**Background**: In the Anthropic streaming protocol, `tool_use` content blocks arrive in stages:
1. `content_block_start` with `type: 'tool_use'` — has `id` and `name`, but `input` is `{}`
2. `content_block_delta` with `type: 'input_json_delta'` — incremental JSON fragments of the arguments
3. `content_block_stop` — signals the block is complete

If arguments are only read from `content_block_start`, they will be `{}` (empty). The provider must either:
- Accumulate `InputJSONDelta` chunks and parse on `content_block_stop`, OR
- Use `functionCall.arguments` from a separate accumulation path (which is what our provider does via the `functionCall` variable)

```bash
# Check if we handle input_json_delta
grep -n "InputJSONDelta\|input_json_delta\|partial_json" lib/services/llm/anthropic-sdk-provider.ts

# Check how rawContentBlocks are built in streamText (may have empty input)
grep -n "rawContentBlocks.push\|content_block_start" lib/services/llm/anthropic-sdk-provider.ts

# Check how functionCall.arguments is populated (separate path)
grep -n "functionCall.*=.*{" lib/services/llm/anthropic-sdk-provider.ts | grep -v "//"
```
**Check**: The `rawContentBlocks` pushed from `content_block_start` will have `input: {}` for tool_use blocks. If `rawContentBlocks` is used to construct multi-turn message history, the tool arguments will be missing. Either:
- Accumulate `InputJSONDelta` and update the block on `content_block_stop`, OR
- Reconstruct `rawContentBlocks` from `allFunctionCalls` at stream end (which has complete arguments), OR
- Document that `rawContentBlocks` in streaming is incomplete for tool arguments and callers should use `functionCalls[]` instead

**Priority**: Medium-High if streaming agentic loops use `rawContentBlocks` for message history. Low if they use `functionCalls[]` directly.

---

## Phase 7: Beta Features Check

### 7.1 List SDK beta resources
```bash
ls node_modules/@anthropic-ai/sdk/resources/beta/ 2>/dev/null
grep "beta" node_modules/@anthropic-ai/sdk/index.d.ts 2>/dev/null | head -10
```
**Check**: Are there beta features we should be aware of or opt into?

### 7.2 Computer use tools
```bash
grep -n "ToolBash\|ToolTextEditor\|computer_use\|bash_20250124\|text_editor" node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts | head -10
```
**Check**: SDK includes computer use tool types. Document availability even if not currently needed.

---

## Summary Template

After running all phases, fill in:

```
Anthropic SDK Capability Audit Results
=======================================
SDK Version:         [installed] vs [latest]
Last Audit:          [date]

Content Blocks (Response):
  TextBlock:                    [HANDLED/UNHANDLED] in [generateText/streamText/both]
  ToolUseBlock:                 [HANDLED/UNHANDLED] in [generateText/streamText/both]
  ServerToolUseBlock:           [HANDLED/UNHANDLED] in [generateText/streamText/both]
  WebSearchToolResultBlock:     [HANDLED/UNHANDLED] in [generateText/streamText/both]
  ThinkingBlock:                [HANDLED/UNHANDLED] in [generateText/streamText/both]
  RedactedThinkingBlock:        [HANDLED/UNHANDLED] in [generateText/streamText/both]

Content Blocks (Request):
  TextBlockParam:               [HANDLED/UNHANDLED]
  ImageBlockParam:              [HANDLED/UNHANDLED]
  DocumentBlockParam:           [HANDLED/UNHANDLED]
  ToolUseBlockParam:            [HANDLED/UNHANDLED]
  ToolResultBlockParam:         [HANDLED/UNHANDLED]

Stop Reasons:
  end_turn:        [MAPPED/UNMAPPED]
  max_tokens:      [MAPPED/UNMAPPED]
  stop_sequence:   [MAPPED/UNMAPPED]
  tool_use:        [MAPPED/UNMAPPED]
  pause_turn:      [MAPPED/UNMAPPED]
  refusal:         [MAPPED/UNMAPPED]

Streaming Deltas:
  TextDelta:           [HANDLED/UNHANDLED]
  InputJSONDelta:      [HANDLED/UNHANDLED]
  CitationsDelta:      [HANDLED/UNHANDLED]
  ThinkingDelta:       [HANDLED/UNHANDLED]
  SignatureDelta:      [HANDLED/UNHANDLED]

Tool Types:
  Tool (standard):           [SUPPORTED/UNSUPPORTED]
  ToolBash20250124:          [SUPPORTED/UNSUPPORTED]
  ToolTextEditor20250124:    [SUPPORTED/UNSUPPORTED]
  WebSearchTool20250305:     [SUPPORTED/UNSUPPORTED]

generateText/streamText Parity:
  functionCalls[]:      [PARITY/GAP]
  stopReason:           [PARITY/GAP]
  rawContentBlocks:     [PARITY/GAP]
  thinking:             [PARITY/GAP]
  webSearchResults:     [PARITY/GAP]
  citations:            [PARITY/GAP]
  usage:                [PARITY/GAP]

Request Capabilities:
  Prompt caching:       [USED/AVAILABLE/UNAVAILABLE]
  Extended thinking:    [USED/AVAILABLE/UNAVAILABLE]
  Tool choice modes:    [FULL/PARTIAL] (auto/any/none/named)
  Document/PDF input:   [USED/AVAILABLE/UNAVAILABLE]
  Image input:          [USED/AVAILABLE/UNAVAILABLE]
  Web search config:    [USED/AVAILABLE/UNAVAILABLE]

Error Handling:
  Specific error classes:  [YES/NO] (AuthenticationError, RateLimitError, etc.)
  Rate limit backoff:      [YES/NO]
  Overloaded (529):        [YES/NO]

Gemini Provider Parity:
  functionCalls[]:      [PARITY/GAP]
  stopReason:           [PARITY/GAP]
  rawContentBlocks:     [PARITY/GAP]
  AbortSignal:          [PARITY/GAP]

Known Risks:
  InputJSONDelta (streaming tool args):  [MITIGATED/OPEN] — rawContentBlocks may have empty tool input
  rawContentBlocks accuracy:             [FULL/PARTIAL] — content_block_start vs accumulated

SDK Upgrade:
  Installed:     [version]
  Latest:        [version]
  Version Jump:  [patch/minor/major]
  Upgrade Risk:  [LOW/MEDIUM/HIGH]
  Action:        [UPGRADE/HOLD/INVESTIGATE]

Gemini SDK:
  Installed:     [version]
  Latest:        [version]
  Action:        [UPGRADE/HOLD/INVESTIGATE]

Gaps Found:     [N] (list by priority)
Action Items:   [N] (with effort estimates)

Overall Health: [CURRENT/BEHIND/SIGNIFICANTLY_BEHIND]
```
