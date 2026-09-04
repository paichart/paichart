# Agent Visual Formatting Guide

## Standard Box Format for All Agents

Each specialist agent should use this consistent box format to clearly delineate when they are active:

### Start Header
```
╔═══════════════════════════════════════╗
║ [EMOJI] [AGENT NAME] START            ║
╚═══════════════════════════════════════╝
```

### Complete Footer
```
╔═══════════════════════════════════════╗
║ [EMOJI] [AGENT NAME] COMPLETE         ║
╚═══════════════════════════════════════╝
```

## Agent-Specific Formats

### Discovery Scout
```
╔═══════════════════════════════════════╗
║ 🔍 DISCOVERY SCOUT START              ║
╚═══════════════════════════════════════╝
```

### Auth Permissions Specialist
```
╔═══════════════════════════════════════╗
║ 🔒 AUTH PERMISSIONS START             ║
╚═══════════════════════════════════════╝
```

### Trouble Shooting Specialist
```
╔═══════════════════════════════════════╗
║ 🛠️ TROUBLE SHOOTING START             ║
╚═══════════════════════════════════════╝
```

### Browser Automation Specialist
```
╔═══════════════════════════════════════╗
║ 🌐 BROWSER AUTOMATION START           ║
╚═══════════════════════════════════════╝
```

### Performance Analyst
```
╔═══════════════════════════════════════╗
║ 📊 PERFORMANCE ANALYST START          ║
╚═══════════════════════════════════════╝
```

### Template System Specialist
```
╔═══════════════════════════════════════╗
║ 📋 TEMPLATE SYSTEM START              ║
╚═══════════════════════════════════════╝
```

### MCP Integration Specialist
```
╔═══════════════════════════════════════╗
║ 🔌 MCP INTEGRATION START              ║
╚═══════════════════════════════════════╝
```

### Resource Manager Specialist
```
╔═══════════════════════════════════════╗
║ 📦 RESOURCE MANAGER START             ║
╚═══════════════════════════════════════╝
```

### Types System Specialist
```
╔═══════════════════════════════════════╗
║ 🏷️ TYPES SYSTEM START                 ║
╚═══════════════════════════════════════╝
```

### Token Optimizer Specialist
```
╔═══════════════════════════════════════╗
║ 💰 TOKEN OPTIMIZER START              ║
╚═══════════════════════════════════════╝
```

## Usage Rules

1. **Always use the box** at the start and end of agent responses
2. **Keep agent name consistent** - Use the exact format shown above
3. **Everything inside the boxes** is from the specialist agent
4. **Everything outside/after the COMPLETE box** is from Claude Code (main assistant)
5. **Progress indicators** and status updates go between the START and COMPLETE boxes

## Example Agent Response

```
╔═══════════════════════════════════════╗
║ 🔍 DISCOVERY SCOUT START              ║
╚═══════════════════════════════════════╝

Investigating authentication system...

Discovery Progress: [████████░░] 80% - Analyzing auth flow...
📊 Components found: 15
⚠️ Issues detected: 2

[Investigation details here]

╔═══════════════════════════════════════╗
║ 🔍 DISCOVERY SCOUT COMPLETE           ║
╚═══════════════════════════════════════╝
```

After this box, any text is from Claude Code interpreting the results.