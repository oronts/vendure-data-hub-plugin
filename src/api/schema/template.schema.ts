export const templateSchema = `
    """
    Import template (built-in or custom) for the import wizard
    """
    type DataHubImportTemplate {
        id: String!
        name: String!
        description: String!
        category: String!
        icon: String
        requiredFields: [String!]!
        optionalFields: [String!]
        sampleData: JSON
        featured: Boolean
        tags: [String!]
        formats: [String!]
        definition: JSON
    }

    """
    Export template (built-in or custom) for the export wizard
    """
    type DataHubExportTemplate {
        id: String!
        name: String!
        description: String!
        icon: String
        format: String!
        requiredFields: [String!]
        tags: [String!]
        definition: JSON
    }

    """
    Template category with metadata and template count
    """
    type DataHubTemplateCategory {
        category: String!
        label: String!
        description: String!
        icon: String!
        count: Int!
    }
`;

export const templateQueries = `
    extend type Query {
        """
        List all import templates (built-in + custom)
        """
        dataHubImportTemplates: [DataHubImportTemplate!]!

        """
        List all export templates (built-in + custom)
        """
        dataHubExportTemplates: [DataHubExportTemplate!]!

        """
        List import template categories with metadata and counts
        """
        dataHubImportTemplateCategories: [DataHubTemplateCategory!]!
    }
`;
