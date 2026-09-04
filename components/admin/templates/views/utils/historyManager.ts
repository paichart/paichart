import { Template, TemplateCommand, HistoryManager } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Creates a history manager for undo/redo operations
 */
export function createHistoryManager(): HistoryManager {
  // Command history
  const commandHistory: TemplateCommand[] = [];
  // Current position in history
  let currentIndex = -1;
  // Template snapshots for each command
  const snapshots: Template[] = [];

  /**
   * Adds a command to the history
   */
  const addCommand = (command: TemplateCommand) => {
    // If we're not at the end of the history, remove all commands after the current index
    if (currentIndex < commandHistory.length - 1) {
      commandHistory.splice(currentIndex + 1);
      snapshots.splice(currentIndex + 1);
    }

    // Add the command to the history
    commandHistory.push({
      ...command,
      id: command.id || uuidv4(),
      timestamp: command.timestamp || Date.now(),
    });

    // Update the current index
    currentIndex = commandHistory.length - 1;
  };

  /**
   * Adds a template snapshot to the history
   */
  const addSnapshot = (template: Template) => {
    // If we're not at the end of the history, remove all snapshots after the current index
    if (currentIndex < snapshots.length - 1) {
      snapshots.splice(currentIndex + 1);
    }

    // Add the snapshot to the history
    snapshots.push(JSON.parse(JSON.stringify(template)));
  };

  /**
   * Undoes the last command
   */
  const undo = (): Template | null => {
    if (!canUndo()) {
      return null;
    }

    // Decrement the current index
    currentIndex--;

    // Return the template at the current index
    return currentIndex >= 0 ? JSON.parse(JSON.stringify(snapshots[currentIndex])) : null;
  };

  /**
   * Redoes the last undone command
   */
  const redo = (): Template | null => {
    if (!canRedo()) {
      return null;
    }

    // Increment the current index
    currentIndex++;

    // Return the template at the current index
    return JSON.parse(JSON.stringify(snapshots[currentIndex]));
  };

  /**
   * Checks if undo is available
   */
  const canUndo = (): boolean => {
    return currentIndex >= 0;
  };

  /**
   * Checks if redo is available
   */
  const canRedo = (): boolean => {
    return currentIndex < commandHistory.length - 1;
  };

  /**
   * Clears the history
   */
  const clear = () => {
    commandHistory.length = 0;
    snapshots.length = 0;
    currentIndex = -1;
  };

  return {
    addCommand: (command: TemplateCommand) => {
      addCommand(command);
    },
    undo,
    redo,
    canUndo,
    canRedo,
    clear,
  };
}
