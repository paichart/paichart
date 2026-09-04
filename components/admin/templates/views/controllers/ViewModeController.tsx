import React, { useState } from 'react';
import { 
  ViewMode, 
  ViewModeDefinition, 
  Template,
  ViewModeProps
} from '../types';
import { useTemplateView } from '../context/TemplateViewContext';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { 
  Download,
  Settings,
  Info
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/Tooltip';

interface ViewModeControllerProps {
  onDownloadETLPlan?: () => void;
}

/**
 * Controller component for switching between view modes
 */
export const ViewModeController: React.FC<ViewModeControllerProps> = ({
  onDownloadETLPlan
}) => {
  const { 
    activeViewMode, 
    setActiveViewMode, 
    availableViewModes,
    userPreferences,
    updateUserPreferences
  } = useTemplateView();

  // Handle view mode change
  const handleViewModeChange = (mode: ViewMode) => {
    setActiveViewMode(mode);
  };

  // Handle setting a default view mode
  const handleSetDefaultViewMode = (mode: ViewMode) => {
    updateUserPreferences({
      defaultViewMode: mode
    });
  };

  // Handle toggling a view mode
  const handleToggleViewMode = (mode: ViewMode, isEnabled: boolean) => {
    updateUserPreferences({
      viewModePreferences: {
        ...userPreferences.viewModePreferences,
        [mode]: { 
          ...userPreferences.viewModePreferences[mode],
          isEnabled 
        }
      }
    });
  };

  return (
    <div className="flex items-center justify-between mb-4 border-b pb-2">
      <Tabs value={activeViewMode} onValueChange={(value) => handleViewModeChange(value as ViewMode)}>
        <TabsList>
          {availableViewModes.map((mode) => (
            <TabsTrigger key={mode.id} value={mode.id} className="flex items-center">
              <span className="flex items-center">
                <span className="mr-2">{mode.icon}</span>
                {mode.name}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex items-center space-x-2">
        {onDownloadETLPlan && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={onDownloadETLPlan} className="flex items-center">
                  <Download className="h-4 w-4 mr-1" />
                  ETL Plan
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Download the ETL implementation plan</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <DropdownMenu>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="flex items-center">
                    <Settings className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>View settings</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <DropdownMenuContent>
            <DropdownMenuLabel>View Settings</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Set Default View</DropdownMenuLabel>
            {availableViewModes.map((mode) => (
              <DropdownMenuItem 
                key={`default-${mode.id}`}
                onClick={() => handleSetDefaultViewMode(mode.id)}
              >
                <span className="flex items-center">
                  <span className="mr-2">{mode.icon}</span>
                  {mode.name}
                  {userPreferences.defaultViewMode === mode.id && (
                    <span className="ml-2 text-success">✓</span>
                  )}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Enable/Disable Views</DropdownMenuLabel>
            {Object.values(ViewMode).map((mode) => {
              const viewMode = availableViewModes.find(m => m.id === mode) || {
                id: mode,
                name: mode,
                icon: <Info className="h-4 w-4" />,
                description: '',
                component: () => null,
                bestFor: []
              };
              
              return (
                <DropdownMenuItem 
                  key={`toggle-${mode}`}
                  onClick={() => handleToggleViewMode(
                    mode, 
                    !userPreferences.viewModePreferences[mode]?.isEnabled
                  )}
                >
                  <span className="flex items-center">
                    <span className="mr-2">{viewMode.icon}</span>
                    {viewMode.name}
                    {userPreferences.viewModePreferences[mode]?.isEnabled && (
                      <span className="ml-2 text-success">✓</span>
                    )}
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

/**
 * Component that renders the active view mode
 */
export const ViewModeRenderer: React.FC<{ tabOverride?: string }> = ({ tabOverride }) => {
  const {
    activeViewMode,
    availableViewModes,
    template,
    updateTemplate,
    saveTemplate,
    isReadOnly
  } = useTemplateView();

  // Find the active view mode component
  const activeViewModeDefinition = availableViewModes.find(
    (mode) => mode.id === activeViewMode
  );

  // If the active view mode is not found, render nothing
  if (!activeViewModeDefinition) {
    return null;
  }

  // Get the component for the active view mode
  const ViewComponent = activeViewModeDefinition.component;

  // Render the active view mode component
  return (
    <ViewComponent
      template={template}
      onTemplateChange={updateTemplate}
      onSave={saveTemplate}
      isReadOnly={isReadOnly}
      activeTab={tabOverride}
    />
  );
};
