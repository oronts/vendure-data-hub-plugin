import * as React from 'react';
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    Input,
    Switch,
    Separator,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@vendure/dashboard';
import {
    Plus,
    Trash2,
    Eye,
    ChevronDown,
    Settings,
    Zap,
} from 'lucide-react';
import { TRANSFORM_TEMPLATES } from './constants';
import { StepEditor } from './StepEditor';
import type { TransformationToolkitProps, TransformStep, TransformationType } from './types';

export function TransformationToolkit({
    steps,
    onChange,
    availableFields = [],
    onPreview,
}: TransformationToolkitProps) {
    const [expandedStep, setExpandedStep] = React.useState<string | null>(null);
    const [showAddDialog, setShowAddDialog] = React.useState(false);

    const addStep = (type: TransformationType) => {
        const template = TRANSFORM_TEMPLATES.find(t => t.type === type);
        const newStep: TransformStep = {
            id: `step-${Date.now()}`,
            type,
            name: template?.name || type,
            enabled: true,
            config: {},
        };
        onChange([...steps, newStep]);
        setExpandedStep(newStep.id);
        setShowAddDialog(false);
    };

    const updateStep = (id: string, updates: Partial<TransformStep>) => {
        onChange(steps.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    const removeStep = (id: string) => {
        onChange(steps.filter(s => s.id !== id));
        if (expandedStep === id) setExpandedStep(null);
    };

    const moveStep = (id: string, direction: 'up' | 'down') => {
        const idx = steps.findIndex(s => s.id === id);
        if (direction === 'up' && idx > 0) {
            const newSteps = [...steps];
            [newSteps[idx - 1], newSteps[idx]] = [newSteps[idx], newSteps[idx - 1]];
            onChange(newSteps);
        } else if (direction === 'down' && idx < steps.length - 1) {
            const newSteps = [...steps];
            [newSteps[idx], newSteps[idx + 1]] = [newSteps[idx + 1], newSteps[idx]];
            onChange(newSteps);
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-medium">Transformation Steps</h3>
                    <p className="text-sm text-muted-foreground">
                        {steps.length} step{steps.length !== 1 ? 's' : ''} configured
                    </p>
                </div>
                <Button onClick={() => setShowAddDialog(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Transform
                </Button>
            </div>

            {/* Steps List */}
            {steps.length === 0 ? (
                <Card>
                    <CardContent className="p-8 text-center">
                        <Zap className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <p className="text-lg font-medium mb-2">No Transformations</p>
                        <p className="text-sm text-muted-foreground mb-4">
                            Add transformation steps to process your data
                        </p>
                        <Button onClick={() => setShowAddDialog(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add Transform
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {steps.map((step, idx) => {
                        const template = TRANSFORM_TEMPLATES.find(t => t.type === step.type);
                        const Icon = template?.icon || Settings;
                        const isExpanded = expandedStep === step.id;

                        return (
                            <Card key={step.id} className={!step.enabled ? 'opacity-50' : ''}>
                                <CardHeader className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-lg ${template?.color || 'bg-gray-500'} flex items-center justify-center text-white`}>
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1">
                                            <Input
                                                value={step.name}
                                                onChange={e => updateStep(step.id, { name: e.target.value })}
                                                className="h-7 text-sm font-medium border-0 p-0 focus-visible:ring-0"
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                {template?.description || step.type}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Switch
                                                checked={step.enabled}
                                                onCheckedChange={v => updateStep(step.id, { enabled: v })}
                                            />
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => moveStep(step.id, 'up')}
                                                disabled={idx === 0}
                                            >
                                                <ChevronDown className="w-4 h-4 rotate-180" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => moveStep(step.id, 'down')}
                                                disabled={idx === steps.length - 1}
                                            >
                                                <ChevronDown className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                                            >
                                                <Settings className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                            </Button>
                                            {onPreview && (
                                                <Button variant="ghost" size="icon" onClick={() => onPreview(step)}>
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                            )}
                                            <Button variant="ghost" size="icon" onClick={() => removeStep(step.id)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                {isExpanded && (
                                    <CardContent className="pt-0 pb-4 px-4">
                                        <Separator className="mb-4" />
                                        <StepEditor
                                            step={step}
                                            onChange={s => updateStep(step.id, s)}
                                            fields={availableFields}
                                        />
                                    </CardContent>
                                )}
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Add Transform Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Add Transformation</DialogTitle>
                        <DialogDescription>Select a transformation type to add to your pipeline</DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-3 py-4">
                        {TRANSFORM_TEMPLATES.map(template => (
                            <button
                                key={template.type}
                                className="flex items-start gap-3 p-4 border rounded-lg hover:bg-muted transition-colors text-left"
                                onClick={() => addStep(template.type)}
                            >
                                <div className={`w-10 h-10 rounded-lg ${template.color} flex items-center justify-center text-white flex-shrink-0`}>
                                    <template.icon className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="font-medium">{template.name}</p>
                                    <p className="text-sm text-muted-foreground">{template.description}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default TransformationToolkit;
