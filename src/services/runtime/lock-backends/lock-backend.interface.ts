/**
 * Lock state for monitoring
 */
export interface LockState {
    key: string;
    owner: string;
    acquiredAt: string;
    expiresAt: string;
    ttlMs: number;
}

/**
 * Lock status check result
 */
export interface LockStatus {
    locked: boolean;
    owner?: string;
    expiresAt?: string;
}

/**
 * In-memory lock entry structure
 */
export interface MemoryLockEntry {
    owner: string;
    expiresAt: number;
    acquiredAt: number;
}

/**
 * Backend provider interface for distributed locks
 *
 * All lock backends must implement this interface to be used
 * with the DistributedLockService.
 */
export interface LockBackend {
    /** Backend name for identification and logging */
    readonly name: string;

    /**
     * Acquire a lock
     * @param key - Unique lock key
     * @param owner - Owner identifier (token)
     * @param ttlMs - Time-to-live in milliseconds
     * @returns Whether the lock was successfully acquired
     */
    acquire(key: string, owner: string, ttlMs: number): Promise<boolean>;

    /**
     * Release a lock
     * @param key - Lock key
     * @param owner - Owner identifier (must match the one used to acquire)
     * @returns Whether the lock was successfully released
     */
    release(key: string, owner: string): Promise<boolean>;

    /**
     * Extend a lock's TTL
     * @param key - Lock key
     * @param owner - Owner identifier (must match the one used to acquire)
     * @param ttlMs - New time-to-live in milliseconds
     * @returns Whether the lock was successfully extended
     */
    extend(key: string, owner: string, ttlMs: number): Promise<boolean>;

    /**
     * Check if a key is locked
     * @param key - Lock key
     * @returns Lock status including owner and expiration if locked
     */
    isLocked(key: string): Promise<LockStatus>;

    /**
     * Clean up expired locks
     * @returns Number of locks cleaned up
     */
    cleanup(): Promise<number>;

    /**
     * Get all active locks (for monitoring)
     * @returns Array of active lock states
     */
    getActiveLocks?(): Promise<LockState[]>;

    /**
     * Close the backend and release resources
     */
    close?(): Promise<void>;
}
