import { describe, expect, it, vi } from 'vitest';
import { parsePaletteDragData, resolveCanvasPosition } from './canvas-position';

describe('pipeline canvas coordinates', () => {
    it('projects client coordinates through the active viewport', () => {
        const screenToFlowPosition = vi.fn(() => ({ x: 25, y: 40 }));

        expect(resolveCanvasPosition(
            { screenToFlowPosition },
            { x: 250, y: 400 },
        )).toEqual({ x: 25, y: 40 });
        expect(screenToFlowPosition).toHaveBeenCalledWith({ x: 250, y: 400 });
    });

    it('rejects malformed drag payloads', () => {
        expect(parsePaletteDragData('{')).toBeNull();
        expect(parsePaletteDragData(JSON.stringify({ nodeType: 'trim' }))).toBeNull();
        expect(parsePaletteDragData(JSON.stringify({
            nodeType: 'trim',
            category: 'transform',
            label: 'Trim',
        }))).toEqual({ nodeType: 'trim', category: 'transform', label: 'Trim' });
    });
});
