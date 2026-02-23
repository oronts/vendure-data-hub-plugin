import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { createQueryKeys } from '../../utils/query-key-factory';
import { CACHE_TIMES } from '../../constants';

const base = createQueryKeys('entity-loaders');
const entityLoaderKeys = {
    ...base,
    supported: () => [...base.all, 'supported'] as const,
};

const supportedEntitiesDocument = graphql(`
    query DataHubSupportedEntitiesApi {
        dataHubSupportedEntities {
            code
            name
            description
            supportedOperations
            adapterCode
        }
    }
`);

export function useEntityLoaders() {
    const { data: entities, ...rest } = useQuery({
        queryKey: entityLoaderKeys.supported(),
        queryFn: () => api.query(supportedEntitiesDocument).then(res => res.dataHubSupportedEntities),
        staleTime: CACHE_TIMES.ADAPTER_CATALOG,
    });

    const getLoaderAdapterCode = useCallback(
        (entityType: string): string | undefined => {
            return entities?.find(e => e.code === entityType)?.adapterCode;
        },
        [entities],
    );

    return {
        ...rest,
        entities: entities ?? [],
        getLoaderAdapterCode,
    };
}
