"use client";

import React from 'react';
import { TemplateProvider } from '../context/TemplateContext';
import { TemplateRelationshipManager } from './TemplateRelationshipManager';

interface TemplateRelationshipManagerWrapperProps {
  povTemplateId?: string;
  readOnly?: boolean;
}

/**
 * Wrapper component for TemplateRelationshipManager that provides the TemplateProvider
 */
export function TemplateRelationshipManagerWrapper({
  povTemplateId,
  readOnly = false
}: TemplateRelationshipManagerWrapperProps) {
  return (
    <TemplateProvider>
      <TemplateRelationshipManager
        povTemplateId={povTemplateId}
        readOnly={readOnly}
      />
    </TemplateProvider>
  );
}