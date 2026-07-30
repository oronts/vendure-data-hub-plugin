import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';
import { Pipeline, PipelineRevision } from '../../entities/pipeline';
import {
    PipelineStatus,
    RevisionType,
    StepType,
} from '../../constants/enums';
import type { PipelineDefinition } from '../../types';
import type { PipelineDefinitionIssue } from '../../validation/pipeline-definition-error';
import { getErrorMessage } from '../../utils/error.utils';
import type { DataHubLogger } from '../logger';
import type { HookScriptRegistryService } from '../events/hook-script-registry.service';

interface HookReferenceValidationContext {
    connection: TransactionalConnection;
    ctx?: RequestContext;
    definition: PipelineDefinition;
    hookScripts: HookScriptRegistryService;
    issues: PipelineDefinitionIssue[];
    logger: DataHubLogger;
    warnings: PipelineDefinitionIssue[];
}

interface HookReferences {
    scriptNames: Set<string>;
    triggerTargets: Map<string, Set<string>>;
}

export async function validateHookReferences(
    context: HookReferenceValidationContext,
): Promise<void> {
    const references = collectHookReferences(context.definition);
    validateScriptReferences(references.scriptNames, context.hookScripts, context.issues);
    if (references.triggerTargets.size === 0) return;

    try {
        await validateTriggerTargets(references.triggerTargets, context);
    } catch (error: unknown) {
        context.logger.warn('Failed to validate hook pipeline targets', {
            error: getErrorMessage(error),
        });
        context.warnings.push({
            message: 'Could not verify hook pipeline targets',
            errorCode: 'hook-reference-check-failed',
        });
    }
}

function collectHookReferences(definition: PipelineDefinition): HookReferences {
    const triggerTargets = new Map<string, Set<string>>();
    const scriptNames = new Set<string>();
    for (const actions of Object.values(definition.hooks ?? {})) {
        if (!Array.isArray(actions)) continue;
        for (const action of actions) {
            if (
                action.type === 'TRIGGER_PIPELINE'
                && typeof action.pipelineCode === 'string'
                && typeof action.triggerKey === 'string'
            ) {
                const triggerKeys = triggerTargets.get(action.pipelineCode) ?? new Set<string>();
                triggerKeys.add(action.triggerKey);
                triggerTargets.set(action.pipelineCode, triggerKeys);
            } else if (action.type === 'SCRIPT' && typeof action.scriptName === 'string') {
                scriptNames.add(action.scriptName);
            }
        }
    }
    return { scriptNames, triggerTargets };
}

function validateScriptReferences(
    scriptNames: Set<string>,
    hookScripts: HookScriptRegistryService,
    issues: PipelineDefinitionIssue[],
): void {
    for (const scriptName of scriptNames) {
        if (!hookScripts.has(scriptName)) {
            issues.push({
                message: `Hook references unregistered script "${scriptName}"`,
                errorCode: 'hook-script-unknown',
            });
        }
    }
}

async function validateTriggerTargets(
    triggerTargets: Map<string, Set<string>>,
    context: HookReferenceValidationContext,
): Promise<void> {
    const pipelineRepository = context.ctx
        ? context.connection.getRepository(context.ctx, Pipeline)
        : context.connection.rawConnection.getRepository(Pipeline);
    const targets = await pipelineRepository.find({
        where: {
            code: In([...triggerTargets.keys()]),
            ...(context.ctx ? { channels: { id: context.ctx.channelId } } : {}),
        },
        select: {
            id: true,
            code: true,
            currentRevisionId: true,
            enabled: true,
            status: true,
        },
    });
    const targetsByCode = new Map(targets.map(target => [target.code, target]));
    const activeRevisionIds = targets
        .map(target => target.currentRevisionId)
        .filter((id): id is NonNullable<typeof id> => id != null);
    const revisionRepository = context.ctx
        ? context.connection.getRepository(context.ctx, PipelineRevision)
        : context.connection.rawConnection.getRepository(PipelineRevision);
    const revisions = activeRevisionIds.length === 0
        ? []
        : await revisionRepository.find({
            where: {
                id: In(activeRevisionIds),
                type: RevisionType.PUBLISHED,
            },
            select: { id: true, definition: true },
        });
    const definitionsByRevisionId = new Map(
        revisions.map(revision => [String(revision.id), revision.definition]),
    );

    for (const [code, triggerKeys] of triggerTargets) {
        validateTriggerTarget(
            code,
            triggerKeys,
            targetsByCode.get(code),
            definitionsByRevisionId,
            context.issues,
        );
    }
}

function validateTriggerTarget(
    code: string,
    triggerKeys: Set<string>,
    target: Pipeline | undefined,
    definitionsByRevisionId: Map<string, PipelineDefinition>,
    issues: PipelineDefinitionIssue[],
): void {
    if (!target) {
        issues.push({
            message: `TRIGGER_PIPELINE hook references unknown pipeline code "${code}"`,
            errorCode: 'hook-pipeline-unknown',
        });
        return;
    }
    if (
        target.status === PipelineStatus.ARCHIVED
        || !target.enabled
        || target.currentRevisionId == null
    ) {
        issues.push({
            message: `TRIGGER_PIPELINE hook target "${code}" has no runnable published revision`,
            errorCode: 'hook-pipeline-not-runnable',
        });
        return;
    }

    const targetDefinition = definitionsByRevisionId.get(String(target.currentRevisionId));
    if (!targetDefinition) {
        issues.push({
            message: `TRIGGER_PIPELINE hook target "${code}" has no active published revision`,
            errorCode: 'hook-pipeline-revision-missing',
        });
        return;
    }

    for (const triggerKey of triggerKeys) {
        const triggerStep = targetDefinition.steps.find(step => step.key === triggerKey);
        if (
            !triggerStep
            || triggerStep.type !== StepType.TRIGGER
            || triggerStep.disabled === true
        ) {
            issues.push({
                message: `TRIGGER_PIPELINE hook target "${code}" has no enabled trigger step "${triggerKey}"`,
                errorCode: 'hook-trigger-not-runnable',
            });
        } else if (!(targetDefinition.edges ?? []).some(edge => edge.from === triggerKey)) {
            issues.push({
                message: `TRIGGER_PIPELINE hook target "${code}" trigger "${triggerKey}" has no outgoing route`,
                errorCode: 'hook-trigger-no-route',
            });
        }
    }
}
