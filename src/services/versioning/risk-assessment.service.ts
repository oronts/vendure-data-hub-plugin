import { Injectable } from '@nestjs/common';
import { ID, RequestContext, TransactionalConnection } from '@vendure/core';
import {
    ImpactAnalysis,
    RiskAssessment,
    RiskContext,
    RiskRule,
    RiskWarning,
} from '../../types/index';
import {
    LOGGER_CONTEXTS,
    RunOutcome,
    RunStatus,
    SortOrder,
    RiskLevel,
    RiskSeverity,
    EstimateConfidence,
    RISK_THRESHOLDS,
} from '../../constants/index';
import { Pipeline, PipelineRun } from '../../entities/pipeline';
import { DataHubLogger, DataHubLoggerFactory } from '../logger';

/**
 * Default risk rules for assessing pipeline impact
 */
const DEFAULT_RISK_RULES: RiskRule[] = [
    // High record count warnings
    {
        id: 'high-record-count',
        check: (impact) => impact.summary.totalRecordsToProcess > RISK_THRESHOLDS.HIGH_RECORD_COUNT,
        severity: RiskSeverity.WARNING,
        message: 'Large dataset: {count} records will be processed',
        recommendation: 'Consider running in batches or during off-peak hours',
    },
    {
        id: 'very-high-record-count',
        check: (impact) => impact.summary.totalRecordsToProcess > RISK_THRESHOLDS.VERY_HIGH_RECORD_COUNT,
        severity: RiskSeverity.DANGER,
        message: 'Very large dataset: {count} records will be processed',
        recommendation: 'Strongly recommend running in batches and monitoring system resources',
    },

    // Deletion warnings
    {
        id: 'has-deletions',
        check: (impact) => impact.entityBreakdown.some(e => e.operations.delete > 0),
        severity: RiskSeverity.WARNING,
        message: '{count} records will be deleted',
        recommendation: 'Ensure you have backups before proceeding',
    },
    {
        id: 'high-deletion-count',
        check: (impact) => {
            const totalDeletes = impact.entityBreakdown.reduce((sum, e) => sum + e.operations.delete, 0);
            return totalDeletes > RISK_THRESHOLDS.HIGH_DELETION_COUNT;
        },
        severity: RiskSeverity.DANGER,
        message: 'High deletion count: {count} records will be deleted',
        recommendation: 'Review the deletion criteria carefully and consider a test run first',
    },

    // Error rate warnings
    {
        id: 'high-estimated-failure-rate',
        check: (impact) => {
            if (impact.summary.totalRecordsToProcess === 0) return false;
            const failureRate = impact.summary.estimatedFailureCount / impact.summary.totalRecordsToProcess;
            return failureRate > RISK_THRESHOLDS.HIGH_FAILURE_RATE_PERCENT;
        },
        severity: RiskSeverity.WARNING,
        message: 'High estimated failure rate: {rate}% of records may fail',
        recommendation: 'Review data quality and transformation rules',
    },

    // First run warning
    {
        id: 'first-run',
        check: (_, context) => context.previousRunCount === 0,
        severity: RiskSeverity.INFO,
        message: 'This is the first run of this pipeline',
        recommendation: 'Monitor closely and review results after completion',
    },

    // Previous failure warning
    {
        id: 'previous-failure',
        check: (_, context) => context.lastRunStatus === RunOutcome.FAILED,
        severity: RiskSeverity.WARNING,
        message: 'The last run of this pipeline failed',
        recommendation: 'Review and fix issues from the previous run before proceeding',
    },

    // Resource warnings
    {
        id: 'high-memory-usage',
        check: (impact) => impact.resourceUsage.memoryMb > RISK_THRESHOLDS.HIGH_MEMORY_USAGE_MB,
        severity: RiskSeverity.WARNING,
        message: 'High memory usage estimated: {memory}MB',
        recommendation: 'Ensure sufficient system resources are available',
    },
    {
        id: 'high-database-load',
        check: (impact) => impact.resourceUsage.databaseQueries > RISK_THRESHOLDS.HIGH_DATABASE_QUERIES,
        severity: RiskSeverity.WARNING,
        message: 'High database load expected: {queries} queries',
        recommendation: 'Consider running during off-peak hours to avoid impacting other operations',
    },

    // Duration warnings
    {
        id: 'long-duration',
        check: (impact) => impact.estimatedDuration.estimatedMs > RISK_THRESHOLDS.LONG_DURATION_MS,
        severity: RiskSeverity.INFO,
        message: 'Long running pipeline: estimated {duration} minutes',
        recommendation: 'Plan for potential timeout scenarios',
    },
    {
        id: 'very-long-duration',
        check: (impact) => impact.estimatedDuration.estimatedMs > RISK_THRESHOLDS.VERY_LONG_DURATION_MS,
        severity: RiskSeverity.WARNING,
        message: 'Very long running pipeline: estimated {duration} hours',
        recommendation: 'Consider breaking into smaller batches or scheduling for maintenance windows',
    },

    // Multiple entity types
    {
        id: 'multiple-entity-types',
        check: (impact) => impact.entityBreakdown.length > RISK_THRESHOLDS.MULTIPLE_ENTITY_TYPES,
        severity: RiskSeverity.INFO,
        message: 'Pipeline affects {count} different entity types',
        recommendation: 'Be aware of potential cross-entity dependencies',
    },

    // Low confidence estimate
    {
        id: 'low-confidence-estimate',
        check: (impact) => impact.estimatedDuration.confidence === EstimateConfidence.LOW,
        severity: RiskSeverity.INFO,
        message: 'Duration estimate has low confidence (no historical data)',
        recommendation: 'Actual duration may vary significantly from estimate',
    },
];

