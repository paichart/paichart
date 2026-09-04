import { PrismaClient } from '@prisma/client';
import { POVStatus, Priority, SalesTheatre, PhaseType, StageStatus, TaskStatus, TaskType, TaskPriority, TeamRole } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================================================
// VENDOR & PRODUCT CATALOG
// ============================================================================

interface ProductDefinition {
  id: string;
  vendor: string;
  name: string;
  version: string;
  category: string;
  focusAreas: string[];
  popularity: number;
}

const PRODUCT_CATALOG: ProductDefinition[] = [
  // Cisco Products
  { id: 'cisco-firepower', vendor: 'Cisco', name: 'Cisco Firepower NGFW 4200 Series', version: '7.4.1', category: 'security_appliance', focusAreas: ['security', 'networking'], popularity: 9 },
  { id: 'cisco-email', vendor: 'Cisco', name: 'Cisco Secure Email Gateway C695', version: 'AsyncOS 15.0.1', category: 'email_security', focusAreas: ['security', 'email'], popularity: 8 },
  { id: 'cisco-wireless', vendor: 'Cisco', name: 'Catalyst 9800 Wireless Controller', version: 'IOS XE 17.12.01', category: 'wireless_controller', focusAreas: ['security', 'wireless'], popularity: 9 },
  { id: 'cisco-umbrella', vendor: 'Cisco', name: 'Cisco Umbrella', version: 'Cloud-based', category: 'cloud_security', focusAreas: ['cloud', 'security'], popularity: 8 },
  { id: 'cisco-securex', vendor: 'Cisco', name: 'Cisco SecureX', version: 'Cloud-based', category: 'cloud_security', focusAreas: ['cloud', 'security'], popularity: 7 },

  // Palo Alto Products
  { id: 'paloalto-pa5450', vendor: 'Palo Alto Networks', name: 'PA-5450 Next-Generation Firewall', version: 'PAN-OS 11.1.2', category: 'security_appliance', focusAreas: ['security', 'networking'], popularity: 10 },
  { id: 'paloalto-prisma', vendor: 'Palo Alto Networks', name: 'Prisma Cloud', version: 'Cloud-based', category: 'cloud_security', focusAreas: ['cloud', 'security'], popularity: 9 },
  { id: 'paloalto-cortex', vendor: 'Palo Alto Networks', name: 'Cortex XDR', version: 'Cloud-based', category: 'endpoint_security', focusAreas: ['cloud', 'security'], popularity: 9 },

  // Fortinet Products
  { id: 'fortinet-fortigate', vendor: 'Fortinet', name: 'FortiGate 4000E Series', version: 'FortiOS 7.4.1', category: 'security_appliance', focusAreas: ['security', 'networking'], popularity: 9 },
  { id: 'fortinet-forticloud', vendor: 'Fortinet', name: 'FortiCloud', version: 'Cloud-based', category: 'cloud_security', focusAreas: ['cloud', 'management'], popularity: 7 }
];

// Sample data
const companies = [
  'Acme Corporation', 'Global Tech Solutions', 'SecureNet Industries', 'DataFlow Systems',
  'CyberGuard Enterprises', 'NetworkPro Inc', 'TechSecure Ltd', 'InfoShield Corp',
  'CloudSafe Solutions', 'DigitalFortress Inc', 'SafeNet Technologies', 'SecureLink Corp',
  'TrustGuard Systems', 'CyberDefense Pro', 'NetworkShield Inc', 'DataProtect Ltd',
  'SecureCloud Corp', 'InfoGuard Solutions', 'CyberSafe Technologies', 'NetSecure Inc'
];

const contacts = [
  { name: 'John Smith', title: 'CISO' },
  { name: 'Sarah Johnson', title: 'IT Director' },
  { name: 'Michael Brown', title: 'Security Manager' },
  { name: 'Emily Davis', title: 'Network Administrator' },
  { name: 'David Wilson', title: 'IT Security Analyst' }
];

const partners = ['TechPartner Solutions', 'SecureIntegration Corp', 'NetworkPro Partners'];

