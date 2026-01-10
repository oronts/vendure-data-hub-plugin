import { BaseOperatorConfig } from '../types';

export interface ParseJsonOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target?: string;
}

export interface StringifyJsonOperatorConfig extends BaseOperatorConfig {
    readonly source: string;
    readonly target?: string;
    readonly pretty?: boolean;
}

export interface PickOperatorConfig extends BaseOperatorConfig {
    readonly fields: string[];
}

export interface OmitOperatorConfig extends BaseOperatorConfig {
    readonly fields: string[];
}
