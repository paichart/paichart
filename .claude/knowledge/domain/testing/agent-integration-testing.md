# Agent Integration Testing Guide

**Type**: Integration/E2E Testing Procedures
**Method**: Manual testing using curl + psql
**Purpose**: Verify agent system functionality end-to-end

**Related**: For automated validation schema tests (unit tests), see:
- `validation-testing-architecture.md` (174 automated tests for schemas)

---

## Overview

This document provides comprehensive testing procedures using `curl` and `psql` to verify all essential features of the agent system architecture. These tests validate the complete data flow from Claude Desktop through the MCP API to database storage and agent execution.

## Prerequisites

### Environment Setup
```bash
# Ensure server is running
npm run dev

PGPASSWORD=postgres psql -U postgres -h localhost -d copov15 -c "\dt"

 Schema |          Name           | Type  |  Owner   
--------+-------------------------+-------+----------
 public | Activity                | table | postgres
 public | CRMFieldMapping         | table | postgres
 public | CRMSettings             | table | postgres
 public | CRMSyncHistory          | table | postgres
 public | Country                 | table | postgres
 public | CustomSchema            | table | postgres
 public | FeatureRequest          | table | postgres
 public | KPITemplate             | table | postgres
 public | Milestone               | table | postgres
 public | POV                     | table | postgres
 public | POVKPI                  | table | postgres
 public | POVLaunch               | table | postgres
 public | POVTemplate             | table | postgres
 public | Phase                   | table | postgres
 public | PhaseTemplate           | table | postgres
 public | RefreshToken            | table | postgres
 public | Region                  | table | postgres
 public | Role                    | table | postgres
 public | SupportRequest          | table | postgres
 public | SystemSettings          | table | postgres
 public | Team                    | table | postgres
 public | TeamMember              | table | postgres
 public | User                    | table | postgres
 public | UserSettings            | table | postgres
 public | Workflow                | table | postgres
 public | WorkflowStep            | table | postgres
 public | _prisma_migrations      | table | postgres
 public | agent_artifacts         | table | postgres
 public | agent_executions        | table | postgres
 public | agent_prompt_library    | table | postgres
 public | agent_templates         | table | postgres
 public | attachments             | table | postgres
 public | comments                | table | postgres
 public | mcp_interactions        | table | postgres
 public | mcp_recommendations     | table | postgres
 public | mcp_tools               | table | postgres
 public | mcp_workflow_executions | table | postgres
 public | mcp_workflows           | table | postgres
 public | notifications           | table | postgres
 public | role_permissions        | table | postgres
 public | stages                  | table | postgres
 public | task_activities         | table | postgres
 public | task_dependencies       | table | postgres
 public | tasks                   | table | postgres
 public | tasks_backup_null_pov   | table | postgres


# Get authentication token (replace with your actual token)
export AUTH_TOKEN="${PAICHART_API_KEY}"

# Base URL
export BASE_URL="http://localhost:3000"
```

### Test Data Setup
```sql
-- Get a test task ID (run this first to get an actual task ID)
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT id, title, \"povId\", \"phaseId\", \"stageId\" 
FROM tasks 
WHERE \"deletedAt\" IS NULL 
LIMIT 5;
"

-- Use one of the returned task IDs for testing
export TEST_TASK_ID="your-actual-task-id-here"
```

## Test Suite 1: Agent Configuration Architecture

**Reference Document**: `agentConfigureArchitecture.md`

### Test 1.1: Basic Agent Configuration
**Purpose**: Verify parameter extraction and processing

```bash
curl -X POST $BASE_URL/api/mcp/tasks/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "action": "agent.configure",
    "taskId": "'$TEST_TASK_ID'",
    "agentRole": "test_specialist",
    "prompt": "Test basic agent configuration functionality",
    "maxRetries": 5,
    "timeout": 1800
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Agent configured successfully",
  "data": {
    "taskId": "your-task-id",
    "agentRole": "test_specialist",
    "executionStatus": "PENDING"
  }
}
```

**Database Verification**:
```sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    id,
    title,
    \"agentRole\",
    \"maxRetries\",
    timeout,
    \"executionStatus\"
FROM tasks 
WHERE id = '$TEST_TASK_ID';
"
```

