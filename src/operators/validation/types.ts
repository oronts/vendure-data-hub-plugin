import { BaseOperatorConfig } from '../types';

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

export interface ValidationError {
    readonly field: string;
    readonly message: string;
    readonly rule: 'required' | 'format' | 'custom';
}