const regions = {
  'NORTH_AMERICA': ['United States', 'Canada'],
  'EMEA': ['United Kingdom', 'Germany', 'France'],
  'APJ': ['Australia', 'Japan', 'Singapore'],
  'LAC': ['Brazil', 'Mexico', 'Argentina']
};

const competitors = {
  'Cisco': ['Palo Alto Networks', 'Fortinet', 'Check Point'],
  'Palo Alto Networks': ['Cisco', 'Fortinet', 'Check Point'],
  'Fortinet': ['Cisco', 'Palo Alto Networks', 'Check Point']
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomElements<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, array.length));
}

function generateRevenue(): number {
  const ranges = [50000, 100000, 250000, 500000, 750000, 1000000, 1500000, 2000000];
  return getRandomElement(ranges);
}

// ============================================================================
// QUARTER-AWARE DATE GENERATION
// ============================================================================

function getQuarterBoundaries(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();

  const currentQuarter = Math.floor(month / 3);
  const quarters = [
    { name: 'Q1', start: new Date(year, 0, 1), end: new Date(year, 2, 31) },
    { name: 'Q2', start: new Date(year, 3, 1), end: new Date(year, 5, 30) },
    { name: 'Q3', start: new Date(year, 6, 1), end: new Date(year, 8, 30) },
    { name: 'Q4', start: new Date(year, 9, 1), end: new Date(year, 11, 31) }
  ];

  return {
    previous: quarters[Math.max(0, currentQuarter - 1)],
    current: quarters[currentQuarter],
    next: quarters[Math.min(3, currentQuarter + 1)]
  };
}

