export class SingleFlightTask<T> {
    private active: Promise<T> | null = null;

    get running(): boolean {
        return this.active !== null;
    }

    run(operation: () => Promise<T>): Promise<T> {
        if (this.active) return this.active;
        const promise = operation();
        this.active = promise;
        void promise.then(
            () => this.clear(promise),
            () => this.clear(promise),
        );
        return promise;
    }

    settle(): Promise<void> {
        return this.active?.then(
            () => undefined,
            () => undefined,
        ) ?? Promise.resolve();
    }

    private clear(promise: Promise<T>): void {
        if (this.active === promise) this.active = null;
    }
}

export class ActiveTaskSet {
    private readonly active = new Set<Promise<unknown>>();

    run<T>(operation: () => Promise<T>): Promise<T> {
        const promise = operation();
        this.active.add(promise);
        void promise.then(
            () => this.active.delete(promise),
            () => this.active.delete(promise),
        );
        return promise;
    }

    async settle(): Promise<void> {
        await Promise.allSettled([...this.active]);
    }
}
