# Discovery Prompt: Claude Desktop Artifact Access

## Problem Statement
Claude Desktop shows MCP resource artifacts but users cannot download or access them directly even though the resources are listed with URIs like `mcp://artifacts/{id}`.

## Key Findings

### What Works
- ✅ MCP server lists artifact resources correctly via `resources/list`
- ✅ Artifacts have proper URIs: `mcp://artifacts/{artifactId}`
- ✅ HTTP download URLs are generated and included in descriptions
- ✅ `agent_results` tool now returns proper MCP URIs

### What Doesn't Work
- ❌ Claude Desktop doesn't make `mcp://` URIs clickable
- ❌ HTTP download URLs in descriptions aren't clickable in Claude Desktop
- ❌ No automatic resource reading when user clicks on MCP resources
- ❌ User cannot directly download artifacts from Claude Desktop interface

## Root Cause Analysis

Claude Desktop limitations:
1. **No URI Scheme Handler**: Claude Desktop doesn't register a handler for `mcp://` URIs
2. **No HTTP Link Rendering**: Download URLs in resource descriptions aren't rendered as clickable links
3. **No Automatic Reading**: Claude Desktop doesn't automatically call `resources/read` when displaying resources
4. **Security Restrictions**: Claude Desktop likely blocks direct HTTP URL access for security

## Solution Approaches

### Option 1: Direct Content Embedding
Instead of providing URLs, embed the actual content in the `agent_results` output:
- Pro: Content immediately available
- Con: Large token usage for big artifacts

### Option 2: Copy-Paste URLs
Provide URLs that users can manually copy and paste into browser:
- Pro: Works with current implementation
- Con: Poor user experience

### Option 3: Base64 Encoding
Return artifacts as base64-encoded data URIs:
- Pro: Self-contained, no external access needed
- Con: Large response size

### Option 4: External Tool Integration
Use a separate tool to fetch and display artifacts:
- Pro: Full control over presentation
- Con: Requires additional setup

## Recommended Implementation

### Short-term Fix
1. In `agent_results` tool, include copyable download URLs
2. Add instructions for users to copy/paste URLs
3. Ensure URLs are on their own line for easy selection

### Long-term Solution
1. Implement a dedicated `download_artifact` tool that returns base64 content
2. Create a web interface for artifact browsing
3. Implement proper MCP resource content delivery

## Testing Commands

```bash
# Check if artifacts exist in database
psql $DATABASE_URL -c "SELECT id, name, type FROM \"AgentArtifact\" WHERE \"executionId\" = 'cmdxqw5lz000jcjczsl4l1kbu';"

# Test artifact download URL
curl -I "http://127.0.0.1:3000/api/artifacts/{artifactId}/public-download?token={token}"

# Check MCP resource listing
grep "resources/list" ~/.config/Claude/logs/mcp.log | tail -5
```

## Implementation Status
- [x] Fixed URI scheme from `execution://` to `mcp://`
- [x] Resources list correctly in Claude Desktop
- [ ] Make download URLs accessible to users
- [ ] Implement alternative access method

## Next Steps
1. Consider implementing a `get_artifact_content` tool that returns artifact content directly
2. Add clear instructions in `agent_results` output for accessing artifacts
3. Create a web-based artifact viewer as fallback option