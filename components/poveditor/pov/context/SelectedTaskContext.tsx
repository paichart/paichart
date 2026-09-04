"use client";

import React, { createContext, useContext, useState } from 'react';

interface SelectedTaskContextType {
  selectedTaskId: string | null;
  updateSelectedTask: (taskId: string | null) => void;
}

export const SelectedTaskContext = createContext<SelectedTaskContextType>({
  selectedTaskId: null,
  updateSelectedTask: () => {}
});

export function SelectedTaskProvider({ children }: { children: React.ReactNode }) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  
  const updateSelectedTask = (taskId: string | null) => {
    setSelectedTaskId(taskId);
  };
  
  return (
    <SelectedTaskContext.Provider value={{ selectedTaskId, updateSelectedTask }}>
      {children}
    </SelectedTaskContext.Provider>
  );
}

export function useSelectedTask() {
  return useContext(SelectedTaskContext);
}
