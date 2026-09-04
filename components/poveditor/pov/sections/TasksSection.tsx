"use client";

import React from 'react';
import { useEditorContext } from '../context';
import TaskEditor from '../components/TaskEditor';

const TasksSection = React.memo(() => {
  const { state } = useEditorContext();
  
  // Check if we're in project mode
  const isProjectMode = state.ui?.mode === 'project';
  
  return (
    <div className="space-y-6">
      <TaskEditor mode="edit" />
    </div>
  );
});

TasksSection.displayName = 'TasksSection';

export default TasksSection;
