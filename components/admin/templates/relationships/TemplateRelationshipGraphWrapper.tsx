"use client";

import React from 'react';
import { TemplateProvider } from '../context/TemplateContext';
import { TemplateRelationshipGraph } from './TemplateRelationshipGraph';

interface TemplateRelationshipGraphWrapperProps {
  initialFilter?: {
    templateId?: string;
    templateType?: 'pov' | 'phase';
  };
}

/**
 * Wrapper component for TemplateRelationshipGraph that provides the TemplateProvider
 */
export function TemplateRelationshipGraphWrapper({
  initialFilter
}: TemplateRelationshipGraphWrapperProps) {
  return (
    <TemplateProvider>
      <TemplateRelationshipGraph 
        initialFilter={initialFilter}
      />
    </TemplateProvider>
  );
}