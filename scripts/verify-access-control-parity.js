const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyAccessControlParity() {
  // Use the DEMO_USER account
  const user = await prisma.user.findUnique({
    where: { email: 'steve.terry@paichart.com' }
  });

  if (!user) {
    console.log('User not found');
    return;
  }

  console.log('═══════════════════════════════════════');
  console.log('🔍 ACCESS CONTROL PARITY VERIFICATION');
  console.log('═══════════════════════════════════════');
  console.log('User:', user.name, '(' + user.email + ')');
  console.log('Role:', user.role);
  console.log('');

  // Test 1: GET /api/pov pattern (status: IN_PROGRESS)
  console.log('--- Test 1: GET /api/pov Pattern ---');
  console.log('Filter: status=IN_PROGRESS');
  console.log('');

  const query = { status: 'IN_PROGRESS' };

  const userAccessQuery = {
    OR: [
      { ownerId: user.id },
      {
        team: {
          members: {
            some: { userId: user.id }
          }
        }
      },
      {
        metadata: {
          path: ['isDemo'],
          equals: true
        }
      }
    ]
  };

  // Defensive pattern from GET /api/pov
  if (Object.keys(query).length > 0) {
    query.AND = [userAccessQuery, { status: 'IN_PROGRESS' }];
    delete query.status;
  } else {
    Object.assign(query, userAccessQuery);
  }

  console.log('Query:', JSON.stringify(query, null, 2));

  const apiPOVs = await prisma.pOV.findMany({
    where: query,
    select: {
      id: true,
      title: true,
      customerName: true,
      status: true,
      ownerId: true,
      metadata: true
    }
  });

  console.log('');
  console.log('Results:', apiPOVs.length, 'POVs');
  apiPOVs.forEach(pov => {
    const isOwned = pov.ownerId === user.id;
    const isDemo = pov.metadata?.isDemo === true;
    console.log('  ✓', pov.title, '-', pov.customerName);
    console.log('    Status:', pov.status, '| Owned:', isOwned, '| Demo:', isDemo);
  });

  console.log('');
  console.log('--- Test 2: audit_all_tasks Pattern ---');
  console.log('Filter: status IN (IN_PROGRESS, STALLED, VALIDATION)');
  console.log('');

  // Current audit_all_tasks pattern
  const whereClause = {
    status: { in: ['IN_PROGRESS', 'STALLED', 'VALIDATION'] }
  };

  whereClause.AND = [
    {
      OR: [
        { ownerId: user.id },
        {
          team: {
            members: {
              some: { userId: user.id }
            }
          }
        },
        {
          metadata: {
            path: ['isDemo'],
            equals: true
          }
        }
      ]
    }
  ];

  console.log('Query:', JSON.stringify(whereClause, null, 2));

  const auditPOVs = await prisma.pOV.findMany({
    where: whereClause,
    select: {
      id: true,
      title: true,
      customerName: true,
      status: true,
      ownerId: true,
      metadata: true
    }
  });

  console.log('');
  console.log('Results:', auditPOVs.length, 'POVs');
  auditPOVs.forEach(pov => {
    const isOwned = pov.ownerId === user.id;
    const isDemo = pov.metadata?.isDemo === true;
    console.log('  ✓', pov.title, '-', pov.customerName);
    console.log('    Status:', pov.status, '| Owned:', isOwned, '| Demo:', isDemo);
  });

  console.log('');
  console.log('--- Parity Check ---');

  const apiIds = new Set(apiPOVs.map(p => p.id));
  const auditIds = new Set(auditPOVs.map(p => p.id));

  const inApiNotAudit = apiPOVs.filter(p => !auditIds.has(p.id));
  const inAuditNotApi = auditPOVs.filter(p => !apiIds.has(p.id));

  if (inApiNotAudit.length > 0) {
    console.log('⚠️ POVs in API but NOT in audit:', inApiNotAudit.length);
    inApiNotAudit.forEach(p => console.log('  -', p.title, '(Status:', p.status + ')'));
  }

  if (inAuditNotApi.length > 0) {
    console.log('🔴 POVs in audit but NOT in API:', inAuditNotApi.length);
    inAuditNotApi.forEach(p => console.log('  -', p.title, '(Status:', p.status + ')'));
  }

  if (inApiNotAudit.length === 0 && inAuditNotApi.length === 0) {
    console.log('✅ PARITY VERIFIED - Both queries return identical POVs');
  } else {
    console.log('❌ PARITY MISMATCH - Different POVs returned');
  }

  console.log('');
  console.log('═══════════════════════════════════════');
}

verifyAccessControlParity()
  .catch(err => {
    console.error('Error:', err);
  })
  .finally(() => prisma.$disconnect());
