import type { CreateDuplicateHandlingConfig } from '../../../../shared/types';

export type { CreateDuplicateHandlingConfig } from '../../../../shared/types';

export function assertCreateDuplicateCanBeSkipped(
    config: CreateDuplicateHandlingConfig,
    entity: string,
    identifier: string,
): void {
    if (config.skipDuplicates === true) {
        return;
    }

    throw new Error(
        `Duplicate ${entity} "${identifier}" during CREATE; set skipDuplicates to true to skip existing records`,
    );
}
