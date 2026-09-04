import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/Alert';

interface KeyboardShortcutsHelpProps {
  visible: boolean;
}

export const KeyboardShortcutsHelp = React.memo(function KeyboardShortcutsHelp({
  visible
}: KeyboardShortcutsHelpProps) {
  if (!visible) return null;
  
  return (
    <Alert className="mb-4">
      <AlertDescription>
        <div className="text-sm">
          <p className="font-medium mb-1">Keyboard Shortcuts:</p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
            <li>Arrow Keys: Pan the graph</li>
            <li>+/=: Zoom in</li>
            <li>-: Zoom out</li>
            <li>0: Reset view</li>
            <li>Tab: Navigate between tasks</li>
            <li>Shift+Tab: Navigate backward</li>
            <li>Esc: Clear selection</li>
            <li>m: Toggle minimap</li>
            <li>d: Toggle task details</li>
            <li>?: Toggle this help</li>
            <li>Export: Save as SVG</li>
          </ul>
        </div>
      </AlertDescription>
    </Alert>
  );
});
