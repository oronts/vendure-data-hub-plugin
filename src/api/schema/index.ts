import gql from 'graphql-tag';

import { pipelineSchema, pipelineQueries, pipelineMutations } from './pipeline.schema';
import { testSchema, testMutations, testQueries } from './test.schema';
import { secretSchema, secretQueries, secretMutations } from './secret.schema';
import { connectionSchema, connectionQueries, connectionMutations } from './connection.schema';
import { logSchema, logQueries } from './log.schema';
import { jobSchema, jobQueries, jobMutations } from './job.schema';
import { feedSchema, feedQueries, feedMutations } from './feed.schema';
import { analyticsSchema, analyticsQueries } from './analytics.schema';
import { adapterSchema, adapterQueries } from './adapter.schema';
import { webhookSchema, webhookQueries, webhookMutations } from './webhook.schema';
import { destinationSchema, destinationQueries, destinationMutations } from './destination.schema';
import { automapperSchema, automapperQueries, automapperMutations } from './automapper.schema';
import { storageSchema, storageQueries } from './storage.schema';
import { subscriptionSchema } from './subscription.schema';
import { queueSchema, queueQueries, queueMutations } from './queue.schema';
import { entitySchemaSchema, entitySchemaQueries } from './entity-schema.schema';
import { versioningSchema, versioningQueries, versioningMutations } from './versioning.schema';
import { sandboxSchema, sandboxQueries, sandboxMutations } from './sandbox.schema';
import { gateSchema, gateQueries, gateMutations } from './gate.schema';

export const adminApiExtensions = gql`
    ${pipelineSchema}
    ${testSchema}
    ${secretSchema}
    ${connectionSchema}
    ${logSchema}
    ${jobSchema}
    ${feedSchema}
    ${analyticsSchema}
    ${adapterSchema}
    ${webhookSchema}
    ${destinationSchema}
    ${automapperSchema}
    ${storageSchema}
    ${subscriptionSchema}
    ${queueSchema}
    ${entitySchemaSchema}
    ${versioningSchema}
    ${sandboxSchema}
    ${gateSchema}

    ${pipelineQueries}
    ${testQueries}
    ${secretQueries}
    ${connectionQueries}
    ${logQueries}
    ${jobQueries}
    ${feedQueries}
    ${analyticsQueries}
    ${adapterQueries}
    ${webhookQueries}
    ${destinationQueries}
    ${automapperQueries}
    ${storageQueries}
    ${queueQueries}
    ${entitySchemaQueries}
    ${versioningQueries}
    ${sandboxQueries}
    ${gateQueries}

    ${pipelineMutations}
    ${testMutations}
    ${secretMutations}
    ${connectionMutations}
    ${jobMutations}
    ${feedMutations}
    ${webhookMutations}
    ${destinationMutations}
    ${automapperMutations}
    ${queueMutations}
    ${versioningMutations}
    ${sandboxMutations}
    ${gateMutations}
`;

export * from './pipeline.schema';
export * from './secret.schema';
export * from './connection.schema';
export * from './log.schema';
export * from './job.schema';
export * from './feed.schema';
export * from './analytics.schema';
export * from './adapter.schema';
export * from './webhook.schema';
export * from './destination.schema';
export * from './automapper.schema';
export * from './storage.schema';
export * from './subscription.schema';
export * from './queue.schema';
export * from './entity-schema.schema';
export * from './versioning.schema';
export * from './sandbox.schema';
export * from './gate.schema';
