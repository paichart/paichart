import { prisma } from '../../../lib/prisma';
import {
  KPITemplateCreateInput,
  KPITemplateUpdateInput,
  KPICalculationContext,
  KPICalculationResult,
  KPITarget,
  KPIHistoryEntry,
  KPICreateInput,
  KPIUpdateInput,
  KPIVisualization,
  SerializedKPITarget
} from '../types/kpi';
import { povService } from './pov';
import { kpiWithTemplate, fullKPI } from '../prisma/select';
import { mapKPIToDomain } from '../prisma/mappers';
import { Prisma } from '@prisma/client';
import { povLogger } from '@/lib/logger';

const localLogger = povLogger.child({ module: 'KPIService' });

class KPIService {
  private static instance: KPIService;

  private constructor() {}

  static getInstance(): KPIService {
    if (!KPIService.instance) {
      KPIService.instance = new KPIService();
    }
    return KPIService.instance;
  }

  async createTemplate(data: KPITemplateCreateInput) {
    return await prisma.kPITemplate.create({
      data: {
        name: data.name,
        description: data.description,
        type: data.type,
        isCustom: data.isCustom || false,
        defaultTarget: data.defaultTarget ? data.defaultTarget : {},
        calculation: data.calculation,
        visualization: data.visualization
      }
    });
  }

  async updateTemplate(id: string, data: KPITemplateUpdateInput) {
    const updateData: Prisma.KPITemplateUpdateInput = {
      ...(data.name && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.type && { type: data.type }),
      ...(data.isCustom !== undefined && { isCustom: data.isCustom }),
      ...(data.defaultTarget !== undefined && { defaultTarget: data.defaultTarget || {} }),
      ...(data.calculation !== undefined && { calculation: data.calculation }),
      ...(data.visualization !== undefined && { visualization: data.visualization })
    };

    return await prisma.kPITemplate.update({
      where: { id },
      data: updateData
    });
  }

  async getTemplates() {
    return await prisma.kPITemplate.findMany({
      orderBy: { name: 'asc' },
      take: 100,
    });
  }

  async createKPI(povId: string, templateId: string | null, data: KPICreateInput) {
    const kpi = await prisma.pOVKPI.create({
      data: {
        povId,
        templateId,
        name: data.name,
        target: this.serializeKPITarget(data.target),
        current: data.current,
        weight: data.weight,
        history: []
      }
    });

    return mapKPIToDomain(kpi);
  }

  async updateKPI(id: string, data: KPIUpdateInput) {
    const updateData: Prisma.POVKPIUpdateInput = {
      ...(data.name && { name: data.name }),
      ...(data.target !== undefined && { target: this.serializeKPITarget(data.target) }),
      ...(data.current !== undefined && { current: data.current }),
      ...(data.weight !== undefined && { weight: data.weight })
    };

    const kpi = await prisma.pOVKPI.update({
      where: { id },
      data: updateData
    });

    return mapKPIToDomain(kpi);
  }

  private serializeKPITarget(target: KPITarget | undefined): Prisma.InputJsonValue {
    if (!target) return {};
    const serialized: SerializedKPITarget = {
      value: target.value,
      threshold: target.threshold ? {
        warning: target.threshold.warning,
        critical: target.threshold.critical
      } : undefined
    };
    return serialized;
  }

  async getKPIHistory(id: string): Promise<KPIHistoryEntry[]> {
    const kpi = await prisma.pOVKPI.findUnique({
      where: { id },
      select: { history: true }
    });

    const history = kpi?.history;
    if (!history || !Array.isArray(history)) {
      return [];
    }

    // Filter out invalid entries and map valid ones
    return history
      .filter(entry => 
        typeof entry === 'object' && 
        entry !== null && 
        'value' in entry && 
        'timestamp' in entry &&
        typeof entry.value === 'number' &&
        typeof entry.timestamp === 'string'
      )
      .map(entry => {
        const typedEntry = entry as { value: number; timestamp: string; metadata?: Record<string, any> };
        return {
          value: typedEntry.value,
          timestamp: typedEntry.timestamp,
          metadata: typedEntry.metadata
        };
      });
  }

