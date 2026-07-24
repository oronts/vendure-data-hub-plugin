import { ConfigurationSource } from '../../constants/enums';

export class CodeFirstConfigurationError extends Error {
    constructor(resourceType: string, code: string, action: string) {
        super(
            `${resourceType} "${code}" is managed by code-first configuration `
            + `and cannot be ${action} until the definition is removed from deployed configuration`,
        );
        this.name = 'CodeFirstConfigurationError';
    }
}

export function assertDatabaseConfiguration(
    source: ConfigurationSource | undefined,
    resourceType: string,
    code: string,
    action: string,
): void {
    if (source === ConfigurationSource.CODE_FIRST) {
        throw new CodeFirstConfigurationError(resourceType, code, action);
    }
}
