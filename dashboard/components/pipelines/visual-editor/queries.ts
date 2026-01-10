/**
 * Visual Pipeline Editor GraphQL Queries
 */

import { graphql } from '@/gql';

// =============================================================================
// ADAPTERS QUERY
// =============================================================================

export const adaptersQuery = graphql(`
    query DataHubAdaptersForVisualEditor {
        dataHubAdapters {
            type
            code
            name
            description
            category
            schema {
                fields {
                    key
                    label
                    description
                    type
                    required
                    options { value label }
                }
            }
            icon
            color
            pure
            async
            batchable
        }
    }
`);

// =============================================================================
// VENDURE SCHEMAS QUERY
// =============================================================================

export const vendureSchemasQuery = graphql(`
    query DataHubVendureSchemasForEditor {
        dataHubVendureSchemas {
            entity
            label
            description
            fields {
                key
                type
                required
                readonly
                description
            }
            lookupFields
            importable
            exportable
        }
    }
`);

// =============================================================================
// FEED FORMATS QUERY
// =============================================================================

export const feedFormatsQuery = graphql(`
    query DataHubFeedFormatsForEditor {
        dataHubFeedFormats {
            code
            label
            description
        }
    }
`);
