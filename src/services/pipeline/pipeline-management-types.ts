import type { ID, ListQueryOptions } from '@vendure/core';
import type { Pipeline } from '../../entities/pipeline';
import type { PipelineDefinition } from '../../types';
import type { ConfigurationSource } from '../../constants/enums';

export interface CreatePipelineInput {
    code: string;
    name: string;
    enabled?: boolean;
    version?: number;
    definition: PipelineDefinition;
}

export interface UpdatePipelineInput {
    id: ID;
    code?: string;
    name?: string;
    enabled?: boolean;
    version?: number;
    definition?: PipelineDefinition;
}

export interface PipelineWriteOptions {
    readonly configurationSource?: ConfigurationSource;
    readonly allowCodeFirstManaged?: boolean;
}

export interface PipelineCapabilityOperators {
    readonly eq?: string | null;
    readonly notEq?: string | null;
    readonly contains?: string | null;
    readonly notContains?: string | null;
    readonly in?: readonly string[] | null;
    readonly notIn?: readonly string[] | null;
    readonly isNull?: boolean | null;
}

type BasePipelineFilter = Omit<
    NonNullable<ListQueryOptions<Pipeline>['filter']>,
    '_and' | '_or'
>;

export type PipelineFilterParameter = BasePipelineFilter & {
    readonly requiredCapabilities?: PipelineCapabilityOperators | null;
    readonly writeCapabilities?: PipelineCapabilityOperators | null;
    readonly _and?: readonly PipelineFilterParameter[] | null;
    readonly _or?: readonly PipelineFilterParameter[] | null;
};

export type PipelineListOptions = Omit<
    ListQueryOptions<Pipeline>,
    'filter'
> & {
    readonly filter?: PipelineFilterParameter | null;
};
