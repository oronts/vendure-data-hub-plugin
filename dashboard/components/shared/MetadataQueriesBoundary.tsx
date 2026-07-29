import type { ReactNode } from 'react';
import { getErrorMessage } from '../../../shared';
import { ErrorState, LoadingState } from './feedback';
import {
    getMetadataBoundaryStatus,
    type MetadataQueryState,
} from './metadata-query-state';

interface MetadataQueriesBoundaryProps {
    children: ReactNode;
    loadingMessage: string;
    title: string;
    queries: readonly MetadataQueryState[];
}

export function MetadataQueriesBoundary({
    children,
    loadingMessage,
    title,
    queries,
}: MetadataQueriesBoundaryProps) {
    const status = getMetadataBoundaryStatus(queries);
    if (status.state === 'loading') {
        return <LoadingState message={loadingMessage} />;
    }
    if (status.state === 'error') {
        const message = `${status.query.label}: ${getErrorMessage(status.query.error)}`;
        const error = status.query.error instanceof Error
            ? status.query.error
            : new Error(message);
        const failedQueries = queries.filter(query => query.isError);
        return (
            <ErrorState
                title={title}
                message={message}
                error={error}
                onRetry={() => {
                    void Promise.all(failedQueries.map(query => query.refetch()));
                }}
                className="m-4"
            />
        );
    }
    return children;
}
