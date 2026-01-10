/**
 * Re-export GraphQL utilities from @vendure/dashboard
 *
 * This provides the `graphql` tagged template literal function
 * for writing GraphQL queries and mutations.
 */
export { graphql } from '@vendure/dashboard';

// Re-export fragment types for type safety
export type { FragmentType, ResultOf, VariablesOf } from '@vendure/dashboard';