**Expected Database State**:
- `agentRole`: "test_specialist"
- `maxRetries`: 5
- `timeout`: 1800
- `executionStatus`: "PENDING"

### Test 1.2: Agent Template Resolution
**Purpose**: Verify agent template lookup and assignment

```bash
curl -X POST $BASE_URL/api/mcp/tasks/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "action": "agent.configure",
    "taskId": "'$TEST_TASK_ID'",
    "agentTemplateName": "Technical Writer",
    "agentRole": "technical_documentation_specialist"
  }'
```

**Database Verification**:
```sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    t.id,
    t.\"agentRole\",
    t.\"agentTemplateId\",
    at.name as template_name,
    at.category as template_category
FROM tasks t
LEFT JOIN \"AgentTemplate\" at ON t.\"agentTemplateId\" = at.id
WHERE t.id = '$TEST_TASK_ID';
"
```

**Expected Database State**:
- `agentRole`: "technical_documentation_specialist"
- `agentTemplateId`: Should be populated
- `template_name`: "Technical Writer"

### Test 1.3: MCP Tools Validation
**Purpose**: Verify MCP tools discovery and validation

```bash
curl -X POST $BASE_URL/api/mcp/tasks/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "action": "agent.configure",
    "taskId": "'$TEST_TASK_ID'",
    "agentRole": "qa_test_engineer",
    "mcpTools": ["project(action: "pov.list")", "project(action: "pov.details")", "analyze_task_performance"],
    "workflow": {
      "setup": "Initialize testing environment",
      "testing": "Execute systematic validation",
      "reporting": "Generate test results"
    },
    "successMetrics": ["test_coverage", "bug_detection_rate"],
    "executionType": "systematic_validation"
  }'
```

**Database Verification**:
```sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    id,
    \"agentRole\",
    jsonb_pretty(\"mcpContext\") as mcp_configuration
FROM tasks 
WHERE id = '$TEST_TASK_ID';
"
```

**Expected Database State**:
- `mcpContext` should contain:
  - `tools`: Array with validated MCP tools
  - `workflow.phases`: Object with setup, testing, reporting
  - `successMetrics`: Array with test_coverage, bug_detection_rate
  - `executionType`: "systematic_validation"

## Test Suite 2: Context Preservation

**Reference Document**: `agentContextPreservation.md`

### Test 2.1: Custom Context Preservation
**Purpose**: Verify custom input context is preserved alongside auto-generated context

```bash
curl -X POST $BASE_URL/api/mcp/tasks/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "action": "agent.configure",
    "taskId": "'$TEST_TASK_ID'",
    "agentRole": "context_preservation_specialist",
    "prompt": "Test enhanced context preservation with detailed debugging.",
    "inputContext": {
      "task_sequence": {
        "_note": "Testing enhanced context preservation",
        "test_value": "should_be_preserved",
        "sequence_position": 1
      },
      "enriched_task_context": {
        "_note": "Enhanced task metadata",
        "test_metadata": "should_also_be_preserved",
        "complexity_score": 85
      },
      "custom_test_data": {
        "debug_timestamp": "2025-07-14T11:29:00Z",
        "test_purpose": "Verify context preservation with debugging",
        "test_id": "context_preservation_001"
      }
    }
  }'
```

**Database Verification**:
```sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    id,
    title,
    \"agentRole\",
    jsonb_pretty(\"inputContext\") as formatted_context
FROM tasks 
WHERE id = '$TEST_TASK_ID';
"
```

**Expected Database State**:
- `inputContext` should contain:
  - Auto-generated sections: `pov`, `task`, `phase`, `mcpConfiguration`
  - Preserved custom sections: `task_sequence`, `enriched_task_context`, `custom_test_data`
  - Merge metadata: `_contextMetadata` with `preservedSections` array

### Test 2.2: Context Merging Logic
**Purpose**: Verify intelligent context merging preserves both auto-generated and custom data

```bash
# First, verify the context structure
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    jsonb_object_keys(\"inputContext\") as context_sections
FROM tasks 
WHERE id = '$TEST_TASK_ID';
"
```

**Expected Sections**:
- `pov` (auto-generated)
- `task` (auto-generated)
- `phase` (auto-generated)
- `mcpConfiguration` (auto-generated)
- `task_sequence` (preserved custom)
- `enriched_task_context` (preserved custom)
- `custom_test_data` (preserved custom)
- `_contextMetadata` (merge tracking)

