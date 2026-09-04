import { EditorTab } from '../types/EditorTab';
import { EditorState } from '../context/types/EditorState';
import PhaseKanbanSection from '../sections/PhaseKanbanSection';

/**
 * Dynamic Phase Tab Generator
 * 
 * Generates tab definitions for each phase in the POV data.
 * Used in project mode to create individual tabs for each phase.
 */

export interface PhaseTabData {
  id: string;
  name: string;
  description?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Generate dynamic phase tabs based on POV data
 */
export function generatePhaseTabsForProject(state: EditorState): EditorTab[] {
  const phases = state.entities?.phases || {};
  const phaseIds = Object.keys(phases);
  
  if (phaseIds.length === 0) {
    return [];
  }
  
  // Sort phases by their order field to ensure correct sequence
  const sortedPhases = phaseIds
    .map(phaseId => ({ phaseId, phase: phases[phaseId] }))
    .sort((a, b) => {
      const orderA = a.phase?.order ?? 999;
      const orderB = b.phase?.order ?? 999;
      return orderA - orderB;
    });
  
  return sortedPhases.map(({ phaseId, phase }, index) => {
    const phaseData: PhaseTabData = {
      id: phaseId,
      name: phase?.name || `Phase ${index + 1}`,
      description: phase?.description,
      status: undefined, // Phase doesn't have status in the current schema
      startDate: phase?.startDate,
      endDate: phase?.endDate,
    };
    
    return {
      id: `phase-${phaseId}`,
      label: phaseData.name,
      icon: 'KanbanSquare',
      order: index + 1, // Start from 1, ordered by phase sequence
      component: PhaseKanbanSection,
      componentProps: {
        phaseId,
        phaseData,
      },
      hidden: () => false, // Always visible in project mode
      description: `Kanban board for ${phaseData.name}`,
    } as EditorTab;
  });
}

/**
 * Check if dynamic tabs should be generated for the current mode
 */
export function shouldGenerateDynamicTabs(mode: string): boolean {
  return mode === 'project';
}

/**
 * Get the active phase tab ID based on selected phase
 */
export function getActivePhaseTabId(selectedPhaseId?: string): string | null {
  if (!selectedPhaseId) return null;
  return `phase-${selectedPhaseId}`;
}
