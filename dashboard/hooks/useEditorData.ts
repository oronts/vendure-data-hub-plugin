import { useAdapters, useSecretCodes, useConnectionCodes } from './api';
import type { DataHubAdapter } from '../types';

export interface EditorDataError {
    source: 'adapters' | 'secrets' | 'connections';
    error: Error;
}

export interface EditorData {
    adapters: DataHubAdapter[];
    secretCodes: string[];
    connectionCodes: string[];
    isLoading: boolean;
    isAdaptersLoading: boolean;
    isSecretsLoading: boolean;
    isConnectionsLoading: boolean;
    errors: EditorDataError[];
    hasError: boolean;
}

export function useEditorData(): EditorData {
    const { data: adapters, isLoading: adaptersLoading, error: adaptersError } = useAdapters();
    const { data: secretCodes, isLoading: secretsLoading, error: secretsError } = useSecretCodes();
    const { data: connectionCodes, isLoading: connectionsLoading, error: connectionsError } = useConnectionCodes();

    const errors: EditorDataError[] = [];
    if (adaptersError) {
        errors.push({ source: 'adapters', error: adaptersError as Error });
    }
    if (secretsError) {
        errors.push({ source: 'secrets', error: secretsError as Error });
    }
    if (connectionsError) {
        errors.push({ source: 'connections', error: connectionsError as Error });
    }

    return {
        adapters: adapters ?? [],
        secretCodes: secretCodes ?? [],
        connectionCodes: connectionCodes ?? [],
        isLoading: adaptersLoading || secretsLoading || connectionsLoading,
        isAdaptersLoading: adaptersLoading,
        isSecretsLoading: secretsLoading,
        isConnectionsLoading: connectionsLoading,
        errors,
        hasError: errors.length > 0,
    };
}
