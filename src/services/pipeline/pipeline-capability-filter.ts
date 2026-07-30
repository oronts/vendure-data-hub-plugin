import { LogicalOperator } from '@vendure/common/lib/generated-types';
import type { Pipeline } from '../../entities/pipeline';
import type { AdapterDefinitionRegistry } from './pipeline-capabilities';
import { getEffectivePipelineCapabilities } from './pipeline-capabilities';
import type {
    PipelineCapabilityOperators,
    PipelineFilterParameter,
    PipelineListOptions,
} from './pipeline-management-types';
import { createSafeRegex } from '../../utils/safe-regex.utils';

export interface PipelineCapabilityPredicate {
    readonly field: 'requiredCapabilities' | 'writeCapabilities';
    readonly operators: PipelineCapabilityOperators;
    readonly regex?: RegExp;
}

export interface ExtractedPipelineCapabilityFilters {
    readonly options: PipelineListOptions;
    readonly predicates: readonly PipelineCapabilityPredicate[];
}

function hasCapabilityFilter(filter: PipelineFilterParameter | null | undefined): boolean {
    if (!filter) return false;
    return Boolean(
        filter.requiredCapabilities
        || filter.writeCapabilities
        || filter._and?.some(hasCapabilityFilter)
        || filter._or?.some(hasCapabilityFilter),
    );
}

function removeEmptyBooleanGroups(filter: PipelineFilterParameter): PipelineFilterParameter | undefined {
    const entries = Object.entries(filter).filter(([, value]) => (
        value !== undefined
        && value !== null
        && (!Array.isArray(value) || value.length > 0)
    ));
    return entries.length > 0
        ? Object.fromEntries(entries) as PipelineFilterParameter
        : undefined;
}

function extractFromAndFilter(
    filter: PipelineFilterParameter,
    predicates: PipelineCapabilityPredicate[],
): PipelineFilterParameter | undefined {
    if (filter._or?.some(hasCapabilityFilter)) {
        throw new Error(
            'Capability filters do not support _or; combine them with top-level or _and filters',
        );
    }

    const {
        requiredCapabilities,
        writeCapabilities,
        _and,
        ...standardFields
    } = filter;

    if (requiredCapabilities) {
        predicates.push(createCapabilityPredicate(
            'requiredCapabilities',
            requiredCapabilities,
        ));
    }
    if (writeCapabilities) {
        predicates.push(createCapabilityPredicate(
            'writeCapabilities',
            writeCapabilities,
        ));
    }

    const standardAnd = _and
        ?.map(child => extractFromAndFilter(child, predicates))
        .filter((child): child is PipelineFilterParameter => child !== undefined);

    return removeEmptyBooleanGroups({
        ...standardFields,
        ...(standardAnd?.length ? { _and: standardAnd } : {}),
    });
}

function createCapabilityPredicate(
    field: PipelineCapabilityPredicate['field'],
    operators: PipelineCapabilityOperators,
): PipelineCapabilityPredicate {
    return {
        field,
        operators,
        ...(operators.regex != null
            ? { regex: createSafeRegex(operators.regex) }
            : {}),
    };
}

export function extractPipelineCapabilityFilters(
    options: PipelineListOptions | undefined,
): ExtractedPipelineCapabilityFilters {
    if (!options?.filter || !hasCapabilityFilter(options.filter)) {
        return { options: options ?? {}, predicates: [] };
    }
    if (options.filterOperator === LogicalOperator.OR) {
        throw new Error(
            'Capability filters do not support filterOperator OR; use conjunctive filters',
        );
    }

    const predicates: PipelineCapabilityPredicate[] = [];
    const filter = extractFromAndFilter(options.filter, predicates);
    return {
        options: {
            ...options,
            filter,
        },
        predicates,
    };
}

function matchesOperators(
    values: readonly string[],
    operators: PipelineCapabilityOperators,
    compiledRegex?: RegExp,
): boolean {
    if (operators.eq != null && !values.includes(operators.eq)) return false;
    if (operators.notEq != null && values.includes(operators.notEq)) return false;
    if (
        operators.contains != null
        && !values.some(value => value.includes(operators.contains as string))
    ) return false;
    if (
        operators.notContains != null
        && values.some(value => value.includes(operators.notContains as string))
    ) return false;
    if (operators.in?.length && !operators.in.some(value => values.includes(value))) return false;
    if (operators.notIn?.length && operators.notIn.some(value => values.includes(value))) return false;
    if (
        operators.regex != null
        && !values.some(value => (
            compiledRegex ?? createSafeRegex(operators.regex as string)
        ).test(value))
    ) return false;
    if (operators.isNull === true && values.length > 0) return false;
    if (operators.isNull === false && values.length === 0) return false;
    return true;
}

export function pipelineMatchesCapabilityFilters(
    registry: AdapterDefinitionRegistry,
    pipeline: Pipeline,
    predicates: readonly PipelineCapabilityPredicate[],
): boolean {
    const capabilities = getEffectivePipelineCapabilities(registry, pipeline.definition);
    return predicates.every(predicate => matchesOperators(
        predicate.field === 'requiredCapabilities'
            ? capabilities.requires
            : capabilities.writes,
        predicate.operators,
        predicate.regex,
    ));
}
