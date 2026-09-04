"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { ChevronLeft, ChevronRight, Save, Check } from 'lucide-react';
import { useEditorContext } from './context';
import { POVTemplate, SectionDefinition } from '@/lib/pov/templates/types';
import DynamicFieldsWizardSection from './sections/DynamicFieldsWizardSection';
// Import from components/poveditor/pov/sections (consistent location)
import GeographicalSection from './sections/GeographicalSection';
import PhaseTemplatesSection from './sections/PhaseTemplatesSection';
import TemplateWizardReviewSection from './sections/TemplateWizardReviewSection';
import TemplateSelectionSection from './sections/TemplateSelectionSection';

interface TemplateWizardProps {
  templateId?: string;
}

export default function TemplateWizard({ templateId }: TemplateWizardProps) {
  const router = useRouter();
  const { state, updateField } = useEditorContext();
  
  const [template, setTemplate] = useState<POVTemplate | null>(null);
  const [loading, setLoading] = useState(!!templateId);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [selectedPhaseTemplates, setSelectedPhaseTemplates] = useState<string[]>([]);
  const [phaseTemplates, setPhaseTemplates] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  
  // Fetch template data
  useEffect(() => {
    if (!templateId) return;
    
    const fetchTemplate = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/pov-templates/${templateId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch template');
        }
        
        const data = await response.json();

        // Extract template from wrapped response
        const template = data.template || data;
        setTemplate(template);
        
        // Set initial selected phase templates from the fetched template's metadata
        if (template?.metadata?.phaseTemplates?.length) {
          setSelectedPhaseTemplates(template.metadata.phaseTemplates);
          
          // Fetch phase templates
          const phaseTemplatePromises = template.metadata.phaseTemplates.map(
            async (id: string) => {
              const response = await fetch(`/api/phase-templates/${id}`);
              if (response.ok) {
                return await response.json();
              }
              return null;
            }
          );
          
          const phaseTemplateResults = await Promise.all(phaseTemplatePromises);
          setPhaseTemplates(phaseTemplateResults.filter(Boolean));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load template');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTemplate();
  }, [templateId]);
  
  // Handle field change
  const handleFieldChange = (fieldId: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value
    }));
  };
  
  // Handle geographical change
  const handleGeographicalChange = (data: {
    theatre?: string;
    regionId?: string;
    countryId?: string;
  }) => {
    setFormData(prev => ({
      ...prev,
      salesTheatre: data.theatre,
      regionId: data.regionId,
      countryId: data.countryId
    }));
  };
  
  // Handle phase templates change
  const handlePhaseTemplatesChange = (selectedIds: string[]) => {
    setSelectedPhaseTemplates(selectedIds);
  };
  
  // Handle next step
  const handleNext = () => {
    // Validate current section
    const currentSection = getSections()[currentStep];
    
    if (currentSection?.id === 'geographical' && !formData.countryId) {
      setError('Country selection is required');
      return;
    }
    
    if (currentStep < getSections().length - 1) {
      setCurrentStep(currentStep + 1);
      setError(null);
    }
  };
  
  // Handle previous step
  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };
  
  // Handle save draft
  const handleSaveDraft = () => {
    setSaving(true);
    // TODO: Implement save draft logic
    setTimeout(() => {
      setSaving(false);
    }, 1000);
  };
  
  // Handle submit
  const handleSubmit = async () => {
    // Validate required fields
    if (!formData.countryId) {
      setError('Country selection is required');
      // Find the geographical section and navigate to it
      const geoSectionIndex = getSections().findIndex(section => section.id === 'geographical');
      if (geoSectionIndex >= 0) {
        setCurrentStep(geoSectionIndex);
      }
      return;
    }
    
    setSaving(true);
    setError(null);
    
    // Combine form data with selected phase templates
    const finalData = {
      templateId,
      formData,
      phaseTemplateIds: selectedPhaseTemplates
    };
    
    try {
      // Create POV from template
      const response = await fetch('/api/pov', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(finalData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create POV');
      }
      
      const data = await response.json();
      
      // Redirect to the new POV
      router.push(`/pov/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create POV');
      setSaving(false);
    }
  };
  
  // Get sections based on the template
  const getSections = (): (SectionDefinition & { id: string })[] => {
    if (!template) {
      return [];
    }
    
    // Start with standard sections (add empty fields array to match SectionDefinition type)
    const standardSections = [
      { id: 'geographical', title: 'Geographical', description: 'Select the geographical information for this POV', fields: [] },
      { id: 'phase-templates', title: 'Phase Templates', description: 'Select the phase templates to include in this POV', fields: [] }
    ];
    
    // Add template-specific sections
    const templateSections = (template.sections || []).map(section => ({
      ...section,
      id: section.id
    }));
    
    // Add review section
    const reviewSection = { id: 'review', title: 'Review', description: 'Review your POV details before creating', fields: [] };
    
    return [...standardSections, ...templateSections, reviewSection];
  };
  
  // Get steps for the stepper
  const getSteps = () => {
    return getSections().map(section => ({
      id: section.id,
      label: section.title
    }));
  };
  
  // Render the current section
  const renderCurrentSection = () => {
    if (!template) {
      return <TemplateSelectionSection />;
    }
    
    const sections = getSections();
    const currentSection = sections[currentStep];
    
    if (!currentSection) {
      return (
        <Alert variant="destructive">
          <AlertDescription>
            Invalid template structure. Please contact an administrator.
          </AlertDescription>
        </Alert>
      );
    }
    
    switch (currentSection.id) {
      case 'geographical':
        return (
          <GeographicalSection
            selectedTheatre={formData.salesTheatre}
            selectedRegion={formData.regionId}
            selectedCountry={formData.countryId}
            onChange={handleGeographicalChange}
          />
        );
      case 'phase-templates':
        return (
          <PhaseTemplatesSection
            selectedTemplateIds={selectedPhaseTemplates}
            phaseTemplates={phaseTemplates}
            onChange={handlePhaseTemplatesChange}
          />
        );
      case 'review':
        return (
          <TemplateWizardReviewSection
            formData={formData}
            selectedPhaseTemplates={selectedPhaseTemplates}
            phaseTemplates={phaseTemplates}
          />
        );
      default:
        // For template-specific sections, use DynamicFieldsSection
        const sectionFields = (template.sections || []).find(s => s.id === currentSection.id)?.fields || [];
        const fields = sectionFields.map(fieldId => (template.fields || {})[fieldId]).filter(Boolean);
        
        return (
          <DynamicFieldsWizardSection
            fields={fields}
            formData={formData}
            onChange={handleFieldChange}
          />
        );
    }
  };
  
  // Render the stepper
  const renderStepper = () => {
    const steps = getSteps();
    
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <div 
                className={`flex flex-col items-center ${index === currentStep ? 'text-primary' : 'text-muted-foreground'}`}
                onClick={() => setCurrentStep(index)}
                style={{ cursor: 'pointer' }}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 ${index === currentStep ? 'bg-primary text-primary-foreground' : index < currentStep ? 'bg-primary/20' : 'bg-muted'}`}>
                  {index < currentStep ? <Check className="h-4 w-4" /> : index + 1}
                </div>
                <span className="text-xs hidden md:block">{step.label}</span>
              </div>
              
              {index < steps.length - 1 && (
                <div className={`h-1 flex-1 mx-2 ${index < currentStep ? 'bg-primary/20' : 'bg-muted'}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };
  
  // Render navigation buttons
  const renderNavigation = () => {
    const isLastStep = currentStep === getSections().length - 1;
    
    return (
      <div className="flex justify-between mt-6">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={currentStep === 0 || saving}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>
        
        <div className="flex space-x-2">
          {!isLastStep && (
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={saving}
            >
              <Save className="h-4 w-4 mr-2" />
              Save Draft
            </Button>
          )}
          
          {isLastStep ? (
            <Button
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Create POV
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={saving}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    );
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }
  
  if (!templateId) {
    return <TemplateSelectionSection />;
  }
  
  if (error && !template) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error}
        </AlertDescription>
      </Alert>
    );
  }
  
  return (
    <div className="container mx-auto py-6 space-y-6">
      {template && (
        <>
          <div>
            <h1 className="text-2xl font-bold">Create POV from &quot;{template.name}&quot;</h1>
            <p className="text-muted-foreground">{template.description}</p>
          </div>
          
          {renderStepper()}
        </>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle>{getSections()[currentStep]?.title}</CardTitle>
        </CardHeader>
        
        <CardContent>
          {renderCurrentSection()}
        </CardContent>
        
        <CardFooter>
          {renderNavigation()}
        </CardFooter>
      </Card>
      
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
