import pino from 'pino';
import pinoBaseOptions from './mcp/server/pino-base-options.json';

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: pinoBaseOptions.redact,
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
export const authLogger = logger.child({ domain: 'auth' });
export const mcpLogger = logger.child({ domain: 'mcp' });
export const povLogger = logger.child({ domain: 'pov' });
export const taskLogger = logger.child({ domain: 'task' });
export const apiLogger = logger.child({ domain: 'api' });
export const dbLogger = logger.child({ domain: 'db' });
export const complianceLogger = logger.child({ domain: 'compliance' });
export const monitorLogger = logger.child({ domain: 'monitor' });
