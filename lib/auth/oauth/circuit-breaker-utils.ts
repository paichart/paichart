/**
 * Circuit Breaker Utility
 * Prevents cascading failures when provider APIs are down
 *
 * States:
 * - CLOSED: Normal operation, requests go through
 * - OPEN: Too many failures, requests blocked for timeout period
 * - HALF_OPEN: Testing if provider recovered, limited requests
 *
 * Part of: Microsoft MCP OAuth Integration (Plan v3.2 - Phase 0.9)
 * Created: 2025-10-14
 */

import { authLogger } from '@/lib/logger';

const localLogger = authLogger.child({ module: 'CircuitBreaker' });

export interface CircuitBreakerConfig {
  failureThreshold: number;    // Open after N failures
  successThreshold: number;    // Close after N successes in HALF_OPEN
  timeout: number;             // ms to wait before HALF_OPEN
  provider: string;            // Provider name for logging
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  get currentState(): CircuitBreakerState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime >= this.config.timeout) {
        localLogger.info({ provider: this.config.provider, from: 'OPEN', to: 'HALF_OPEN' }, 'Circuit breaker state transition (timeout expired)');
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      }
    }

    return this.state;
  }

  recordSuccess(): void {
    const previousState = this.state;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        localLogger.info({ provider: this.config.provider, from: 'HALF_OPEN', to: 'CLOSED', successCount: this.successCount }, 'Circuit breaker state transition');
        this.state = 'CLOSED';
        this.failureCount = 0;
        this.successCount = 0;
      }
    } else if (this.state === 'CLOSED') {
      // Reset failure count on success
      this.failureCount = 0;
    }

    localLogger.debug({ provider: this.config.provider, previousState, currentState: this.state }, 'Circuit breaker success recorded');
  }

  recordFailure(): void {
    const previousState = this.state;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      localLogger.warn({ provider: this.config.provider, from: 'HALF_OPEN', to: 'OPEN' }, 'Circuit breaker failure in HALF_OPEN, transitioning to OPEN');
      this.state = 'OPEN';
      this.successCount = 0;
    } else if (this.state === 'CLOSED') {
      this.failureCount++;
      if (this.failureCount >= this.config.failureThreshold) {
        localLogger.warn({ provider: this.config.provider, failureCount: this.failureCount, failureThreshold: this.config.failureThreshold, from: 'CLOSED', to: 'OPEN' }, 'Circuit breaker failure threshold reached');
        this.state = 'OPEN';
      }
    }

    localLogger.debug({ provider: this.config.provider, previousState, currentState: this.state, failureCount: this.failureCount }, 'Circuit breaker failure recorded');
  }

  getState(): CircuitBreakerState {
    return this.currentState;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  getLastFailureTime(): number {
    return this.lastFailureTime;
  }

  reset(): void {
    localLogger.info({ provider: this.config.provider }, 'Circuit breaker manual reset');
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
  }

  /**
   * Get circuit breaker statistics for monitoring
   */
  getStats(): {
    provider: string;
    state: CircuitBreakerState;
    failures: number;
    lastFailure: Date | null;
  } {
    return {
      provider: this.config.provider,
      state: this.currentState,
      failures: this.failureCount,
      lastFailure: this.lastFailureTime > 0 ? new Date(this.lastFailureTime) : null
    };
  }
}
