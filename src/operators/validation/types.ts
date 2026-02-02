import { BaseOperatorConfig } from '../types';

export { ValidationError } from '../../types/index';

export interface ValidateRequiredOperatorConfig extends BaseOperatorConfig {
    readonly fields: string[];
    readonly errorField?: string;
}

export interface ValidateFormatOperatorConfig extends BaseOperatorConfig {
    readonly field: string;
    readonly pattern: string;
    readonly errorField?: string;
    readonly errorMessage?: string;
}
