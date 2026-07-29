export type TestResultMessage =
    | {
        readonly id: string;
        readonly values?: Record<string, string | number>;
        readonly text?: never;
    }
    | {
        readonly id?: never;
        readonly values?: never;
        readonly text: string;
    };

export interface TestResult {
    status: 'success' | 'error' | 'warning';
    message?: TestResultMessage;
    data?: unknown;
    records?: Array<Record<string, unknown>>;
    beforeAfter?: Array<{
        before: Record<string, unknown>;
        after: Record<string, unknown>;
    }>;
    feedContent?: { content: string; contentType: string; itemCount: number };
    loadSimulation?: Record<string, unknown>;
}
