import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CodeEditorWithExpand } from './CodeEditor';

interface ChildrenProps {
    children?: ReactNode;
    className?: string;
}

vi.mock('@lingui/react/macro', () => ({
    Trans: ({ children }: ChildrenProps) => createElement('span', null, children),
}));

vi.mock('@vendure/dashboard', () => ({
    Button: ({ children }: ChildrenProps) => createElement('button', null, children),
    Dialog: ({ children }: ChildrenProps) => createElement('div', null, children),
    DialogContent: ({ children }: ChildrenProps) => createElement('section', null, children),
    DialogDescription: ({ children, className }: ChildrenProps) =>
        createElement('p', { className }, children),
    DialogHeader: ({ children }: ChildrenProps) => createElement('header', null, children),
    DialogTitle: ({ children }: ChildrenProps) => createElement('h2', null, children),
}));

describe('CodeEditorWithExpand', () => {
    it('uses localized static actions and describes the expanded editor', () => {
        const markup = renderToStaticMarkup(
            <CodeEditorWithExpand
                id="script"
                label="Hook script"
                value=""
                onChange={vi.fn()}
            />,
        );

        expect(markup).toContain('Format');
        expect(markup).toContain('Expand');
        expect(markup).toContain('Collapse');
        expect(markup).toContain('Expanded code editor for Hook script');
        expect(markup).toContain('class="sr-only"');
    });
});
