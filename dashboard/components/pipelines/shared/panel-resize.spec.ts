import { describe, expect, it } from 'vitest';
import { clampPanelWidth, resizePanelWithKey } from './panel-resize';

describe('properties panel resizing', () => {
    it('clamps pointer widths to the accessible range', () => {
        expect(clampPanelWidth(200, 380, 900)).toBe(380);
        expect(clampPanelWidth(1_000, 380, 900)).toBe(900);
    });

    it('supports directional and boundary keys', () => {
        expect(resizePanelWithKey('ArrowLeft', 520, 380, 900)).toBe(536);
        expect(resizePanelWithKey('ArrowRight', 520, 380, 900)).toBe(504);
        expect(resizePanelWithKey('Home', 520, 380, 900)).toBe(380);
        expect(resizePanelWithKey('End', 520, 380, 900)).toBe(900);
        expect(resizePanelWithKey('Enter', 520, 380, 900)).toBeNull();
    });
});
