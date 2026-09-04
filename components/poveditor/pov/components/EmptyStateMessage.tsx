"use client";

import React from 'react';
import { Bot } from 'lucide-react';

interface EmptyStateMessageProps {
  title?: string;
  message?: string;
  icon?: React.ReactNode;
}

export const EmptyStateMessage: React.FC<EmptyStateMessageProps> = ({
  title = 'No Task Selected',
  message = 'Select a task in the Phases tab to configure its agent capabilities.',
  icon = <Bot className="h-12 w-12 text-muted-foreground mb-4" />
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon}
      <h3 className="text-lg font-medium mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        {message}
      </p>
    </div>
  );
};
