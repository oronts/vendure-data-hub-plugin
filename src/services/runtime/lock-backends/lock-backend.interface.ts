export interface LockState {
    key: string;
    owner: string;
    acquiredAt: string;
    expiresAt: string;
    ttlMs: number;
}

export interface LockStatus {
    locked: boolean;
    owner?: string;
    expiresAt?: string;
}

export interface MemoryLockEntry {
    owner: string;
    expiresAt: number;
    acquiredAt: number;
}

export interface LockBackend {
    readonly name: string;
    acquire(key: string, owner: string, ttlMs: number): Promise<boolean>;
    release(key: string, owner: string): Promise<boolean>;
    extend(key: string, owner: string, ttlMs: number): Promise<boolean>;
    isLocked(key: string): Promise<LockStatus>;
    cleanup(): Promise<number>;
    getActiveLocks?(): Promise<LockState[]>;
    close?(): Promise<void>;
}
