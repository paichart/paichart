#!/usr/bin/env node

const { mcpServerManager } = require('../dist/lib/services/mcp/serverManager');

async function connectBrowserUseServer() {
  try {
    console.log('Connecting browser-use server...\n');
    
    // Initialize server manager if needed
    if (!mcpServerManager.getIsInitialized()) {
      console.log('Initializing server manager...');
      await mcpServerManager.initialize();
    }
    
    // Check if browser-use server exists
    const servers = mcpServerManager.listServers();
    const browserUseServer = servers.find(s => s.name === 'browser-use');
    
    if (!browserUseServer) {
      console.error('browser-use server not found in configuration!');
      console.log('Available servers:', servers.map(s => s.name));
      return;
    }
    
    console.log('Found browser-use server:', {
      name: browserUseServer.name,
      status: browserUseServer.status,
      transport: browserUseServer.config?.transport?.type
    });
    
    // Connect if not already connected
    if (browserUseServer.status !== 'connected') {
      console.log('\nConnecting to browser-use server...');
      await mcpServerManager.connectServer('browser-use');
      console.log('✅ Successfully connected to browser-use server!');
    } else {
      console.log('✅ browser-use server is already connected');
    }
    
    // List tools from browser-use
    const tools = await mcpServerManager.discoverTools('browser-use');
    console.log(`\n✅ Found ${tools.length} tools from browser-use server`);
    
    // Check tool registry
    const { mcpToolRegistry } = require('../dist/lib/services/mcp/toolRegistry');
    const registeredTools = mcpToolRegistry.searchTools({ serverName: 'browser-use' });
    console.log(`✅ ${registeredTools.length} browser-use tools registered in tool registry`);
    
    if (registeredTools.length > 0) {
      console.log('\nRegistered browser-use tools:');
      registeredTools.forEach(tool => {
        console.log(`  - ${tool.name}`);
      });
    }
    
  } catch (error) {
    console.error('Error connecting browser-use server:', error);
  }
}

// Run if called directly
if (require.main === module) {
  connectBrowserUseServer().then(() => {
    console.log('\nDone! The browser-use tools should now appear in MCPToolsSelector.');
    process.exit(0);
  }).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}