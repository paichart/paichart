/**
 * Prompt Command Handler for MCP
 *
 * Enables /prompt command execution in Claude Desktop through natural language processing.
 * Makes MCP prompts accessible via tool responses for enhanced AI workflow integration.
 *
 * @class PromptCommandHandler
 * @version 1.0.0
 * @description Core features:
 *   - /prompt command parsing and execution
 *   - Natural language argument processing (key=value pairs)
 *   - Authentication-aware prompt selection
 *   - Built-in and database prompt support
 *   - Command suggestions on typos
 *   - List and help commands
 *   - Graceful error handling
 *
 * @usage
 *   - `/prompt list` - List all prompts
 *   - `/prompt help` - Show help
 *   - `/prompt {name} [args...]` - Execute prompt
 *
 * @example Command Formats:
 *   - `/prompt task_audit_and_planning`
 *   - `/prompt pov_health_check pov="BlackEye"`
 *   - `/prompt task_audit_and_planning pov_status_filter="VALIDATION"`
 *
 * @integration Can be integrated into existing tool handlers via handleIfPromptCommand()
 */

const { stderr, createAdapter } = require('../mcp-logger');
// BUG-BASIC-XSS-1 Phase 2.8: sanitize \${promptName} echoes.
const { sanitizeForResponse } = require('./response-sanitizer');

class PromptCommandHandler {
  /**
   * Creates Prompt Command Handler
   *
   * @param {PromptRegistry} promptRegistry - Prompt registry instance for prompt lookup
   *
   * @description Initializes command parser with regex pattern and logger.
   *   Command pattern: /^\/prompt\s+(\S+)(?:\s+(.*))?$/i (case-insensitive)
   */
  constructor(promptRegistry) {
    this.promptRegistry = promptRegistry;
    // BUG-STANDALONE-012 L3 fix (2026-05-23, Phase 3 sec-ops, defense-in-depth):
    // tightened promptName from `\S+` (any non-whitespace) to
    // [a-zA-Z0-9_-]+ (matches typical prompt-name convention). Reduces the
    // attack surface for crafted prompt-name strings even though all echo
    // sites are already sanitized via sanitizeForResponse. Per
    // [[feedback_prefer_more_specialists]] + sec-ops L3 (85% conf).
    this.commandPattern = /^\/prompt\s+([a-zA-Z0-9_-]+)(?:\s+(.*))?$/i;
    this.logger = this.createLogger();
  }

  createLogger() {
    return createAdapter(stderr.mcpLogger.child({ component: 'prompt-command' }));
  }

  /**
   * Check if input is a prompt command
   */
  isPromptCommand(input) {
    return this.commandPattern.test(input?.toString() || '');
  }

