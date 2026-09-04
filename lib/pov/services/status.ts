import { POVStatus } from '@prisma/client';
import { StatusTransition, ValidationResult, NotificationConfig, StatusCondition } from '../types/status';
import { povService } from './pov';
import { prisma } from '@/lib/prisma';
import { mapPoVToResponse } from '../prisma/mappers';

class StatusTransitionService {
  private static instance: StatusTransitionService;

  private constructor() {}

  static getInstance(): StatusTransitionService {
    if (!StatusTransitionService.instance) {
      StatusTransitionService.instance = new StatusTransitionService();
    }
    return StatusTransitionService.instance;
  }

  private transitions: StatusTransition[] = [
    {
      from: POVStatus.PROJECTED,
      to: POVStatus.IN_PROGRESS,
      conditions: [
        {
          type: 'PHASE',
          check: async (pov) => Boolean(pov.phases && pov.phases.length > 0),
          errorMessage: 'PoV must have at least one phase'
        }
      ],
      notifications: [
        {
          roles: ['OWNER', 'ADMIN'],
          template: 'POV_STATUS_CHANGE'
        }
      ]
    },
    {
      from: POVStatus.IN_PROGRESS,
      to: POVStatus.VALIDATION,
      conditions: [
        {
          // Change A (2026-06-22 review): was a buggy "all phases completed" check that
          // read the empty legacy JSONB checklist (vacuously true). Now: lenient gate —
          // only a BLOCKED task stops advancement, via the complete povHasBlockedTask query.
          type: 'CUSTOM',
          check: async (pov) => !(await this.povHasBlockedTask(pov.id)),
          errorMessage: 'Cannot move to VALIDATION while a task is BLOCKED — unblock it first'
        }
      ],
      notifications: [
        {
          roles: ['OWNER', 'ADMIN'],
          template: 'POV_READY_FOR_VALIDATION'
        }
      ]
    },
    {
      from: POVStatus.VALIDATION,
      to: POVStatus.WON,
      conditions: [
        {
          type: 'KPI',
          check: async (pov) => {
            // TODO: Implement KPI validation logic
            return true;
          },
          errorMessage: 'KPI targets not met'
        },
        {
          // Change B (2026-06-22 review): a task can become BLOCKED after reaching
          // VALIDATION. Defense-in-depth — shares the same complete predicate as Change A.
          type: 'CUSTOM',
          check: async (pov) => !(await this.povHasBlockedTask(pov.id)),
          errorMessage: 'Cannot mark WON while a task is BLOCKED'
        }
      ],
      notifications: [
        {
          roles: ['OWNER', 'ADMIN'],
          template: 'POV_WON',
          data: {
            notifyCustomer: true
          }
        }
      ]
    },
    {
      from: POVStatus.IN_PROGRESS,
      to: POVStatus.STALLED,
      conditions: [
        {
          // Change F (2026-06-22 review): the inline phase-level read here had the same
          // stage-blind spot as the old Change A. Now shares the complete povHasBlockedTask
          // query so the STALLED-entry gate and the forward gates can't drift.
          type: 'CUSTOM',
          check: async (pov) => await this.povHasBlockedTask(pov.id),
          errorMessage: 'Cannot mark POV as STALLED without at least one BLOCKED task as justification'
        }
      ],
      notifications: [
        {
          roles: ['OWNER', 'ADMIN'],
          template: 'POV_STALLED'
        }
      ]
    },
    {
      from: POVStatus.VALIDATION,
      to: POVStatus.LOST,
      conditions: [],
      notifications: [
        {
          roles: ['OWNER', 'ADMIN'],
          template: 'POV_LOST'
        }
      ]
    },
    // ── New recovery / terminal edges (2026-06-22 review — Changes C, D, E) ──
    // NOTE (F1): transition.notifications is currently DEAD CONFIG — validateTransition
    // reads only .conditions; nothing dispatches notifications. The blocks below are kept
    // for structural consistency with the existing edges; wiring dispatch is out-of-scope.
    {
      // Change C — frictionless resume. Unconditional by design (Steve, 2026-06-22):
      // teams keep working other tasks while one is blocked; resume must not be gated.
      from: POVStatus.STALLED,
      to: POVStatus.IN_PROGRESS,
      conditions: [],
      notifications: [
        { roles: ['OWNER', 'ADMIN'], template: 'POV_STATUS_CHANGE' }
      ]
    },
    {
      // Change D — abandon a stalled POV.
      from: POVStatus.STALLED,
      to: POVStatus.LOST,
      conditions: [],
      notifications: [
        { roles: ['OWNER', 'ADMIN'], template: 'POV_LOST' }
      ]
    },
    {
      // Change E — send a POV back for rework if validation surfaces gaps.
      from: POVStatus.VALIDATION,
      to: POVStatus.IN_PROGRESS,
      conditions: [],
      notifications: [
        { roles: ['OWNER', 'ADMIN'], template: 'POV_STATUS_CHANGE' }
      ]
    }
  ];

  /**
   * Complete blocked-task check (2026-06-22 review — used by Changes A, B, F).
   * `phaseId` and `stageId` are BOTH nullable (schema.prisma:268-269), so the in-memory
   * `phases[].tasks` view is a strict SUBSET of a POV's tasks — a BLOCKED task on a stage
   * with `phaseId=null` is invisible to it (the F4 gap). Query by `povId` instead (served by
   * the composite index `@@index([povId, status])`) to catch EVERY blocked task. `count===0`
   * is an honest "no blocked tasks", which also closes the nullish vacuous-pass that an
   * optional-chained phase-level predicate would have on a phase-less POV.
   */
  private async povHasBlockedTask(povId: string): Promise<boolean> {
    const count = await prisma.task.count({ where: { povId, status: 'BLOCKED' } });
    return count > 0;
  }

  async validateTransition(
    povId: string,
    newStatus: POVStatus
  ): Promise<ValidationResult> {
    const rawPov = await povService.get(povId);
    if (!rawPov) {
      return {
        valid: false,
        errors: ['PoV not found']
      };
    }

    // Conditions validate the mapPoVToResponse output (not rawPov); today the mapper
    // passes phases through verbatim. The blocked-task check queries by povId so it does
    // not depend on the mapped phases/stages shape — but keep that invariant in mind if
    // the mapper ever starts reshaping phases.
    const pov = mapPoVToResponse(rawPov);
    const transition = this.transitions.find(
      (transition: StatusTransition) => transition.from === pov.status && transition.to === newStatus
    );
    
    if (!transition) {
      return {
        valid: false,
        errors: ['Invalid status transition']
      };
    }

    const results = await Promise.all(
      transition.conditions.map((condition: StatusCondition) => condition.check(pov))
    );

    const errors = transition.conditions
      .filter((_: StatusCondition, i: number) => !results[i])
      .map((condition: StatusCondition) => condition.errorMessage);

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Intentionally unused — the backend is the sole transition gate (plan §4); the GUI
  // status <Select> shows all statuses and relies on validateTransition to reject invalid
  // ones. NOT wired to the dropdown by design (one copy of the rules, no GUI↔backend drift).
  getAvailableTransitions(currentStatus: POVStatus): POVStatus[] {
    return this.transitions
      .filter((transition: StatusTransition) => transition.from === currentStatus)
      .map((transition: StatusTransition) => transition.to);
  }
}

export const statusService = StatusTransitionService.getInstance();
