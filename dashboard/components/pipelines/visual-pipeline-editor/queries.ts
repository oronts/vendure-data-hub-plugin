import { graphql } from '@/gql';

// =============================================================================
// GRAPHQL QUERIES
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

export const feedFormatsQuery = graphql(`
    query DataHubFeedFormatsForEditor {
        dataHubFeedFormats {
            code
            label
            description
        }
    }
`);
