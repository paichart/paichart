// Script to seed geographical data in the database
const { PrismaClient, SalesTheatre, RegionType } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedGeographicalData() {
  try {
    console.log('Seeding geographical data...');
    
    // Define geographical data by theatre
    const geographicalData = {
      [SalesTheatre.NORTH_AMERICA]: [
        {
          name: 'United States',
          code: 'US',
          regions: [
            { name: 'East Coast', type: RegionType.EAST },
            { name: 'West Coast', type: RegionType.WEST },
            { name: 'Central', type: RegionType.CENTRAL },
          ]
        },
        {
          name: 'Canada',
          code: 'CA',
          regions: [
            { name: 'Eastern Canada', type: RegionType.EAST },
            { name: 'Western Canada', type: RegionType.WEST },
          ]
        },
        {
          name: 'Mexico',
          code: 'MX',
          regions: [
            { name: 'Mexico City', type: RegionType.CENTRAL },
          ]
        }
      ],
      [SalesTheatre.LAC]: [
        {
          name: 'Brazil',
          code: 'BR',
          regions: [
            { name: 'Brasília', type: RegionType.CENTRAL },
          ]
        },
        {
          name: 'Argentina',
          code: 'AR',
          regions: [
            { name: 'Buenos Aires', type: RegionType.CENTRAL },
          ]
        },
        {
          name: 'Colombia',
          code: 'CO',
          regions: [
            { name: 'Bogotá', type: RegionType.CENTRAL },
          ]
        }
      ],
      [SalesTheatre.EMEA]: [
        {
          name: 'United Kingdom',
          code: 'GB',
          regions: [
            { name: 'England', type: RegionType.SOUTH },
            { name: 'Scotland', type: RegionType.NORTH },
          ]
        },
        {
          name: 'Germany',
          code: 'DE',
          regions: [
            { name: 'Northern Germany', type: RegionType.NORTH },
            { name: 'Southern Germany', type: RegionType.SOUTH },
          ]
        },
        {
          name: 'France',
          code: 'FR',
          regions: [
            { name: 'Paris Region', type: RegionType.CENTRAL },
            { name: 'Southern France', type: RegionType.SOUTH },
          ]
        }
      ],
      [SalesTheatre.APJ]: [
        {
          name: 'Australia',
          code: 'AU',
          regions: [
            { name: 'Eastern Australia', type: RegionType.EAST },
            { name: 'Western Australia', type: RegionType.WEST },
            { name: 'Southern Australia', type: RegionType.SOUTH },
          ]
        },
        {
          name: 'Japan',
          code: 'JP',
          regions: [
            { name: 'Tokyo Region', type: RegionType.CENTRAL },
            { name: 'Kansai Region', type: RegionType.WEST },
          ]
        },
        {
          name: 'India',
          code: 'IN',
          regions: [
            { name: 'Northern India', type: RegionType.NORTH },
            { name: 'Southern India', type: RegionType.SOUTH },
          ]
        },
        {
          name: 'Singapore',
          code: 'SG',
          regions: [
            { name: 'Singapore Central', type: RegionType.CENTRAL },
          ]
        },
        {
          name: 'China',
          code: 'CN',
          regions: [
            { name: 'Northern China', type: RegionType.NORTH },
            { name: 'Southern China', type: RegionType.SOUTH },
            { name: 'Eastern China', type: RegionType.EAST },
          ]
        },
        {
          name: 'South East Asia',
          code: 'SEA',
          regions: [
            { name: 'Thailand', type: RegionType.CENTRAL },
            { name: 'Vietnam', type: RegionType.EAST },
            { name: 'Indonesia', type: RegionType.SOUTH },
          ]
        }
      ]
    };
    
    // Seed data for each theatre
    for (const [theatre, countries] of Object.entries(geographicalData)) {
      console.log(`\nSeeding data for theatre: ${theatre}`);
      
      for (const countryData of countries) {
        // Check if country already exists
        const existingCountry = await prisma.country.findFirst({
          where: { code: countryData.code },
        });
        
        if (existingCountry) {
          console.log(`Country ${countryData.name} (${countryData.code}) already exists, skipping...`);
          continue;
        }
        
        // Create country
        const country = await prisma.country.create({
          data: {
            name: countryData.name,
            code: countryData.code,
            theatre: theatre,
          },
        });
        
        console.log(`Created country: ${country.name} (${country.code})`);
        
        // Create regions for country
        for (const regionData of countryData.regions) {
          const region = await prisma.region.create({
            data: {
              name: regionData.name,
              type: regionData.type,
              countryId: country.id,
            },
          });
          
          console.log(`  Created region: ${region.name} (${region.type})`);
        }
      }
    }
    
    console.log('\nGeographical data seeding complete!');
  } catch (error) {
    console.error('Error seeding geographical data:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedGeographicalData();