/**
 * Service for assessing risk of pipeline execution
 */
@Injectable()
export class RiskAssessmentService {
    private readonly logger: DataHubLogger;
    private rules: RiskRule[] = [...DEFAULT_RISK_RULES];

    constructor(
        private connection: TransactionalConnection,
        loggerFactory: DataHubLoggerFactory,
    ) {
        this.logger = loggerFactory.createLogger(LOGGER_CONTEXTS.PIPELINE_SERVICE);
    }

    /**
     * Add a custom risk rule
     */
    addRule(rule: RiskRule): void {
        this.rules.push(rule);
    }

    /**
     * Remove a rule by ID
     */
    removeRule(ruleId: string): boolean {
        const index = this.rules.findIndex(r => r.id === ruleId);
        if (index >= 0) {
            this.rules.splice(index, 1);
            return true;
        }
        return false;
    }

    /**
     * Get all active rules
     */
    getRules(): RiskRule[] {
        return [...this.rules];
    }

    /**
     * Assess risk for an impact analysis result
     */
    async assess(
        ctx: RequestContext,
        pipelineId: ID,
        impact: ImpactAnalysis,
    ): Promise<RiskAssessment> {
        // Build context from pipeline history
        const context = await this.buildContext(ctx, pipelineId);

        const warnings: RiskWarning[] = [];

        // Evaluate each rule
        for (const rule of this.rules) {
            try {
                if (rule.check(impact, context)) {
                    const warning = this.createWarning(rule, impact, context);
                    warnings.push(warning);
                }
            } catch (err) {
                this.logger.warn('Risk rule evaluation failed', {
                    ruleId: rule.id,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }

        // Calculate risk score and level
        const { score, level } = this.calculateRiskScore(warnings);

        this.logger.debug('Risk assessment completed', {
            pipelineId,
            warningCount: warnings.length,
            riskLevel: level,
            riskScore: score,
        });

        return {
            level,
            score,
            warnings,
        };
    }

    /**
     * Update impact analysis with risk assessment
     */
    async assessAndUpdate(
        ctx: RequestContext,
        pipelineId: ID,
        impact: ImpactAnalysis,
    ): Promise<ImpactAnalysis> {
        const riskAssessment = await this.assess(ctx, pipelineId, impact);
        return {
            ...impact,
            riskAssessment,
        };
    }

    // Private helper methods

    private async buildContext(ctx: RequestContext, pipelineId: ID): Promise<RiskContext> {
        const runRepo = this.connection.getRepository(ctx, PipelineRun);
        const pipelineRepo = this.connection.getRepository(ctx, Pipeline);

        // Count previous runs
        const previousRunCount = await runRepo.count({
            where: { pipeline: { id: pipelineId } },
        });

        // Get last run status
        const lastRun = await runRepo.findOne({
            where: { pipeline: { id: pipelineId } },
            order: { finishedAt: SortOrder.DESC },
        });

        let lastRunStatus: RunOutcome | undefined;
        if (lastRun) {
            if (lastRun.status === RunStatus.COMPLETED) lastRunStatus = RunOutcome.SUCCESS;
            else if (lastRun.status === RunStatus.FAILED) lastRunStatus = RunOutcome.FAILED;
        }

        // Get pipeline config
        const pipeline = await pipelineRepo.findOne({
            where: { id: pipelineId },
        });

        return {
            previousRunCount,
            lastRunStatus,
            pipelineConfig: pipeline?.definition,
        };
    }

    private createWarning(
        rule: RiskRule,
        impact: ImpactAnalysis,
        context: RiskContext,
    ): RiskWarning {
        const message = this.interpolateMessage(rule.message, impact, context);
        const details = this.generateDetails(rule.id, impact, context);

        return {
            type: rule.id,
            severity: rule.severity,
            message,
            details,
            affectedCount: this.getAffectedCount(rule.id, impact),
            recommendation: rule.recommendation,
        };
    }

    private interpolateMessage(
        template: string,
        impact: ImpactAnalysis,
        context: RiskContext,
    ): string {
        return template
            .replace('{count}', String(impact.summary.totalRecordsToProcess))
            .replace('{rate}', String(
                Math.round(
                    (impact.summary.estimatedFailureCount / Math.max(impact.summary.totalRecordsToProcess, 1)) * 100
                )
            ))
            .replace('{memory}', String(impact.resourceUsage.memoryMb))
            .replace('{queries}', String(impact.resourceUsage.databaseQueries))
            .replace('{duration}', String(Math.round(impact.estimatedDuration.estimatedMs / 60000)));
    }

    private generateDetails(
        ruleId: string,
        impact: ImpactAnalysis,
        context: RiskContext,
    ): string {
        switch (ruleId) {
            case 'high-record-count':
            case 'very-high-record-count':
                return `The pipeline will process ${impact.summary.totalRecordsToProcess.toLocaleString()} records. ` +
                    `This may take approximately ${Math.round(impact.estimatedDuration.estimatedMs / 60000)} minutes.`;

            case 'has-deletions':
            case 'high-deletion-count': {
                const deletes = impact.entityBreakdown
                    .filter(e => e.operations.delete > 0)
                    .map(e => `${e.operations.delete} ${e.entityType}`)
                    .join(', ');
                return `The following records will be deleted: ${deletes}. This operation cannot be undone.`;
            }

            case 'high-estimated-failure-rate':
                return `Based on sample analysis, approximately ${impact.summary.estimatedFailureCount} records ` +
                    `may fail processing. Review the sample records for potential data quality issues.`;

            case 'first-run':
                return `This pipeline has never been run before. Results should be reviewed carefully ` +
                    `to ensure the configuration is correct.`;

            case 'previous-failure':
                return `The last execution of this pipeline failed. Ensure the underlying issues ` +
                    `have been resolved before running again.`;

            case 'high-memory-usage':
                return `The pipeline is estimated to use ${impact.resourceUsage.memoryMb}MB of memory. ` +
                    `Ensure the system has sufficient resources available.`;

            case 'high-database-load':
                return `The pipeline will execute approximately ${impact.resourceUsage.databaseQueries.toLocaleString()} ` +
                    `database queries. This may impact system performance.`;

            case 'long-duration':
            case 'very-long-duration':
                return `Estimated duration: ${Math.round(impact.estimatedDuration.estimatedMs / 60000)} minutes ` +
                    `(confidence: ${impact.estimatedDuration.confidence}). Based on: ${impact.estimatedDuration.basedOn}.`;

            case 'multiple-entity-types':
                return `Affected entities: ${impact.summary.affectedEntities.join(', ')}. ` +
                    `Changes to one entity may affect related entities.`;

            case 'low-confidence-estimate':
                return `The duration estimate is based on ${impact.estimatedDuration.basedOn} and may not be accurate. ` +
                    `Run this pipeline a few times to improve estimate accuracy.`;

            default:
                return '';
        }
    }

    private getAffectedCount(ruleId: string, impact: ImpactAnalysis): number | undefined {
        switch (ruleId) {
            case 'high-record-count':
            case 'very-high-record-count':
                return impact.summary.totalRecordsToProcess;

            case 'has-deletions':
            case 'high-deletion-count':
                return impact.entityBreakdown.reduce((sum, e) => sum + e.operations.delete, 0);

            case 'high-estimated-failure-rate':
                return impact.summary.estimatedFailureCount;

            case 'multiple-entity-types':
                return impact.entityBreakdown.length;

            default:
                return undefined;
        }
    }

    private calculateRiskScore(warnings: RiskWarning[]): { score: number; level: RiskLevel } {
        // Weight by severity
        const weights: Record<RiskSeverity, number> = {
            [RiskSeverity.INFO]: RISK_THRESHOLDS.SEVERITY_WEIGHT_INFO,
            [RiskSeverity.WARNING]: RISK_THRESHOLDS.SEVERITY_WEIGHT_WARNING,
            [RiskSeverity.DANGER]: RISK_THRESHOLDS.SEVERITY_WEIGHT_DANGER,
        };

        let score = 0;
        for (const warning of warnings) {
            score += weights[warning.severity as RiskSeverity] ?? 0;
        }

        // Cap at 100
        score = Math.min(100, score);

        // Determine level
        let level: RiskLevel;
        if (score < RISK_THRESHOLDS.RISK_SCORE_LOW) level = RiskLevel.LOW;
        else if (score < RISK_THRESHOLDS.RISK_SCORE_MEDIUM) level = RiskLevel.MEDIUM;
        else if (score < RISK_THRESHOLDS.RISK_SCORE_HIGH) level = RiskLevel.HIGH;
        else level = RiskLevel.CRITICAL;

        return { score, level };
    }
}
