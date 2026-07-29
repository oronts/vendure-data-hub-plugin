import type { PipelineDefinition } from '../types';
import { collectResourceReferences } from '../../shared/utils/resource-references';
import { DATAHUB_PERMISSIONS } from '../constants/permissions';

export interface PipelineWorkflowPermissions {
    update: string;
    review: string;
    publish: string;
}

export function getPipelineExecutionPermissions(
    definition: PipelineDefinition | undefined,
    runPermission: string,
): string[] {
    const required = new Set([
        runPermission,
        ...(definition?.capabilities?.requires ?? []),
    ]);
    const references = collectResourceReferences(definition);
    if (references.connections.size > 0) {
        required.add(DATAHUB_PERMISSIONS.USE_CONNECTION);
        required.add(DATAHUB_PERMISSIONS.USE_SECRET);
    }
    if (references.secrets.size > 0) {
        required.add(DATAHUB_PERMISSIONS.USE_SECRET);
    }
    return [...required].sort();
}

export function getPipelineWorkflowPermission(
    status: string | undefined,
    permissions: PipelineWorkflowPermissions,
): string | undefined {
    switch (status) {
        case 'DRAFT':
            return permissions.update;
        case 'REVIEW':
            return permissions.review;
        case 'PUBLISHED':
            return permissions.publish;
        default:
            return undefined;
    }
}
