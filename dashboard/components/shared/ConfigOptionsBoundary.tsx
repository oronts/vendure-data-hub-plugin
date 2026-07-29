import type { ReactNode } from 'react';
import { useLingui } from '@lingui/react/macro';
import { getErrorMessage } from '../../../shared';
import { useConfigOptions } from '../../hooks/api/use-config-options';
import { ErrorState, LoadingState } from './feedback';

export interface ConfigOptionsBoundaryProps {
    children: ReactNode;
}

export function ConfigOptionsBoundary({ children }: ConfigOptionsBoundaryProps) {
    const { t } = useLingui();
    const options = useConfigOptions();

    if (options.isPending) {
        return <LoadingState message={t`Loading Data Hub configuration...`} />;
    }

    if (options.isError) {
        const message = getErrorMessage(options.error);
        const error = options.error instanceof Error
            ? options.error
            : new Error(message);

        return (
            <ErrorState
                title={t`Data Hub configuration unavailable`}
                message={message}
                error={error}
                onRetry={() => void options.refetch()}
                className="m-4"
            />
        );
    }

    return children;
}
