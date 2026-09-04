import { PrismaClient } from '@prisma/client';
import { POVStatus, Priority, SalesTheatre, PhaseType, StageStatus, TaskStatus, TaskType, TaskPriority, TeamRole, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * DEMO MODE SETUP SCRIPT
 * Aligned with unified-auth-implementation-plan.md
 *
 * Creates:
 * 1. Demo owner system account (demo-owner@paichart.system)
 * 2. Demo POVs with metadata.isDemo = true
 * 3. Demo teams, phases, stages, and tasks
 *
 * Usage:
 *   npm run setup-demo-mode                    # Create 2 demo POVs
 *   npm run setup-demo-mode --count=5          # Create 5 demo POVs
 *   npm run setup-demo-mode --reset            # Reset existing demo POVs
 *   npm run setup-demo-mode --create-regular   # Also create 20 regular POVs
 */

// Demo-specific data
const demoSolutions = [
  'BlackEye Red Team Assessment',
  'Enterprise Network Security Audit',
  'Cloud Security Posture Review',
  'Zero Trust Architecture Implementation',
  'Advanced Threat Detection Platform'
];

const demoCompanies = [
  'Demo Financial Corp',
  'Demo Healthcare Systems',
  'Demo Manufacturing Inc',
  'Demo Retail Solutions',
  'Demo Technology Services'
];

const demoObjectives = [
  'Demonstrate comprehensive Red Team assessment capabilities with real-world attack scenarios',
  'Showcase enterprise network security analysis workflow and vulnerability detection',
  'Illustrate cloud security posture management process and compliance validation',
  'Display zero trust architecture implementation and access control mechanisms',
  'Exhibit advanced threat detection and incident response procedures'
];

// Regular POV data (from original script)
const companies = [
  'Acme Corporation', 'Global Tech Solutions', 'SecureNet Industries', 'DataFlow Systems',
  'CyberGuard Enterprises', 'NetworkPro Inc', 'TechSecure Ltd', 'InfoShield Corp',
  'CloudSafe Solutions', 'DigitalFortress Inc', 'SafeNet Technologies', 'SecureLink Corp',
  'TrustGuard Systems', 'CyberDefense Pro', 'NetworkShield Inc', 'DataProtect Ltd',
  'SecureCloud Corp', 'InfoGuard Solutions', 'CyberSafe Technologies', 'NetSecure Inc'
];

const solutions = [
  'Next-Generation Firewall Implementation',
  'Email Security Gateway Deployment',
  'Wireless Network Security Upgrade',
  'Network Access Control Solution',
  'Advanced Threat Protection Platform',
  'Security Information and Event Management',
  'Zero Trust Network Architecture',
  'Cloud Security Posture Management',
  'Endpoint Detection and Response',
  'Identity and Access Management'
];

const objectives = [
  'Enhance network security posture and reduce cyber threats',
  'Implement comprehensive email protection against advanced threats',
  'Secure wireless infrastructure and improve access control',
  'Deploy advanced threat detection and response capabilities',
  'Establish zero-trust security framework across the organization',
  'Improve security monitoring and incident response times',
  'Modernize legacy security infrastructure with next-gen solutions',
  'Implement cloud-native security controls and governance',
  'Enhance endpoint security and threat visibility',
  'Streamline identity management and access controls'
];

const competitors = [
  ['Palo Alto Networks', 'Fortinet', 'Check Point'],
  ['Proofpoint', 'Mimecast', 'Microsoft'],
  ['Aruba', 'Juniper', 'Extreme Networks'],
  ['CrowdStrike', 'SentinelOne', 'Carbon Black'],
  ['Splunk', 'IBM QRadar', 'LogRhythm'],
  ['Okta', 'Ping Identity', 'SailPoint']
];

const contacts = [
  { name: 'John Smith', title: 'CISO' },
  { name: 'Sarah Johnson', title: 'IT Director' },
  { name: 'Michael Brown', title: 'Security Manager' },
  { name: 'Emily Davis', title: 'Network Administrator' },
  { name: 'David Wilson', title: 'IT Security Analyst' },
  { name: 'Lisa Anderson', title: 'Infrastructure Manager' },
  { name: 'Robert Taylor', title: 'Chief Technology Officer' },
  { name: 'Jennifer Martinez', title: 'Security Architect' },
  { name: 'Christopher Lee', title: 'IT Manager' },
  { name: 'Amanda White', title: 'Compliance Officer' }
];

const partners = [
  'TechPartner Solutions', 'SecureIntegration Corp', 'NetworkPro Partners',
  'CyberSolutions Inc', 'TechAdvantage Ltd', 'SecureChannel Partners',
  'NetworkExperts Corp', 'CyberIntegration Pro', 'TechSecure Partners',
  'InfoSystems Solutions'
];

const regions = {
  'NORTH_AMERICA': ['United States', 'Canada'],
  'EMEA': ['United Kingdom', 'Germany', 'France'],
  'APJ': ['Australia', 'Japan', 'Singapore'],
  'LAC': ['Brazil', 'Mexico', 'Argentina']
};

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomElements<T>(array: T[], count: number): T[] {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function generateRandomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateRevenue(): number {
  const ranges = [50000, 100000, 250000, 500000, 750000, 1000000, 1500000, 2000000];
  return getRandomElement(ranges);
}

/**
 * Get or create demo owner system account
 * Email: demo-owner@paichart.system
 * Role: ADMIN (can create POVs)
 */
async function getOrCreateDemoOwner() {
  console.log('👤 Getting or creating demo owner account...');

  let demoOwner = await prisma.user.findUnique({
    where: { email: 'demo-owner@paichart.system' }
  });

  if (!demoOwner) {
    demoOwner = await prisma.user.create({
      data: {
        name: 'Demo Content Owner',
        email: 'demo-owner@paichart.system',
        role: UserRole.ADMIN, // Demo owner is admin to create POVs
        status: 'ACTIVE',
        isVerified: true,
        oauthProvider: 'system',
        oauthProviderId: 'demo-owner-system',
        avatarUrl: null,
        lastLoginAt: new Date()
      }
    });
    console.log('  ✅ Created demo owner account:', demoOwner.id);
  } else {
    console.log('  ✅ Found existing demo owner:', demoOwner.id);
  }

  return demoOwner;
}

/**
 * Create stages and tasks from phase template
 * (Reused from original script)
 */
async function createStagesAndTasksFromTemplate(phase: any, template: any) {
  try {
    const workflow = template.workflow as any;
    if (!workflow?.stages) {
      console.log(`    ⚠️  No stages found in template: ${template.name}`);
      return;
    }

    console.log(`    🔧 Creating ${workflow.stages.length} stages from template: ${template.name}`);

    for (let stageIndex = 0; stageIndex < workflow.stages.length; stageIndex++) {
      const stageData = workflow.stages[stageIndex];

      // Create stage
      const stage = await prisma.stage.create({
        data: {
          phaseId: phase.id,
          name: stageData.name,
          description: stageData.description || '',
          status: StageStatus.PENDING,
          order: stageData.order || stageIndex,
          metadata: {
            estimatedDuration: stageData.metadata?.estimatedDuration || { value: 1, unit: 'DAYS' },
            requiredSkills: stageData.metadata?.requiredSkills || [],
            riskLevel: stageData.metadata?.riskLevel || 'MEDIUM'
          }
        }
      });

      // Create tasks for this stage
      if (stageData.tasks && Array.isArray(stageData.tasks)) {
        console.log(`      📝 Creating ${stageData.tasks.length} tasks for stage: ${stageData.name}`);

        const taskTypeMap: Record<string, TaskType> = {
          'DECISION': TaskType.DECISION,
          'MILESTONE': TaskType.MILESTONE,
          'APPROVAL': TaskType.APPROVAL,
          'DOCUMENT': TaskType.DOCUMENT,
          'ACTION': TaskType.ACTION
        };

        for (let taskIndex = 0; taskIndex < stageData.tasks.length; taskIndex++) {
          const taskData = stageData.tasks[taskIndex];

          await prisma.task.create({
            data: {
              title: taskData.title,
              description: taskData.description || '',
              povId: phase.povId,
              phaseId: phase.id,
              stageId: stage.id,
              order: (taskIndex + 1) * 1000,
              priority: taskData.priority === 'HIGH' ? TaskPriority.HIGH : taskData.priority === 'LOW' ? TaskPriority.LOW : TaskPriority.MEDIUM,
              status: TaskStatus.OPEN,
              type: taskTypeMap[taskData.type] || TaskType.ACTION,
              metadata: {
                technicalLevel: taskData.metadata?.technicalLevel || 'TECHNICAL',
                estimatedDuration: taskData.metadata?.estimatedDuration || { value: 2, unit: 'HOURS' },
                requiredSkills: taskData.metadata?.requiredSkills || [],
                vendorSpecific: taskData.metadata?.vendorSpecific || {},
                configurationExamples: taskData.metadata?.configurationExamples || [],
                validationCriteria: taskData.metadata?.validationCriteria || [],
                troubleshootingTips: taskData.metadata?.troubleshootingTips || []
              }
            }
          });
        }
      }
    }
  } catch (error) {
    console.error(`    ❌ Error creating stages/tasks from template ${template.name}:`, error);
  }
}

/**
 * Create a single POV (demo or regular)
 */
async function createPOV(options: {
  index: number;
  isDemo: boolean;
  demoOwner?: any;
  users: any[];
  countries: any[];
  phaseTemplates: any[];
}) {
  const { index, isDemo, demoOwner, users, countries, phaseTemplates } = options;

  // Choose data based on demo vs regular
  const companiesData = isDemo ? demoCompanies : companies;
  const solutionsData = isDemo ? demoSolutions : solutions;
  const objectivesData = isDemo ? demoObjectives : objectives;

  const salesTheatre = getRandomElement(Object.keys(regions)) as SalesTheatre;
  const countryNames = regions[salesTheatre];
  const country = countries.find(c => countryNames.includes(c.name));

  if (!country) {
    console.warn(`No country found for theatre ${salesTheatre}`);
    return null;
  }

  const region = country.regions.length > 0 ? getRandomElement(country.regions) : null;
  const owner = isDemo ? demoOwner : getRandomElement(users);
  const contact = getRandomElement(contacts);
  const partner = getRandomElement(partners);
  const company = getRandomElement(companiesData);
  const solution = getRandomElement(solutionsData);
  const objective = getRandomElement(objectivesData);
  const competitorList = getRandomElements(getRandomElement(competitors), Math.floor(Math.random() * 3) + 1);

  // Generate dates
  const startDate = generateRandomDate(new Date('2024-01-01'), new Date('2025-12-31'));
  const endDate = new Date(startDate.getTime() + (Math.random() * 180 + 30) * 24 * 60 * 60 * 1000);
  const forecastDate = new Date(endDate.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000);

  const status = isDemo ? POVStatus.IN_PROGRESS : getRandomElement([
    POVStatus.PROJECTED, POVStatus.IN_PROGRESS, POVStatus.VALIDATION,
    POVStatus.WON, POVStatus.LOST, POVStatus.STALLED
  ]);

  const priority = isDemo ? Priority.HIGH : getRandomElement([Priority.LOW, Priority.MEDIUM, Priority.HIGH, Priority.URGENT]);
  const revenue = generateRevenue();

  const povData = {
    title: isDemo ? `${company} - ${solution} (Demo)` : `${company} - ${solution}`,
    description: `${solution} project for ${company} to ${objective.toLowerCase()}`,
    status,
    priority,
    startDate,
    endDate,
    objective,
    dealId: `DEAL-${String(index + 1).padStart(4, '0')}`,
    opportunityName: `${company} Security Modernization`,
    revenue,
    forecastDate,
    customerName: company,
    customerContact: `${contact.name}, ${contact.title}`,
    partnerName: partner,
    partnerContact: `${getRandomElement(contacts).name}, Partner Manager`,
    competitors: competitorList,
    solution,
    tags: isDemo
      ? ['demo', 'interactive', 'showcase']
      : getRandomElements(['security', 'networking', 'compliance', 'modernization', 'cloud', 'enterprise'], 3),
    estimatedBudget: revenue * 1.2,
    salesTheatre,
    countryId: country.id,
    regionId: region?.id || null,
    ownerId: owner.id,
    metadata: isDemo
      ? {
          // Demo-specific metadata
          isDemo: true,
          demoOwnerId: demoOwner.id,
          demoDescription: `Interactive demo showcasing ${solution} workflow`,
          demoRestrictions: {
            canDelete: false,
            canChangeOwner: false,
            canExport: false
          },
          // Standard metadata
          industry: getRandomElement(['Financial Services', 'Healthcare', 'Manufacturing']),
          companySize: 'Enterprise (5000+)',
          urgency: 'High',
          decisionTimeframe: 'Q1 2025'
        }
      : {
          // Regular POV metadata
          isDemo: false,
          industry: getRandomElement(['Financial Services', 'Healthcare', 'Manufacturing', 'Government', 'Education', 'Retail']),
          companySize: getRandomElement(['Small (1-100)', 'Medium (101-1000)', 'Large (1001-5000)', 'Enterprise (5000+)']),
          urgency: getRandomElement(['Low', 'Medium', 'High', 'Critical']),
          decisionTimeframe: getRandomElement(['Q1 2025', 'Q2 2025', 'Q3 2025', 'Q4 2025'])
        }
  };

  const prefix = isDemo ? '🎯 DEMO' : '📋';
  console.log(`  ${prefix} Creating POV ${index + 1}: ${povData.title}`);

  // Create team for this POV
  const teamName = isDemo ? `${company} Demo Team` : `${company} POV Team`;
  const team = await prisma.team.create({
    data: { name: teamName }
  });

  // Add team members
  const teamMembers = isDemo
    ? [demoOwner] // Demo owner is sole team member for demo POVs
    : getRandomElements(users, Math.floor(Math.random() * 4) + 3); // 3-6 for regular POVs

  const roles = ['PROJECT_MANAGER', 'SALES_ENGINEER', 'TECHNICAL_TEAM', 'MEMBER'];

  for (let j = 0; j < teamMembers.length; j++) {
    const role = j === 0 ? 'PROJECT_MANAGER' : getRandomElement(roles);
    await prisma.teamMember.create({
      data: {
        teamId: team.id,
        userId: teamMembers[j].id,
        role: role as any
      }
    });
  }

  console.log(`    👥 Created team "${teamName}" with ${teamMembers.length} members`);

  // Create POV
  const pov = await prisma.pOV.create({
    data: {
      ...povData,
      teamId: team.id
    }
  });

  // Create phases with templates
  const planningTemplates = phaseTemplates.filter(t => t.type === PhaseType.PLANNING);
  const executionTemplates = phaseTemplates.filter(t => t.type === PhaseType.EXECUTION);
  const reviewTemplates = phaseTemplates.filter(t => t.type === PhaseType.REVIEW);

  const phases = [];

  // Planning Phase
  if (planningTemplates.length > 0) {
    const planningTemplate = getRandomElement(planningTemplates);
    const planningPhase = await prisma.phase.create({
      data: {
        name: 'Planning Phase',
        description: 'Requirements gathering, architecture design, and project planning',
        type: PhaseType.PLANNING,
        startDate: pov.startDate,
        endDate: new Date(pov.startDate.getTime() + 14 * 24 * 60 * 60 * 1000),
        order: 1,
        povId: pov.id,
        templateId: planningTemplate.id,
        details: {
          templateName: planningTemplate.name,
          estimatedDuration: '2 weeks',
          keyDeliverables: ['Requirements Document', 'Architecture Design', 'Project Plan']
        }
      }
    });
    phases.push(planningPhase);
    await createStagesAndTasksFromTemplate(planningPhase, planningTemplate);
  }

  // Execution Phase
  if (executionTemplates.length > 0) {
    const executionTemplate = getRandomElement(executionTemplates);
    const planningEndDate = phases.length > 0 ? phases[phases.length - 1].endDate : pov.startDate;
    const executionStartDate = new Date(planningEndDate.getTime() + 24 * 60 * 60 * 1000);

    const executionPhase = await prisma.phase.create({
      data: {
        name: 'Implementation Phase',
        description: 'System deployment, configuration, and integration',
        type: PhaseType.EXECUTION,
        startDate: executionStartDate,
        endDate: new Date(executionStartDate.getTime() + 42 * 24 * 60 * 60 * 1000),
        order: 2,
        povId: pov.id,
        templateId: executionTemplate.id,
        details: {
          templateName: executionTemplate.name,
          estimatedDuration: '6 weeks',
          keyDeliverables: ['Deployed System', 'Configuration Documentation', 'Test Results']
        }
      }
    });
    phases.push(executionPhase);
    await createStagesAndTasksFromTemplate(executionPhase, executionTemplate);
  }

  // Review Phase
  if (reviewTemplates.length > 0) {
    const reviewTemplate = getRandomElement(reviewTemplates);
    const executionEndDate = phases.length > 0 ? phases[phases.length - 1].endDate : pov.startDate;
    const reviewStartDate = new Date(executionEndDate.getTime() + 24 * 60 * 60 * 1000);

    const reviewPhase = await prisma.phase.create({
      data: {
        name: 'Review & Validation Phase',
        description: 'Security audit, compliance validation, and final review',
        type: PhaseType.REVIEW,
        startDate: reviewStartDate,
        endDate: new Date(reviewStartDate.getTime() + 14 * 24 * 60 * 60 * 1000),
        order: 3,
        povId: pov.id,
        templateId: reviewTemplate.id,
        details: {
          templateName: reviewTemplate.name,
          estimatedDuration: '2 weeks',
          keyDeliverables: ['Security Audit Report', 'Compliance Validation', 'Final Documentation']
        }
      }
    });
    phases.push(reviewPhase);
    await createStagesAndTasksFromTemplate(reviewPhase, reviewTemplate);
  }

  console.log(`    ✅ Created ${phases.length} phases for POV ${index + 1}`);

  return pov;
}

/**
 * Reset demo POVs to initial state
 * Aligns with daily reset functionality in unified plan
 */
async function resetDemoPOVs() {
  console.log('🔄 Resetting demo POVs to initial state...');

  // Find all demo POVs
  const demoPOVs = await prisma.pOV.findMany({
    where: {
      metadata: {
        path: ['isDemo'],
        equals: true
      }
    },
    include: {
      phases: {
        include: {
          stages: {
            include: { tasks: true }
          }
        }
      }
    }
  });

  for (const pov of demoPOVs) {
    // Reset all tasks to OPEN status
    for (const phase of pov.phases) {
      for (const stage of phase.stages) {
        await prisma.task.updateMany({
          where: { stageId: stage.id },
          data: {
            status: TaskStatus.OPEN,
            assigneeId: null
          }
        });
      }
    }

    // Clear demo user comments (preserve demo owner comments)
    await prisma.comment.deleteMany({
      where: {
        task: { povId: pov.id },
        user: { role: UserRole.DEMO_USER }
      }
    });

    // Clear demo user task activities
    await prisma.taskActivity.deleteMany({
      where: {
        task: { povId: pov.id },
        user: { role: UserRole.DEMO_USER }
      }
    });

    console.log(`  ✅ Reset demo POV: ${pov.title}`);
  }

  console.log(`🎉 Reset ${demoPOVs.length} demo POVs to initial state`);
  return demoPOVs.length;
}

/**
 * Main setup function
 */
async function setupDemoMode(options: {
  demoCount?: number;
  regularCount?: number;
  resetOnly?: boolean;
  skipCleanup?: boolean;
} = {}) {
  const {
    demoCount = 2,
    regularCount = 0,
    resetOnly = false,
    skipCleanup = false
  } = options;

  console.log('🎯 Setting up demo mode (unified-auth-implementation-plan.md)...\n');

  try {
    // Step 1: Get or create demo owner
    const demoOwner = await getOrCreateDemoOwner();

    // Step 2: If reset-only mode, just reset and exit
    if (resetOnly) {
      const count = await resetDemoPOVs();
      console.log(`\n✅ Demo mode reset complete (${count} POVs reset)`);
      return { demoOwner, demoPOVCount: count, regularPOVCount: 0 };
    }

    // Step 3: Get required data
    const users = await prisma.user.findMany();
    const countries = await prisma.country.findMany({ include: { regions: true } });
    const phaseTemplates = await prisma.phaseTemplate.findMany();

    if (users.length === 0) {
      throw new Error('No users found. Please run user seeding first.');
    }

    if (countries.length === 0) {
      throw new Error('No countries found. Please run geographical data seeding first.');
    }

    if (phaseTemplates.length === 0) {
      throw new Error('No phase templates found. Please run phase template population first.');
    }

    console.log(`📊 Found ${users.length} users, ${countries.length} countries, ${phaseTemplates.length} phase templates\n`);

    // Step 4: Cleanup if requested
    if (!skipCleanup) {
      console.log('🧹 Cleaning up existing demo POVs...');
      await prisma.task.deleteMany({
        where: { pov: { metadata: { path: ['isDemo'], equals: true } } }
      });
      await prisma.stage.deleteMany({
        where: { phase: { pov: { metadata: { path: ['isDemo'], equals: true } } } }
      });
      await prisma.phase.deleteMany({
        where: { pov: { metadata: { path: ['isDemo'], equals: true } } }
      });
      await prisma.pOV.deleteMany({
        where: { metadata: { path: ['isDemo'], equals: true } }
      });
      console.log('  ✅ Cleanup complete\n');
    }

    // Step 5: Create demo POVs
    console.log(`🎯 Creating ${demoCount} demo POVs...\n`);
    const demoPOVs = [];

    for (let i = 0; i < demoCount; i++) {
      const pov = await createPOV({
        index: i,
        isDemo: true,
        demoOwner,
        users,
        countries,
        phaseTemplates
      });
      if (pov) demoPOVs.push(pov);
    }

    // Step 6: Create regular POVs if requested
    const regularPOVs = [];
    if (regularCount > 0) {
      console.log(`\n📋 Creating ${regularCount} regular POVs...\n`);

      for (let i = 0; i < regularCount; i++) {
        const pov = await createPOV({
          index: i + demoCount,
          isDemo: false,
          users,
          countries,
          phaseTemplates
        });
        if (pov) regularPOVs.push(pov);
      }
    }

    // Step 7: Summary statistics
    const totalTasks = await prisma.task.count();
    const totalPhases = await prisma.phase.count();
    const demoPOVCount = await prisma.pOV.count({
      where: { metadata: { path: ['isDemo'], equals: true } }
    });

    console.log('\n📊 Demo Mode Setup Complete!');
    console.log('═══════════════════════════════════════');
    console.log(`  Demo Owner: ${demoOwner.email}`);
    console.log(`  Demo POVs: ${demoPOVCount}`);
    console.log(`  Regular POVs: ${regularPOVs.length}`);
    console.log(`  Total Phases: ${totalPhases}`);
    console.log(`  Total Tasks: ${totalTasks}`);
    console.log('═══════════════════════════════════════\n');

    console.log('🎯 Next Steps:');
    console.log('  1. Run database migration: npx prisma migrate dev --name add_demo_user_role');
    console.log('  2. Start development server: npm run dev');
    console.log('  3. New users will auto-receive DEMO_USER role');
    console.log('  4. Demo users will see only demo POVs marked with 🎯 badge\n');

    return { demoOwner, demoPOVCount: demoPOVs.length, regularPOVCount: regularPOVs.length };

  } catch (error) {
    console.error('❌ Error setting up demo mode:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * CLI interface
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const demoCountArg = args.find(arg => arg.startsWith('--count='))?.split('=')[1];
  const regularCountArg = args.find(arg => arg.startsWith('--regular='))?.split('=')[1];
  const resetOnly = args.includes('--reset');
  const skipCleanup = args.includes('--skip-cleanup');
  const createRegular = args.includes('--create-regular');

  const demoCount = demoCountArg ? parseInt(demoCountArg) : 2;
  const regularCount = regularCountArg ? parseInt(regularCountArg) : (createRegular ? 20 : 0);

  console.log('🚀 Demo Mode Setup Script');
  console.log('═══════════════════════════════════════');

  if (resetOnly) {
    console.log('  Mode: Reset existing demo POVs');
  } else {
    console.log(`  Demo POVs: ${demoCount}`);
    console.log(`  Regular POVs: ${regularCount}`);
    console.log(`  Skip Cleanup: ${skipCleanup}`);
  }

  console.log('═══════════════════════════════════════\n');

  try {
    await setupDemoMode({
      demoCount,
      regularCount,
      resetOnly,
      skipCleanup
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

// Export for use in other scripts
export { setupDemoMode, resetDemoPOVs, getOrCreateDemoOwner };

// Run if called directly
if (require.main === module) {
  main();
}
