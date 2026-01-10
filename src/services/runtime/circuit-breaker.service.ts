import { Injectable } from '@nestjs/common';
import { CircuitBreakerConfig } from '../../types/plugin-options';
import { RuntimeConfigService } from './runtime-config.service';

export type CircuitState = 'closed' | 'open' | 'half-open';

interface CircuitStats {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime: number;
    failureTimestamps: number[];
}

@Injectable()
export class CircuitBreakerService {
    private circuits: Map<string, CircuitStats> = new Map();
    private config: Required<CircuitBreakerConfig>;

    constructor(private readonly runtimeConfig: RuntimeConfigService) {
        this.config = this.runtimeConfig.getCircuitBreakerConfig();
    }

    private getCircuit(key: string): CircuitStats {
        if (!this.circuits.has(key)) {
            this.circuits.set(key, {
                state: 'closed',
                failures: 0,
                successes: 0,
                lastFailureTime: 0,
                failureTimestamps: [],
            });
        }
        return this.circuits.get(key)!;
    }

    private cleanOldFailures(circuit: CircuitStats): void {
        const now = Date.now();
        const windowStart = now - this.config.failureWindowMs;
        circuit.failureTimestamps = circuit.failureTimestamps.filter(ts => ts > windowStart);
        circuit.failures = circuit.failureTimestamps.length;
    }

    isOpen(key: string): boolean {
        if (!this.config.enabled) return false;

        const circuit = this.getCircuit(key);
        this.cleanOldFailures(circuit);

        if (circuit.state === 'open') {
            const timeSinceLastFailure = Date.now() - circuit.lastFailureTime;
            if (timeSinceLastFailure >= this.config.resetTimeoutMs) {
                circuit.state = 'half-open';
                circuit.successes = 0;
                return false;
            }
            return true;
        }

        return false;
    }

    canExecute(key: string): boolean {
        return !this.isOpen(key);
    }

    recordSuccess(key: string): void {
        if (!this.config.enabled) return;

        const circuit = this.getCircuit(key);

        if (circuit.state === 'half-open') {
            circuit.successes++;
            if (circuit.successes >= this.config.successThreshold) {
                circuit.state = 'closed';
                circuit.failures = 0;
                circuit.successes = 0;
                circuit.failureTimestamps = [];
            }
        } else if (circuit.state === 'closed') {
            circuit.successes++;
        }
    }

    recordFailure(key: string): void {
        if (!this.config.enabled) return;

        const circuit = this.getCircuit(key);
        const now = Date.now();

        circuit.failureTimestamps.push(now);
        circuit.lastFailureTime = now;
        this.cleanOldFailures(circuit);

        if (circuit.state === 'half-open') {
            circuit.state = 'open';
            circuit.successes = 0;
        } else if (circuit.state === 'closed' && circuit.failures >= this.config.failureThreshold) {
            circuit.state = 'open';
        }
    }

    getState(key: string): CircuitState {
        const circuit = this.getCircuit(key);
        this.cleanOldFailures(circuit);

        if (circuit.state === 'open') {
            const timeSinceLastFailure = Date.now() - circuit.lastFailureTime;
            if (timeSinceLastFailure >= this.config.resetTimeoutMs) {
                return 'half-open';
            }
        }

        return circuit.state;
    }

    getStats(key: string): { state: CircuitState; failures: number; successes: number } {
        const circuit = this.getCircuit(key);
        this.cleanOldFailures(circuit);
        return {
            state: this.getState(key),
            failures: circuit.failures,
            successes: circuit.successes,
        };
    }

    reset(key: string): void {
        this.circuits.delete(key);
    }

    resetAll(): void {
        this.circuits.clear();
    }

    async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
        if (!this.canExecute(key)) {
            throw new CircuitOpenError(`Circuit breaker is open for: ${key}`);
        }

        try {
            const result = await fn();
            this.recordSuccess(key);
            return result;
        } catch (error) {
            this.recordFailure(key);
            throw error;
        }
    }
}

export class CircuitOpenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CircuitOpenError';
    }
}
