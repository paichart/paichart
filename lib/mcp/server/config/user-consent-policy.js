/**
 * User Consent & Transparency Policy
 * Anthropic MCP Compliance - User Awareness and Consent
 *
 * @aspirational - This module is not yet active. No code imports it.
 * References Prisma models (UserConsent, AuditLog, SecurityLog) that do not
 * exist in the schema. See:
 * .claude/knowledge/domain/mcp/TODO-user-consent-trust-integration.md
 */

// Consent types required for different operations
const CONSENT_TYPES = {
  SERVICE_REGISTRATION: {
    id: 'service_registration',
    title: 'Service Registration Consent',
    description: 'Allow your service to be discoverable and callable by other users in the MCP Hub',
    required: true,
    implications: [
      'Your service information will be visible to authenticated users',
      'Other users may execute tools from your service',
      'Service usage will be logged for monitoring and billing',
      'You remain responsible for your service\'s actions and outputs'
    ]
  },
  
  SERVICE_CALLS: {
    id: 'service_calls',
    title: 'Service Interaction Consent',
    description: 'Allow making calls to other services through the MCP Hub',
    required: true,
    implications: [
      'Your requests to other services will be logged',
      'Service owners may see your usage patterns',
      'You are responsible for appropriate use of called services',
      'Some service calls may incur costs'
    ]
  },
  
  DATA_PROCESSING: {
    id: 'data_processing',
    title: 'Data Processing Consent',
    description: 'Allow processing of your service interactions for improvement and compliance',
    required: true,
    implications: [
      'Request and response data may be analyzed for security and compliance',
      'Aggregated usage statistics may be generated',
      'Personal information will be anonymized where possible',
      'Data retention follows our standard policies'
    ]
  },
  
  MONITORING: {
    id: 'monitoring',
    title: 'Security Monitoring Consent',
    description: 'Allow monitoring of your service interactions for security purposes',
    required: true,
    implications: [
      'Security events and anomalies will be logged and analyzed',
      'Suspicious activities may trigger account reviews',
      'Monitoring data helps protect all platform users',
      'You may be contacted regarding security issues'
    ]
  }
};

// Privacy notice for different data types
const PRIVACY_NOTICES = {
  SERVICE_METADATA: {
    collected: ['Service name', 'Description', 'Capabilities', 'Endpoints', 'Owner information'],
    purpose: 'Enable service discovery and access control',
    retention: '90 days after service deletion',
    sharing: 'Visible to authenticated users for discovery purposes'
  },
  
  INTERACTION_LOGS: {
    collected: ['Request details', 'Response summaries', 'Timestamps', 'User IDs', 'IP addresses'],
    purpose: 'Security monitoring, compliance reporting, and system improvement',
    retention: '1 year for security logs, 30 days for detailed interaction data',
    sharing: 'Not shared with third parties, may be reviewed by platform administrators'
  },
  
  USAGE_ANALYTICS: {
    collected: ['Service popularity', 'Performance metrics', 'Error rates', 'User engagement patterns'],
    purpose: 'Platform improvement and service optimization',
    retention: 'Indefinitely in aggregated, anonymized form',
    sharing: 'May be shared in aggregate statistics without personal identification'
  }
};

/**
 * Generate consent form for user operations
 */
function generateConsentForm(operation, userContext) {
  const requiredConsents = getRequiredConsents(operation);
  
  return {
    operation,
    timestamp: new Date().toISOString(),
    consents: requiredConsents.map(consentType => ({
      ...CONSENT_TYPES[consentType],
      status: 'pending'
    })),
    privacyNotices: getRelevantPrivacyNotices(operation),
    userRights: {
      access: 'You can request access to your data at any time',
      rectification: 'You can request correction of inaccurate data',
      erasure: 'You can request deletion of your data (subject to legal requirements)',
      portability: 'You can request export of your data in machine-readable format',
      objection: 'You can object to certain types of data processing',
      withdrawal: 'You can withdraw consent at any time (may affect service availability)'
    },
    contact: {
      dataProtectionOfficer: 'privacy@paichart.com',
      supportTeam: 'support@paichart.com'
    }
  };
}

/**
 * Validate user consent for operation
 */
async function validateUserConsent(userId, operation, prisma) {
  try {
    const requiredConsents = getRequiredConsents(operation);
    
    const userConsents = await prisma.userConsent.findMany({
      where: {
        userId,
        consentType: { in: requiredConsents },
        status: 'GRANTED',
        expiresAt: { gt: new Date() }
      },
      take: 50
    });
    
    const grantedConsents = userConsents.map(c => c.consentType);
    const missingConsents = requiredConsents.filter(c => !grantedConsents.includes(c));
    
    return {
      valid: missingConsents.length === 0,
      missingConsents,
      grantedConsents,
      requiresConsent: missingConsents.length > 0,
      consentForm: missingConsents.length > 0 ? generateConsentForm(operation, { userId }) : null
    };
  } catch (error) {
    // Note: mcpLogger not imported — module is aspirational (see JSDoc above)
    // When activated, replace with: mcpLogger.error({ err: error }, 'Failed to validate consent');
    return {
      valid: false,
      error: 'Unable to validate consent',
      requiresConsent: true
    };
  }
}