### Test 2.3: Context Metadata Validation
**Purpose**: Verify context merge metadata is properly tracked

```sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    \"inputContext\" -> '_contextMetadata' -> 'hasCustomData' as has_custom_data,
    \"inputContext\" -> '_contextMetadata' -> 'mergeStrategy' as merge_strategy,
    \"inputContext\" -> '_contextMetadata' -> 'preservedSections' as preserved_sections
FROM tasks 
WHERE id = '$TEST_TASK_ID';
"
```

**Expected Metadata**:
- `has_custom_data`: true
- `merge_strategy`: "enhanced_preservation"
- `preserved_sections`: Array containing custom section names

## Test Suite 3: System Prompt Hierarchy

**Reference Document**: `SystemPromptHierarchy.md`

### Test 3.1: Role-Based System Prompt Generation
**Purpose**: Verify system prompt generation based on agent role

```bash
curl -X POST $BASE_URL/api/mcp/tasks/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "action": "agent.configure",
    "taskId": "'$TEST_TASK_ID'",
    "agentRole": "quality_assurance_specialist",
    "prompt": "Test role-based system prompt generation"
  }'
```

**Database Verification**:
```sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    \"agentRole\",
    prompt,
    \"modelParameters\" -> 'systemPrompt' as system_prompt
FROM tasks 
WHERE id = '$TEST_TASK_ID';
"
```

**Expected Behavior**:
- `agentRole`: "quality_assurance_specialist"
- System prompt should be role-specific during execution (verified in execution tests)

### Test 3.2: Custom System Prompt Override
**Purpose**: Verify custom system prompt takes precedence

```bash
curl -X POST $BASE_URL/api/mcp/tasks/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "action": "agent.configure",
    "taskId": "'$TEST_TASK_ID'",
    "agentRole": "custom_specialist",
    "modelParameters": {
      "systemPrompt": "You are a custom AI specialist with specific expertise in testing.",
      "temperature": 0.7,
      "maxTokens": 4000
    }
  }'
```

**Database Verification**:
```sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    \"modelParameters\" -> 'systemPrompt' as custom_system_prompt,
    \"modelParameters\" -> 'temperature' as temperature,
    \"modelParameters\" -> 'maxTokens' as max_tokens
FROM tasks 
WHERE id = '$TEST_TASK_ID';
"
```

**Expected Database State**:
- `custom_system_prompt`: "You are a custom AI specialist with specific expertise in testing."
- `temperature`: 0.7
- `max_tokens`: 4000

## Test Suite 4: Agent Execution

**Reference Document**: `1.AgentExecutionExplained.md`

### Test 4.1: Agent Execution Trigger
**Purpose**: Verify agent execution can be triggered and tracked

```bash
curl -X POST $BASE_URL/api/mcp/tasks/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "action": "agent.execute",
    "taskId": "'$TEST_TASK_ID'",
    "config": {
      "timeout": 300000,
      "maxRetries": 3
    }
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "message": "Agent execution started",
  "data": {
    "executionId": "execution-id",
    "status": "PENDING"
  }
}
```

**Database Verification**:
```sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    id,
    \"taskId\",
    status,
    \"startTime\",
    config,
    context
FROM \"AgentExecution\" 
WHERE \"taskId\" = '$TEST_TASK_ID'
ORDER BY \"createdAt\" DESC
LIMIT 1;
"
```

**Expected Database State**:
- `status`: "PENDING" or "RUNNING"
- `taskId`: Matches test task ID
- `config`: Contains execution configuration
- `context`: Contains task and MCP context

### Test 4.2: Execution Status Monitoring
**Purpose**: Verify execution status can be monitored

```bash
# Get the execution ID from previous test
export EXECUTION_ID=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "
SELECT id FROM \"AgentExecution\" 
WHERE \"taskId\" = '$TEST_TASK_ID' 
ORDER BY \"createdAt\" DESC 
LIMIT 1;
" | xargs)

# Monitor execution status
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    id,
    status,
    progress,
    \"startTime\",
    \"endTime\",
    logs
FROM \"AgentExecution\" 
WHERE id = '$EXECUTION_ID';
"
```

