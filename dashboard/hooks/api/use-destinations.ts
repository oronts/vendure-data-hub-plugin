import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, useChannel } from '@vendure/dashboard';
import { graphql } from '../../gql';
import type { DataHubExportDestinationInput } from '../../gql/graphql';
import { createQueryKeys } from '../../utils/query-key-factory';

const base = createQueryKeys('export-destinations');
export const destinationKeys = {
    ...base,
    list: (channelId: string) => [...base.lists(), channelId] as const,
};

export const exportDestinationsDocument = graphql(`
    query DataHubManagedExportDestinationsApi {
        dataHubExportDestinations {
            id
            name
            type
            enabled
        }
    }
`);

export const registerExportDestinationDocument = graphql(`
    mutation RegisterDataHubExportDestinationApi($input: DataHubExportDestinationInput!) {
        dataHubRegisterExportDestination(input: $input) {
            success
            id
        }
    }
`);

export const deleteExportDestinationDocument = graphql(`
    mutation DeleteDataHubExportDestinationApi($id: String!) {
        dataHubDeleteExportDestination(id: $id) {
            result
            message
        }
    }
`);

export const testExportDestinationDocument = graphql(`
    mutation TestDataHubExportDestinationApi($id: String!) {
        dataHubTestExportDestination(id: $id) {
            success
            message
            latencyMs
        }
    }
`);

export function useExportDestinations() {
    const { activeChannel } = useChannel();
    const channelId = activeChannel ? String(activeChannel.id) : '';

    return useQuery({
        queryKey: destinationKeys.list(channelId),
        queryFn: () => api
            .query(exportDestinationsDocument)
            .then(response => response.dataHubExportDestinations),
        enabled: channelId.length > 0,
    });
}

export function useRegisterExportDestination() {
    const queryClient = useQueryClient();
    const { activeChannel } = useChannel();
    const channelId = activeChannel ? String(activeChannel.id) : '';

    return useMutation({
        mutationFn: (input: DataHubExportDestinationInput) => api
            .mutate(registerExportDestinationDocument, { input })
            .then(response => response.dataHubRegisterExportDestination),
        onSuccess: () => queryClient.invalidateQueries({
            queryKey: destinationKeys.list(channelId),
        }),
    });
}

export function useDeleteExportDestination() {
    const queryClient = useQueryClient();
    const { activeChannel } = useChannel();
    const channelId = activeChannel ? String(activeChannel.id) : '';

    return useMutation({
        mutationFn: (id: string) => api
            .mutate(deleteExportDestinationDocument, { id })
            .then(response => response.dataHubDeleteExportDestination),
        onSuccess: () => queryClient.invalidateQueries({
            queryKey: destinationKeys.list(channelId),
        }),
    });
}

export function useTestExportDestination() {
    return useMutation({
        mutationFn: (id: string) => api
            .mutate(testExportDestinationDocument, { id })
            .then(response => response.dataHubTestExportDestination),
    });
}
