import { graphql } from '../../gql';

export const configOptionsDocument = graphql(`
    query DataHubConfigOptionsApi {
        dataHubConfigOptions {
            stepTypes { type label description icon color bgColor borderColor inputs outputs category adapterType nodeType }
            loadStrategies { value label description icon }
            conflictStrategies { value label description icon }
            triggerTypes { value label description icon fields { key label type required placeholder defaultValue description min max options { value label } optionsRef } defaultValues configKeyMap wizardScopes }
            fileEncodings { value label description icon }
            csvDelimiters { value label description icon }
            httpMethods { value label description icon }
            authTypes { value label description icon }
            destinationTypes { value label description icon }
            fileFormats {
                value
                label
                description
                extensions
                mimeTypes
                supportsPreview
                requiresClientParser
                parseable
            }
            validationModes { value label description icon }
            validationStrictnesses { value label description icon }
            channelStrategies { value label description icon }
            queueTypes { value label description icon }
            vendureEvents { value label description icon category }
            comparisonOperators { value label description valueType noValue example }
            approvalTypes { value label description icon fields { key label type required placeholder defaultValue description min max options { value label } } defaultValues }
            backoffStrategies { value label description icon }
            enrichmentSourceTypes { value label description icon fields { key label type required placeholder defaultValue description options { value label } } defaultValues }
            validationRuleTypes { value label description icon fields { key label type required placeholder defaultValue description options { value label } } defaultValues }
            exportAdapterCodes { value label adapterCode }
            feedAdapterCodes { value label adapterCode }
            connectionSchemas {
                type
                label
                fields { key label type required placeholder defaultValue description min max options { value label } }
                httpLike
            }
            destinationSchemas {
                type
                label
                configKey
                message
                fieldMapping
                fields { key label type required placeholder defaultValue description options { value label } }
            }
            hookStages { key label description icon category }
            hookStageCategories { key label color description gridClass order }
            logLevels { value label description icon }
            parallelErrorPolicies { value label description icon }
            logPersistenceLevels { value label description icon }
            adapterTypes { value label description icon }
            runStatuses { value label description icon }
            fieldTransformTypes { value label description icon category }
            wizardStrategyMappings { wizardValue label loadStrategy conflictStrategy }
            queryTypeOptions { value label description icon }
            cronPresets { value label description icon }
            ackModes { value label description icon }
        }
    }
`);
