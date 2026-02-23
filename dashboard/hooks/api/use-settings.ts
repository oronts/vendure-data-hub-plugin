import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createMutationErrorHandler, createMutationSuccessHandler } from './mutation-helpers';
import { createQueryKeys } from '../../utils/query-key-factory';
import type { DataHubSettingsInput } from '../../types';

const base = createQueryKeys('settings');
const settingsKeys = {
    all: base.all,
    detail: base.details,
};

const settingsDocument = graphql(`
    query DataHubSettingsApi {
        dataHubSettings {
            retentionDaysRuns
            retentionDaysErrors
            retentionDaysLogs
            logPersistenceLevel
        }
    }
`);

const setSettingsDocument = graphql(`
    mutation UpdateDataHubSettingsApi($input: DataHubSettingsInput!) {
        updateDataHubSettings(input: $input) {
            retentionDaysRuns
            retentionDaysErrors
            retentionDaysLogs
            logPersistenceLevel
        }
    }
`);

export function useSettings() {
    return useQuery({
        queryKey: settingsKeys.detail(),
        queryFn: () => api.query(settingsDocument).then((res) => res.dataHubSettings),
    });
}

export function useUpdateSettings() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: DataHubSettingsInput) =>
            api.mutate(setSettingsDocument, { input }).then((res) => res.updateDataHubSettings),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: settingsKeys.detail() });
            createMutationSuccessHandler('Settings updated')();
        },
        onError: createMutationErrorHandler('update settings'),
    });
}
