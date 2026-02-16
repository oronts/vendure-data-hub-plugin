import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { POLLING_INTERVALS } from '../../constants';
import type { DataHubLogListOptions } from '../../types';

const logKeys = {
    all: ['logs'] as const,
    lists: () => [...logKeys.all, 'list'] as const,
    list: (options?: DataHubLogListOptions) => [...logKeys.lists(), options] as const,
    stats: (pipelineId?: string) => [...logKeys.all, 'stats', pipelineId] as const,
    recent: (limit?: number) => [...logKeys.all, 'recent', limit] as const,
};

const logsDocument = graphql(`
    query DataHubLogsApi($options: DataHubLogListOptions) {
        dataHubLogs(options: $options) {
            items {
                id
                createdAt
                level
                message
                stepKey
                context
                metadata
                pipelineId
                pipeline {
                    id
                    code
                    name
                }
                runId
                durationMs
                recordsProcessed
                recordsFailed
            }
            totalItems
        }
    }
`);

const logStatsDocument = graphql(`
    query DataHubLogStatsApi($pipelineId: ID) {
        dataHubLogStats(pipelineId: $pipelineId) {
            total
            byLevel {
                DEBUG
                INFO
                WARN
                ERROR
            }
            errorsToday
            warningsToday
            avgDurationMs
        }
    }
`);

const recentLogsDocument = graphql(`
    query DataHubRecentLogsApi($limit: Int) {
        dataHubRecentLogs(limit: $limit) {
            id
            createdAt
            level
            message
            stepKey
            pipelineId
            pipeline {
                id
                code
                name
            }
            runId
            durationMs
            recordsProcessed
            recordsFailed
        }
    }
`);

export function useLogs(options?: DataHubLogListOptions) {
    return useQuery({
        queryKey: logKeys.list(options),
        queryFn: () => api.query(logsDocument, { options }).then((res) => res.dataHubLogs),
    });
}

export function useLogStats(pipelineId?: string) {
    return useQuery({
        queryKey: logKeys.stats(pipelineId),
        queryFn: () => api.query(logStatsDocument, { pipelineId }).then((res) => res.dataHubLogStats),
    });
}

export function useRecentLogs(limit: number = 10, options?: { refetchInterval?: number | false }) {
    return useQuery({
        queryKey: logKeys.recent(limit),
        queryFn: () => api.query(recentLogsDocument, { limit }).then((res) => res.dataHubRecentLogs),
        refetchInterval: options?.refetchInterval ?? POLLING_INTERVALS.LIVE_LOGS,
    });
}
