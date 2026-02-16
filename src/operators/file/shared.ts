/**
 * Shared utilities for image operators that depend on the `sharp` library.
 *
 * Both image-resize and image-convert operators need to dynamically import
 * sharp (which uses `export = sharp`). This module centralises that logic
 * so the import quirk is handled in exactly one place.
 */

export type SharpFn = typeof import('sharp');

export async function loadSharp(): Promise<SharpFn> {
    try {
        // sharp uses `export = sharp`, so dynamic import yields { default: sharp }
        const mod = await import('sharp') as { default: SharpFn };
        return mod.default;
    } catch {
        throw new Error(
            'The "sharp" package is required for image operations. Install it with: npm install sharp',
        );
    }
}
