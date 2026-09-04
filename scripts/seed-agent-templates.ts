import { PrismaClient, Prisma } from '@prisma/client';
import { AgentCategory, AgentPriority, AgentTemplateStatus, AgentComplexity, TemplateType } from '@prisma/client';
import { 
  PAICHART_UNIVERSAL_BASE_TEMPLATE, 
  getRoleSpecificGuidance,
  PAICHART_UNIVERSAL_METADATA 
} from '../lib/services/agentTemplateBuilder/pAIchartUniversalTemplate';
import { AGENT_MODELS } from '../lib/agents/model-tiers';
import { DEFAULT_MAX_TOKENS } from '../lib/services/llm/types';

const prisma = new PrismaClient();

/**
 * Global model parameters for all agent templates
 */
const globalModelParameters = {
  provider: 'anthropic_sdk',
  model: AGENT_MODELS.generic,
  temperature: 0.3,
  maxTokens: DEFAULT_MAX_TOKENS,  // 6000→8000→24000 (2026-07-16 truncation-stall R1 — a ceiling not a target). Never a literal — see test-seed-model-params-guard.
  stopSequences: [],
  useSystemPrompt: true,
  maxRetries: 3,
  timeout: 300,
  // No thinking as requested; cacheControl null = platform default (default-ON since Finding G 2026-07-08; explicit opt-out is false)
  cacheControl: null,
  thinkingBudgetTokens: undefined
};

/**
 * pAIchart Universal Agent Templates
 * These templates use the pAIchart Universal base with role-specific expertise
 */
/**
 * Templates removed during rationalization (2026-04-03):
 * - General Purpose Assistant: consolidated into Universal (overlapping scope)
 * - Customer Success Specialist: niche, covered by Business Analyst
 * - MCP Service Discovery: covered by MCP Service Orchestrator's registry(action: "tools")
 *
 * Templates recategorized:
 * - Project Manager: GENERAL → AUTOMATION (coordination/process role)
 * - MCP Service Registry: MCP_SERVICE_REGISTRY → MCP_SERVICE (consolidated)
 *
 * New templates added:
 * - Sales Engineer: the core pAIchart user persona (ARCHITECT type)
 * - Marketing Strategist: GTM planning and competitive positioning (ANALYST type)
 */