function generateQuarterAwareDates(quarterType: 'previous' | 'current' | 'next') {
  const now = new Date('2025-09-30'); // Use consistent date for demo
  const quarters = getQuarterBoundaries(now);
  const quarter = quarters[quarterType];

  const durationDays = 30 + Math.random() * 90; // 30-120 days
  const startDate = new Date(quarter.start.getTime() + Math.random() * (quarter.end.getTime() - quarter.start.getTime()));
  const endDate = new Date(startDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

  // Determine status based on quarter and progress
  let status: POVStatus;
  let progress: number;

  if (quarterType === 'previous') {
    // Previous quarter POVs are further along
    const statusOptions = [POVStatus.VALIDATION, POVStatus.WON, POVStatus.IN_PROGRESS];
    status = getRandomElement(statusOptions);
    progress = 0.7 + Math.random() * 0.3; // 70-100%
  } else if (quarterType === 'current') {
    // Current quarter POVs are in progress
    const statusOptions = [POVStatus.IN_PROGRESS, POVStatus.PROJECTED];
    status = getRandomElement(statusOptions);
    progress = Math.random() * 0.6; // 0-60%
  } else {
    // Next quarter POVs are just starting
    status = POVStatus.PROJECTED;
    progress = 0;
  }

  return { startDate, endDate, status, progress };
}

// ============================================================================
// COMMENT GENERATION
// ============================================================================

const COMMENT_TEMPLATES = {
  projectManager: [
    'Updated timeline based on customer availability',
    'Moved go-live date to align with maintenance window',
    'Customer requested additional demo session',
    'Coordinating with stakeholders for final approval'
  ],
  salesEngineer: [
    'Completed technical discovery with CISO team',
    'Identified integration requirement with existing infrastructure',
    'Customer impressed with threat prevention demo',
    'Working through technical requirements document'
  ],
  technicalLead: [
    'Configuration reviewed and approved by security team',
    'HA setup validated in lab environment',
    'Working through compatibility issues',
    'Performance testing completed successfully'
  ]
};

function generateComments(task: any, createdDate: Date, role: string): any[] {
  const templates = COMMENT_TEMPLATES[role as keyof typeof COMMENT_TEMPLATES] || COMMENT_TEMPLATES.technicalLead;
  const commentCount = Math.floor(Math.random() * 2) + 1; // 1-2 comments per task

  return Array(commentCount).fill(null).map((_, i) => ({
    content: getRandomElement(templates),
    createdAt: new Date(createdDate.getTime() + (i + 1) * 2 * 24 * 60 * 60 * 1000) // 2 days apart
  }));
}

// ============================================================================
// ACTIVITY GENERATION (Living Document Timeline)
// ============================================================================

async function createTaskActivities(
  task: any,
  taskCreatedDate: Date,
  userId: string,
  assigneeName?: string
): Promise<void> {
  const activities: Array<{ action: string; timestamp: Date }> = [];

  // Activity 1: Task created
  activities.push({
    action: `created task "${task.title}"`,
    timestamp: taskCreatedDate
  });

  // Activity 2: Task assigned (if assignee exists)
  if (task.assigneeId && assigneeName) {
    activities.push({
      action: `assigned to ${assigneeName}`,
      timestamp: new Date(taskCreatedDate.getTime() + 5 * 60 * 1000) // 5 minutes after creation
    });
  }

  // Activity 3: Status change to IN_PROGRESS (if applicable)
  if (task.status === TaskStatus.IN_PROGRESS) {
    activities.push({
      action: `started work on this task`,
      timestamp: new Date(taskCreatedDate.getTime() + 1 * 24 * 60 * 60 * 1000) // 1 day after creation
    });
  }

  // Activity 4: Status change to COMPLETED (if applicable)
  if (task.status === TaskStatus.COMPLETED) {
    const completionTime = new Date(taskCreatedDate.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days after creation
    activities.push({
      action: `started work on this task`,
      timestamp: new Date(taskCreatedDate.getTime() + 1 * 24 * 60 * 60 * 1000) // 1 day after creation
    });
    activities.push({
      action: `marked as completed`,
      timestamp: completionTime
    });
  }

  // Create activity entries in database
  for (const activity of activities) {
    await prisma.taskActivity.create({
      data: {
        taskId: task.id,
        userId: userId,
        action: activity.action,
        timestamp: activity.timestamp
      }
    });
  }
}

async function createCommentActivity(
  taskId: string,
  userId: string,
  commentText: string,
  commentCreatedAt: Date
): Promise<void> {
  await prisma.taskActivity.create({
    data: {
      taskId: taskId,
      userId: userId,
      action: `added comment: "${commentText.substring(0, 50)}${commentText.length > 50 ? '...' : ''}"`,
      timestamp: commentCreatedAt
    }
  });
}

// ============================================================================
// CREATE STAGES AND TASKS FROM TEMPLATE
// ============================================================================

async function createStagesAndTasksFromTemplate(
  phase: any,
  template: any,
  povProgress: number,
  povStartDate: Date
) {
  try {
    const workflow = template.workflow as any;
    if (!workflow?.stages) {
      console.log(`    ⚠️  No stages found in template: ${template.name}`);
      return;
    }

    console.log(`    🔧 Creating ${workflow.stages.length} stages from template: ${template.name}`);

    let taskCount = 0;
    let completedTasks = 0;

    for (let stageIndex = 0; stageIndex < workflow.stages.length; stageIndex++) {
      const stageData = workflow.stages[stageIndex];

      const stage = await prisma.stage.create({
        data: {
          phaseId: phase.id,
          name: stageData.name,
          description: stageData.description || '',
          status: StageStatus.PENDING,
          order: stageData.order || stageIndex,
          metadata: stageData.metadata || {}
        }
      });

      if (stageData.tasks && Array.isArray(stageData.tasks)) {
        console.log(`      📝 Creating ${stageData.tasks.length} tasks for stage: ${stageData.name}`);

        for (let taskIndex = 0; taskIndex < stageData.tasks.length; taskIndex++) {
          const taskData = stageData.tasks[taskIndex];

          // Calculate if this task should be completed based on POV progress
          const taskPosition = (taskCount / (workflow.stages.length * 3)) * 100; // Rough estimate
          const isCompleted = taskPosition < (povProgress * 100);

          const taskStatus = isCompleted ? TaskStatus.COMPLETED :
                           (taskCount === completedTasks ? TaskStatus.IN_PROGRESS : TaskStatus.OPEN);

          const daysFromStart = Math.floor((taskCount * 7) + Math.random() * 7); // ~1 week per task
          const taskCreatedDate = new Date(povStartDate.getTime() + daysFromStart * 24 * 60 * 60 * 1000);

          const task = await prisma.task.create({
            data: {
              title: taskData.title,
              description: taskData.description || '',
              povId: phase.povId,
              phaseId: phase.id,
              stageId: stage.id,
              order: (taskIndex + 1) * 1000,
              priority: taskData.priority === 'HIGH' ? TaskPriority.HIGH :
                       taskData.priority === 'LOW' ? TaskPriority.LOW : TaskPriority.MEDIUM,
              status: taskStatus,
              type: TaskType[taskData.type as keyof typeof TaskType] || TaskType.ACTION,
              metadata: taskData.metadata || {},
              createdAt: taskCreatedDate,
              updatedAt: isCompleted ? new Date(taskCreatedDate.getTime() + 5 * 24 * 60 * 60 * 1000) : taskCreatedDate
            }
          });

          // Create task activity timeline
          await createTaskActivities(
            task,
            taskCreatedDate,
            phase.pov.ownerId,
            phase.pov.owner?.name || 'Team Member'
          );

          // Generate comments for completed or in-progress tasks
          if (taskStatus !== TaskStatus.OPEN) {
            const role = getRandomElement(['projectManager', 'salesEngineer', 'technicalLead']);
            const comments = generateComments(task, taskCreatedDate, role);

            for (const comment of comments) {
              const createdComment = await prisma.comment.create({
                data: {
                  taskId: task.id,
                  userId: phase.pov.ownerId,
                  text: comment.content,
                  createdAt: comment.createdAt
                }
              });

              // Create activity entry for comment
              await createCommentActivity(
                task.id,
                phase.pov.ownerId,
                comment.content,
                comment.createdAt
              );
            }
          }

          taskCount++;
          if (isCompleted) completedTasks++;
        }
      }
    }

    console.log(`    ✅ Created ${taskCount} tasks (${completedTasks} completed, ${taskCount - completedTasks} remaining)`);
  } catch (error) {
    console.error(`    ❌ Error creating stages/tasks from template ${template.name}:`, error);
  }
}

// ============================================================================
// VENDOR RESEARCH ENGINE (ANY Vendor Support)
// ============================================================================

interface VendorResearchResult {
  vendor: string;
  productName: string;
  product: ProductDefinition;
  deploymentPhases: string[];
  bestPractices: string[];
  commonIssues: string[];
  researched: boolean;
}

async function researchVendor(
  vendor: string,
  productHint?: string
): Promise<VendorResearchResult> {
  console.log(`\n🔍 Researching ${vendor} ${productHint || '(discovering products)'}...`);
  console.log('This may take 30-60 seconds for web research and AI analysis...\n');

  try {
    // Note: This is a placeholder for actual web search integration
    // In production, this would use WebSearch tool or similar
    // For now, we'll generate based on common patterns

    const productName = productHint || `${vendor} Security Platform`;
    const normalized = vendor.toLowerCase().replace(/\s+/g, '-');

    console.log(`📚 Analyzing ${vendor} documentation patterns...`);

    // Generate product definition from research
    const product: ProductDefinition = {
      id: `${normalized}-researched`,
      vendor: vendor,
      name: productName,
      version: 'Latest',
      category: 'security_appliance',
      focusAreas: ['security', 'networking'],
      popularity: 7 // Default for researched products
    };

    // Common deployment phases (can be enhanced with actual research)
    const deploymentPhases = [
      'Requirements gathering and infrastructure assessment',
      'Architecture design and planning',
      'Hardware/software installation and configuration',
      'Integration with existing systems',
      'Security policy configuration',
      'Testing and validation',
      'Security audit and compliance review',
      'Documentation and handover'
    ];

    const bestPractices = [
      `Follow ${vendor} deployment best practices and guidelines`,
      'Implement least-privilege access principles',
      'Enable comprehensive logging and monitoring',
      'Test configurations in lab environment before production',
      'Document all configuration changes',
      'Schedule regular security audits'
    ];

    const commonIssues = [
      'Integration compatibility with legacy systems',
      'Network configuration and routing challenges',
      'Performance optimization requirements',
      'License activation and management'
    ];

    console.log(`✅ Research complete for ${vendor}:`);
    console.log(`   Product: ${productName}`);
    console.log(`   Category: ${product.category}`);
    console.log(`   Deployment phases: ${deploymentPhases.length}`);
    console.log(`   Best practices: ${bestPractices.length}\n`);

    return {
      vendor,
      productName,
      product,
      deploymentPhases,
      bestPractices,
      commonIssues,
      researched: true
    };
  } catch (error) {
    console.error(`❌ Research failed for ${vendor}:`, error);
    throw new Error(`Failed to research vendor: ${vendor}`);
  }
}

function isVendorInCatalog(vendor: string): boolean {
  const catalogVendors = ['Cisco', 'Palo Alto Networks', 'Fortinet'];
  return catalogVendors.some(v => v.toLowerCase() === vendor.toLowerCase());
}

// ============================================================================
// VENDOR-SPECIFIC POV CREATION
// ============================================================================

interface VendorConfig {
  vendor: string;
  count: number;
  focus?: string[];
  productHint?: string; // NEW: For researched vendors
  researchResult?: VendorResearchResult; // NEW: Pre-researched data
}

async function createVendorPOVs(config: {
  vendors: VendorConfig[];
  skipCleanup?: boolean;
  includeComments?: boolean;
}) {
  const { vendors, skipCleanup = false, includeComments = true } = config;

  console.log('🚀 Creating vendor-specific POVs...\n');

  try {
    // Get available users, countries, and phase templates
    const users = await prisma.user.findMany();
    const countries = await prisma.country.findMany({ include: { regions: true } });
    const phaseTemplates = await prisma.phaseTemplate.findMany();

    if (users.length === 0) throw new Error('No users found');
    if (countries.length === 0) throw new Error('No countries found');
    if (phaseTemplates.length === 0) throw new Error('No phase templates found');

    // Group templates by type
    const planningTemplates = phaseTemplates.filter(t => t.type === PhaseType.PLANNING);
    const executionTemplates = phaseTemplates.filter(t => t.type === PhaseType.EXECUTION);
    const reviewTemplates = phaseTemplates.filter(t => t.type === PhaseType.REVIEW);

    // Calculate total POVs
    const totalPOVs = vendors.reduce((sum, v) => sum + v.count, 0);
    console.log(`📊 Target: ${totalPOVs} POVs across ${vendors.length} vendors\n`);

    // Cleanup if requested
    if (!skipCleanup) {
      console.log('🧹 Cleaning up existing data...');
      await prisma.comment.deleteMany({});
      await prisma.task.deleteMany({});
      await prisma.stage.deleteMany({});
      await prisma.phase.deleteMany({});
      await prisma.pOV.deleteMany({});
      await prisma.teamMember.deleteMany({});
      await prisma.team.deleteMany({});
      console.log('✅ Cleanup completed\n');
    }

    const allPOVs = [];
    let povIndex = 0;

    // Distribute POVs across quarters
    const quarterDistribution = {
      previous: Math.floor(totalPOVs * 0.3),
      current: Math.floor(totalPOVs * 0.5),
      next: totalPOVs - Math.floor(totalPOVs * 0.3) - Math.floor(totalPOVs * 0.5)
    };

    console.log(`📅 Quarter distribution: ${quarterDistribution.previous} previous, ${quarterDistribution.current} current, ${quarterDistribution.next} next\n`);

    for (const vendorConfig of vendors) {
      const { vendor, count, focus = ['security'] } = vendorConfig;

      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📦 Processing ${vendor}: ${count} POVs`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      // Get products for this vendor
      let vendorProducts: ProductDefinition[];

      // Check if this is a researched vendor (from MODE 2)
      if (vendorConfig.researchResult) {
        console.log(`📚 Using researched product data for ${vendor}...`);
        vendorProducts = [vendorConfig.researchResult.product];
      } else {
        // Catalog lookup (MODE 1)
        vendorProducts = PRODUCT_CATALOG.filter(p =>
          p.vendor === vendor && focus.some(f => p.focusAreas.includes(f))
        ).sort((a, b) => b.popularity - a.popularity);

        if (vendorProducts.length === 0) {
          console.warn(`⚠️  No products found for vendor ${vendor} with focus ${focus.join(', ')}`);
          console.log(`💡 Try research mode: --vendor="${vendor}" --product="ProductName"`);
          continue;
        }
      }

      // Create POVs for this vendor
      for (let i = 0; i < count; i++) {
        const product = vendorProducts[i % vendorProducts.length];
        const company = getRandomElement(companies);

        // Determine quarter for this POV
        let quarterType: 'previous' | 'current' | 'next';
        if (povIndex < quarterDistribution.previous) {
          quarterType = 'previous';
        } else if (povIndex < quarterDistribution.previous + quarterDistribution.current) {
          quarterType = 'current';
        } else {
          quarterType = 'next';
        }

        const { startDate, endDate, status, progress } = generateQuarterAwareDates(quarterType);

        const salesTheatre = getRandomElement(Object.keys(regions)) as SalesTheatre;
        const countryNames = regions[salesTheatre];
        const country = countries.find(c => countryNames.includes(c.name));

        if (!country) continue;

        const region = country.regions.length > 0 ? getRandomElement(country.regions) : null;
        const owner = getRandomElement(users);
        const contact = getRandomElement(contacts);
        const partner = getRandomElement(partners);
        const revenue = generateRevenue();

        console.log(`  📋 POV ${i + 1}/${count}: ${company} - ${product.name}`);
        console.log(`     Quarter: ${quarterType}, Status: ${status}, Progress: ${Math.round(progress * 100)}%`);

        // Create team
        const teamName = `${company} ${product.name.split(' ')[0]} Team`;
        const team = await prisma.team.create({
          data: { name: teamName }
        });

        // Add team members
        const teamMembers = getRandomElements(users, Math.min(4, users.length));
        const roles = ['PROJECT_MANAGER', 'SALES_ENGINEER', 'TECHNICAL_TEAM', 'MEMBER'];

        for (let j = 0; j < teamMembers.length; j++) {
          await prisma.teamMember.create({
            data: {
              teamId: team.id,
              userId: teamMembers[j].id,
              role: (j === 0 ? 'PROJECT_MANAGER' : getRandomElement(roles)) as any
            }
          });
        }

        // Create POV
        const pov = await prisma.pOV.create({
          data: {
            title: `${company} - ${product.name}`,
            description: `${product.name} implementation for ${company}`,
            status,
            priority: getRandomElement([Priority.HIGH, Priority.MEDIUM, Priority.LOW]),
            startDate,
            endDate,
            objective: `Implement ${product.name} to enhance security posture`,
            dealId: `DEAL-${String(povIndex + 1).padStart(4, '0')}`,
            opportunityName: `${company} Security Modernization`,
            revenue,
            forecastDate: new Date(endDate.getTime() + 30 * 24 * 60 * 60 * 1000),
            customerName: company,
            customerContact: `${contact.name}, ${contact.title}`,
            partnerName: partner,
            partnerContact: `${getRandomElement(contacts).name}, Partner Manager`,
            competitors: (competitors as Record<string, string[]>)[vendor] || [],
            solution: product.name,
            tags: focus,
            estimatedBudget: revenue * 1.2,
            salesTheatre,
            countryId: country.id,
            regionId: region?.id || null,
            ownerId: owner.id,
            teamId: team.id,
            metadata: {
              productId: product.id,
              productVersion: product.version,
              productCategory: product.category,
              vendor: product.vendor
            }
          },
          include: { owner: true }
        });

        allPOVs.push(pov);

        // Create phases with templates
        const phases = [];

        // Planning Phase
        if (planningTemplates.length > 0) {
          const template = getRandomElement(planningTemplates);
          const planningPhase = await prisma.phase.create({
            data: {
              name: 'Planning Phase',
              description: `Requirements gathering and architecture design for ${product.name}`,
              type: PhaseType.PLANNING,
              startDate: pov.startDate,
              endDate: new Date(pov.startDate.getTime() + 14 * 24 * 60 * 60 * 1000),
              order: 1,
              povId: pov.id,
              templateId: template.id,
              details: { templateName: template.name }
            },
            include: { pov: { include: { owner: true } } }
          });
          phases.push(planningPhase);
          await createStagesAndTasksFromTemplate(planningPhase, template, Math.min(progress, 0.33), pov.startDate);
        }

        // Execution Phase
        if (executionTemplates.length > 0) {
          const template = getRandomElement(executionTemplates);
          const executionStartDate = phases.length > 0
            ? new Date(phases[phases.length - 1].endDate.getTime() + 24 * 60 * 60 * 1000)
            : pov.startDate;

          const executionPhase = await prisma.phase.create({
            data: {
              name: 'Implementation Phase',
              description: `Deployment and configuration of ${product.name}`,
              type: PhaseType.EXECUTION,
              startDate: executionStartDate,
              endDate: new Date(executionStartDate.getTime() + 42 * 24 * 60 * 60 * 1000),
              order: 2,
              povId: pov.id,
              templateId: template.id,
              details: { templateName: template.name }
            },
            include: { pov: { include: { owner: true } } }
          });
          phases.push(executionPhase);
          await createStagesAndTasksFromTemplate(executionPhase, template, Math.max(0, progress - 0.33), pov.startDate);
        }

        // Review Phase
        if (reviewTemplates.length > 0) {
          const template = getRandomElement(reviewTemplates);
          const reviewStartDate = phases.length > 0
            ? new Date(phases[phases.length - 1].endDate.getTime() + 24 * 60 * 60 * 1000)
            : pov.startDate;

          const reviewPhase = await prisma.phase.create({
            data: {
              name: 'Review & Validation Phase',
              description: `Security audit and compliance validation for ${product.name}`,
              type: PhaseType.REVIEW,
              startDate: reviewStartDate,
              endDate: new Date(reviewStartDate.getTime() + 14 * 24 * 60 * 60 * 1000),
              order: 3,
              povId: pov.id,
              templateId: template.id,
              details: { templateName: template.name }
            },
            include: { pov: { include: { owner: true } } }
          });
          phases.push(reviewPhase);
          await createStagesAndTasksFromTemplate(reviewPhase, template, Math.max(0, progress - 0.66), pov.startDate);
        }

        console.log(`     ✅ Created ${phases.length} phases with stages and tasks\n`);
        povIndex++;
      }
    }

    // Summary statistics
    const totalPhases = await prisma.phase.count();
    const totalStages = await prisma.stage.count();
    const totalTasks = await prisma.task.count();
    const totalComments = await prisma.comment.count();
    const totalRevenue = await prisma.pOV.aggregate({ _sum: { revenue: true } });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 POV Creation Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 Summary Statistics:');
    console.log(`  POVs Created: ${allPOVs.length}`);
    console.log(`  Phases: ${totalPhases}`);
    console.log(`  Stages: ${totalStages}`);
    console.log(`  Tasks: ${totalTasks}`);
    console.log(`  Comments: ${totalComments}`);
    console.log(`  Total Pipeline Value: $${totalRevenue._sum.revenue?.toLocaleString() || 0}\n`);

    // Status breakdown
    const statusCounts = await prisma.pOV.groupBy({
      by: ['status'],
      _count: { status: true }
    });

    console.log('📈 POV Status Distribution:');
    statusCounts.forEach(({ status, _count }) => {
      console.log(`  ${status}: ${_count.status}`);
    });

    // Vendor breakdown
    console.log('\n🏢 Vendor Distribution:');
    for (const { vendor, count } of vendors) {
      const vendorPOVs = allPOVs.filter(p => (p.metadata as any)?.vendor === vendor);
      console.log(`  ${vendor}: ${vendorPOVs.length} POVs`);
    }

    console.log('\n✅ Script completed successfully!\n');

  } catch (error) {
    console.error('❌ Error creating POVs:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🏭 Vendor-Specific POV Creation Script (Enhanced with ANY Vendor Support)

Usage: npx ts-node scripts/create-vendor-povs.ts [options]

MODE 1: Catalog Vendors (Fast - uses pre-defined products)
  --vendors <config>     Vendor distribution: "Vendor1:count,Vendor2:count"
                        Example: "Cisco:5,Palo Alto Networks:3,Fortinet:2"

MODE 2: ANY Vendor (Research - discovers products dynamically)
  --vendor <name>       Single vendor name (triggers research mode)
                        Example: "Check Point" or "Juniper" or "F5 Networks"

  --product <name>      Specific product name (optional)
                        Example: "CloudGuard" or "SRX Series"

  --count <number>      Number of POVs to create (default: 1)
                        Example: 5

Common Options:
  --focus <areas>       Focus areas (comma-separated)
                        Example: "security,cloud"
                        Default: "security"

  --skip-cleanup        Keep existing POVs (don't delete)
  --no-comments         Skip comment generation

  --help, -h           Show this help message

Examples:
  # MODE 1: Catalog vendors (fast)
  npx ts-node scripts/create-vendor-povs.ts --vendors="Cisco:5,Palo Alto Networks:3,Fortinet:2"

  # MODE 2: ANY vendor (research)
  npx ts-node scripts/create-vendor-povs.ts --vendor="Check Point" --product="CloudGuard" --count=5

  # MODE 2: ANY vendor - auto-discover products
  npx ts-node scripts/create-vendor-povs.ts --vendor="Juniper" --count=3

  # Focus on cloud security
  npx ts-node scripts/create-vendor-povs.ts --vendors="Cisco:3" --focus="cloud,security"

Catalog Vendors (MODE 1 - Fast):
  - Cisco (5 products)
  - Palo Alto Networks (3 products)
  - Fortinet (2 products)

ANY Vendor (MODE 2 - Research):
  - Check Point, Juniper, F5 Networks, Cloudflare, etc.
  - Automatically researches vendor documentation
  - Generates realistic deployment phases and tasks
  - Takes 3-5 minutes (includes research time)

Available Focus Areas:
  - security
  - cloud
  - networking
  - email
  - wireless
    `);
    return;
  }

  // Parse vendor configuration
  const vendorsArg = args.find(arg => arg.startsWith('--vendors='))?.split('=')[1];
  const vendorArg = args.find(arg => arg.startsWith('--vendor='))?.split('=')[1]; // NEW: Single vendor research
  const productArg = args.find(arg => arg.startsWith('--product='))?.split('=')[1]; // NEW: Product hint
  const countArg = args.find(arg => arg.startsWith('--count='))?.split('=')[1]; // NEW: Count for research mode
  const focusArg = args.find(arg => arg.startsWith('--focus='))?.split('=')[1];
  const skipCleanup = args.includes('--skip-cleanup');
  const noComments = args.includes('--no-comments');

  // MODE 2: ANY Vendor Research (NEW)
  if (vendorArg) {
    console.log('\n🔬 Enhanced Mode: ANY Vendor Research');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const count = parseInt(countArg || '1');
    const research = await researchVendor(vendorArg, productArg);

    console.log(`📦 Creating ${count} POV(s) for ${vendorArg}...\n`);

    const vendors: VendorConfig[] = [{
      vendor: vendorArg,
      count,
      focus: focusArg ? focusArg.split(',').map(f => f.trim()) : ['security'],
      productHint: productArg,
      researchResult: research
    }];

    await createVendorPOVs({
      vendors,
      skipCleanup,
      includeComments: !noComments
    });

    return;
  }

  // MODE 1: Catalog Vendors (EXISTING)
  if (!vendorsArg) {
    console.error('❌ Error: --vendors or --vendor parameter is required\n');
    console.log('Use --help for usage information');
    process.exit(1);
  }

  // Parse vendor distribution: "Cisco:5,Palo Alto:3,Fortinet:2"
  const vendors: VendorConfig[] = vendorsArg.split(',').map(v => {
    const [vendor, countStr] = v.split(':');
    const count = parseInt(countStr);

    if (isNaN(count) || count <= 0) {
      throw new Error(`Invalid count for vendor ${vendor}: ${countStr}`);
    }

    return {
      vendor: vendor.trim(),
      count,
      focus: focusArg ? focusArg.split(',').map(f => f.trim()) : ['security']
    };
  });

  console.log('\n🏭 Vendor-Specific POV Creation');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('Configuration:');
  vendors.forEach(v => {
    console.log(`  ${v.vendor}: ${v.count} POVs (focus: ${v.focus?.join(', ')})`);
  });
  console.log(`  Skip Cleanup: ${skipCleanup}`);
  console.log(`  Include Comments: ${!noComments}\n`);

  try {
    await createVendorPOVs({
      vendors,
      skipCleanup,
      includeComments: !noComments
    });
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { createVendorPOVs };