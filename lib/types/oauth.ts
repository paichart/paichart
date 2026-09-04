/**
 * OAuth 2.0 and Trial Management Type Definitions
 * Provides type safety for JSON configuration fields and OAuth data
 */

export interface TrialConfiguration {
  companyName: string;
  contactEmail: string;
  useCase: string;
  expectedUsers: number;
  industry: string;
  trialId: string;
  requestedAt: string;
  activatedAt?: string;
  status: string;
  type: 'company_trial';
  category: 'TRIAL_REQUEST';
  userId?: string;
  lastActivity?: string;
  serviceCallCount?: number;
}

export interface MCPToolConfiguration {
  endpoint?: string;
  transport?: string;
  category?: string;
  ownerId?: string;
  ownerEmail?: string;
  createdBy?: string;
  serviceType?: string;
  publicAccess?: boolean;
  approvalStatus?: string;
  evaluationResult?: any;
  [key: string]: any; // Allow additional configuration fields
}

export interface MCPToolPermissions {
  canModify?: string[];
  canDelete?: string[];
  owner?: string;
  [key: string]: any; // Allow additional permission fields
}

export interface OAuthUserData {
  provider: string;
  providerUserId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  organizationDomain?: string;
}

export interface OAuthRegistrationData {
  email: string;
  name: string;
  trial?: string;
  oauthData?: OAuthUserData;
}

export interface EnterpriseTrialResponse {
  success: boolean;
  trialId: string;
  status: string;
  message: string;
  companyName: string;
  trialDuration: string;
  benefits: string[];
  nextSteps: {
    description: string;
    registrationUrl: string;
    expectedBenefits: {
      trialDuration: string;
      includedServices: string;
      supportLevel: string;
      teamSize: number;
      features: string[];
    };
  };
  contactInfo: {
    email: string;
    nextContact: string;
  };
  hubInfo: {
    activeServices: number;
    hubVersion: string;
    supportedIntegrations: string[];
  };
}

// Type guards for safe JSON casting
export function isTrialConfiguration(obj: any): obj is TrialConfiguration {
  return obj && 
    typeof obj === 'object' && 
    typeof obj.companyName === 'string' &&
    typeof obj.contactEmail === 'string' &&
    typeof obj.trialId === 'string' &&
    obj.type === 'company_trial';
}

export function isMCPToolConfiguration(obj: any): obj is MCPToolConfiguration {
  return obj && typeof obj === 'object';
}

export function isOAuthUserData(obj: any): obj is OAuthUserData {
  return obj && 
    typeof obj === 'object' &&
    typeof obj.provider === 'string' &&
    typeof obj.email === 'string' &&
    typeof obj.name === 'string';
}