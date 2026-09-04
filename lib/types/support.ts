export interface SupportRequest {
  id: string;
  userId: string;
  type: string;
  priority: SupportRequestPriority;
  subject: string;
  description: string;
  status: SupportRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  user: {
    name: string;
    email: string;
  };
}

export interface FeatureRequest {
  id: string;
  userId: string;
  category: string;
  impact: FeatureRequestImpact;
  title: string;
  description: string;
  businessCase: string;
  isUrgent: boolean;
  status: FeatureRequestStatus;
  createdAt: Date;
  updatedAt: Date;
  user: {
    name: string;
    email: string;
  };
}

export interface SupportRequestCreate {
  type: string;
  priority: SupportRequestPriority;
  subject: string;
  description: string;
}

export interface FeatureRequestCreate {
  category: string;
  impact: FeatureRequestImpact;
  title: string;
  description: string;
  businessCase: string;
  isUrgent?: boolean;
}

export const SUPPORT_REQUEST_TYPES = [
  'technical',
  'access',
  'data',
  'other',
] as const;

export const FEATURE_REQUEST_CATEGORIES = [
  'functionality',
  'improvement',
  'integration',
  'usability',
  'performance',
  'other',
] as const;

export type SupportRequestPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type SupportRequestStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type FeatureRequestStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED';
export type FeatureRequestImpact = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
