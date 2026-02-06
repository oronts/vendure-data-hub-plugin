/**
 * Type definitions for e2e test data structures.
 * These interfaces represent GraphQL query response shapes.
 */

/**
 * Pipeline list item from dataHubPipelines query
 */
export interface PipelineListItem {
    id: string;
    code: string;
    name: string;
    status: string;
}

/**
 * Adapter list item from dataHubAdapters query
 */
export interface AdapterListItem {
    type: string;
    code: string;
    name: string;
}

/**
 * Secret list item from dataHubSecrets query
 */
export interface SecretListItem {
    id: string;
    code: string;
    provider?: string;
}

/**
 * Connection list item from dataHubConnections query
 */
export interface ConnectionListItem {
    id: string;
    code: string;
    type: string;
}

/**
 * Validation issue from validateDataHubPipelineDefinition mutation
 */
export interface ValidationIssue {
    message: string;
    reason?: string;
    stepKey?: string;
    field?: string;
}
