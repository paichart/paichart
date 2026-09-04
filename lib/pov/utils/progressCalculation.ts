// Task status types
type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';

// Task interface
interface Task {
  id: string;
  status: TaskStatus;
  phaseId?: string;
  priority?: string;
  dueDate?: string;
}

// Phase interface
interface Phase {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  order: number;
}

// Progress metrics interface
export interface ProgressMetrics {
  overall: {
    total: number;
    completed: number;
    percentage: number;
  };
  byStatus: {
    open: number;
    inProgress: number;
    completed: number;
    blocked: number;
  };
  byPhase: Array<{
    phaseId: string;
    phaseName: string;
    total: number;
    completed: number;
    percentage: number;
  }>;
  timeline: {
    onTrack: boolean;
    daysRemaining: number;
    estimatedCompletion: Date | null;
  };
}

/**
 * Calculate task completion percentage
 */
export function calculateTaskCompletion(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  
  const completedTasks = tasks.filter(task => task.status === 'COMPLETED').length;
  return Math.round((completedTasks / tasks.length) * 100);
}

/**
 * Calculate phase-based progress
 */
export function calculatePhaseProgress(
  tasks: Task[], 
  phases: Phase[]
): Array<{ phaseId: string; phaseName: string; total: number; completed: number; percentage: number }> {
  return phases.map(phase => {
    const phaseTasks = tasks.filter(task => task.phaseId === phase.id);
    const completedTasks = phaseTasks.filter(task => task.status === 'COMPLETED').length;
    const percentage = phaseTasks.length > 0 ? Math.round((completedTasks / phaseTasks.length) * 100) : 0;
    
    return {
      phaseId: phase.id,
      phaseName: phase.name,
      total: phaseTasks.length,
      completed: completedTasks,
      percentage
    };
  });
}

/**
 * Calculate overall POV progress metrics
 */
export function calculatePOVProgress(
  tasks: Task[], 
  phases: Phase[], 
  povEndDate: Date
): ProgressMetrics {
  const total = tasks.length;
  const completed = tasks.filter(task => task.status === 'COMPLETED').length;
  const inProgress = tasks.filter(task => task.status === 'IN_PROGRESS').length;
  const open = tasks.filter(task => task.status === 'OPEN').length;
  const blocked = tasks.filter(task => task.status === 'BLOCKED').length;
  
  const overallPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  // Calculate phase progress
  const phaseProgress = calculatePhaseProgress(tasks, phases);
  
  // Calculate timeline metrics
  const now = new Date();
  const daysRemaining = Math.ceil((povEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  // Estimate completion based on current progress rate
  let estimatedCompletion: Date | null = null;
  if (overallPercentage > 0 && overallPercentage < 100) {
    const daysElapsed = Math.ceil((now.getTime() - phases[0]?.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const progressRate = overallPercentage / Math.max(daysElapsed, 1);
    const remainingProgress = 100 - overallPercentage;
    const estimatedDaysToComplete = remainingProgress / progressRate;
    estimatedCompletion = new Date(now.getTime() + (estimatedDaysToComplete * 24 * 60 * 60 * 1000));
  }
  
  const onTrack = estimatedCompletion ? estimatedCompletion <= povEndDate : overallPercentage === 100;
  
  return {
    overall: {
      total,
      completed,
      percentage: overallPercentage
    },
    byStatus: {
      open,
      inProgress,
      completed,
      blocked
    },
    byPhase: phaseProgress,
    timeline: {
      onTrack,
      daysRemaining,
      estimatedCompletion
    }
  };
}

/**
 * Get progress status color based on percentage and timeline
 */
export function getProgressStatusColor(percentage: number, onTrack: boolean): string {
  if (percentage === 100) return 'success';
  if (!onTrack) return 'destructive';
  if (percentage >= 75) return 'success';
  if (percentage >= 50) return 'primary';
  if (percentage >= 25) return 'warning';
  return 'muted';
}

/**
 * Calculate weighted progress (considering task priorities)
 */
export function calculateWeightedProgress(tasks: Task[]): number {
  if (tasks.length === 0) return 0;
  
  const weights = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1
  };
  
  let totalWeight = 0;
  let completedWeight = 0;
  
  tasks.forEach(task => {
    const weight = weights[task.priority as keyof typeof weights] || weights.MEDIUM;
    totalWeight += weight;
    
    if (task.status === 'COMPLETED') {
      completedWeight += weight;
    }
  });
  
  return totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
}

/**
 * Get tasks that are overdue
 */
export function getOverdueTasks(tasks: Task[]): Task[] {
  const now = new Date();
  
  return tasks.filter(task => {
    if (!task.dueDate || task.status === 'COMPLETED') return false;
    
    try {
      const dueDate = new Date(task.dueDate);
      return dueDate < now;
    } catch (error) {
      return false;
    }
  });
}

/**
 * Get tasks due soon (within next 7 days)
 */
export function getTasksDueSoon(tasks: Task[], days: number = 7): Task[] {
  const now = new Date();
  const futureDate = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
  
  return tasks.filter(task => {
    if (!task.dueDate || task.status === 'COMPLETED') return false;
    
    try {
      const dueDate = new Date(task.dueDate);
      return dueDate >= now && dueDate <= futureDate;
    } catch (error) {
      return false;
    }
  });
}

/**
 * Calculate progress velocity (tasks completed per day)
 */
export function calculateProgressVelocity(
  tasks: Task[], 
  startDate: Date, 
  endDate?: Date
): number {
  const completedTasks = tasks.filter(task => task.status === 'COMPLETED');
  const end = endDate || new Date();
  const daysElapsed = Math.max(1, Math.ceil((end.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
  
  return completedTasks.length / daysElapsed;
}

const progressCalculationUtils = {
  calculateTaskCompletion,
  calculatePhaseProgress,
  calculatePOVProgress,
  getProgressStatusColor,
  calculateWeightedProgress,
  getOverdueTasks,
  getTasksDueSoon,
  calculateProgressVelocity
};

export default progressCalculationUtils;