const defaultTemplates = [
  {
    name: PAICHART_UNIVERSAL_METADATA.name,
    description: PAICHART_UNIVERSAL_METADATA.description,
    category: AgentCategory.GENERAL,
    templateType: TemplateType.GENERALIST,
    defaultRole: 'strategic_technical_advisor',
    promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE,
    capabilities: {
      'Strategic Advisory': 'Business context understanding, Customer value demonstration, Technical excellence delivery, Stakeholder communication',
      'PoV Management': 'Phase-aware execution, Stage coordination, Task sequence understanding, Session continuity',
      'Tool Integration': 'MCP tool utilization, Context-aware tool selection, Result synthesis, Knowledge sharing'
    },
    constraints: {
      'Quality Standards': 'Technical excellence required, Customer satisfaction focus, Strategic advisor positioning, Compelling event contribution',
      'Execution Guidelines': 'Use available tools with precision, Apply domain expertise when needed, Provide confidence scores and insights, Support team collaboration'
    },
    maxRetries: 3,
    timeout: 300,
    priority: AgentPriority.MEDIUM,
    isDefault: true,
    tags: ['universal', 'base-template', 'strategic-advisor', 'pov-management', 'paichart-universal'],
    metadata: {
      modelParameters: globalModelParameters,
      hasModelParameters: true,
      modelParamsVersion: '1.0.0'
    }
  },
  {
    name: 'QA Test Engineer',
    description: 'Quality assurance specialist focused on systematic testing, edge cases, and quality validation for PoV success',
    category: AgentCategory.TESTING,
    templateType: TemplateType.REVIEWER,
    defaultRole: 'qa_test_engineer',
    promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance('qa_test_engineer')),
    capabilities: {
      frameworks: 'Jest, Cypress, Selenium, Playwright, JUnit, PyTest',
      tools: 'Postman, Insomnia, BrowserStack, TestRail, Jira, Charles Proxy',
      skills: 'Test Planning, Automation, Performance Testing, Security Testing, API Testing'
    },
    constraints: {
      testing_standards: 'Must achieve minimum 80% test coverage and follow WCAG 2.1 accessibility guidelines',
      reporting: 'All test results must include confidence scores and risk assessments'
    },
    maxRetries: 3,
    timeout: 300,
    priority: AgentPriority.HIGH,
    isDefault: true,
    tags: ['qa', 'testing', 'quality-assurance', 'automation', 'paichart-universal'],
    metadata: {
      modelParameters: globalModelParameters,
      hasModelParameters: true,
      modelParamsVersion: '1.0.0'
    }
  },
  {
    name: 'Business Analyst',
    description: 'Requirements analysis and ROI specialist focused on translating technical findings into business value',
    category: AgentCategory.ANALYSIS,
    templateType: TemplateType.ANALYST,
    defaultRole: 'business_analyst',
    promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance('business_analyst')),
    capabilities: {
      methodologies: 'Agile, Waterfall, Lean, Six Sigma',
      tools: 'JIRA, Confluence, Visio, Lucidchart, Excel, Power BI',
      skills: 'Requirements Gathering, Process Analysis, Stakeholder Management, ROI Analysis'
    },
    constraints: {
      business_alignment: 'All analysis must align with business objectives and demonstrate clear ROI',
      stakeholder_validation: 'Requirements must be validated with key stakeholders'
    },
    maxRetries: 2,
    timeout: 300,
    priority: AgentPriority.HIGH,
    tags: ['business-analysis', 'requirements', 'roi', 'stakeholder-management', 'paichart-universal'],
    metadata: {
      modelParameters: globalModelParameters,
      hasModelParameters: true,
      modelParamsVersion: '1.0.0'
    }
  },
  {
    name: 'Technical Consultant',
    description: 'Architecture and technical feasibility specialist focused on solution design and best practices',
    category: AgentCategory.DEVELOPMENT,
    templateType: TemplateType.ARCHITECT,
    defaultRole: 'technical_consultant',
    promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance('technical_consultant')),
    capabilities: {
      languages: 'TypeScript, JavaScript, Python, Java, Go, C#',
      frameworks: 'React, Next.js, Node.js, Express, Spring Boot, .NET',
      architecture: 'Microservices, Event-Driven, Serverless, Cloud-Native',
      skills: 'Solution Architecture, Technology Evaluation, Performance Optimization, Integration Design'
    },
    constraints: {
      technical_excellence: 'All recommendations must follow industry best practices and be scalable',
      risk_assessment: 'Technical risks must be identified and mitigation strategies provided'
    },
    maxRetries: 3,
    timeout: 450,
    priority: AgentPriority.HIGH,
    tags: ['technical-consulting', 'architecture', 'solution-design', 'best-practices', 'paichart-universal'],
    metadata: {
      modelParameters: globalModelParameters,
      hasModelParameters: true,
      modelParamsVersion: '1.0.0'
    }
  },
  {
    name: 'DevOps Engineer',
    description: 'Deployment and infrastructure specialist focused on scalability and operational excellence',
    category: AgentCategory.DEPLOYMENT,
    templateType: TemplateType.OPERATOR,
    defaultRole: 'devops_engineer',
    promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance('devops_engineer')),
    capabilities: {
      cloud_platforms: 'AWS, Azure, GCP, Digital Ocean',
      containers: 'Docker, Kubernetes, Docker Compose, Helm',
      ci_cd: 'GitHub Actions, GitLab CI, Jenkins, CircleCI',
      monitoring: 'Prometheus, Grafana, ELK Stack, DataDog, New Relic',
      iac: 'Terraform, CloudFormation, Ansible, Pulumi'
    },
    constraints: {
      reliability: 'All deployments must target 99.9% uptime with proper monitoring',
      security: 'Security best practices and compliance requirements must be met'
    },
    maxRetries: 3,
    timeout: 450,
    priority: AgentPriority.HIGH,
    tags: ['devops', 'infrastructure', 'deployment', 'monitoring', 'paichart-universal'],
    metadata: {
      modelParameters: globalModelParameters,
      hasModelParameters: true,
      modelParamsVersion: '1.0.0'
    }
  },
  {
    name: 'Security Analyst',
    description: 'Security validation and compliance specialist focused on risk mitigation for customer confidence',
    category: AgentCategory.SECURITY,
    templateType: TemplateType.REVIEWER,
    defaultRole: 'security_analyst',
    promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance('security_analyst')),
    capabilities: {
      security_testing: 'Penetration Testing, Vulnerability Assessment, Security Auditing',
      compliance: 'GDPR, HIPAA, SOC2, ISO27001, PCI-DSS',
      tools: 'Burp Suite, OWASP ZAP, Nmap, Wireshark, Vault, CyberArk',
      skills: 'Threat Modeling, Risk Assessment, Security Architecture, Incident Response'
    },
    constraints: {
      compliance_requirements: 'All security assessments must meet relevant compliance standards',
      risk_documentation: 'Security risks must be clearly documented with mitigation strategies'
    },
    maxRetries: 2,
    timeout: 360,
    priority: AgentPriority.HIGH,
    tags: ['security', 'compliance', 'risk-assessment', 'vulnerability-testing', 'paichart-universal'],
    metadata: {
      modelParameters: globalModelParameters,
      hasModelParameters: true,
      modelParamsVersion: '1.0.0'
    }
  },
  {
    name: 'Senior Software Developer',
    description: 'Experienced developer for complex coding tasks, architecture decisions, and code reviews',
    category: AgentCategory.DEVELOPMENT,
    templateType: TemplateType.BUILDER,
    defaultRole: 'senior_software_developer',
    promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance('senior_software_developer')),
    capabilities: {
      languages: 'TypeScript, JavaScript, Python, Java, Go, C#',
      frameworks: 'React, Next.js, Node.js, Express, Spring Boot, .NET',
      databases: 'PostgreSQL, MongoDB, Redis, MySQL',
      tools: 'Git, Docker, Jest, ESLint, Prettier, Webpack',
      skills: 'Architecture Design, Code Review, Performance Optimization, Security, Testing'
    },
    constraints: {
      code_quality: 'Must follow established coding standards and best practices',
      testing: 'Minimum 80% test coverage required for all new code',
      documentation: 'All public APIs and complex logic must be documented',
      security: 'Security review required for authentication/authorization code'
    },
    maxRetries: 3,
    timeout: 600,
    priority: AgentPriority.HIGH,
    tags: ['development', 'senior', 'full-stack', 'architecture', 'paichart-universal'],
    metadata: {
      modelParameters: globalModelParameters,
      hasModelParameters: true,
      modelParamsVersion: '1.0.0'
    }
  },
  {
    name: 'Technical Writer',
    description: 'Documentation specialist for technical content, API docs, and user guides',
    category: AgentCategory.DOCUMENTATION,
    templateType: TemplateType.DOCUMENTER,
    defaultRole: 'technical_writer',
    promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance('technical_writer')),
    capabilities: {
      document_types: 'API Docs, User Guides, Developer Docs, Architecture Docs, Tutorials',
      tools: 'Markdown, GitBook, Confluence, Notion, Swagger/OpenAPI',
      skills: 'Technical Writing, Information Architecture, Content Strategy, UX Writing'
    },
    constraints: {
      clarity: 'Documentation must be clear and support customer confidence',
      accuracy: 'All technical information must be verified and demonstrate solution value',
      customer_focus: 'Documentation must reinforce technical credibility and strategic positioning'
    },
    maxRetries: 2,
    timeout: 240,
    priority: AgentPriority.MEDIUM,
    tags: ['documentation', 'writing', 'technical', 'customer-confidence', 'paichart-universal'],
    metadata: {
      modelParameters: globalModelParameters,
      hasModelParameters: true,
      modelParamsVersion: '1.0.0'
    }
  },
  {
    name: 'Project Manager',
    description: 'Project coordination and timeline management specialist focused on stakeholder communication and PoV delivery excellence',
    category: AgentCategory.AUTOMATION,
    templateType: TemplateType.OPERATOR,
    defaultRole: 'project_manager',
    promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance('project_manager')),
    capabilities: {
      methodologies: 'Agile, Waterfall, Scrum, Kanban, Lean',
      tools: 'JIRA, Asana, Monday.com, MS Project, Slack, Teams',
      skills: 'Project Planning, Resource Management, Risk Management, Stakeholder Communication, Timeline Management'
    },
    constraints: {
      delivery_excellence: 'All milestones must align with customer expectations and sales timelines',
      stakeholder_management: 'Regular communication and transparent reporting required',
      risk_mitigation: 'Proactive identification and mitigation of project risks'
    },
    maxRetries: 2,
    timeout: 300,
    priority: AgentPriority.HIGH,
    tags: ['project-management', 'coordination', 'stakeholder-communication', 'delivery-excellence', 'paichart-universal'],
    metadata: {
      modelParameters: globalModelParameters,
      hasModelParameters: true,
      modelParamsVersion: '1.0.0'
    }
  },
  {
    name: 'Solution Architect',
    description: 'Comprehensive solution design and technical leadership specialist focused on enterprise architecture and competitive advantage',
    category: AgentCategory.DEVELOPMENT,
    templateType: TemplateType.ARCHITECT,
    defaultRole: 'solution_architect',
    promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance('solution_architect')),
    capabilities: {
      architecture_patterns: 'Microservices, Event-Driven, Serverless, Cloud-Native, SOA',
      technologies: 'AWS, Azure, GCP, Kubernetes, Docker, API Gateway, Service Mesh',
      design_tools: 'Lucidchart, Draw.io, Enterprise Architect, Visio',
      skills: 'End-to-end Solution Design, Technology Evaluation, Integration Strategy, Performance Planning'
    },
    constraints: {
      enterprise_readiness: 'All solutions must demonstrate scalability and long-term viability',
      competitive_advantage: 'Architecture must highlight unique value propositions',
      customer_alignment: 'Solutions must directly address business requirements and support compelling events'
    },
    maxRetries: 3,
    timeout: 450,
    priority: AgentPriority.HIGH,
    tags: ['solution-architecture', 'enterprise-design', 'technical-leadership', 'competitive-advantage', 'paichart-universal'],
    metadata: {
      modelParameters: globalModelParameters,
      hasModelParameters: true,
      modelParamsVersion: '1.0.0'
    }
  },
  {
    name: 'Data Analyst',
    description: 'Data analysis and insights specialist focused on metrics validation, ROI analysis, and business intelligence for PoV success',
    category: AgentCategory.ANALYSIS,
    templateType: TemplateType.ANALYST,
    defaultRole: 'data_analyst',
    promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance('data_analyst')),
    capabilities: {
      analytics_tools: 'Python, R, SQL, Tableau, Power BI, Excel, Google Analytics',
      statistical_methods: 'Regression Analysis, Time Series, A/B Testing, Predictive Modeling',
      visualization: 'Tableau, Power BI, D3.js, Matplotlib, Seaborn',
      skills: 'Data Collection, Statistical Analysis, Performance Metrics, Trend Analysis, Data Visualization'
    },
    constraints: {
      data_quality: 'All analysis must include confidence scores and data quality assessments',
      business_impact: 'Insights must directly support business case and ROI calculations',
      executive_communication: 'Results must be presented in executive-friendly format'
    },
    maxRetries: 2,
    timeout: 360,
    priority: AgentPriority.HIGH,
    tags: ['data-analysis', 'business-intelligence', 'roi-analysis', 'metrics-validation', 'paichart-universal'],
    metadata: {
      modelParameters: globalModelParameters,
      hasModelParameters: true,
      modelParamsVersion: '1.0.0'
    }
  },
  {
    // Added 2026-04-15 (task #81). Distinct from "Artifact Harvester"
    // (seed-artifact-synthesis-templates.ts) which harvests from existing
    // source material. This one analyzes topics / systems / situations
    // and produces findings — infrastructure audits, red-team analysis,
    // competitive studies, compliance reviews, threat modelling. See the
    // decision guide in seed-artifact-synthesis-templates.ts header.
    // GS1 naming: describes deliverable (analytical findings) not mechanism.
    // GS2 role guidance: see pAIchartUniversalTemplate.ts `research_analyst` key.
    // GS4 category: ANALYSIS (peer of Business Analyst, Data Analyst).
    name: 'Research Analyst',
    description: 'Generic analytical research specialist. Analyzes systems, infrastructure, threat landscapes, competitive positions, compliance regimes, or domain topics and produces findings with severity ratings and POV-grounded recommendations. Distinct from the narrow Artifact Harvester — use the Harvester when the task asks to extract findings from existing source material (git logs, meeting notes, session history); use this Research Analyst when the task asks to investigate a topic or system and produce analytical output.',
    category: AgentCategory.ANALYSIS,
    templateType: TemplateType.ANALYST,
    defaultRole: 'research_analyst',
    promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance('research_analyst')),
    capabilities: {
      research_domains: 'Infrastructure analysis, Red team / threat modelling, Competitive analysis, Compliance landscape, Literature review, Risk assessment',
      frameworks: 'NIST CSF, CIS v8, HIPAA, SOX, PCI-DSS, GDPR, NIS2, ISO 27001, ASD Essential Eight, APRA CPS 234',
      skills: 'Structured analysis, Severity rating, POV context grounding, Regional regulatory inference, Assumption flagging'
    },
    constraints: {
      scope_discipline: 'Stay within the task description; do not expand to adjacent domains without instruction',
      anchoring: 'Every finding must anchor to a named system, architectural element, regulatory requirement, or measurable metric — unanchored claims must be labelled "assumption"',
      no_harvest: 'Do NOT accept tasks that ask to extract findings from existing source material (git logs, meeting notes) — that is the Artifact Harvester\'s scope; post a brief note and exit'
    },
    maxRetries: 2,
    timeout: 360,
    priority: AgentPriority.HIGH,
    tags: ['research', 'analysis', 'infrastructure', 'red-team', 'compliance', 'paichart-universal'],
    metadata: {
      modelParameters: {
        // Start on Sonnet for anti-fabrication safety per 2026-04-15 Threats-
        // to-Validity observation (capable models refuse; less-capable
        // hallucinate). Re-evaluate during the template audit (task #83)
        // once the TEMPLATE_MISMATCH escape hatch (task #82) ships.
        ...globalModelParameters,
        model: AGENT_MODELS.synthesis,
      },
      hasModelParameters: true,
      modelParamsVersion: '1.0.0'
    }
  },
  {
    name: 'MCP Service Registry',
    description: 'Autonomous agent for conversational MCP service registration and lifecycle management',
    category: AgentCategory.MCP_SERVICE,
    templateType: TemplateType.ORCHESTRATOR,
    defaultRole: 'mcp_service_registrar',
    promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance('mcp_service_registrar')),
    capabilities: {
      'Service Registration': 'Natural language parsing, Configuration validation, Ownership tracking',
      'Validation': 'MCP protocol compliance, Security validation, Endpoint testing',
      'Metadata Management': 'Service categorization, Capability mapping, Discovery optimization'
    },
    constraints: {
      'Security Standards': 'All services must meet security requirements, Authentication validated',
      'Ownership Tracking': 'User authentication required, Ownership metadata mandatory',
      'Protocol Compliance': 'Strict MCP protocol adherence required'
    },
    maxRetries: 3,
    timeout: 300,
    priority: AgentPriority.HIGH,
    isDefault: false,
    tags: ['mcp-hub', 'service-registry', 'automation', 'paichart-universal'],
    metadata: {
      modelParameters: globalModelParameters,
      hasModelParameters: true,
      modelParamsVersion: '1.0.0',
      mcpHubSpecific: true
    }
  },
  // --- New templates ---
  {
    name: 'Sales Engineer',
    description: 'POV strategy and technical win specialist focused on customer engagement, demo planning, and accelerating purchase decisions. Acts as POV owner — coordinates the technical team and drives the compelling event.',
    category: AgentCategory.GENERAL,
    templateType: TemplateType.OPERATOR, // Task #83 fix: was ARCHITECT (mismatch with POV-owner coordinator role). SE coordinates customer engagement + drives timeline; peer-level with PM and DevOps (OPERATOR shape).
    defaultRole: 'sales_engineer',
    promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance('sales_engineer')),
    capabilities: {
      skills: 'POV Strategy, Demo Planning, Technical Win Execution, Competitive Analysis, Value Selling',
      tools: 'CRM, Demo Environments, Presentation Tools, ROI Calculators',
      domains: 'Customer Engagement, Solution Positioning, Proof of Value Design, Stakeholder Management'
    },
    constraints: {
      customer_focus: 'All activities must accelerate the customer purchase decision',
      value_articulation: 'Technical capabilities must be translated into business value',
      competitive_awareness: 'Differentiation from competitors must be explicit and defensible'
    },
    maxRetries: 2,
    timeout: 300,
    priority: AgentPriority.HIGH,
    tags: ['sales-engineering', 'pov-strategy', 'technical-win', 'customer-engagement', 'paichart-universal'],
    metadata: {
      modelParameters: globalModelParameters,
      hasModelParameters: true,
      modelParamsVersion: '1.0.0'
    }
  },
  {
    name: 'Marketing Strategist',
    description: 'Go-to-market planning and competitive positioning specialist focused on campaign design, messaging frameworks, and market analysis',
    category: AgentCategory.ANALYSIS,
    templateType: TemplateType.ANALYST,
    defaultRole: 'marketing_strategist',
    promptTemplate: PAICHART_UNIVERSAL_BASE_TEMPLATE.replace('${roleSpecificGuidance}', getRoleSpecificGuidance('marketing_strategist')),
    capabilities: {
      skills: 'Market Analysis, Competitive Intelligence, Campaign Design, Content Strategy, Brand Positioning',
      tools: 'Google Analytics, SEMrush, HubSpot, Salesforce Marketing Cloud, Canva',
      domains: 'Go-to-Market Strategy, Demand Generation, Product Marketing, Channel Strategy'
    },
    constraints: {
      data_driven: 'All recommendations must be grounded in market data and measurable KPIs',
      buyer_journey: 'Strategies must map to specific stages of the buyer journey',
      roi_focus: 'Campaign proposals must include projected pipeline contribution and conversion targets'
    },
    maxRetries: 2,
    timeout: 300,
    priority: AgentPriority.HIGH,
    tags: ['marketing', 'go-to-market', 'competitive-analysis', 'campaign-design', 'paichart-universal'],
    metadata: {
      modelParameters: globalModelParameters,
      hasModelParameters: true,
      modelParamsVersion: '1.0.0'
    }
  }
];

