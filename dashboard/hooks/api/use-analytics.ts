import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createQueryKeys } from '../../utils/query-key-factory';

const base = createQueryKeys('analytics');

export const analyticsKeys = {
    ...base,
    overview: () => [...base.all, 'overview'] as const,
};

const analyticsOverviewDocument = graphql(`
    query DataHubAnalyticsOverviewApi {
        dataHubAnalyticsOverview {
            totalPipelines
            enabledPipelines
            runsToday
            runsThisWeek
            successRateToday
            successRateWeek
            recordsProcessedToday
            recordsFailedToday
            avgDurationMsToday
        }
    }
`);

export function useAnalyticsOverview(enabled = true) {
    return useQuery({
        queryKey: analyticsKeys.overview(),
        queryFn: () => api.query(analyticsOverviewDocument).then(response => response.dataHubAnalyticsOverview),
        enabled,
    });
}
