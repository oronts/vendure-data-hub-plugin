import * as React from 'react';
import { useEditorData } from '../hooks';
import type { EditorData } from '../hooks';

const EditorDataContext = React.createContext<EditorData | null>(null);

export function EditorDataProvider({ children }: { children: React.ReactNode }) {
    const editorData = useEditorData();
    return (
        <EditorDataContext.Provider value={editorData}>
            {children}
        </EditorDataContext.Provider>
    );
}

export function useEditorDataContext(): EditorData {
    const context = React.useContext(EditorDataContext);
    if (!context) {
        throw new Error('useEditorDataContext must be used within EditorDataProvider');
    }
    return context;
}