async function seedAgentTemplates() {
  console.log('🌱 Seeding agent templates...');

  try {
    // Upsert templates — create if missing, update if existing.
    // NEVER deleteMany: other seed scripts (MCP Service Orchestrator, MCP Workflow
    // Orchestrator) create templates that must not be wiped.
    const createdTemplates = [];

    for (const template of defaultTemplates) {
      const existing = await prisma.agentTemplate.findFirst({
        where: { name: template.name }
      });

      if (existing) {
        console.log(`📝 Updating template: ${template.name} (${existing.id})`);
        const updated = await prisma.agentTemplate.update({
          where: { id: existing.id },
          data: {
          ...template,
          status: AgentTemplateStatus.ACTIVE,
          version: '1.1.0',
          updatedAt: new Date()
        }
        });
        createdTemplates.push(updated);
      } else {
        console.log(`📝 Creating template: ${template.name}`);
        const created = await prisma.agentTemplate.create({
          data: {
            ...template,
            status: AgentTemplateStatus.ACTIVE,
            version: '1.1.0',
            usageCount: 0,
            createdBy: 'system'
          }
        });
        createdTemplates.push(created);
      }
    }

    console.log(`✅ Successfully created ${createdTemplates.length} agent templates:`);
    createdTemplates.forEach(template => {
      console.log(`   - ${template.name} (${template.category}) [${template.templateType || 'no type'}]`);
    });

    // Removed templates — kept as a list for future deprecations.
    // Original three (General Purpose Assistant, Customer Success Specialist,
    // MCP Service Discovery) were soft-deprecated 2026-04-03 and hard-deleted
    // 2026-04-26 after the artifact-delivery contract fix; the live tasks that
    // had referenced them were also deleted at the same time.
    // To deprecate a template in the future: add its name to the array below
    // and run the seed. The script preserves the row by setting status to
    // DEPRECATED rather than deleting (preserves agent_executions FK history).
    const deprecatedTemplates: string[] = [];
    for (const name of deprecatedTemplates) {
      const existing = await prisma.agentTemplate.findFirst({ where: { name } });
      if (existing && existing.status !== AgentTemplateStatus.DEPRECATED) {
        await prisma.agentTemplate.update({
          where: { id: existing.id },
          data: { status: AgentTemplateStatus.DEPRECATED, isDefault: false, updatedAt: new Date() }
        });
        console.log(`🗄️  Deprecated template: ${name} (${existing.id})`);
      }
    }

    // Create some sample prompt library entries
    console.log('\n📚 Creating prompt library entries...');
    
    const promptLibraryEntries: Array<Prisma.AgentPromptLibraryCreateInput> = [
      // MCP Interactive Prompts
    ];

    for (const entry of promptLibraryEntries) {
      const existingPrompt = await prisma.agentPromptLibrary.findFirst({
        where: { name: entry.name }
      });
      if (existingPrompt) {
        console.log(`📖 Updating prompt: ${entry.name}`);
        await prisma.agentPromptLibrary.update({
          where: { id: existingPrompt.id },
          data: { ...entry, updatedAt: new Date() }
        });
      } else {
        console.log(`📖 Creating prompt: ${entry.name}`);
        await prisma.agentPromptLibrary.create({
          data: {
            ...entry,
            status: AgentTemplateStatus.ACTIVE,
            version: '1.0.0',
            usageCount: 0,
            createdBy: 'system'
          }
        });
      }
    }

    console.log(`✅ Successfully created ${promptLibraryEntries.length} prompt library entries`);
    console.log('\n🎉 Agent template seeding completed successfully!');

  } catch (error) {
    console.error('❌ Error seeding agent templates:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
if (require.main === module) {
  seedAgentTemplates()
    .then(() => {
      console.log('✨ Seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Seeding failed:', error);
      process.exit(1);
    });
}

export default seedAgentTemplates;
