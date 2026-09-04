import { CRMFieldMapping, CRMSyncHistory } from '@prisma/client';

export type CRMFieldType = 'string' | 'number' | 'date' | 'boolean' | 'array';

export type CRMFieldTransformer = {
  fromCRM: (value: any) => any;
  toCRM: (value: any) => any;
};

export type CRMFieldConfig = {
  crmField: string;
  localField: string;
  type: CRMFieldType;
  required: boolean;
  transformer?: CRMFieldTransformer;
};

export type CRMSyncResult = {
  success: boolean;
  syncedFields: string[];
  errors?: {
    field: string;
    message: string;
  }[];
  timestamp: Date;
};

export type CRMFieldMappingCreateInput = {
  crmField: string;
  localField: string;
  transformer?: string;
  isRequired?: boolean;
};

export type CRMFieldMappingUpdateInput = Partial<CRMFieldMappingCreateInput>;

export type CRMSyncHistoryCreateInput = {
  povId: string;
  status: string;
  details?: Record<string, any>;
};

export type CRMSyncConfig = {
  fieldMappings: CRMFieldMapping[];
  syncHistory: CRMSyncHistory[];
};
