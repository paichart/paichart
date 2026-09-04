const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPOVs() {
  const user = await prisma.user.findUnique({
    where: { email: 'steve.terry@paichart.com' }
  });

  if (!user) {
    console.log('User not found');
    return;
  }

  console.log('User ID:', user.id);
  console.log('User Role:', user.role);
  console.log('');

  const problematicPOVs = [
    'cmgalshqp0071yx39ox4k2r48',
    'cmgalshko000ayx39ouq4jdu7'
  ];

  for (const povId of problematicPOVs) {
    const pov = await prisma.pOV.findUnique({
      where: { id: povId },
      include: {
        owner: { select: { email: true, name: true } },
        team: {
          include: {
            members: {
              include: {
                user: { select: { email: true, name: true } }
              }
            }
          }
        }
      }
    });

    if (!pov) {
      console.log('POV not found:', povId);
      continue;
    }

    console.log('POV:', pov.title);
    console.log('Customer:', pov.customerName);
    console.log('Owner:', pov.owner.name, '(' + pov.owner.email + ')');
    console.log('IsDemo:', pov.metadata?.isDemo || false);
    console.log('Team:', pov.team ? 'Yes' : 'No');

    if (pov.team) {
      console.log('Team Members:');
      pov.team.members.forEach(m => {
        console.log('  -', m.user.name, '(' + m.user.email + ')', 'Role:', m.role);
      });
    }

    console.log('');
  }
}

checkPOVs().finally(() => prisma.$disconnect());