/**
 * Record user consent
 */
async function recordUserConsent(userId, consentData, prisma) {
  try {
    const consentRecord = await prisma.userConsent.create({
      data: {
        userId,
        consentType: consentData.consentType,
        status: 'GRANTED',
        consentText: consentData.consentText,
        version: consentData.version || '1.0',
        ipAddress: consentData.ipAddress,
        userAgent: consentData.userAgent,
        grantedAt: new Date(),
        expiresAt: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)), // 1 year
        metadata: {
          source: 'mcp_hub',
          operation: consentData.operation,
          sessionId: consentData.sessionId
        }
      }
    });
    
    // When activated: mcpLogger.info({ userId, consentType: consentData.consentType }, 'Consent recorded');
    return consentRecord;
  } catch (error) {
    // When activated: mcpLogger.error({ err: error }, 'Failed to record consent');
    throw error;
  }
}

/**
 * Generate transparency report for user
 */
async function generateTransparencyReport(userId, prisma) {
  try {
    const [
      userServices,
      serviceCalls,
      consentHistory,
      dataProcessingLogs
    ] = await Promise.all([
      prisma.mCPTool.findMany({
        where: { configuration: { path: ['ownerId'], equals: userId } },
        select: { id: true, name: true, status: true, createdAt: true },
        take: 100
      }),
      prisma.auditLog.count({
        where: { userId, eventType: 'SERVICE_CALL' }
      }),
      prisma.userConsent.findMany({
        where: { userId },
        orderBy: { grantedAt: 'desc' }
      }),
      prisma.securityLog.count({
        where: { userId }
      })
    ]);
    
    return {
      userId,
      reportDate: new Date().toISOString(),
      summary: {
        servicesRegistered: userServices.length,
        serviceCallsMade: serviceCalls,
        consentsGranted: consentHistory.length,
        dataProcessingEvents: dataProcessingLogs
      },
      services: userServices,
      consentHistory,
      dataUsage: {
        serviceMetadata: 'Used for discovery and access control',
        interactionLogs: 'Used for security monitoring and compliance',
        usageAnalytics: 'Used for platform improvement (anonymized)'
      },
      rights: {
        access: 'Request copy of your data',
        rectification: 'Correct inaccurate information',
        erasure: 'Delete your account and associated data',
        portability: 'Export your data',
        objection: 'Object to data processing',
        withdrawal: 'Withdraw consents'
      },
      contact: 'privacy@paichart.com'
    };
  } catch (error) {
    // When activated: mcpLogger.error({ err: error }, 'Failed to generate transparency report');
    throw error;
  }
}

// Helper functions

function getRequiredConsents(operation) {
  const consentMap = {
    // Consolidated tool names (Mar 2026)
    'registry': ['SERVICE_REGISTRATION', 'DATA_PROCESSING', 'MONITORING'],
    'services': ['SERVICE_CALLS', 'DATA_PROCESSING', 'MONITORING'],
    // Legacy tool names (backward compat)
    'register_service': ['SERVICE_REGISTRATION', 'DATA_PROCESSING', 'MONITORING'],
    'call_service': ['SERVICE_CALLS', 'DATA_PROCESSING', 'MONITORING'],
    'discover_services': ['DATA_PROCESSING'],
    'update_service': ['SERVICE_REGISTRATION', 'DATA_PROCESSING', 'MONITORING']
  };

  return consentMap[operation] || ['DATA_PROCESSING'];
}

function getRelevantPrivacyNotices(operation) {
  const noticeMap = {
    // Consolidated tool names (Mar 2026)
    'registry': ['SERVICE_METADATA', 'INTERACTION_LOGS', 'USAGE_ANALYTICS'],
    'services': ['INTERACTION_LOGS', 'USAGE_ANALYTICS'],
    // Legacy tool names (backward compat)
    'register_service': ['SERVICE_METADATA', 'INTERACTION_LOGS', 'USAGE_ANALYTICS'],
    'call_service': ['INTERACTION_LOGS', 'USAGE_ANALYTICS'],
    'discover_services': ['USAGE_ANALYTICS']
  };
  
  const relevantNotices = noticeMap[operation] || ['USAGE_ANALYTICS'];
  return relevantNotices.map(notice => ({
    type: notice,
    ...PRIVACY_NOTICES[notice]
  }));
}

module.exports = {
  CONSENT_TYPES,
  PRIVACY_NOTICES,
  generateConsentForm,
  validateUserConsent,
  recordUserConsent,
  generateTransparencyReport,
  getRequiredConsents,
  getRelevantPrivacyNotices
};