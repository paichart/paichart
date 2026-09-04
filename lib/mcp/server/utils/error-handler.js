/**
 * Jan Marshal's Simple Error Handler for MCP Server
 * "Error handling should be simple - catch it, log it, return an error message"
 */

const { stderr, createAdapter } = require('../mcp-logger');

class SimpleErrorHandler {
  constructor() {
    this.logger = this.createLogger();
  }

  createLogger() {
    return createAdapter(stderr.mcpLogger.child({ component: 'error-handler' }));
  }

  /**
   * Simple error handling - no complex pattern recognition
   */
  handleError(error, context = {}) {
    // Simple error logging
    this.logger.error('Error occurred:', {
      message: error.message,
      endpoint: context.endpoint || 'unknown',
      method: context.method || 'unknown'
    });

    // Simple error response
    return {
      isError: true,
      error: error.message || 'An error occurred',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Simple error text extraction
   */
  getErrorText(error) {
    if (typeof error === 'string') {
      return error;
    }
    
    if (error.message) {
      return error.message;
    }
    
    if (error.response && error.response.statusText) {
      return `${error.response.status} ${error.response.statusText}`;
    }
    
    return 'Unknown error';
  }

  /**
   * Simple error check for common types
   */
  isNetworkError(error) {
    const errorText = this.getErrorText(error).toLowerCase();
    return errorText.includes('network') || 
           errorText.includes('connection') || 
           errorText.includes('timeout');
  }

  isAuthError(error) {
    const errorText = this.getErrorText(error).toLowerCase();
    return errorText.includes('unauthorized') || 
           errorText.includes('authentication') || 
           errorText.includes('401') || 
           errorText.includes('403');
  }
}

// Create singleton instance
const errorHandler = new SimpleErrorHandler();

module.exports = { SimpleErrorHandler, errorHandler };
