import { Prisma } from '@prisma/client';
import { prisma } from '../../prisma';
import { povService } from './pov';
import { CRMFieldMapping as PrismaCRMFieldMapping } from '@prisma/client';
import { CRMSyncResult, CRMFieldMappingCreateInput, CRMFieldMappingUpdateInput } from '../types/crm';

export class CRMService {
  private static instance: CRMService;

  private constructor() {}

  static getInstance(): CRMService {
    if (!CRMService.instance) {
      CRMService.instance = new CRMService();
    }
    return CRMService.instance;
  }

  async syncPoV(povId: string): Promise<CRMSyncResult> {
    const mapping = await this.getFieldMapping();
    const syncHistory = await this.createSyncHistory(povId);
    
    try {
      // Get PoV data
      const pov = await povService.get(povId);
      if (!pov) {
        throw new Error('PoV not found');
      }

      // Perform sync with field mapping
      const result = await this.performSync(pov, mapping);
      
      // Update PoV with synced data
      await povService.update(povId, {
        dealId: result.dealId,
        opportunityName: result.opportunityName,
        revenue: result.revenue,
        forecastDate: result.forecastDate,
        customerName: result.customerName,
        customerContact: result.customerContact,
        partnerName: result.partnerName,
        partnerContact: result.partnerContact,
        competitors: result.competitors,
        solution: result.solution,
        lastCrmSync: new Date(),
        crmSyncStatus: 'SUCCESS'
      });

      // Update sync history
      await this.updateSyncHistory(syncHistory.id, {
        status: 'SUCCESS',
        details: result
      });

      return result;
    } catch (error) {
      // Log failure
      await this.updateSyncHistory(syncHistory.id, {
        status: 'FAILED',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      });

      // Update PoV sync status
      await povService.update(povId, {
        lastCrmSync: new Date(),
        crmSyncStatus: 'FAILED'
      });

      throw error;
    }
  }

  async getFieldMapping(): Promise<PrismaCRMFieldMapping[]> {
    return await prisma.cRMFieldMapping.findMany({
      orderBy: { crmField: 'asc' },
      take: 100,
    });
  }

  private async createSyncHistory(povId: string) {
    return await prisma.cRMSyncHistory.create({
      data: {
        povId,
        status: 'IN_PROGRESS',
        details: Prisma.JsonNull
      }
    });
  }

  private async updateSyncHistory(
    id: string,
    data: { status: string; details: any }
  ) {
    return await prisma.cRMSyncHistory.update({
      where: { id },
      data: {
        status: data.status,
        details: data.details || Prisma.JsonNull
      }
    });
  }

  private async performSync(pov: any, mapping: PrismaCRMFieldMapping[]): Promise<any> {
    // This would be replaced with actual CRM API calls
    // For now, return mock data
    return {
      dealId: 'CRM-123',
      opportunityName: pov.title,
      revenue: 100000,
      forecastDate: new Date(),
      customerName: 'ACME Corp',
      customerContact: 'John Doe',
      partnerName: 'Partner Co',
      partnerContact: 'Jane Smith',
      competitors: ['Competitor A', 'Competitor B'],
      solution: 'Enterprise Solution'
    };
  }

  async getLastSync(povId: string) {
    return prisma.cRMSyncHistory.findFirst({
      where: { povId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getSyncHistory(povId: string) {
    return prisma.cRMSyncHistory.findMany({
      where: { povId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async createFieldMapping(data: CRMFieldMappingCreateInput) {
    return await prisma.cRMFieldMapping.create({
      data: {
        crmField: data.crmField,
        localField: data.localField,
        transformer: data.transformer,
        isRequired: data.isRequired || false
      }
    });
  }

  async updateFieldMapping(id: string, data: CRMFieldMappingUpdateInput) {
    return await prisma.cRMFieldMapping.update({
      where: { id },
      data
    });
  }

  async deleteFieldMapping(id: string) {
    await prisma.cRMFieldMapping.delete({
      where: { id }
    });
  }
}

export const crmService = CRMService.getInstance();
