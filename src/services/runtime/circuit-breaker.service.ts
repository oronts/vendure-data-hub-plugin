import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { CircuitBreakerConfig } from '../../types/plugin-options';
import { RuntimeConfigService } from './runtime-config.service';
import { CircuitState } from '../../constants/enums';
import { CIRCUIT_BREAKER } from '../../constants/index';

interface CircuitStats {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime: number;
    lastAccessTime: number;
    failureTimestamps: number[];
}

@Injectable()
export class CircuitBreakerService implements OnModuleDestroy {
    private circuits: Map<string, CircuitStats> = new Map();
    private config: Required<CircuitBreakerConfig>;
    private cleanupInterval: NodeJS.Timeout | null = null;

    constructor(private readonly runtimeConfig: RuntimeConfigService) {
        this.config = this.runtimeConfig.getCircuitBreakerConfig();
        this.cleanupInterval = setInterval(() => this.cleanupIdleCircuits(), CIRCUIT_BREAKER.CLEANUP_INTERVAL_MS);
    }

    onModuleDestroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    private cleanupIdleCircuits(): void {
        const now = Date.now();
        const cutoff = now - CIRCUIT_BREAKER.IDLE_TIMEOUT_MS;

        for (const [key, circuit] of this.circuits.entries()) {
            if (circuit.lastAccessTime < cutoff && circuit.state === CircuitState.CLOSED && circuit.failures === 0) {
                this.circuits.delete(key);
            }
        }

        if (this.circuits.size > CIRCUIT_BREAKER.MAX_CIRCUITS) {
            const entries = Array.from(this.circuits.entries())
                .sort((a, b) => a[1].lastAccessTime - b[1].lastAccessTime);
            const toRemove = entries.slice(0, this.circuits.size - CIRCUIT_BREAKER.MAX_CIRCUITS);
            for (const [key] of toRemove) {
                this.circuits.delete(key);
            }
        }
    }

    private getCircuit(key: string): CircuitStats {
        const now = Date.now();
        let circuit = this.circuits.get(key);
        if (!circuit) {
            circuit = {
                state: CircuitState.CLOSED,
                failures: 0,
                successes: 0,
                lastFailureTime: 0,
                lastAccessTime: now,
                failureTimestamps: [],
            };
            this.circuits.set(key, circuit);
        }
        circuit.lastAccessTime = now;
        return circuit;
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

        if (circuit.state === CircuitState.OPEN) {
            const timeSinceLastFailure = Date.now() - circuit.lastFailureTime;
            if (timeSinceLastFailure >= this.config.resetTimeoutMs) {
                circuit.state = CircuitState.HALF_OPEN;
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

        if (circuit.state === CircuitState.HALF_OPEN) {
            circuit.successes++;
            if (circuit.successes >= this.config.successThreshold) {
                circuit.state = CircuitState.CLOSED;
                circuit.failures = 0;
                circuit.successes = 0;
                circuit.failureTimestamps = [];
            }
        } else if (circuit.state === CircuitState.CLOSED) {
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

        if (circuit.state === CircuitState.HALF_OPEN) {
            circuit.state = CircuitState.OPEN;
            circuit.successes = 0;
        } else if (circuit.state === CircuitState.CLOSED && circuit.failures >= this.config.failureThreshold) {
            circuit.state = CircuitState.OPEN;
        }
    }

    getState(key: string): CircuitState {
        const circuit = this.getCircuit(key);
        this.cleanOldFailures(circuit);

        if (circuit.state === CircuitState.OPEN) {
            const timeSinceLastFailure = Date.now() - circuit.lastFailureTime;
            if (timeSinceLastFailure >= this.config.resetTimeoutMs) {
                return CircuitState.HALF_OPEN;
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
