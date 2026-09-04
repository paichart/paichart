/**
 * JWT Token Management - Compatibility Wrapper
 *
 * This file re-exports from lib/auth/token-manager.ts to maintain
 * backward compatibility with existing imports while ensuring all
 * tokens use RS256 (Component 5 - Phase 2/3 deployed Jan 2026).
 *
 * DEPRECATED: New code should import from '@/lib/auth/token-manager' directly.
 * This wrapper exists only for backward compatibility with old imports.
 */

export {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTokens,
  decodeToken
} from './auth/token-manager';

// Legacy type exports
export type { TokenPayload } from './types/auth';

// Backward compatibility: verifyToken alias
export { verifyAccessToken as verifyToken } from './auth/token-manager';
