export interface LogsRouteSearch {
    runId?: string;
}

export function parseLogsRouteSearch(
    search: Record<string, unknown>,
): LogsRouteSearch {
    const runId = typeof search.runId === 'string'
        ? search.runId.trim()
        : '';
    return runId ? { runId } : {};
}
