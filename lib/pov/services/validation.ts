 import { POVStatus, Priority, PhaseType } from '@prisma/client';
import { createPoVSchema, createPhaseSchema } from '../types/requests';
import { MetadataService } from './metadata';
import { TeamService } from './team';

export class ValidationService {
  /**
   * Validate PoV creation data
   */
  static async validatePoVCreation(data: {
    title: string;
    description: string;
    status: POVStatus;
    priority: Priority;
    startDate: string | Date;
    endDate: string | Date;
    metadata: any;
    ownerId: string;
  }): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Validate schema
      createPoVSchema.parse(data);

      // Validate dates
      const startDate = new Date(data.startDate);
      const endDate = new Date(data.endDate);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        errors.push('Invalid date format');
      } else {
        if (startDate >= endDate) {
          errors.push('End date must be after start date');
        }

        // Validate metadata
        if (!MetadataService.validateMetadata(data.metadata)) {
          errors.push('Invalid metadata format');
        }

        // Additional business rules
        if (data.status === POVStatus.WON && startDate > new Date()) {
          errors.push('Cannot set future PoV as won');
        }
      }

    } catch (error: any) {
      if (error?.errors) {
        errors.push(...error.errors.map((e: any) => e.message));
      } else {
        errors.push('Invalid PoV data');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate PoV update data
   */
  static async validatePoVUpdate(
    povId: string,
    data: Partial<{
      title: string;
      description: string;
      status: POVStatus;
      priority: Priority;
      startDate: Date;
      endDate: Date;
      metadata: any;
    }>
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Validate dates if both are provided
      if (data.startDate && data.endDate && data.startDate >= data.endDate) {
        errors.push('End date must be after start date');
      }

      // Validate metadata if provided
      if (data.metadata && !MetadataService.validateMetadata(data.metadata)) {
        errors.push('Invalid metadata format');
      }

      // Additional business rules
      if (data.status === POVStatus.WON) {
        // Check if all phases are completed
        // This would require additional service calls
      }

    } catch (error: any) {
      errors.push('Invalid update data');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate phase creation data
   */
  static async validatePhaseCreation(
    povId: string,
    data: {
      name: string;
      description: string;
      type: PhaseType;
      startDate: Date;
      endDate: Date;
    }
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Validate schema
      createPhaseSchema.parse(data);

      // Validate dates
      if (data.startDate >= data.endDate) {
        errors.push('End date must be after start date');
      }

      // Additional business rules
      if (data.type === PhaseType.REVIEW && data.startDate <= new Date()) {
        errors.push('Review phase must start in the future');
      }

    } catch (error: any) {
      if (error?.errors) {
        errors.push(...error.errors.map((e: any) => e.message));
      } else {
        errors.push('Invalid phase data');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate team member addition
   */
  static async validateTeamMemberAddition(
    teamId: string,
    userId: string
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Check if user is already a member
      const isMember = await TeamService.isTeamMember({ teamId, userId });
      if (isMember) {
        errors.push('User is already a team member');
      }

    } catch (error) {
      errors.push('Failed to validate team member');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate phase reordering
   */
  static validatePhaseReorder(phases: Array<{ id: string; order: number }>): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check for duplicate orders
    const orders = phases.map((p) => p.order);
    const uniqueOrders = new Set(orders);
    if (orders.length !== uniqueOrders.size) {
      errors.push('Duplicate phase orders are not allowed');
    }

    // Check for gaps in order
    const sortedOrders = [...orders].sort((a, b) => a - b);
    for (let i = 0; i < sortedOrders.length; i++) {
      if (sortedOrders[i] !== i) {
        errors.push('Phase orders must be sequential');
        break;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // REMOVED 2026-06-22 (review Change H): `validateStatusTransition` was a SECOND,
  // dead transition table (zero callers — runtime uses statusService.validateTransition
  // in lib/pov/services/status.ts). It had already drifted (no backward/abandon/rework
  // edges) and was a standing drift trap. Deleted so there is one source of the rules.

  /**
   * Validate phase dates against PoV dates
   */
  static validatePhaseDates(
    phaseStartDate: Date,
    phaseEndDate: Date,
    povStartDate: Date,
    povEndDate: Date
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (phaseStartDate < povStartDate) {
      errors.push('Phase cannot start before PoV start date');
    }

    if (phaseEndDate > povEndDate) {
      errors.push('Phase cannot end after PoV end date');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