**Expected Progression**:
- Status: PENDING → RUNNING → COMPLETED/FAILED
- Progress: 0 → increasing → 100 (if completed)
- Timestamps: startTime populated, endTime when finished

## Test Suite 5: Unified Storage Architecture

**Reference Document**: `MCPStorageArchitectureAnalysis.md`

### Test 5.1: Unified MCP Storage Verification
**Purpose**: Verify MCP configuration is stored in unified schema fields

```bash
curl -X POST $BASE_URL/api/mcp/tasks/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "action": "agent.configure",
    "taskId": "'$TEST_TASK_ID'",
    "agentRole": "storage_verification_specialist",
    "mcpTools": ["project(action: "task.list")", "project(action: "task.context")"],
    "workflow": {
      "analysis": "Analyze storage architecture",
      "verification": "Verify unified storage"
    },
    "successMetrics": ["storage_integrity", "data_consistency"],
    "executionType": "systematic_validation"
  }'
```

**Database Verification**:
```sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    id,
    \"mcpToolId\",
    \"mcpWorkflowId\",
    jsonb_pretty(\"mcpContext\") as mcp_context,
    jsonb_pretty(\"mcpMetadata\") as mcp_metadata
FROM tasks 
WHERE id = '$TEST_TASK_ID';
"
```

**Expected Database State**:
- `mcpContext`: Complete MCP configuration object
- `mcpToolId`: Primary tool reference (if single tool)
- `mcpMetadata`: Integration metadata with version info
- All fields properly populated with unified storage structure

### Test 5.2: Legacy Compatibility Verification
**Purpose**: Verify backward compatibility with legacy storage

```sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    id,
    CASE 
        WHEN \"mcpContext\" IS NOT NULL THEN 'unified_storage'
        WHEN metadata -> 'mcpConfiguration' IS NOT NULL THEN 'legacy_storage'
        ELSE 'no_mcp_config'
    END as storage_type,
    metadata -> 'mcpStorageVersion' as storage_version
FROM tasks 
WHERE id = '$TEST_TASK_ID';
"
```

**Expected Result**:
- `storage_type`: "unified_storage"
- `storage_version`: "2.0.0" or higher

## Test Suite 6: End-to-End Integration

### Test 6.1: Complete Agent Configuration Flow
**Purpose**: Verify complete end-to-end agent configuration and execution

```bash
# Step 1: Configure agent with comprehensive parameters
curl -X POST $BASE_URL/api/mcp/tasks/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "action": "agent.configure",
    "taskId": "'$TEST_TASK_ID'",
    "agentTemplateName": "QA Test Engineer",
    "agentRole": "comprehensive_testing_specialist",
    "prompt": "Execute comprehensive end-to-end testing of the agent system",
    "inputContext": {
      "test_scenario": {
        "type": "end_to_end_integration",
        "scope": "complete_agent_pipeline",
        "validation_level": "comprehensive"
      },
      "test_parameters": {
        "include_context_preservation": true,
        "include_mcp_integration": true,
        "include_storage_verification": true
      }
    },
    "mcpTools": ["project(action: "pov.list")", "project(action: "pov.details")", "analyze_task_performance"],
    "workflow": {
      "setup": "Initialize comprehensive testing environment",
      "configuration_test": "Verify agent configuration pipeline",
      "context_test": "Test context preservation and merging",
      "storage_test": "Validate unified storage architecture",
      "execution_test": "Test agent execution capabilities",
      "integration_test": "Verify end-to-end integration"
    },
    "successMetrics": [
      "configuration_completeness",
      "context_preservation_accuracy",
      "storage_integrity",
      "execution_reliability",
      "integration_success_rate"
    ],
    "executionType": "comprehensive_validation",
    "maxRetries": 3,
    "timeout": 1800,
    "modelParameters": {
      "temperature": 0.7,
      "maxTokens": 4000,
      "systemPrompt": "You are a comprehensive testing specialist focused on validating complex agent systems."
    }
  }'

# Step 2: Verify complete configuration storage
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    id,
    title,
    \"agentRole\",
    \"agentTemplateId\",
    \"executionStatus\",
    \"maxRetries\",
    timeout,
    jsonb_object_keys(\"inputContext\") as context_sections,
    \"mcpContext\" -> 'tools' as mcp_tools,
    \"mcpContext\" -> 'workflow' -> 'phases' as workflow_phases,
    \"mcpContext\" -> 'successMetrics' as success_metrics,
    \"mcpContext\" -> 'executionType' as execution_type
FROM tasks 
WHERE id = '$TEST_TASK_ID';
"

# Step 3: Execute the configured agent
curl -X POST $BASE_URL/api/mcp/tasks/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "action": "agent.execute",
    "taskId": "'$TEST_TASK_ID'"
  }'

# Step 4: Monitor execution progress
sleep 5
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    ae.id as execution_id,
    ae.status,
    ae.progress,
    ae.\"startTime\",
    ae.\"endTime\",
    t.\"agentRole\",
    t.\"executionStatus\"
FROM \"AgentExecution\" ae
JOIN tasks t ON ae.\"taskId\" = t.id
WHERE t.id = '$TEST_TASK_ID'
ORDER BY ae.\"createdAt\" DESC
LIMIT 1;
"
```

