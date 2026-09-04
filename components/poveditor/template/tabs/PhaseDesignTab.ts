import { TemplateTab } from './types';
import PhaseTemplateDesignSection from '../sections/PhaseTemplateDesignSection';

export const PhaseDesignTab: TemplateTab = {
  id: 'phase-design',
  label: 'Phase Design',
  description: 'Design phases, stages, and tasks',
  component: PhaseTemplateDesignSection,
  icon: 'BuildingOffice2Icon',
  order: 2,
  templateTypes: ['phase'],
  isRequired: false,
  validation: {
    custom: (templateData: any) => {
      const phases = templateData.phases || {};
      const stages = templateData.stages || {};
      const tasks = templateData.tasks || {};
      
      const errors: Record<string, string[]> = {};
      
      // Check if at least one phase exists
      const phaseCount = Object.keys(phases).length;
      if (phaseCount === 0) {
        errors.phases = ['At least one phase is required for phase templates'];
      }
      
      // Check if phases have stages
      const phasesWithoutStages = Object.values(phases).filter((phase: any) => {
        const phaseStages = Object.values(stages).filter((stage: any) => stage.phaseId === phase.id);
        return phaseStages.length === 0;
      });
      
      if (phasesWithoutStages.length > 0) {
        if (!errors.phases) errors.phases = [];
        errors.phases.push(`${phasesWithoutStages.length} phase(s) have no stages defined`);
      }
      
      // Check if stages have tasks
      const stagesWithoutTasks = Object.values(stages).filter((stage: any) => {
        const stageTasks = Object.values(tasks).filter((task: any) => task.stageId === stage.id);
        return stageTasks.length === 0;
      });
      
      if (stagesWithoutTasks.length > 0) {
        if (!errors.stages) errors.stages = [];
        errors.stages = [`${stagesWithoutTasks.length} stage(s) have no tasks defined`];
      }
      
      return {
        isValid: Object.keys(errors).length === 0,
        errors
      };
    }
  }
};
