import { describe, expect, it } from 'vitest';
import { getGateCheckpointKeys } from './gate-checkpoint';

describe('getGateCheckpointKeys', () => {
    it('isolates gate state by run ID', () => {
        expect(getGateCheckpointKeys('run-1', 'approval')).toEqual({
            pending: '__gate:run-1:approval',
            approved: '__gateApproved:run-1:approval',
        });
        expect(getGateCheckpointKeys('run-2', 'approval')).not.toEqual(
            getGateCheckpointKeys('run-1', 'approval'),
        );
    });
});
