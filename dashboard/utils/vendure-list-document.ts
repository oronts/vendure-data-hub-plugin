import type { TypedDocumentNode } from '@graphql-typed-document-node/core';

export interface VendureListOptions {
    skip?: number;
    take?: number;
    sort?: Record<string, 'ASC' | 'DESC'>;
    filter?: unknown;
    filterOperator?: 'AND' | 'OR';
}

type NonNullableListVariables<TVariables extends { options?: unknown }> =
    Omit<TVariables, 'options'> & {
        options?: VendureListOptions;
    };

export function normalizeVendureListOptions(
    options: {
        skip?: number | null;
        take?: number | null;
        sort?: Record<string, 'ASC' | 'DESC' | null | undefined> | null;
        filter?: unknown;
        filterOperator?: string | null;
    } | null | undefined,
): VendureListOptions | undefined {
    if (!options) return undefined;
    const sort = options.sort
        ? Object.fromEntries(
            Object.entries(options.sort).filter(
                (entry): entry is [string, 'ASC' | 'DESC'] =>
                    entry[1] === 'ASC' || entry[1] === 'DESC',
            ),
        )
        : undefined;
    return {
        skip: options.skip ?? undefined,
        take: options.take ?? undefined,
        sort,
        filter: options.filter ?? undefined,
        filterOperator: options.filterOperator === 'AND' || options.filterOperator === 'OR'
            ? options.filterOperator
            : undefined,
    };
}

export function asVendureListDocument<
    TResult,
    TVariables extends { options?: unknown },
>(
    document: TypedDocumentNode<TResult, TVariables>,
): TypedDocumentNode<TResult, NonNullableListVariables<TVariables>> {
    return document as TypedDocumentNode<
        TResult,
        NonNullableListVariables<TVariables>
    >;
}