  private async updateKPIHistory(id: string, historyEntry: KPIHistoryEntry) {
    // BC19 (2026-06-08): atomic jsonb array append. Was a plain-$transaction
    // findUnique → push → update — lost-update racy under concurrent history writes
    // (a plain $transaction does NOT prevent lost-update; the append now happens in-SQL,
    // so a concurrent writer blocks then appends onto the committed array). See
    // transaction-atomicity-pattern.md / bug-class BC19.
    const newEntry = {
      value: historyEntry.value,
      timestamp: historyEntry.timestamp,
      metadata: historyEntry.metadata || {}
    };
    await prisma.$executeRaw`
      UPDATE "POVKPI"
         SET history = COALESCE(history, '[]'::jsonb) || ${JSON.stringify(newEntry)}::jsonb
       WHERE id = ${id}`;
  }

  async getKPI(id: string) {
    const kpi = await prisma.pOVKPI.findUnique({
      where: { id },
      include: {
        template: true,
        pov: {
          select: {
            id: true,
            title: true,
            status: true
          }
        }
      }
    });

    if (!kpi) return null;

    // Fix N+1: parse history in-memory instead of re-querying (it's already loaded as Json)
    const history = Array.isArray(kpi.history) ? kpi.history : [];
    return mapKPIToDomain({ ...kpi, history });
  }

  async getPOVKPIs(povId: string) {
    const kpis = await prisma.pOVKPI.findMany({
      where: { povId },
      include: {
        template: true,
        pov: {
          select: {
            id: true,
            title: true,
            status: true
          }
        }
      },
      take: 100,
    });

    // Fix N+1: parse history in-memory instead of re-querying per KPI
    const kpisWithHistory = kpis.map((kpi: { history?: unknown } & Record<string, any>) => ({
      ...kpi,
      history: Array.isArray(kpi.history) ? kpi.history : [],
    }));

    return kpisWithHistory.map(mapKPIToDomain);
  }

  /**
   * DEPRECATED: Dynamic calculation via new Function() is permanently disabled (BC17/BC48).
   * KPI calculation is now handled by predefined calculators in kpi-calculators.ts.
   * The KPITemplate.calculation field stores the calculator formula ID (e.g., 'task-completion-rate').
   * NEVER evaluate the calculation field as code.
   */
  async calculateKPI(_kpiId: string): Promise<KPICalculationResult | null> {
    localLogger.warn('calculateKPI is deprecated — use kpi-calculators.ts predefined formulas instead');
    return null;
  }

  determineKPIStatus(
    value: number,
    target: SerializedKPITarget,
    direction: 'higher_is_better' | 'lower_is_better' = 'higher_is_better'
  ): KPICalculationResult['status'] {
    const { threshold } = target;

    if (direction === 'lower_is_better') {
      // Lower values are better (e.g., stale-task-ratio, blocked-task-ratio)
      if (!threshold) return value <= target.value ? 'success' : 'warning';
      if (value >= threshold.critical) return 'critical';
      if (value >= threshold.warning) return 'warning';
      return 'success';
    }

    // Higher values are better (e.g., task-completion-rate, on-time-rate)
    if (!threshold) return value >= target.value ? 'success' : 'warning';
    if (value <= threshold.critical) return 'critical';
    if (value <= threshold.warning) return 'warning';
    return 'success';
  }

  async parseVisualization(visualization: string): Promise<KPIVisualization | null> {
    try {
      return JSON.parse(visualization);
    } catch {
      return null;
    }
  }

  async deleteTemplate(id: string) {
    await prisma.kPITemplate.delete({
      where: { id }
    });
  }

  async deleteKPI(id: string) {
    await prisma.pOVKPI.delete({
      where: { id }
    });
  }
}

export const kpiService = KPIService.getInstance();
