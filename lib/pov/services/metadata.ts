import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { PoVMetadata } from '../types/core';
import { createPoVSchema } from '../types/requests';

function isPoVMetadata(value: unknown): value is PoVMetadata {
  if (!value || typeof value !== 'object') return false;
  const metadata = value as Record<string, unknown>;
  return (
    typeof metadata.customer === 'string' &&
    typeof metadata.teamSize === 'string' &&
    typeof metadata.successCriteria === 'string' &&
    typeof metadata.technicalRequirements === 'string'
  );
}

export class MetadataService {
  /**
   * Validate PoV metadata
   */
  static validateMetadata(metadata: PoVMetadata): boolean {
    try {
      const { metadata: metadataSchema } = createPoVSchema.shape;
      metadataSchema.parse(metadata);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Update PoV metadata
   */
  static async updateMetadata(
    povId: string,
    metadata: Partial<PoVMetadata>
  ): Promise<void> {
    // BC19 (2026-06-09): atomic jsonb merge — was an RR findUnique→spread→update. The `||` merges over the
    // stored metadata in-SQL (top-level/shallow, right-operand wins — identical to the prior `{...current,
    // ...metadata}` spread), so concurrent merges never abort and never need retry. Same shape as the
    // 2026-06-08 mergeTaskInputContext fix. See transaction-atomicity-pattern.md / BC19.
    const affected = await prisma.$executeRaw`
      UPDATE "POV"
         SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb
       WHERE id = ${povId}`;
    if (affected === 0) {
      throw new Error('PoV not found');
    }
  }

  /**
   * Get PoV metadata
   */
  static async getMetadata(povId: string): Promise<PoVMetadata | null> {
    const pov = await prisma.pOV.findUnique({
      where: { id: povId },
      select: { metadata: true },
    });

    if (!pov?.metadata || !isPoVMetadata(pov.metadata)) {
      return null;
    }

    return pov.metadata;
  }

  /**
   * Format team size for display
   */
  static formatTeamSize(size: string): string {
    const numSize = parseInt(size, 10);
    if (isNaN(numSize)) return size;
    if (numSize === 1) return '1 member';
    return `${numSize} members`;
  }

  /**
   * Parse success criteria into bullet points
   */
  static parseSuccessCriteria(criteria: string): string[] {
    return criteria
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }

  /**
   * Parse technical requirements into sections
   */
  static parseTechnicalRequirements(requirements: string): {
    frontend?: string[];
    backend?: string[];
    infrastructure?: string[];
    other?: string[];
  } {
    const sections: Record<string, string[]> = {};
    let currentSection = 'other';

    const lines = requirements.split('\n').map(line => line.trim());

    for (const line of lines) {
      if (line.length === 0) continue;

      // Check if line is a section header
      if (line.toLowerCase().includes('frontend')) {
        currentSection = 'frontend';
        sections[currentSection] = [];
      } else if (line.toLowerCase().includes('backend')) {
        currentSection = 'backend';
        sections[currentSection] = [];
      } else if (line.toLowerCase().includes('infrastructure')) {
        currentSection = 'infrastructure';
        sections[currentSection] = [];
      } else {
        if (!sections[currentSection]) {
          sections[currentSection] = [];
        }
        sections[currentSection].push(line);
      }
    }

    return sections;
  }

  /**
   * Validate and normalize metadata
   */
  static normalizeMetadata(metadata: PoVMetadata): Prisma.JsonObject {
    return {
      // Return as a plain object that Prisma can serialize as JSON
      customer: metadata.customer.trim(),
      teamSize: metadata.teamSize.toString(),
      successCriteria: metadata.successCriteria
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n'),
      technicalRequirements: metadata.technicalRequirements
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join('\n'),
    };
  }

  /**
   * Search PoVs by metadata
   */
  static async searchByMetadata(query: string) {
    return prisma.pOV.findMany({
      where: {
        OR: [
          {
            metadata: {
              path: ['customer'],
              string_contains: query,
            },
          },
          {
            metadata: {
              path: ['successCriteria'],
              string_contains: query,
            },
          },
          {
            metadata: {
              path: ['technicalRequirements'],
              string_contains: query,
            },
          },
        ],
      },
      select: {
        id: true,
        title: true,
        metadata: true,
      },
      take: 200,
    });
  }
}
