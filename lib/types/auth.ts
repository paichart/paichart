export enum UserRole {
  USER = 'USER',
  DEMO_USER = 'DEMO_USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export const AVAILABLE_ROLES: UserRole[] = [
  UserRole.USER,
  UserRole.DEMO_USER,
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
];

export enum ResourceAction {
  VIEW = 'view',
  CREATE = 'create',
  EDIT = 'edit',
  DELETE = 'delete',
  APPROVE = 'approve',
  REJECT = 'reject',
  ASSIGN = 'assign',
  COMMENT = 'comment',
  UPLOAD = 'upload',
}

export enum ResourceType {
  PoV = 'pov',
  PHASE = 'phase',
  TASK = 'task',
  USER = 'user',
  TEAM = 'team',
  SETTINGS = 'settings',
  ANALYTICS = 'analytics',
  USER_MANAGEMENT = 'user-management',
  PERMISSIONS = 'permissions',
  JOB_TITLES = 'job-titles',
  CRM = 'crm',
  CRM_SETTINGS = 'crm-settings',
  CRM_MAPPING = 'crm-mapping',
  CRM_SYNC = 'crm-sync',
  AUDIT = 'audit',
  MCP_SERVICE = 'mcp-service',
  MCP_RESOURCES = 'mcp-resources',
  MCP_RESOURCE = 'mcp-resource',
  AGENT_EXECUTION = 'agent-execution',
  PROMPT_LIBRARY = 'prompt-library',
}

export interface Resource {
  // null = capability check with no instance (e.g. "can this role create a POV?").
  // The composite-key lookup ignores id; it's used only for cache key + audit.
  id: string | null;
  type: ResourceType;
  ownerId?: string;
  teamId?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date | null;
  customRoleId?: string | null;
  verificationToken?: string | null;
  isVerified: boolean;
  verifiedAt?: Date | null;
  // OAuth 2.0 fields for enterprise authentication
  oauthProvider?: string | null;
  oauthProviderId?: string | null;
  avatarUrl?: string | null;
  organizationDomain?: string | null;
  lastLoginAt?: Date | null;
}

export interface TokenPayload {
  userId: string;
  email: string;
  name?: string;
  role: UserRole;
  sub?: string; // Standard JWT subject claim (Component 5 - RS256 tokens)
  tenantId?: string; // Multi-tenant support (prepared for future)
  exp?: number;
  iat?: number;
}

export interface JWTPayload extends Record<string, any> {
  userId: string;
  email: string;
  name?: string;
  role: UserRole;
  exp?: number;
  iat?: number;
}

export interface Permission {
  action: ResourceAction;
  resourceType: ResourceType;
  conditions?: {
    isOwner?: boolean;
    isTeamMember?: boolean;
    hasRole?: UserRole[];
  };
}

export interface PermissionCacheKey {
  userId: string;
  resourceType: ResourceType;
  resourceId: string;
  action: ResourceAction;
}

export interface ApiError {
  message: string;
  code?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
}

export interface AuthResponse {
  user: User;
  accessToken?: string; // BC56: Deprecated — token is in HttpOnly cookie, not response body
  tokenExpiresAt?: number; // BC56: Expiration timestamp (seconds) for pre-emptive refresh
}

export interface ApiResponse<T = any> {
  data?: T;
  error?: ApiError;
}

export interface ResponseCookie {
  name: string;
  value: string;
  options?: {
    path?: string;
    domain?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
    maxAge?: number;
    expires?: Date;
  };
}

export interface ApiResponseWithCookies<T = any> {
  data?: T;
  error?: ApiError;
  cookies?: ResponseCookie[];
}

export type RolePermissions = Record<UserRole, Permission[]>;

// OAuth 2.0 related types
export interface OAuthProvider {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  endpoints: {
    authorize: string;
    token: string;
    userInfo: string;
    revoke?: string;
  };
  displayName: string;
}

export interface OAuthUserInfo {
  id: string;
  email: string;
  name: string;
  provider: string;
  providerUserId: string;
  avatarUrl?: string;
  organizationDomain?: string;
  roles?: string[];
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  tokenType: string;
  scope: string;
}

export interface AuthContext {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
  tokenType: 'jwt' | 'oauth2';
  provider?: string;
  authenticated: boolean;
}

// Trial and MCP related types for type-safe JSON configuration
export interface TrialConfiguration {
  trialId: string;
  type: 'company_trial';
  contactEmail: string;
  companyName: string;
  userId?: string;
  status?: 'PENDING' | 'ACTIVE_TRIAL' | 'EXPIRED';
  activatedAt?: string;
  expiresAt?: string;
}

export interface MCPToolConfiguration extends Record<string, any> {
  // Strongly typed common configurations for better type safety
  trialId?: string;
  type?: 'company_trial' | 'user_trial' | 'enterprise_trial';
  contactEmail?: string;
  companyName?: string;
  userId?: string;
  status?: 'PENDING' | 'ACTIVE_TRIAL' | 'EXPIRED';
  activatedAt?: string;
  expiresAt?: string;
}

export interface MCPToolPermissions extends Record<string, any> {
  owner?: string;
}

// Type guard functions for safe type casting
export function isTrialConfiguration(config: any): config is TrialConfiguration {
  return config && 
         typeof config === 'object' && 
         'trialId' in config && 
         'contactEmail' in config &&
         'type' in config;
}

export function isMCPToolConfiguration(config: any): config is MCPToolConfiguration {
  return config && typeof config === 'object';
}

export function convertUserResponse(user: any): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: new Date(user.createdAt),
    updatedAt: new Date(user.updatedAt),
    lastLogin: user.lastLogin ? new Date(user.lastLogin) : null,
    customRoleId: user.customRoleId || null,
    verificationToken: user.verificationToken || null,
    isVerified: user.isVerified || false,
    verifiedAt: user.verifiedAt ? new Date(user.verifiedAt) : null,
    // OAuth 2.0 fields
    oauthProvider: user.oauthProvider || null,
    oauthProviderId: user.oauthProviderId || null,
    avatarUrl: user.avatarUrl || null,
    organizationDomain: user.organizationDomain || null,
    lastLoginAt: user.lastLoginAt ? new Date(user.lastLoginAt) : null,
  };
}
