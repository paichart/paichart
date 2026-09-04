import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { KeyboardShortcutsHelpProps } from './types';

/**
 * Component to display keyboard shortcuts help
 */
export const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({ visible }) => {
  if (!visible) return null;
  
  return (
    <Alert className="mb-4">
      <AlertDescription>
        <div className="text-sm">
          <p className="font-medium mb-1">Keyboard Shortcuts:</p>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
            <li>Arrow Right: Expand node</li>
            <li>Arrow Left: Collapse node</li>
            <li>Arrow Up: Navigate up</li>
            <li>Arrow Down: Navigate down</li>
            <li>Space: Toggle node expansion</li>
            <li>F: Toggle focus mode</li>
            <li>Esc: Clear selection/focus</li>
            <li>m: Toggle minimap</li>
            <li>+: Expand all nodes</li>
            <li>-: Collapse all nodes</li>
            <li>?: Toggle this help</li>
          </ul>
        </div>
      </AlertDescription>
    </Alert>
  );
};
