/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n    query DataHubAdaptersApi {\n        dataHubAdapters {\n            type\n            code\n            name\n            description\n            category\n            schema {\n                fields {\n                    key\n                    label\n                    description\n                    type\n                    required\n                    defaultValue\n                    placeholder\n                    options {\n                        value\n                        label\n                    }\n                }\n            }\n            icon\n            color\n            pure\n            async\n            batchable\n            requires\n        }\n    }\n": typeof types.DataHubAdaptersApiDocument,
    "\n    query DataHubConnectionsForList($options: DataHubConnectionListOptions) {\n        dataHubConnections(options: $options) {\n            items {\n                id\n                code\n                type\n            }\n            totalItems\n        }\n    }\n": typeof types.DataHubConnectionsForListDocument,
    "\n    query DataHubConnectionDetailApi($id: ID!) {\n        dataHubConnection(id: $id) {\n            id\n            code\n            type\n            config\n        }\n    }\n": typeof types.DataHubConnectionDetailApiDocument,
    "\n    mutation CreateDataHubConnectionApi($input: CreateDataHubConnectionInput!) {\n        createDataHubConnection(input: $input) {\n            id\n            code\n        }\n    }\n": typeof types.CreateDataHubConnectionApiDocument,
    "\n    mutation UpdateDataHubConnectionApi($input: UpdateDataHubConnectionInput!) {\n        updateDataHubConnection(input: $input) {\n            id\n            code\n        }\n    }\n": typeof types.UpdateDataHubConnectionApiDocument,
    "\n    mutation DeleteDataHubConnectionApi($id: ID!) {\n        deleteDataHubConnection(id: $id) {\n            result\n        }\n    }\n": typeof types.DeleteDataHubConnectionApiDocument,
    "\n    query DataHubPipelineHooksApi($pipelineId: ID!) {\n        dataHubPipelineHooks(pipelineId: $pipelineId)\n    }\n": typeof types.DataHubPipelineHooksApiDocument,
    "\n    mutation RunDataHubHookTestApi($pipelineId: ID!, $stage: String!, $payload: JSON) {\n        runDataHubHookTest(pipelineId: $pipelineId, stage: $stage, payload: $payload)\n    }\n": typeof types.RunDataHubHookTestApiDocument,
    "\n    query DataHubEventsApi($limit: Int) {\n        dataHubEvents(limit: $limit) {\n            name\n            createdAt\n            payload\n        }\n    }\n": typeof types.DataHubEventsApiDocument,
    "\n    query DataHubLogsApi($options: DataHubLogListOptions) {\n        dataHubLogs(options: $options) {\n            items {\n                id\n                createdAt\n                level\n                message\n                stepKey\n                context\n                metadata\n                pipelineId\n                runId\n                durationMs\n                recordsProcessed\n                recordsFailed\n            }\n            totalItems\n        }\n    }\n": typeof types.DataHubLogsApiDocument,
    "\n    query DataHubLogStatsApi($pipelineId: ID) {\n        dataHubLogStats(pipelineId: $pipelineId) {\n            total\n            byLevel {\n                DEBUG\n                INFO\n                WARN\n                ERROR\n            }\n            errorsToday\n            warningsToday\n            avgDurationMs\n        }\n    }\n": typeof types.DataHubLogStatsApiDocument,
    "\n    query DataHubRecentLogsApi($limit: Int) {\n        dataHubRecentLogs(limit: $limit) {\n            id\n            createdAt\n            level\n            message\n            stepKey\n            pipelineId\n            runId\n            durationMs\n            recordsProcessed\n            recordsFailed\n        }\n    }\n": typeof types.DataHubRecentLogsApiDocument,
    "\n    query DataHubPipelineRunsApi($pipelineId: ID, $options: DataHubPipelineRunListOptions) {\n        dataHubPipelineRuns(pipelineId: $pipelineId, options: $options) {\n            items {\n                id\n                status\n                startedAt\n                finishedAt\n                metrics\n            }\n            totalItems\n        }\n    }\n": typeof types.DataHubPipelineRunsApiDocument,
    "\n    query DataHubPipelineRunDetailApi($id: ID!) {\n        dataHubPipelineRun(id: $id) {\n            id\n            status\n            startedAt\n            finishedAt\n            metrics\n            error\n            startedByUserId\n            pipeline {\n                id\n                code\n                name\n            }\n        }\n    }\n": typeof types.DataHubPipelineRunDetailApiDocument,
    "\n    query DataHubRunErrorsApi($runId: ID!) {\n        dataHubRunErrors(runId: $runId) {\n            id\n            stepKey\n            message\n            payload\n        }\n    }\n": typeof types.DataHubRunErrorsApiDocument,
    "\n    mutation CancelDataHubPipelineRunApi($id: ID!) {\n        cancelDataHubPipelineRun(id: $id) {\n            id\n            status\n        }\n    }\n": typeof types.CancelDataHubPipelineRunApiDocument,
    "\n    mutation RetryDataHubRecordApi($errorId: ID!, $patch: JSON) {\n        retryDataHubRecord(errorId: $errorId, patch: $patch)\n    }\n": typeof types.RetryDataHubRecordApiDocument,
    "\n    query DataHubRecordRetryAuditsApi($errorId: ID!) {\n        dataHubRecordRetryAudits(errorId: $errorId) {\n            id\n            createdAt\n            userId\n            previousPayload\n            patch\n            resultingPayload\n        }\n    }\n": typeof types.DataHubRecordRetryAuditsApiDocument,
    "\n    query DataHubPipelinesForList($options: DataHubPipelineListOptions) {\n        dataHubPipelines(options: $options) {\n            items {\n                id\n                code\n                name\n                enabled\n                status\n                updatedAt\n            }\n            totalItems\n        }\n    }\n": typeof types.DataHubPipelinesForListDocument,
    "\n    query DataHubPipelineDetail($id: ID!) {\n        dataHubPipeline(id: $id) {\n            id\n            createdAt\n            updatedAt\n            code\n            name\n            enabled\n            status\n            version\n            publishedAt\n            definition\n        }\n    }\n": typeof types.DataHubPipelineDetailDocument,
    "\n    mutation CreateDataHubPipelineApi($input: CreateDataHubPipelineInput!) {\n        createDataHubPipeline(input: $input) {\n            id\n            code\n            name\n        }\n    }\n": typeof types.CreateDataHubPipelineApiDocument,
    "\n    mutation UpdateDataHubPipelineApi($input: UpdateDataHubPipelineInput!) {\n        updateDataHubPipeline(input: $input) {\n            id\n            code\n            name\n        }\n    }\n": typeof types.UpdateDataHubPipelineApiDocument,
    "\n    mutation DeleteDataHubPipelineApi($id: ID!) {\n        deleteDataHubPipeline(id: $id) {\n            result\n        }\n    }\n": typeof types.DeleteDataHubPipelineApiDocument,
    "\n    mutation RunDataHubPipelineApi($pipelineId: ID!) {\n        startDataHubPipelineRun(pipelineId: $pipelineId) {\n            id\n            status\n        }\n    }\n": typeof types.RunDataHubPipelineApiDocument,
    "\n    query ValidateDataHubPipelineDefinitionApi($definition: JSON!, $level: String) {\n        validateDataHubPipelineDefinition(definition: $definition, level: $level) {\n            isValid\n            issues {\n                message\n                stepKey\n                reason\n                field\n            }\n            warnings {\n                message\n                stepKey\n                reason\n                field\n            }\n            level\n        }\n    }\n": typeof types.ValidateDataHubPipelineDefinitionApiDocument,
    "\n    mutation DryRunDataHubPipelineApi($pipelineId: ID!) {\n        startDataHubPipelineDryRun(pipelineId: $pipelineId) {\n            metrics\n            notes\n            sampleRecords { step before after }\n        }\n    }\n": typeof types.DryRunDataHubPipelineApiDocument,
    "\n    query DataHubPipelineTimelineApi($pipelineId: ID!, $limit: Int) {\n        dataHubPipelineTimeline(pipelineId: $pipelineId, limit: $limit) {\n            revision {\n                id\n                createdAt\n                version\n                type\n                commitMessage\n                authorName\n                changesSummary\n                isLatest\n                isCurrent\n            }\n            runCount\n            lastRunAt\n            lastRunStatus\n        }\n    }\n": typeof types.DataHubPipelineTimelineApiDocument,
    "\n    mutation SubmitDataHubPipelineForReviewApi($id: ID!) {\n        submitDataHubPipelineForReview(id: $id) {\n            id\n            status\n        }\n    }\n": typeof types.SubmitDataHubPipelineForReviewApiDocument,
    "\n    mutation ApproveDataHubPipelineApi($id: ID!) {\n        approveDataHubPipeline(id: $id) {\n            id\n            status\n        }\n    }\n": typeof types.ApproveDataHubPipelineApiDocument,
    "\n    mutation RejectDataHubPipelineReviewApi($id: ID!) {\n        rejectDataHubPipelineReview(id: $id) {\n            id\n            status\n        }\n    }\n": typeof types.RejectDataHubPipelineReviewApiDocument,
    "\n    mutation PublishDataHubPipelineApi($id: ID!) {\n        publishDataHubPipeline(id: $id) {\n            id\n            status\n            publishedAt\n        }\n    }\n": typeof types.PublishDataHubPipelineApiDocument,
    "\n    mutation ArchiveDataHubPipelineApi($id: ID!) {\n        archiveDataHubPipeline(id: $id) {\n            id\n            status\n        }\n    }\n": typeof types.ArchiveDataHubPipelineApiDocument,
    "\n    query DataHubQueueStatsApi {\n        dataHubQueueStats {\n            pending\n            running\n            failed\n            completedToday\n            byPipeline {\n                code\n                pending\n                running\n            }\n            recentFailed {\n                id\n                code\n                finishedAt\n                error\n            }\n        }\n    }\n": typeof types.DataHubQueueStatsApiDocument,
    "\n    query DataHubDeadLettersApi {\n        dataHubDeadLetters {\n            id\n            stepKey\n            message\n            payload\n        }\n    }\n": typeof types.DataHubDeadLettersApiDocument,
    "\n    query DataHubConsumersApi {\n        dataHubConsumers {\n            pipelineCode\n            queueName\n            isActive\n            messagesProcessed\n            messagesFailed\n            lastMessageAt\n        }\n    }\n": typeof types.DataHubConsumersApiDocument,
    "\n    mutation StartDataHubConsumerApi($pipelineCode: String!) {\n        startDataHubConsumer(pipelineCode: $pipelineCode)\n    }\n": typeof types.StartDataHubConsumerApiDocument,
    "\n    mutation StopDataHubConsumerApi($pipelineCode: String!) {\n        stopDataHubConsumer(pipelineCode: $pipelineCode)\n    }\n": typeof types.StopDataHubConsumerApiDocument,
    "\n    mutation MarkDataHubDeadLetterApi($id: ID!, $deadLetter: Boolean!) {\n        markDataHubDeadLetter(id: $id, deadLetter: $deadLetter)\n    }\n": typeof types.MarkDataHubDeadLetterApiDocument,
    "\n    query DataHubSecretsForList($options: DataHubSecretListOptions) {\n        dataHubSecrets(options: $options) {\n            items {\n                id\n                code\n                provider\n            }\n            totalItems\n        }\n    }\n": typeof types.DataHubSecretsForListDocument,
    "\n    query DataHubSecretDetailApi($id: ID!) {\n        dataHubSecret(id: $id) {\n            id\n            code\n            provider\n            value\n            metadata\n        }\n    }\n": typeof types.DataHubSecretDetailApiDocument,
    "\n    mutation CreateDataHubSecretApi($input: CreateDataHubSecretInput!) {\n        createDataHubSecret(input: $input) {\n            id\n            code\n        }\n    }\n": typeof types.CreateDataHubSecretApiDocument,
    "\n    mutation UpdateDataHubSecretApi($input: UpdateDataHubSecretInput!) {\n        updateDataHubSecret(input: $input) {\n            id\n            code\n        }\n    }\n": typeof types.UpdateDataHubSecretApiDocument,
    "\n    mutation DeleteDataHubSecretApi($id: ID!) {\n        deleteDataHubSecret(id: $id) {\n            result\n        }\n    }\n": typeof types.DeleteDataHubSecretApiDocument,
    "\n    query DataHubSettingsApi {\n        dataHubSettings {\n            retentionDaysRuns\n            retentionDaysErrors\n            retentionDaysLogs\n            logPersistenceLevel\n        }\n    }\n": typeof types.DataHubSettingsApiDocument,
    "\n    mutation UpdateDataHubSettingsApi($input: DataHubSettingsInput!) {\n        updateDataHubSettings(input: $input) {\n            retentionDaysRuns\n            retentionDaysErrors\n            retentionDaysLogs\n            logPersistenceLevel\n        }\n    }\n": typeof types.UpdateDataHubSettingsApiDocument,
    "\n    mutation PreviewDataHubExtractApi($step: JSON!, $limit: Int) {\n        previewDataHubExtract(step: $step, limit: $limit) { records }\n    }\n": typeof types.PreviewDataHubExtractApiDocument,
    "\n    mutation SimulateDataHubTransformApi($step: JSON!, $records: JSON!) {\n        simulateDataHubTransform(step: $step, records: $records)\n    }\n": typeof types.SimulateDataHubTransformApiDocument,
    "\n    mutation SimulateDataHubLoadApi($step: JSON!, $records: JSON!) {\n        simulateDataHubLoad(step: $step, records: $records)\n    }\n": typeof types.SimulateDataHubLoadApiDocument,
    "\n    mutation SimulateDataHubValidateApi($step: JSON!, $records: JSON!) {\n        simulateDataHubValidate(step: $step, records: $records) {\n            records\n            summary { input passed failed passRate }\n        }\n    }\n": typeof types.SimulateDataHubValidateApiDocument,
    "\n    mutation PreviewDataHubFeedApi($feedCode: String!, $limit: Int) {\n        previewDataHubFeed(feedCode: $feedCode, limit: $limit) { content contentType itemCount }\n    }\n": typeof types.PreviewDataHubFeedApiDocument,
};
const documents: Documents = {
    "\n    query DataHubAdaptersApi {\n        dataHubAdapters {\n            type\n            code\n            name\n            description\n            category\n            schema {\n                fields {\n                    key\n                    label\n                    description\n                    type\n                    required\n                    defaultValue\n                    placeholder\n                    options {\n                        value\n                        label\n                    }\n                }\n            }\n            icon\n            color\n            pure\n            async\n            batchable\n            requires\n        }\n    }\n": types.DataHubAdaptersApiDocument,
    "\n    query DataHubConnectionsForList($options: DataHubConnectionListOptions) {\n        dataHubConnections(options: $options) {\n            items {\n                id\n                code\n                type\n            }\n            totalItems\n        }\n    }\n": types.DataHubConnectionsForListDocument,
    "\n    query DataHubConnectionDetailApi($id: ID!) {\n        dataHubConnection(id: $id) {\n            id\n            code\n            type\n            config\n        }\n    }\n": types.DataHubConnectionDetailApiDocument,
    "\n    mutation CreateDataHubConnectionApi($input: CreateDataHubConnectionInput!) {\n        createDataHubConnection(input: $input) {\n            id\n            code\n        }\n    }\n": types.CreateDataHubConnectionApiDocument,
    "\n    mutation UpdateDataHubConnectionApi($input: UpdateDataHubConnectionInput!) {\n        updateDataHubConnection(input: $input) {\n            id\n            code\n        }\n    }\n": types.UpdateDataHubConnectionApiDocument,
    "\n    mutation DeleteDataHubConnectionApi($id: ID!) {\n        deleteDataHubConnection(id: $id) {\n            result\n        }\n    }\n": types.DeleteDataHubConnectionApiDocument,
    "\n    query DataHubPipelineHooksApi($pipelineId: ID!) {\n        dataHubPipelineHooks(pipelineId: $pipelineId)\n    }\n": types.DataHubPipelineHooksApiDocument,
    "\n    mutation RunDataHubHookTestApi($pipelineId: ID!, $stage: String!, $payload: JSON) {\n        runDataHubHookTest(pipelineId: $pipelineId, stage: $stage, payload: $payload)\n    }\n": types.RunDataHubHookTestApiDocument,
    "\n    query DataHubEventsApi($limit: Int) {\n        dataHubEvents(limit: $limit) {\n            name\n            createdAt\n            payload\n        }\n    }\n": types.DataHubEventsApiDocument,
    "\n    query DataHubLogsApi($options: DataHubLogListOptions) {\n        dataHubLogs(options: $options) {\n            items {\n                id\n                createdAt\n                level\n                message\n                stepKey\n                context\n                metadata\n                pipelineId\n                runId\n                durationMs\n                recordsProcessed\n                recordsFailed\n            }\n            totalItems\n        }\n    }\n": types.DataHubLogsApiDocument,
    "\n    query DataHubLogStatsApi($pipelineId: ID) {\n        dataHubLogStats(pipelineId: $pipelineId) {\n            total\n            byLevel {\n                DEBUG\n                INFO\n                WARN\n                ERROR\n            }\n            errorsToday\n            warningsToday\n            avgDurationMs\n        }\n    }\n": types.DataHubLogStatsApiDocument,
    "\n    query DataHubRecentLogsApi($limit: Int) {\n        dataHubRecentLogs(limit: $limit) {\n            id\n            createdAt\n            level\n            message\n            stepKey\n            pipelineId\n            runId\n            durationMs\n            recordsProcessed\n            recordsFailed\n        }\n    }\n": types.DataHubRecentLogsApiDocument,
    "\n    query DataHubPipelineRunsApi($pipelineId: ID, $options: DataHubPipelineRunListOptions) {\n        dataHubPipelineRuns(pipelineId: $pipelineId, options: $options) {\n            items {\n                id\n                status\n                startedAt\n                finishedAt\n                metrics\n            }\n            totalItems\n        }\n    }\n": types.DataHubPipelineRunsApiDocument,
    "\n    query DataHubPipelineRunDetailApi($id: ID!) {\n        dataHubPipelineRun(id: $id) {\n            id\n            status\n            startedAt\n            finishedAt\n            metrics\n            error\n            startedByUserId\n            pipeline {\n                id\n                code\n                name\n            }\n        }\n    }\n": types.DataHubPipelineRunDetailApiDocument,
    "\n    query DataHubRunErrorsApi($runId: ID!) {\n        dataHubRunErrors(runId: $runId) {\n            id\n            stepKey\n            message\n            payload\n        }\n    }\n": types.DataHubRunErrorsApiDocument,
    "\n    mutation CancelDataHubPipelineRunApi($id: ID!) {\n        cancelDataHubPipelineRun(id: $id) {\n            id\n            status\n        }\n    }\n": types.CancelDataHubPipelineRunApiDocument,
    "\n    mutation RetryDataHubRecordApi($errorId: ID!, $patch: JSON) {\n        retryDataHubRecord(errorId: $errorId, patch: $patch)\n    }\n": types.RetryDataHubRecordApiDocument,
    "\n    query DataHubRecordRetryAuditsApi($errorId: ID!) {\n        dataHubRecordRetryAudits(errorId: $errorId) {\n            id\n            createdAt\n            userId\n            previousPayload\n            patch\n            resultingPayload\n        }\n    }\n": types.DataHubRecordRetryAuditsApiDocument,
    "\n    query DataHubPipelinesForList($options: DataHubPipelineListOptions) {\n        dataHubPipelines(options: $options) {\n            items {\n                id\n                code\n                name\n                enabled\n                status\n                updatedAt\n            }\n            totalItems\n        }\n    }\n": types.DataHubPipelinesForListDocument,
    "\n    query DataHubPipelineDetail($id: ID!) {\n        dataHubPipeline(id: $id) {\n            id\n            createdAt\n            updatedAt\n            code\n            name\n            enabled\n            status\n            version\n            publishedAt\n            definition\n        }\n    }\n": types.DataHubPipelineDetailDocument,
    "\n    mutation CreateDataHubPipelineApi($input: CreateDataHubPipelineInput!) {\n        createDataHubPipeline(input: $input) {\n            id\n            code\n            name\n        }\n    }\n": types.CreateDataHubPipelineApiDocument,
    "\n    mutation UpdateDataHubPipelineApi($input: UpdateDataHubPipelineInput!) {\n        updateDataHubPipeline(input: $input) {\n            id\n            code\n            name\n        }\n    }\n": types.UpdateDataHubPipelineApiDocument,
    "\n    mutation DeleteDataHubPipelineApi($id: ID!) {\n        deleteDataHubPipeline(id: $id) {\n            result\n        }\n    }\n": types.DeleteDataHubPipelineApiDocument,
    "\n    mutation RunDataHubPipelineApi($pipelineId: ID!) {\n        startDataHubPipelineRun(pipelineId: $pipelineId) {\n            id\n            status\n        }\n    }\n": types.RunDataHubPipelineApiDocument,
    "\n    query ValidateDataHubPipelineDefinitionApi($definition: JSON!, $level: String) {\n        validateDataHubPipelineDefinition(definition: $definition, level: $level) {\n            isValid\n            issues {\n                message\n                stepKey\n                reason\n                field\n            }\n            warnings {\n                message\n                stepKey\n                reason\n                field\n            }\n            level\n        }\n    }\n": types.ValidateDataHubPipelineDefinitionApiDocument,
    "\n    mutation DryRunDataHubPipelineApi($pipelineId: ID!) {\n        startDataHubPipelineDryRun(pipelineId: $pipelineId) {\n            metrics\n            notes\n            sampleRecords { step before after }\n        }\n    }\n": types.DryRunDataHubPipelineApiDocument,
    "\n    query DataHubPipelineTimelineApi($pipelineId: ID!, $limit: Int) {\n        dataHubPipelineTimeline(pipelineId: $pipelineId, limit: $limit) {\n            revision {\n                id\n                createdAt\n                version\n                type\n                commitMessage\n                authorName\n                changesSummary\n                isLatest\n                isCurrent\n            }\n            runCount\n            lastRunAt\n            lastRunStatus\n        }\n    }\n": types.DataHubPipelineTimelineApiDocument,
    "\n    mutation SubmitDataHubPipelineForReviewApi($id: ID!) {\n        submitDataHubPipelineForReview(id: $id) {\n            id\n            status\n        }\n    }\n": types.SubmitDataHubPipelineForReviewApiDocument,
    "\n    mutation ApproveDataHubPipelineApi($id: ID!) {\n        approveDataHubPipeline(id: $id) {\n            id\n            status\n        }\n    }\n": types.ApproveDataHubPipelineApiDocument,
    "\n    mutation RejectDataHubPipelineReviewApi($id: ID!) {\n        rejectDataHubPipelineReview(id: $id) {\n            id\n            status\n        }\n    }\n": types.RejectDataHubPipelineReviewApiDocument,
    "\n    mutation PublishDataHubPipelineApi($id: ID!) {\n        publishDataHubPipeline(id: $id) {\n            id\n            status\n            publishedAt\n        }\n    }\n": types.PublishDataHubPipelineApiDocument,
    "\n    mutation ArchiveDataHubPipelineApi($id: ID!) {\n        archiveDataHubPipeline(id: $id) {\n            id\n            status\n        }\n    }\n": types.ArchiveDataHubPipelineApiDocument,
    "\n    query DataHubQueueStatsApi {\n        dataHubQueueStats {\n            pending\n            running\n            failed\n            completedToday\n            byPipeline {\n                code\n                pending\n                running\n            }\n            recentFailed {\n                id\n                code\n                finishedAt\n                error\n            }\n        }\n    }\n": types.DataHubQueueStatsApiDocument,
    "\n    query DataHubDeadLettersApi {\n        dataHubDeadLetters {\n            id\n            stepKey\n            message\n            payload\n        }\n    }\n": types.DataHubDeadLettersApiDocument,
    "\n    query DataHubConsumersApi {\n        dataHubConsumers {\n            pipelineCode\n            queueName\n            isActive\n            messagesProcessed\n            messagesFailed\n            lastMessageAt\n        }\n    }\n": types.DataHubConsumersApiDocument,
    "\n    mutation StartDataHubConsumerApi($pipelineCode: String!) {\n        startDataHubConsumer(pipelineCode: $pipelineCode)\n    }\n": types.StartDataHubConsumerApiDocument,
    "\n    mutation StopDataHubConsumerApi($pipelineCode: String!) {\n        stopDataHubConsumer(pipelineCode: $pipelineCode)\n    }\n": types.StopDataHubConsumerApiDocument,
    "\n    mutation MarkDataHubDeadLetterApi($id: ID!, $deadLetter: Boolean!) {\n        markDataHubDeadLetter(id: $id, deadLetter: $deadLetter)\n    }\n": types.MarkDataHubDeadLetterApiDocument,
    "\n    query DataHubSecretsForList($options: DataHubSecretListOptions) {\n        dataHubSecrets(options: $options) {\n            items {\n                id\n                code\n                provider\n            }\n            totalItems\n        }\n    }\n": types.DataHubSecretsForListDocument,
    "\n    query DataHubSecretDetailApi($id: ID!) {\n        dataHubSecret(id: $id) {\n            id\n            code\n            provider\n            value\n            metadata\n        }\n    }\n": types.DataHubSecretDetailApiDocument,
    "\n    mutation CreateDataHubSecretApi($input: CreateDataHubSecretInput!) {\n        createDataHubSecret(input: $input) {\n            id\n            code\n        }\n    }\n": types.CreateDataHubSecretApiDocument,
    "\n    mutation UpdateDataHubSecretApi($input: UpdateDataHubSecretInput!) {\n        updateDataHubSecret(input: $input) {\n            id\n            code\n        }\n    }\n": types.UpdateDataHubSecretApiDocument,
    "\n    mutation DeleteDataHubSecretApi($id: ID!) {\n        deleteDataHubSecret(id: $id) {\n            result\n        }\n    }\n": types.DeleteDataHubSecretApiDocument,
    "\n    query DataHubSettingsApi {\n        dataHubSettings {\n            retentionDaysRuns\n            retentionDaysErrors\n            retentionDaysLogs\n            logPersistenceLevel\n        }\n    }\n": types.DataHubSettingsApiDocument,
    "\n    mutation UpdateDataHubSettingsApi($input: DataHubSettingsInput!) {\n        updateDataHubSettings(input: $input) {\n            retentionDaysRuns\n            retentionDaysErrors\n            retentionDaysLogs\n            logPersistenceLevel\n        }\n    }\n": types.UpdateDataHubSettingsApiDocument,
    "\n    mutation PreviewDataHubExtractApi($step: JSON!, $limit: Int) {\n        previewDataHubExtract(step: $step, limit: $limit) { records }\n    }\n": types.PreviewDataHubExtractApiDocument,
    "\n    mutation SimulateDataHubTransformApi($step: JSON!, $records: JSON!) {\n        simulateDataHubTransform(step: $step, records: $records)\n    }\n": types.SimulateDataHubTransformApiDocument,
    "\n    mutation SimulateDataHubLoadApi($step: JSON!, $records: JSON!) {\n        simulateDataHubLoad(step: $step, records: $records)\n    }\n": types.SimulateDataHubLoadApiDocument,
    "\n    mutation SimulateDataHubValidateApi($step: JSON!, $records: JSON!) {\n        simulateDataHubValidate(step: $step, records: $records) {\n            records\n            summary { input passed failed passRate }\n        }\n    }\n": types.SimulateDataHubValidateApiDocument,
    "\n    mutation PreviewDataHubFeedApi($feedCode: String!, $limit: Int) {\n        previewDataHubFeed(feedCode: $feedCode, limit: $limit) { content contentType itemCount }\n    }\n": types.PreviewDataHubFeedApiDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubAdaptersApi {\n        dataHubAdapters {\n            type\n            code\n            name\n            description\n            category\n            schema {\n                fields {\n                    key\n                    label\n                    description\n                    type\n                    required\n                    defaultValue\n                    placeholder\n                    options {\n                        value\n                        label\n                    }\n                }\n            }\n            icon\n            color\n            pure\n            async\n            batchable\n            requires\n        }\n    }\n"): (typeof documents)["\n    query DataHubAdaptersApi {\n        dataHubAdapters {\n            type\n            code\n            name\n            description\n            category\n            schema {\n                fields {\n                    key\n                    label\n                    description\n                    type\n                    required\n                    defaultValue\n                    placeholder\n                    options {\n                        value\n                        label\n                    }\n                }\n            }\n            icon\n            color\n            pure\n            async\n            batchable\n            requires\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubConnectionsForList($options: DataHubConnectionListOptions) {\n        dataHubConnections(options: $options) {\n            items {\n                id\n                code\n                type\n            }\n            totalItems\n        }\n    }\n"): (typeof documents)["\n    query DataHubConnectionsForList($options: DataHubConnectionListOptions) {\n        dataHubConnections(options: $options) {\n            items {\n                id\n                code\n                type\n            }\n            totalItems\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubConnectionDetailApi($id: ID!) {\n        dataHubConnection(id: $id) {\n            id\n            code\n            type\n            config\n        }\n    }\n"): (typeof documents)["\n    query DataHubConnectionDetailApi($id: ID!) {\n        dataHubConnection(id: $id) {\n            id\n            code\n            type\n            config\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation CreateDataHubConnectionApi($input: CreateDataHubConnectionInput!) {\n        createDataHubConnection(input: $input) {\n            id\n            code\n        }\n    }\n"): (typeof documents)["\n    mutation CreateDataHubConnectionApi($input: CreateDataHubConnectionInput!) {\n        createDataHubConnection(input: $input) {\n            id\n            code\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation UpdateDataHubConnectionApi($input: UpdateDataHubConnectionInput!) {\n        updateDataHubConnection(input: $input) {\n            id\n            code\n        }\n    }\n"): (typeof documents)["\n    mutation UpdateDataHubConnectionApi($input: UpdateDataHubConnectionInput!) {\n        updateDataHubConnection(input: $input) {\n            id\n            code\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation DeleteDataHubConnectionApi($id: ID!) {\n        deleteDataHubConnection(id: $id) {\n            result\n        }\n    }\n"): (typeof documents)["\n    mutation DeleteDataHubConnectionApi($id: ID!) {\n        deleteDataHubConnection(id: $id) {\n            result\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubPipelineHooksApi($pipelineId: ID!) {\n        dataHubPipelineHooks(pipelineId: $pipelineId)\n    }\n"): (typeof documents)["\n    query DataHubPipelineHooksApi($pipelineId: ID!) {\n        dataHubPipelineHooks(pipelineId: $pipelineId)\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation RunDataHubHookTestApi($pipelineId: ID!, $stage: String!, $payload: JSON) {\n        runDataHubHookTest(pipelineId: $pipelineId, stage: $stage, payload: $payload)\n    }\n"): (typeof documents)["\n    mutation RunDataHubHookTestApi($pipelineId: ID!, $stage: String!, $payload: JSON) {\n        runDataHubHookTest(pipelineId: $pipelineId, stage: $stage, payload: $payload)\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubEventsApi($limit: Int) {\n        dataHubEvents(limit: $limit) {\n            name\n            createdAt\n            payload\n        }\n    }\n"): (typeof documents)["\n    query DataHubEventsApi($limit: Int) {\n        dataHubEvents(limit: $limit) {\n            name\n            createdAt\n            payload\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubLogsApi($options: DataHubLogListOptions) {\n        dataHubLogs(options: $options) {\n            items {\n                id\n                createdAt\n                level\n                message\n                stepKey\n                context\n                metadata\n                pipelineId\n                runId\n                durationMs\n                recordsProcessed\n                recordsFailed\n            }\n            totalItems\n        }\n    }\n"): (typeof documents)["\n    query DataHubLogsApi($options: DataHubLogListOptions) {\n        dataHubLogs(options: $options) {\n            items {\n                id\n                createdAt\n                level\n                message\n                stepKey\n                context\n                metadata\n                pipelineId\n                runId\n                durationMs\n                recordsProcessed\n                recordsFailed\n            }\n            totalItems\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubLogStatsApi($pipelineId: ID) {\n        dataHubLogStats(pipelineId: $pipelineId) {\n            total\n            byLevel {\n                DEBUG\n                INFO\n                WARN\n                ERROR\n            }\n            errorsToday\n            warningsToday\n            avgDurationMs\n        }\n    }\n"): (typeof documents)["\n    query DataHubLogStatsApi($pipelineId: ID) {\n        dataHubLogStats(pipelineId: $pipelineId) {\n            total\n            byLevel {\n                DEBUG\n                INFO\n                WARN\n                ERROR\n            }\n            errorsToday\n            warningsToday\n            avgDurationMs\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubRecentLogsApi($limit: Int) {\n        dataHubRecentLogs(limit: $limit) {\n            id\n            createdAt\n            level\n            message\n            stepKey\n            pipelineId\n            runId\n            durationMs\n            recordsProcessed\n            recordsFailed\n        }\n    }\n"): (typeof documents)["\n    query DataHubRecentLogsApi($limit: Int) {\n        dataHubRecentLogs(limit: $limit) {\n            id\n            createdAt\n            level\n            message\n            stepKey\n            pipelineId\n            runId\n            durationMs\n            recordsProcessed\n            recordsFailed\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubPipelineRunsApi($pipelineId: ID, $options: DataHubPipelineRunListOptions) {\n        dataHubPipelineRuns(pipelineId: $pipelineId, options: $options) {\n            items {\n                id\n                status\n                startedAt\n                finishedAt\n                metrics\n            }\n            totalItems\n        }\n    }\n"): (typeof documents)["\n    query DataHubPipelineRunsApi($pipelineId: ID, $options: DataHubPipelineRunListOptions) {\n        dataHubPipelineRuns(pipelineId: $pipelineId, options: $options) {\n            items {\n                id\n                status\n                startedAt\n                finishedAt\n                metrics\n            }\n            totalItems\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubPipelineRunDetailApi($id: ID!) {\n        dataHubPipelineRun(id: $id) {\n            id\n            status\n            startedAt\n            finishedAt\n            metrics\n            error\n            startedByUserId\n            pipeline {\n                id\n                code\n                name\n            }\n        }\n    }\n"): (typeof documents)["\n    query DataHubPipelineRunDetailApi($id: ID!) {\n        dataHubPipelineRun(id: $id) {\n            id\n            status\n            startedAt\n            finishedAt\n            metrics\n            error\n            startedByUserId\n            pipeline {\n                id\n                code\n                name\n            }\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubRunErrorsApi($runId: ID!) {\n        dataHubRunErrors(runId: $runId) {\n            id\n            stepKey\n            message\n            payload\n        }\n    }\n"): (typeof documents)["\n    query DataHubRunErrorsApi($runId: ID!) {\n        dataHubRunErrors(runId: $runId) {\n            id\n            stepKey\n            message\n            payload\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation CancelDataHubPipelineRunApi($id: ID!) {\n        cancelDataHubPipelineRun(id: $id) {\n            id\n            status\n        }\n    }\n"): (typeof documents)["\n    mutation CancelDataHubPipelineRunApi($id: ID!) {\n        cancelDataHubPipelineRun(id: $id) {\n            id\n            status\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation RetryDataHubRecordApi($errorId: ID!, $patch: JSON) {\n        retryDataHubRecord(errorId: $errorId, patch: $patch)\n    }\n"): (typeof documents)["\n    mutation RetryDataHubRecordApi($errorId: ID!, $patch: JSON) {\n        retryDataHubRecord(errorId: $errorId, patch: $patch)\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubRecordRetryAuditsApi($errorId: ID!) {\n        dataHubRecordRetryAudits(errorId: $errorId) {\n            id\n            createdAt\n            userId\n            previousPayload\n            patch\n            resultingPayload\n        }\n    }\n"): (typeof documents)["\n    query DataHubRecordRetryAuditsApi($errorId: ID!) {\n        dataHubRecordRetryAudits(errorId: $errorId) {\n            id\n            createdAt\n            userId\n            previousPayload\n            patch\n            resultingPayload\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubPipelinesForList($options: DataHubPipelineListOptions) {\n        dataHubPipelines(options: $options) {\n            items {\n                id\n                code\n                name\n                enabled\n                status\n                updatedAt\n            }\n            totalItems\n        }\n    }\n"): (typeof documents)["\n    query DataHubPipelinesForList($options: DataHubPipelineListOptions) {\n        dataHubPipelines(options: $options) {\n            items {\n                id\n                code\n                name\n                enabled\n                status\n                updatedAt\n            }\n            totalItems\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubPipelineDetail($id: ID!) {\n        dataHubPipeline(id: $id) {\n            id\n            createdAt\n            updatedAt\n            code\n            name\n            enabled\n            status\n            version\n            publishedAt\n            definition\n        }\n    }\n"): (typeof documents)["\n    query DataHubPipelineDetail($id: ID!) {\n        dataHubPipeline(id: $id) {\n            id\n            createdAt\n            updatedAt\n            code\n            name\n            enabled\n            status\n            version\n            publishedAt\n            definition\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation CreateDataHubPipelineApi($input: CreateDataHubPipelineInput!) {\n        createDataHubPipeline(input: $input) {\n            id\n            code\n            name\n        }\n    }\n"): (typeof documents)["\n    mutation CreateDataHubPipelineApi($input: CreateDataHubPipelineInput!) {\n        createDataHubPipeline(input: $input) {\n            id\n            code\n            name\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation UpdateDataHubPipelineApi($input: UpdateDataHubPipelineInput!) {\n        updateDataHubPipeline(input: $input) {\n            id\n            code\n            name\n        }\n    }\n"): (typeof documents)["\n    mutation UpdateDataHubPipelineApi($input: UpdateDataHubPipelineInput!) {\n        updateDataHubPipeline(input: $input) {\n            id\n            code\n            name\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation DeleteDataHubPipelineApi($id: ID!) {\n        deleteDataHubPipeline(id: $id) {\n            result\n        }\n    }\n"): (typeof documents)["\n    mutation DeleteDataHubPipelineApi($id: ID!) {\n        deleteDataHubPipeline(id: $id) {\n            result\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation RunDataHubPipelineApi($pipelineId: ID!) {\n        startDataHubPipelineRun(pipelineId: $pipelineId) {\n            id\n            status\n        }\n    }\n"): (typeof documents)["\n    mutation RunDataHubPipelineApi($pipelineId: ID!) {\n        startDataHubPipelineRun(pipelineId: $pipelineId) {\n            id\n            status\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query ValidateDataHubPipelineDefinitionApi($definition: JSON!, $level: String) {\n        validateDataHubPipelineDefinition(definition: $definition, level: $level) {\n            isValid\n            issues {\n                message\n                stepKey\n                reason\n                field\n            }\n            warnings {\n                message\n                stepKey\n                reason\n                field\n            }\n            level\n        }\n    }\n"): (typeof documents)["\n    query ValidateDataHubPipelineDefinitionApi($definition: JSON!, $level: String) {\n        validateDataHubPipelineDefinition(definition: $definition, level: $level) {\n            isValid\n            issues {\n                message\n                stepKey\n                reason\n                field\n            }\n            warnings {\n                message\n                stepKey\n                reason\n                field\n            }\n            level\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation DryRunDataHubPipelineApi($pipelineId: ID!) {\n        startDataHubPipelineDryRun(pipelineId: $pipelineId) {\n            metrics\n            notes\n            sampleRecords { step before after }\n        }\n    }\n"): (typeof documents)["\n    mutation DryRunDataHubPipelineApi($pipelineId: ID!) {\n        startDataHubPipelineDryRun(pipelineId: $pipelineId) {\n            metrics\n            notes\n            sampleRecords { step before after }\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubPipelineTimelineApi($pipelineId: ID!, $limit: Int) {\n        dataHubPipelineTimeline(pipelineId: $pipelineId, limit: $limit) {\n            revision {\n                id\n                createdAt\n                version\n                type\n                commitMessage\n                authorName\n                changesSummary\n                isLatest\n                isCurrent\n            }\n            runCount\n            lastRunAt\n            lastRunStatus\n        }\n    }\n"): (typeof documents)["\n    query DataHubPipelineTimelineApi($pipelineId: ID!, $limit: Int) {\n        dataHubPipelineTimeline(pipelineId: $pipelineId, limit: $limit) {\n            revision {\n                id\n                createdAt\n                version\n                type\n                commitMessage\n                authorName\n                changesSummary\n                isLatest\n                isCurrent\n            }\n            runCount\n            lastRunAt\n            lastRunStatus\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation SubmitDataHubPipelineForReviewApi($id: ID!) {\n        submitDataHubPipelineForReview(id: $id) {\n            id\n            status\n        }\n    }\n"): (typeof documents)["\n    mutation SubmitDataHubPipelineForReviewApi($id: ID!) {\n        submitDataHubPipelineForReview(id: $id) {\n            id\n            status\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation ApproveDataHubPipelineApi($id: ID!) {\n        approveDataHubPipeline(id: $id) {\n            id\n            status\n        }\n    }\n"): (typeof documents)["\n    mutation ApproveDataHubPipelineApi($id: ID!) {\n        approveDataHubPipeline(id: $id) {\n            id\n            status\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation RejectDataHubPipelineReviewApi($id: ID!) {\n        rejectDataHubPipelineReview(id: $id) {\n            id\n            status\n        }\n    }\n"): (typeof documents)["\n    mutation RejectDataHubPipelineReviewApi($id: ID!) {\n        rejectDataHubPipelineReview(id: $id) {\n            id\n            status\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation PublishDataHubPipelineApi($id: ID!) {\n        publishDataHubPipeline(id: $id) {\n            id\n            status\n            publishedAt\n        }\n    }\n"): (typeof documents)["\n    mutation PublishDataHubPipelineApi($id: ID!) {\n        publishDataHubPipeline(id: $id) {\n            id\n            status\n            publishedAt\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation ArchiveDataHubPipelineApi($id: ID!) {\n        archiveDataHubPipeline(id: $id) {\n            id\n            status\n        }\n    }\n"): (typeof documents)["\n    mutation ArchiveDataHubPipelineApi($id: ID!) {\n        archiveDataHubPipeline(id: $id) {\n            id\n            status\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubQueueStatsApi {\n        dataHubQueueStats {\n            pending\n            running\n            failed\n            completedToday\n            byPipeline {\n                code\n                pending\n                running\n            }\n            recentFailed {\n                id\n                code\n                finishedAt\n                error\n            }\n        }\n    }\n"): (typeof documents)["\n    query DataHubQueueStatsApi {\n        dataHubQueueStats {\n            pending\n            running\n            failed\n            completedToday\n            byPipeline {\n                code\n                pending\n                running\n            }\n            recentFailed {\n                id\n                code\n                finishedAt\n                error\n            }\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubDeadLettersApi {\n        dataHubDeadLetters {\n            id\n            stepKey\n            message\n            payload\n        }\n    }\n"): (typeof documents)["\n    query DataHubDeadLettersApi {\n        dataHubDeadLetters {\n            id\n            stepKey\n            message\n            payload\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubConsumersApi {\n        dataHubConsumers {\n            pipelineCode\n            queueName\n            isActive\n            messagesProcessed\n            messagesFailed\n            lastMessageAt\n        }\n    }\n"): (typeof documents)["\n    query DataHubConsumersApi {\n        dataHubConsumers {\n            pipelineCode\n            queueName\n            isActive\n            messagesProcessed\n            messagesFailed\n            lastMessageAt\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation StartDataHubConsumerApi($pipelineCode: String!) {\n        startDataHubConsumer(pipelineCode: $pipelineCode)\n    }\n"): (typeof documents)["\n    mutation StartDataHubConsumerApi($pipelineCode: String!) {\n        startDataHubConsumer(pipelineCode: $pipelineCode)\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation StopDataHubConsumerApi($pipelineCode: String!) {\n        stopDataHubConsumer(pipelineCode: $pipelineCode)\n    }\n"): (typeof documents)["\n    mutation StopDataHubConsumerApi($pipelineCode: String!) {\n        stopDataHubConsumer(pipelineCode: $pipelineCode)\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation MarkDataHubDeadLetterApi($id: ID!, $deadLetter: Boolean!) {\n        markDataHubDeadLetter(id: $id, deadLetter: $deadLetter)\n    }\n"): (typeof documents)["\n    mutation MarkDataHubDeadLetterApi($id: ID!, $deadLetter: Boolean!) {\n        markDataHubDeadLetter(id: $id, deadLetter: $deadLetter)\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubSecretsForList($options: DataHubSecretListOptions) {\n        dataHubSecrets(options: $options) {\n            items {\n                id\n                code\n                provider\n            }\n            totalItems\n        }\n    }\n"): (typeof documents)["\n    query DataHubSecretsForList($options: DataHubSecretListOptions) {\n        dataHubSecrets(options: $options) {\n            items {\n                id\n                code\n                provider\n            }\n            totalItems\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubSecretDetailApi($id: ID!) {\n        dataHubSecret(id: $id) {\n            id\n            code\n            provider\n            value\n            metadata\n        }\n    }\n"): (typeof documents)["\n    query DataHubSecretDetailApi($id: ID!) {\n        dataHubSecret(id: $id) {\n            id\n            code\n            provider\n            value\n            metadata\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation CreateDataHubSecretApi($input: CreateDataHubSecretInput!) {\n        createDataHubSecret(input: $input) {\n            id\n            code\n        }\n    }\n"): (typeof documents)["\n    mutation CreateDataHubSecretApi($input: CreateDataHubSecretInput!) {\n        createDataHubSecret(input: $input) {\n            id\n            code\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation UpdateDataHubSecretApi($input: UpdateDataHubSecretInput!) {\n        updateDataHubSecret(input: $input) {\n            id\n            code\n        }\n    }\n"): (typeof documents)["\n    mutation UpdateDataHubSecretApi($input: UpdateDataHubSecretInput!) {\n        updateDataHubSecret(input: $input) {\n            id\n            code\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation DeleteDataHubSecretApi($id: ID!) {\n        deleteDataHubSecret(id: $id) {\n            result\n        }\n    }\n"): (typeof documents)["\n    mutation DeleteDataHubSecretApi($id: ID!) {\n        deleteDataHubSecret(id: $id) {\n            result\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    query DataHubSettingsApi {\n        dataHubSettings {\n            retentionDaysRuns\n            retentionDaysErrors\n            retentionDaysLogs\n            logPersistenceLevel\n        }\n    }\n"): (typeof documents)["\n    query DataHubSettingsApi {\n        dataHubSettings {\n            retentionDaysRuns\n            retentionDaysErrors\n            retentionDaysLogs\n            logPersistenceLevel\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation UpdateDataHubSettingsApi($input: DataHubSettingsInput!) {\n        updateDataHubSettings(input: $input) {\n            retentionDaysRuns\n            retentionDaysErrors\n            retentionDaysLogs\n            logPersistenceLevel\n        }\n    }\n"): (typeof documents)["\n    mutation UpdateDataHubSettingsApi($input: DataHubSettingsInput!) {\n        updateDataHubSettings(input: $input) {\n            retentionDaysRuns\n            retentionDaysErrors\n            retentionDaysLogs\n            logPersistenceLevel\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation PreviewDataHubExtractApi($step: JSON!, $limit: Int) {\n        previewDataHubExtract(step: $step, limit: $limit) { records }\n    }\n"): (typeof documents)["\n    mutation PreviewDataHubExtractApi($step: JSON!, $limit: Int) {\n        previewDataHubExtract(step: $step, limit: $limit) { records }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation SimulateDataHubTransformApi($step: JSON!, $records: JSON!) {\n        simulateDataHubTransform(step: $step, records: $records)\n    }\n"): (typeof documents)["\n    mutation SimulateDataHubTransformApi($step: JSON!, $records: JSON!) {\n        simulateDataHubTransform(step: $step, records: $records)\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation SimulateDataHubLoadApi($step: JSON!, $records: JSON!) {\n        simulateDataHubLoad(step: $step, records: $records)\n    }\n"): (typeof documents)["\n    mutation SimulateDataHubLoadApi($step: JSON!, $records: JSON!) {\n        simulateDataHubLoad(step: $step, records: $records)\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation SimulateDataHubValidateApi($step: JSON!, $records: JSON!) {\n        simulateDataHubValidate(step: $step, records: $records) {\n            records\n            summary { input passed failed passRate }\n        }\n    }\n"): (typeof documents)["\n    mutation SimulateDataHubValidateApi($step: JSON!, $records: JSON!) {\n        simulateDataHubValidate(step: $step, records: $records) {\n            records\n            summary { input passed failed passRate }\n        }\n    }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n    mutation PreviewDataHubFeedApi($feedCode: String!, $limit: Int) {\n        previewDataHubFeed(feedCode: $feedCode, limit: $limit) { content contentType itemCount }\n    }\n"): (typeof documents)["\n    mutation PreviewDataHubFeedApi($feedCode: String!, $limit: Int) {\n        previewDataHubFeed(feedCode: $feedCode, limit: $limit) { content contentType itemCount }\n    }\n"];

export function graphql(source: string) {
  return (documents as Record<string, DocumentNode>)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;