import { prisma } from '@/lib/prisma';
import { SalesTheatre } from '@prisma/client';

interface GeographicalConsistencyParams {
  salesTheatre?: SalesTheatre;
  countryId?: string;
  regionId?: string;
}

export class PoVGeographicalValidator {
  /**
   * Validate that the geographical data is consistent
   * - If regionId is provided, it must belong to the specified country
   * - If countryId is provided, it must belong to the specified theatre
   */
  async validateGeographicalConsistency(params: GeographicalConsistencyParams): Promise<boolean> {
    const { salesTheatre, countryId, regionId } = params;
    
    // If no geographical data provided, it's valid
    if (!salesTheatre && !countryId && !regionId) {
      return true;
    }
    
    // If regionId is provided, check that it belongs to the specified country
    if (regionId && countryId) {
      const region = await prisma.region.findUnique({
        where: { id: regionId },
        select: { countryId: true },
      });
      
      if (!region || region.countryId !== countryId) {
        return false;
      }
    }
    
    // If countryId is provided, check that it belongs to the specified theatre
    if (countryId && salesTheatre) {
      const country = await prisma.country.findUnique({
        where: { id: countryId },
        select: { theatre: true },
      });
      
      if (!country || country.theatre !== salesTheatre) {
        return false;
      }
    }
    
    return true;
  }
}

export class GeographicalService {
  /**
   * Get all regions
   */
  async getAllRegions() {
    return prisma.region.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        country: true,
      },
      take: 300,
    });
  }

  /**
   * Get regions by country
   */
  async getRegionsByCountry(countryId: string) {
    return prisma.region.findMany({
      where: {
        countryId,
      },
      orderBy: {
        name: 'asc',
      },
      take: 300,
    });
  }

  /**
   * Get all countries
   */
  async getAllCountries() {
    return prisma.country.findMany({
      orderBy: {
        name: 'asc',
      },
      include: {
        regions: true,
      },
      take: 300,
    });
  }

  /**
   * Get countries by theatre
   */
  async getCountriesByTheatre(theatre: SalesTheatre) {
    return prisma.country.findMany({
      where: {
        theatre,
      },
      orderBy: {
        name: 'asc',
      },
      include: {
        regions: true,
      },
      take: 300,
    });
  }

  /**
   * Get country by region
   */
  async getCountryByRegion(regionId: string) {
    const region = await prisma.region.findUnique({
      where: {
        id: regionId,
      },
      include: {
        country: true,
      },
    });

    return region?.country;
  }

  /**
   * Get geographical distribution of POVs
   */
  async getGeographicalDistribution() {
    // Get counts by theatre
    const theatreCounts = await prisma.pOV.groupBy({
      by: ['salesTheatre'],
      _count: {
        id: true,
      },
    });

    // Get counts by country
    const countryCounts = await prisma.pOV.groupBy({
      by: ['countryId'],
      _count: {
        id: true,
      },
    });

    // Get counts by region
    const regionCounts = await prisma.pOV.groupBy({
      by: ['regionId'],
      _count: {
        id: true,
      },
    });

    // Get country and region details
    const countries = await prisma.country.findMany({
      include: {
        regions: true,
      },
      take: 300,
    });

    // Format the results
    const byTheatre = theatreCounts.reduce((acc, item) => {
      acc[item.salesTheatre] = item._count.id;
      return acc;
    }, {} as Record<string, number>);

    const byCountry = countryCounts.reduce((acc, item) => {
      const country = countries.find((c) => c.id === item.countryId);
      if (country) {
        acc[country.id] = {
          name: country.name,
          code: country.code,
          count: item._count.id,
        };
      }
      return acc;
    }, {} as Record<string, { name: string; code: string; count: number }>);

    const byRegion = regionCounts.reduce((acc, item) => {
      if (!item.regionId) return acc;
      
      let regionName = 'Unknown';
      let countryId = '';
      
      for (const country of countries) {
        const region = country.regions.find((r) => r.id === item.regionId);
        if (region) {
          regionName = region.name;
          countryId = country.id;
          break;
        }
      }
      
      acc[item.regionId] = {
        name: regionName,
        countryId,
        count: item._count.id,
      };
      
      return acc;
    }, {} as Record<string, { name: string; countryId: string; count: number }>);

    return {
      byTheatre,
      byCountry,
      byRegion,
    };
  }
}

export const geographicalService = new GeographicalService();