**Expected End-to-End Results**:
1. **Configuration**: All parameters properly stored in unified schema
2. **Context**: Custom and auto-generated context properly merged
3. **Storage**: MCP configuration in dedicated fields with metadata
4. **Execution**: Agent execution record created and progressing
5. **Integration**: Complete pipeline functioning end-to-end

## Test Suite 7: Error Handling & Edge Cases

### Test 7.1: Invalid Parameter Handling
**Purpose**: Verify system handles invalid parameters gracefully

```bash
# Test with invalid task ID
curl -X POST $BASE_URL/api/mcp/tasks/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "action": "agent.configure",
    "taskId": "invalid-task-id",
    "agentRole": "test_specialist"
  }'
```

**Expected Response**:
```json
{
  "success": false,
  "error": "Task not found",
  "code": "TASK_NOT_FOUND"
}
```

### Test 7.2: Missing Required Parameters
**Purpose**: Verify validation of required parameters

```bash
# Test with missing taskId
curl -X POST $BASE_URL/api/mcp/tasks/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "action": "agent.configure",
    "agentRole": "test_specialist"
  }'
```

**Expected Response**:
```json
{
  "success": false,
  "error": "Missing required parameter: taskId",
  "code": "MISSING_PARAMETER"
}
```

### Test 7.3: Invalid MCP Tools
**Purpose**: Verify handling of invalid MCP tools

```bash
curl -X POST $BASE_URL/api/mcp/tasks/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "action": "agent.configure",
    "taskId": "'$TEST_TASK_ID'",
    "agentRole": "test_specialist",
    "mcpTools": ["invalid_tool", "another_invalid_tool"]
  }'
```

**Database Verification**:
```sql
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    \"mcpContext\" -> 'tools' as validated_tools
FROM tasks 
WHERE id = '$TEST_TASK_ID';
"
```

**Expected Behavior**:
- Invalid tools should be filtered out
- Only valid tools should be stored
- System should continue with valid configuration

## Test Automation Script

