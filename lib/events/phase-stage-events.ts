/**
 * Phase-Stage Events System
 * Extends existing event-driven infrastructure for phase and stage operations
 *
 * Features:
 * - Real-time phase/stage change notifications
 * - PostgreSQL NOTIFY/LISTEN for event broadcasting
 * - Event validation and security
 * - UI updates via React Query cache invalidation
 * 
 * @version 1.0.0
 * @author Phase-Stage Specialist
 */

import { EventEmitter } from 'events';
import { Client } from 'pg';
import { prisma } from '../prisma';
import { BaseEventEmitter, BaseEventConfig, StandardizedEvent } from './base-event-emitter';

export interface PhaseStageEvent {
  id: string;
  type: 'phase' | 'stage';
  action: 'created' | 'updated' | 'deleted' | 'status_changed';
  entityId: string;
  povId: string;
  phaseId?: string;
  data: {
    name: string;
    status?: string;
    order?: number;
    phase?: {
      id: string;
      name: string;
      type: string;
    };
    pov?: {
      id: string;
      title: string;
    };
  };
  timestamp: string;
  userId: string;
}

export class PhaseStageEventEmitter extends BaseEventEmitter {
  constructor() {
    // Use standardized base class with unified patterns
    super({
      systemName: 'phase-stage-events',
      channels: ['phase_events', 'stage_events'],
      maxListeners: 100,
      enableDebugLogging: true
    });
  }

  // Implement abstract methods from BaseEventEmitter
  protected onConnected(): void {
    this.logger.info('Phase-stage event system connected and ready');
  }

  protected onConnectionError(error: any): void {
    this.logger.error('Phase-stage event system connection error:', error);
  }

  protected onDisconnected(): void {
    this.logger.info('Phase-stage event system disconnected');
  }

  protected getCustomStats(): any {
    return {
      phaseEventsEmitted: this.eventCount,
      lastEventTime: new Date().toISOString()
    };
  }

  // Implement abstract validateAndEmitEvent method from BaseEventEmitter
  protected validateAndEmitEvent(eventData: any, channel: string): void {
    // Validate event structure
    if (!eventData.id || !eventData.action || !eventData.povId) {
      this.logger.error('Invalid event data structure:', eventData);
      return;
    }

    // Create standardized event
    const phaseStageEvent: PhaseStageEvent = {
      id: eventData.id,
      type: channel === 'phase_events' ? 'phase' : 'stage',
      action: eventData.action,
      entityId: eventData.id,
      povId: eventData.povId,
      phaseId: eventData.phaseId,
      data: {
        name: eventData.name,
        status: eventData.status,
        order: eventData.order,
        phase: eventData.phase,
        pov: eventData.pov
      },
      timestamp: new Date().toISOString(),
      userId: eventData.userId || 'system'
    };

    // Emit specific events
    this.emit('phase-stage-change', phaseStageEvent);
    this.emit(`${phaseStageEvent.type}-${phaseStageEvent.action}`, phaseStageEvent);
    this.emit(`pov-${eventData.povId}`, phaseStageEvent); // POV-specific events
    
    this.logger.debug(`Emitted ${phaseStageEvent.type} ${phaseStageEvent.action} event`);
  }

  // Connection error handling and reconnection now managed by BaseEventEmitter and shared connection pool

  public async emitPhaseEvent(action: string, phase: any, userId: string = 'system') {
    const eventData = {
      id: phase.id,
      action,
      povId: phase.povId,
      name: phase.name,
      type: phase.type, // ✅ FIXED: Phase has 'type' field, not 'status'
      order: phase.order,
      userId,
      timestamp: new Date().toISOString()
    };

    // Emit locally
    this.validateAndEmitEvent(eventData, 'phase_events');

    // Use standardized database event emission
    try {
      await this.emitDatabaseEvent('phase_events', eventData);
    } catch (error) {
      this.logger.error('Failed to send phase event notification:', error);
    }
  }

  public async emitStageEvent(action: string, stage: any, userId: string = 'system') {
    const eventData = {
      id: stage.id,
      action,
      povId: stage.phase?.pov?.id || stage.povId,
      phaseId: stage.phaseId,
      name: stage.name,
      order: stage.order,
      phase: stage.phase ? {
        id: stage.phase.id,
        name: stage.phase.name,
        type: stage.phase.type
      } : undefined,
      userId,
      timestamp: new Date().toISOString()
    };

    // Emit locally
    this.validateAndEmitEvent(eventData, 'stage_events');

    // Use standardized database event emission
    try {
      await this.emitDatabaseEvent('stage_events', eventData);
    } catch (error) {
      this.logger.error('Failed to send stage event notification:', error);
    }
  }

  public getStats() {
    // Use standardized stats collection from base class
    return this.getStandardizedStats();
  }
}

// Global singleton declaration (Fix 6.2)
declare global {
  var phaseStageEvents: PhaseStageEventEmitter | undefined;
}

export function getPhaseStageEventEmitter(): PhaseStageEventEmitter {
  if (!global.phaseStageEvents) {
    global.phaseStageEvents = new PhaseStageEventEmitter();
  }
  return global.phaseStageEvents;
}

export default PhaseStageEventEmitter;