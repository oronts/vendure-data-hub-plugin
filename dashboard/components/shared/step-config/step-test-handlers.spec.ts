import { describe, expect, it } from 'vitest';
import { STEP_TYPE } from '../../../constants';
import { STEP_CONFIG_TRANSLATION_IDS } from '../../../constants';
import {
    canTestStepType,
    getFeedStepTestResult,
} from './step-test-capabilities';

describe('step test capabilities', () => {
    it('does not advertise the stored-feed preview API for pipeline feed steps', () => {
        expect(canTestStepType(STEP_TYPE.FEED)).toBe(false);
        expect(getFeedStepTestResult()).toEqual(
            expect.objectContaining({
                status: 'warning',
                message: {
                    id: STEP_CONFIG_TRANSLATION_IDS.FEED_PIPELINE_DRY_RUN,
                },
            }),
        );
    });

    it('keeps sandbox-backed step types directly testable', () => {
        expect(canTestStepType(STEP_TYPE.EXTRACT)).toBe(true);
        expect(canTestStepType(STEP_TYPE.TRANSFORM)).toBe(true);
        expect(canTestStepType(STEP_TYPE.VALIDATE)).toBe(true);
        expect(canTestStepType(STEP_TYPE.LOAD)).toBe(true);
    });
});