  /**
   * Parse prompt command
   */
  parseCommand(input) {
    const match = input.match(this.commandPattern);
    if (!match) return null;

    const [, promptName, argsString] = match;
    
    // Parse arguments (simple key=value pairs)
    // BUG-STANDALONE-012 L1 fix (2026-05-23, Phase 3 sec-ops): use indexOf
    // not split('='). Previously `pair.split('=')` destructured to
    // [key, value] losing everything after the first '=' in the value —
    // breaking URLs with query strings (foo=https://x.com/?q=bar) and
    // any value containing '='. Now: find first '=', key = before it,
    // value = everything after (including any further '=').
    const args = {};
    if (argsString) {
      const argPairs = argsString.match(/(\w+)=("[^"]*"|'[^']*'|\S+)/g);
      if (argPairs) {
        argPairs.forEach(pair => {
          const eqIdx = pair.indexOf('=');
          if (eqIdx <= 0) return; // malformed pair, skip
          const key = pair.substring(0, eqIdx);
          const rawValue = pair.substring(eqIdx + 1);
          // Remove quotes if present
          args[key] = rawValue.replace(/^["']|["']$/g, '');
        });
      }
    }

    return { promptName, args };
  }

  /**
   * Execute prompt command
   */
  async executePromptCommand(input, context = null) {
    // Handle both formats: "select_pov" and "/prompt select_pov"
    let normalizedInput = input;
    if (typeof input === 'string' && !input.startsWith('/prompt')) {
      normalizedInput = `/prompt ${input}`;
    }
    
    const command = this.parseCommand(normalizedInput);
    if (!command) {
      return this.getHelpMessage();
    }

    const { promptName, args } = command;

    // Special commands
    // BUG-STANDALONE-001 fix (2026-05-23): split 'help' from 'list'.
    // Previously both routed to listAvailablePrompts → identical output.
    // Per command convention: 'help' shows usage/syntax/conventions;
    // 'list' enumerates available prompts.
    if (promptName === 'help') {
      return this.getHelpMessage();
    }
    if (promptName === 'list') {
      return this.listAvailablePrompts(context);
    }

    // Get the prompt (check both built-in and database)
    // Pass context for authentication-based prompt selection
    let prompt = await this.promptRegistry.getPrompt(promptName, context);
    
    if (!prompt) {
      // BUG-STANDALONE-003 fix (2026-05-23): forward context so the
      // not-found message can list authenticated/database prompts.
      // Without context, promptRegistry.listPrompts() returns empty/built-in
      // only, producing 'Available prompts: ' (empty line) in the response.
      return this.getPromptNotFoundMessage(promptName, context);
    }

    try {
      // Execute the prompt with user context for access control
      const content = await prompt.content(args, context);

      return {
        content: [{
          type: "text",
          text: `📝 **Prompt: ${prompt.name}**\n\n${content}`
        }],
        isError: false,
        _meta: {
          source: 'prompt_command',
          promptName: promptName,
          timestamp: new Date().toISOString(),
          nextSteps: [
            `✅ Prompt '${sanitizeForResponse(promptName)}' executed successfully`,
            "Review the output above for results",
            `Execute again: prompt_command(promptName: '${sanitizeForResponse(promptName)}')`,
            "Or: list_prompts() to discover other prompts"
          ]
        }
      };
    } catch (error) {
      this.logger.error(`Failed to execute prompt ${promptName}:`, error.message);

      // P3: Enhanced error categorization and recovery
      let errorType = 'EXECUTION_ERROR';
      let suggestion = 'Prompt execution failed. Check the error details below.';
      let recovery = [];

      const errorMsg = error.message || String(error);

      // Categorize common errors
      if (errorMsg.includes('authentication') || errorMsg.includes('unauthorized')) {
        errorType = 'AUTHENTICATION_ERROR';
        suggestion = 'Prompt requires authentication.';
        recovery = [
          'Authenticate using OAuth (Microsoft/Google/GitHub)',
          'Or provide API key in X-API-Key header',
          'Some prompts are public, others require authentication'
        ];
      } else if (errorMsg.includes('not found') || errorMsg.includes('undefined')) {
        errorType = 'CONFIGURATION_ERROR';
        suggestion = 'Prompt configuration may be incomplete.';
        recovery = [
          'Check that prompt is properly registered',
          'Verify prompt content function exists',
          'Contact administrator if error persists'
        ];
      } else if (errorMsg.includes('Invalid') || errorMsg.includes('validation')) {
        errorType = 'PARAMETER_ERROR';
        suggestion = 'Prompt arguments may be invalid.';
        recovery = [
          'Check argument format: key=value pairs',
          `Use quotes for values with spaces: arg="value with spaces"`,
          `See prompt arguments: /prompt ${sanitizeForResponse(promptName)} (without args for help)`
        ];
      }

      return {
        content: [{
          type: "text",
          text: `❌ Error executing prompt: ${errorMsg}\n\n` +
                `Error Type: ${errorType}\n` +
                `${suggestion}\n\n` +
                (recovery.length > 0 ? `Recovery Steps:\n${recovery.map(r => `• ${r}`).join('\n')}\n\n` : '') +
                `Try: /prompt list to see all available prompts`
        }],
        isError: true,
        _meta: {
          errorType,
          promptName,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * List available prompts
   */
  listAvailablePrompts(context = null) {
    const prompts = this.promptRegistry.listPrompts(context);
    
    let message = `📝 **Available MCP Prompts** (${prompts.length} total)\n\n`;
    message += `Use: \`/prompt [name] [arg1=value1 arg2=value2...]\`\n\n`;
    
    // Group by source
    const builtIn = prompts.filter(p => p.source === 'built-in');
    const database = prompts.filter(p => p.source === 'database');
    
    if (builtIn.length > 0) {
      message += `**Built-in Prompts:**\n`;
      builtIn.forEach(p => {
        message += `• \`/prompt ${p.name}\` - ${p.description}\n`;
        if (p.arguments?.length > 0) {
          const args = p.arguments.map(a => 
            a.required ? a.name : `[${a.name}]`
          ).join(' ');
          message += `  Args: ${args}\n`;
        }
      });
      message += '\n';
    }
    
    if (database.length > 0) {
      message += `**Database Prompts:**\n`;
      database.forEach(p => {
        message += `• \`/prompt ${p.name}\` - ${p.description}`;
        if (p.usageCount) {
          message += ` (used ${p.usageCount} times)`;
        }
        message += '\n';
        if (p.arguments?.length > 0) {
          const args = p.arguments.map(a => 
            a.required ? a.name : `[${a.name}]`
          ).join(' ');
          message += `  Args: ${args}\n`;
        }
      });
    }
    
    // BUG-STANDALONE-002 fix (2026-05-23): replaced 4 dead example commands
    // (show_available_prompts / list_tasks_guided / select_pov /
    // configure_agent) — NONE existed in the prompt registry. User following
    // these examples got "Prompt not found" responses. Replaced with real
    // prompts visible above in the same response.
    message += `\n**Examples:**\n`;
    message += `• \`/prompt task_audit_and_planning\` — run portfolio audit (no args needed)\n`;
    message += `• \`/prompt pov_health_check pov="BlackEye"\` — single-POV health report\n`;
    message += `• \`/prompt task_audit_and_planning pov_status_filter="VALIDATION"\` — args use key=value syntax\n`;

    return {
      content: [{ type: "text", text: message }],
      isError: false,
      _meta: {
        source: 'prompt_command',
        action: 'list',
        promptCount: prompts.length,
        nextSteps: prompts.length > 0
          ? [
              `Found ${prompts.length} available prompt${prompts.length === 1 ? '' : 's'}`,
              prompts[0] ? `Try: /prompt ${prompts[0].name}` : null,
              "Use prompt names from the list above",
              "Example: prompt_command(promptName: 'task_audit_and_planning')"
            ].filter(Boolean)
          : [
              "No prompts available",
              "Contact administrator to configure prompts"
            ]
      }
    };
  }

  /**
   * Get help message
   */
  getHelpMessage() {
    return {
      content: [{ 
        type: "text", 
        text: `📝 **MCP Prompt Commands**

**Usage:** \`/prompt [command] [arguments]\`

**Commands:**
• \`/prompt list\` - List all available prompts
• \`/prompt help\` - Show this help message
• \`/prompt [name] [args...]\` - Execute a specific prompt

**Examples:**
• \`/prompt task_audit_and_planning\` — run portfolio audit (no args needed)
• \`/prompt pov_health_check pov="BlackEye"\` — single-POV health report
• \`/prompt task_audit_and_planning pov_status_filter="VALIDATION"\` — args use key=value syntax

Type \`/prompt list\` to see all available prompts with descriptions.`
      }],
      isError: false,
      _meta: {
        source: 'prompt_command',
        action: 'help'
      }
    };
  }

  /**
   * Get prompt not found message
   */
  getPromptNotFoundMessage(promptName, context = null) {
    // BUG-STANDALONE-003 fix (2026-05-23): pass context so we surface the
    // SAME prompt set the user sees via /prompt list (both built-in AND
    // authenticated database prompts). Previously called without context →
    // empty 'Available prompts:' fallback when 16 prompts existed.
    const prompts = this.promptRegistry.listPrompts(context);

    // P3: Better fuzzy matching with scoring
    const suggestions = prompts
      .map(p => {
        const name = p.name.toLowerCase();
        const search = promptName.toLowerCase();
        let score = 0;

        // Exact match
        if (name === search) score = 100;
        // Starts with
        else if (name.startsWith(search)) score = 80;
        // Contains
        else if (name.includes(search)) score = 60;
        // Word match
        else if (search.split('_').some(word => name.includes(word))) score = 40;
        // Reverse contains
        else if (search.includes(name)) score = 30;

        return { ...p, score };
      })
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    let message = `❌ Prompt not found: \`${sanitizeForResponse(promptName)}\`\n\n`;

    if (suggestions.length > 0) {
      message += `Did you mean:\n`;
      suggestions.forEach(p => {
        message += `• \`/prompt ${p.name}\` - ${p.description}`;
        if (p.score < 100) message += ` (${p.score}% match)`;
        message += '\n';
      });
      message += `\n💡 Copy prompt name exactly as shown above.`;
    } else {
      message += `No similar prompts found.\n\n`;
      message += `Available prompts: ${prompts.slice(0, 5).map(p => p.name).join(', ')}`;
      if (prompts.length > 5) message += ` (+${prompts.length - 5} more)`;
    }

    message += `\n\nType \`/prompt list\` to see all available prompts with descriptions.`;

    return {
      content: [{ type: "text", text: message }],
      isError: true,
      _meta: {
        source: 'prompt_command',
        action: 'not_found',
        promptName: promptName,
        suggestionsCount: suggestions.length,
        nextSteps: [
          "Check prompt name spelling",
          "/prompt list - See all available prompts",
          suggestions.length > 0 ? `Try: /prompt ${suggestions[0].name}` : null
        ].filter(Boolean)
      }
    };
  }

  /**
   * Integration helper - Check and handle prompt commands in tool input
   *
   * @param {string} toolName - Name of the tool being called
   * @param {Object} args - Tool arguments to check for prompt commands
   * @param {Object} [context=null] - User authentication context (optional)
   *
   * @returns {Promise<Object|null>} MCP response if prompt command detected, null otherwise
   * @returns {Array<Object>} returns.content - Prompt execution result
   * @returns {boolean} returns.isError - Whether execution failed
   * @returns {Object} returns._meta - Metadata (source, promptName, timestamp)
   *
   * @description Scans tool arguments for /prompt commands and executes them.
   *   Checks common command fields: query, prompt, message, input, command.
   *   Returns null if no prompt command detected (normal tool processing continues).
   *
   * @integration Pattern for tool handlers:
   *   const promptResult = await promptHandler.handleIfPromptCommand(toolName, args, context);
   *   if (promptResult) return promptResult; // Prompt command handled
   *   // Continue with normal tool logic
   *
   * @example
   * // In existing tool handler:
   * const result = await handler.handleIfPromptCommand('search',
   *   { query: "/prompt list" },
   *   context
   * );
   * if (result) return result; // Prompt command executed
   */
  async handleIfPromptCommand(toolName, args, context = null) {
    // Check if any argument contains a /prompt command
    const inputString = JSON.stringify(args);
    
    if (this.isPromptCommand(inputString)) {
      this.logger.info('Detected prompt command in tool input');
      return await this.executePromptCommand(inputString, context);
    }
    
    // Check specific fields that might contain commands
    const commandFields = ['query', 'prompt', 'message', 'input', 'command'];
    for (const field of commandFields) {
      if (args[field] && this.isPromptCommand(args[field])) {
        this.logger.info(`Detected prompt command in ${field} field`);
        return await this.executePromptCommand(args[field], context);
      }
    }
    
    return null; // Not a prompt command
  }
}

module.exports = { PromptCommandHandler };