### Complete Test Runner
```bash
#!/bin/bash
# save as: test_agent_system.sh

set -e

echo "🚀 Starting Agent System Test Verification"
echo "=========================================="

# Load environment variables
source .env.local 2>/dev/null || echo "Warning: .env.local not found"

# Set defaults if not provided
export PGPASSWORD=${PGPASSWORD:-postgres}
export DB_HOST=${DB_HOST:-localhost}
export DB_USER=${DB_USER:-postgres}
export DB_NAME=${DB_NAME:-copov15}
export BASE_URL=${BASE_URL:-http://localhost:3000}

# Get test task ID
echo "📋 Getting test task ID..."
export TEST_TASK_ID=$(psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "
SELECT id FROM tasks 
WHERE \"deletedAt\" IS NULL 
LIMIT 1;
" | xargs)

if [ -z "$TEST_TASK_ID" ]; then
    echo "❌ No test tasks found. Please create a task first."
    exit 1
fi

echo "✅ Using test task ID: $TEST_TASK_ID"

# Test Suite 1: Basic Configuration
echo ""
echo "🧪 Test Suite 1: Basic Agent Configuration"
echo "----------------------------------------"

echo "Test 1.1: Basic agent configuration..."
curl -s -X POST $BASE_URL/api/mcp/tasks/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "action": "agent.configure",
    "taskId": "'$TEST_TASK_ID'",
    "agentRole": "test_specialist",
    "maxRetries": 5,
    "timeout": 1800
  }' | jq '.success'

echo "✅ Basic configuration test completed"

# Test Suite 2: Context Preservation
echo ""
echo "🧪 Test Suite 2: Context Preservation"
echo "------------------------------------"

echo "Test 2.1: Custom context preservation..."
curl -s -X POST $BASE_URL/api/mcp/tasks/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d '{
    "action": "agent.configure",
    "taskId": "'$TEST_TASK_ID'",
    "agentRole": "context_specialist",
    "inputContext": {
      "test_data": {"preserved": true},
      "custom_section": {"test": "value"}
    }
  }' | jq '.success'

echo "✅ Context preservation test completed"

# Verify database state
echo ""
echo "🔍 Database Verification"
echo "----------------------"

psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT 
    'Agent Role' as field,
    \"agentRole\" as value
FROM tasks WHERE id = '$TEST_TASK_ID'
UNION ALL
SELECT 
    'Max Retries' as field,
    \"maxRetries\"::text as value
FROM tasks WHERE id = '$TEST_TASK_ID'
UNION ALL
SELECT 
    'Has Custom Context' as field,
    CASE WHEN \"inputContext\" ? 'test_data' THEN 'true' ELSE 'false' END as value
FROM tasks WHERE id = '$TEST_TASK_ID';
"

echo ""
echo "🎉 Agent System Test Verification Complete!"
echo "==========================================="
```

### Usage
```bash
# Make script executable
chmod +x test_agent_system.sh

# Run complete test suite
./test_agent_system.sh
```

## Troubleshooting

### Common Issues

#### 1. Authentication Errors
```bash
# Verify token is valid
curl -H "Authorization: Bearer $AUTH_TOKEN" $BASE_URL/api/auth/verify
```

#### 2. Database Connection Issues
```bash
# Test database connection
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1;"
```

#### 3. Server Not Running
```bash
# Check if server is running
curl $BASE_URL/api/health
```

#### 4. Task Not Found
```bash
# List available tasks
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
SELECT id, title, \"povId\" 
FROM tasks 
WHERE \"deletedAt\" IS NULL 
LIMIT 10;
"
```

### Debug Queries

#### View Complete Task Configuration
```sql
SELECT 
    id,
    title,
    \"agentRole\",
    \"agentTemplateId\",
    \"executionStatus\",
    jsonb_pretty(\"inputContext\") as input_context,
    jsonb_pretty(\"mcpContext\") as mcp_context,
    jsonb_pretty(\"mcpMetadata\") as mcp_metadata
FROM tasks 
WHERE id = 'your-task-id';
```

#### View Agent Execution History
```sql
SELECT 
    ae.id,
    ae.status,
    ae.progress,
    ae.\"startTime\",
    ae.\"endTime\",
    t.title as task_title,
    t.\"agentRole\"
FROM \"AgentExecution\" ae
JOIN tasks t ON ae.\"taskId\" = t.id
ORDER BY ae.\"createdAt\" DESC
LIMIT 10;
```

#### Check MCP Storage Migration Status
```sql
SELECT 
    COUNT(*) as total_tasks,
    COUNT(CASE WHEN \"mcpContext\" IS NOT NULL THEN 1 END) as unified_storage,
    COUNT(CASE WHEN metadata -> 'mcpConfiguration' IS NOT NULL THEN 1 END) as legacy_storage
FROM tasks;
```

## Success Criteria

### Test Suite Pass Criteria

1. **Configuration Tests**: All API calls return `success: true`
2. **Database Verification**: All expected fields populated correctly
3. **Context Preservation**: Custom sections preserved alongside auto-generated
4. **Storage Architecture**: MCP configuration in unified schema fields
5. **Execution Flow**: Agent executions can be triggered and monitored
6. **Error Handling**: Invalid inputs handled gracefully with appropriate errors

### Performance Benchmarks

- **Configuration API Response**: < 2 seconds
- **Database Queries**: < 500ms
- **Context Merging**: < 1 second for complex contexts
- **Agent Execution Startup**: < 5 seconds

This comprehensive test suite validates all essential features documented in the agent system architecture, ensuring the complete pipeline from Claude Desktop through MCP API to database storage and agent execution functions correctly.
