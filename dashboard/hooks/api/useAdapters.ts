import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@vendure/dashboard';
import { graphql } from '../../gql';
import { CACHE_TIMES } from '../../constants';

export const adapterKeys = {
    all: ['adapters'] as const,
    catalog: () => [...adapterKeys.all, 'catalog'] as const,
    byType: (type: string) => [...adapterKeys.all, 'byType', type] as const,
};

const adaptersDocument = graphql(`
    query DataHubAdaptersApi {
        dataHubAdapters {
            type
            code
            name
            description
            category
            schema {
                fields {
                    key
                    label
                    description
                    type
                    required
                    defaultValue
                    placeholder
                    options {
                        value
                        label
                    }
                }
            }
            icon
            color
            pure
            async
            batchable
            requires
        }
    }
`);

export function useAdapters() {
    return useQuery({
        queryKey: adapterKeys.catalog(),
        queryFn: () => api.query(adaptersDocument).then((res) => res.dataHubAdapters),
        staleTime: CACHE_TIMES.ADAPTER_CATALOG,
    });
}

export function useAdaptersByType(type: string) {
    const { data: adapters, ...rest } = useAdapters();
    const filtered = React.useMemo(
        () => adapters?.filter((a) => a.type === type),
        [adapters, type]
    );
    return { ...rest, data: filtered };
}

export function useAdapter(code: string | undefined) {
    const { data: adapters, ...rest } = useAdapters();
    const adapter = React.useMemo(
        () => (code ? adapters?.find((a) => a.code === code) : undefined),
        [adapters, code]
    );
    return { ...rest, data: adapter };
}
