export interface FailedRun {
    id: string;
    code: string;
    finishedAt?: string | null;
    error?: string | null;
}

export interface DeadLetter {
    id: string;
    stepKey: string;
    message: string;
    payload: unknown;
}

export interface Consumer {
    pipelineCode: string;
    queueName: string;
    isActive: boolean;
    messagesProcessed: number;
    messagesFailed: number;
    lastMessageAt?: string | null;
}
