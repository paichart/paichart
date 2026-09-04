"use client";

import React from 'react';
import { SectionsStep as ModularSectionsStep } from './sections/SectionsStep';
import { SectionDefinition, FieldDefinition } from '@/lib/pov/templates/types';

interface SectionsStepProps {
  sections: SectionDefinition[];
  fields: Record<string, FieldDefinition>;
  onUpdate: (sections: SectionDefinition[]) => void;
}

/**
 * SectionsStep component for the template wizard
 * This is a wrapper around the modular SectionsStep component
 */
export function SectionsStep({ sections, fields, onUpdate }: SectionsStepProps) {
  // Debug fields being received by SectionsStep
  
  return (
    <ModularSectionsStep
      sections={sections}
      fields={fields}
      onUpdate={onUpdate}
    />
  );
}

export default SectionsStep;