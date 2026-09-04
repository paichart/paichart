'use client';

import React from 'react';
import { useTemplateData, useTemplateEditorActions } from '../context/TemplateEditorContext';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Separator } from '@/components/ui/Separator';
import { Plus, X, Info } from 'lucide-react';
import { TemplateTab } from './types';
import { ModelParametersSection, ModelParameters } from '@/components/poveditor/pov/components/ModelParametersSection';
import { LLMProvider, anthropicModels, toModelOptions } from '@/lib/services/llm/types';

/**
 * Agent Configuration Tab Component
 * Handles basic agent template configuration including role, capabilities, and constraints
 */
function AgentConfigTabComponent() {
  const templateData = useTemplateData();
  const { setField } = useTemplateEditorActions();

  // Read from root-level fields only (no fallback to nested agentConfig)
  const data = templateData as any;
  const templateMetadata = data.metadata || {};
  
  // Get current config from root fields with defaults
  const agentConfig = {
    defaultRole: data.defaultRole || '',
    category: data.category || 'GENERAL',
    priority: data.priority || 'MEDIUM',
    capabilities: data.capabilities || {},
    constraints: data.constraints || {},
    maxRetries: data.maxRetries ?? 3,
    timeout: data.timeout ?? 300,
    tags: data.tags || []
  };

  // Extract model parameters from metadata or use defaults
  const modelParameters: ModelParameters = {
    ...(templateMetadata.modelParameters || {
      provider: LLMProvider.ANTHROPIC_SDK,
      model: 'claude-haiku-4-5',
      temperature: 0.3,
      maxTokens: 25000,
      stopSequences: [],
      useSystemPrompt: true,
      cacheControl: null,
      thinkingBudgetTokens: undefined
    }),
    // System prompt is managed by PromptTemplateTab via promptTemplate field
    // We provide empty string here to satisfy the interface
    systemPrompt: ''
  };

  // Update root-level fields directly
  const updateAgentConfig = (updates: any) => {
    // Update each field at the root level
    Object.entries(updates).forEach(([key, value]) => {
      setField([key], value);
    });
  };

  const updateModelParameters = (newParams: ModelParameters) => {
    const currentMetadata = (templateData as any).metadata || {};
    const updatedMetadata = {
      ...currentMetadata,
      modelParameters: newParams,
      hasModelParameters: true,
      modelParamsVersion: '1.0.0'
    };
    setField(['metadata'], updatedMetadata);
  };

  const addCapability = (key: string, value: string) => {
    if (key && value) {
      const capabilities = { ...agentConfig.capabilities };
      capabilities[key] = value;
      updateAgentConfig({ capabilities });
    }
  };

  const removeCapability = (key: string) => {
    const capabilities = { ...agentConfig.capabilities };
    delete capabilities[key];
    updateAgentConfig({ capabilities });
  };

  const addConstraint = (key: string, value: string) => {
    if (key && value) {
      const constraints = { ...agentConfig.constraints };
      constraints[key] = value;
      updateAgentConfig({ constraints });
    }
  };

  const removeConstraint = (key: string) => {
    const constraints = { ...agentConfig.constraints };
    delete constraints[key];
    updateAgentConfig({ constraints });
  };

  const addTag = (tag: string) => {
    if (tag && !agentConfig.tags.includes(tag)) {
      updateAgentConfig({
        tags: [...agentConfig.tags, tag]
      });
    }
  };

  const removeTag = (tag: string) => {
    updateAgentConfig({
      tags: agentConfig.tags.filter((t: string) => t !== tag)
    });
  };

  // Capability suggestions based on agent category
  const getCapabilitySuggestions = (category: string) => {
    const suggestions: Record<string, Record<string, string[]>> = {
      'DEVELOPMENT': {
        languages: ['JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'Go', 'Rust'],
        frameworks: ['React', 'Next.js', 'Vue.js', 'Angular', 'Express', 'FastAPI', 'Spring Boot'],
        tools: ['Git', 'Docker', 'Kubernetes', 'VS Code', 'IntelliJ', 'Postman', 'Jest'],
        skills: ['API Design', 'Database Design', 'Code Review', 'Debugging', 'Performance Optimization']
      },
      'TESTING': {
        languages: ['JavaScript', 'TypeScript', 'Python', 'Java'],
        frameworks: ['Jest', 'Cypress', 'Selenium', 'Playwright', 'JUnit', 'PyTest'],
        tools: ['Postman', 'Insomnia', 'BrowserStack', 'TestRail', 'Jira', 'Charles Proxy'],
        skills: ['Test Planning', 'Automation', 'Performance Testing', 'Security Testing', 'API Testing']
      },
      'DOCUMENTATION': {
        languages: ['Markdown', 'HTML', 'LaTeX', 'AsciiDoc'],
        frameworks: ['GitBook', 'Docusaurus', 'VuePress', 'Sphinx', 'MkDocs'],
        tools: ['Notion', 'Confluence', 'GitBook', 'Figma', 'Draw.io', 'Loom'],
        skills: ['Technical Writing', 'Information Architecture', 'User Guides', 'API Documentation', 'Diagramming']
      },
      'DEPLOYMENT': {
        languages: ['Bash', 'PowerShell', 'YAML', 'JSON', 'HCL'],
        frameworks: ['Terraform', 'Ansible', 'CloudFormation', 'Helm', 'Docker Compose'],
        tools: ['AWS', 'Azure', 'GCP', 'Jenkins', 'GitHub Actions', 'GitLab CI', 'ArgoCD'],
        skills: ['CI/CD', 'Infrastructure as Code', 'Container Orchestration', 'Monitoring', 'Security']
      },
      'ANALYSIS': {
        languages: ['Python', 'R', 'SQL', 'JavaScript', 'Scala'],
        frameworks: ['Pandas', 'NumPy', 'Matplotlib', 'D3.js', 'Tableau', 'Power BI'],
        tools: ['Jupyter', 'Excel', 'Tableau', 'Power BI', 'Google Analytics', 'Mixpanel'],
        skills: ['Data Analysis', 'Statistical Analysis', 'Data Visualization', 'Report Generation', 'KPI Tracking']
      },
      'AUTOMATION': {
        languages: ['Python', 'JavaScript', 'PowerShell', 'Bash', 'Go'],
        frameworks: ['Selenium', 'Puppeteer', 'Ansible', 'Zapier', 'IFTTT'],
        tools: ['Jenkins', 'GitHub Actions', 'Cron', 'Task Scheduler', 'Airflow'],
        skills: ['Process Automation', 'Workflow Design', 'Script Development', 'Integration', 'Monitoring']
      },
      'MONITORING': {
        languages: ['Python', 'Go', 'JavaScript', 'Bash', 'SQL'],
        frameworks: ['Prometheus', 'Grafana', 'ELK Stack', 'Datadog', 'New Relic'],
        tools: ['Grafana', 'Prometheus', 'Splunk', 'CloudWatch', 'PagerDuty', 'Slack'],
        skills: ['System Monitoring', 'Log Analysis', 'Alerting', 'Performance Tuning', 'Incident Response']
      },
      'REVIEW': {
        languages: ['JavaScript', 'TypeScript', 'Python', 'Java', 'C#'],
        frameworks: ['ESLint', 'Prettier', 'SonarQube', 'CodeClimate', 'Checkmarx'],
        tools: ['GitHub', 'GitLab', 'Bitbucket', 'SonarQube', 'CodeClimate', 'Reviewboard'],
        skills: ['Code Review', 'Security Review', 'Architecture Review', 'Best Practices', 'Mentoring']
      },
      'SECURITY': {
        languages: ['Python', 'JavaScript', 'Bash', 'PowerShell', 'Go'],
        frameworks: ['OWASP', 'Burp Suite', 'Metasploit', 'Nessus', 'Wireshark'],
        tools: ['Burp Suite', 'OWASP ZAP', 'Nmap', 'Wireshark', 'Vault', 'CyberArk'],
        skills: ['Penetration Testing', 'Vulnerability Assessment', 'Security Auditing', 'Compliance', 'Incident Response']
      },
      'GENERAL': {
        languages: ['JavaScript', 'TypeScript', 'Python', 'HTML', 'CSS'],
        frameworks: ['React', 'Node.js', 'Express', 'Next.js'],
        tools: ['VS Code', 'Git', 'Chrome DevTools', 'Postman', 'Figma'],
        skills: ['Problem Solving', 'Communication', 'Research', 'Documentation', 'Project Management']
      }
    };

    return suggestions[agentConfig.category] || {};
  };

  const addSuggestedCapability = (categoryType: string, capability: string) => {
    const capabilities = { ...agentConfig.capabilities };
    if (!capabilities[categoryType]) {
      capabilities[categoryType] = [];
    }
    if (!capabilities[categoryType].includes(capability)) {
      capabilities[categoryType] = [...capabilities[categoryType], capability];
      updateAgentConfig({ capabilities });
    }
  };

  const currentSuggestions = getCapabilitySuggestions(agentConfig.category);

  return (
    <div className="space-y-6">
      {/* Basic Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Basic Configuration
          </CardTitle>
          <CardDescription>
            Configure the fundamental properties of your agent template
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="defaultRole">Default Role</Label>
              <Input
                id="defaultRole"
                placeholder="e.g., Senior Software Developer"
                value={agentConfig.defaultRole}
                onChange={(e) => updateAgentConfig({ defaultRole: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={agentConfig.category}
                onValueChange={(value) => updateAgentConfig({ category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GENERAL">General</SelectItem>
                  <SelectItem value="DEVELOPMENT">Development</SelectItem>
                  <SelectItem value="TESTING">Testing</SelectItem>
                  <SelectItem value="DOCUMENTATION">Documentation</SelectItem>
                  <SelectItem value="DEPLOYMENT">Deployment</SelectItem>
                  <SelectItem value="ANALYSIS">Analysis</SelectItem>
                  <SelectItem value="AUTOMATION">Automation</SelectItem>
                  <SelectItem value="MONITORING">Monitoring</SelectItem>
                  <SelectItem value="REVIEW">Review</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={agentConfig.priority}
                onValueChange={(value) => updateAgentConfig({ priority: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="timeout">Timeout (seconds)</Label>
              <Input
                id="timeout"
                type="number"
                min="30"
                max="3600"
                value={agentConfig.timeout}
                onChange={(e) => {
                  const value = e.target.value === '' ? 300 : parseInt(e.target.value);
                  updateAgentConfig({ timeout: value });
                }}
                onBlur={(e) => {
                  if (e.target.value === '') {
                    updateAgentConfig({ timeout: 300 });
                  }
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxRetries">Max Retries</Label>
            <Input
              id="maxRetries"
              type="number"
              min="0"
              max="10"
              value={agentConfig.maxRetries}
              onChange={(e) => {
                const value = e.target.value === '' ? 3 : parseInt(e.target.value);
                updateAgentConfig({ maxRetries: value });
              }}
              onBlur={(e) => {
                if (e.target.value === '') {
                  updateAgentConfig({ maxRetries: 3 });
                }
              }}
            />
            {/* Honest labelling (2026-08-05): the value is stored and carried into the execution config,
                but nothing in the agent execution path loops on it — see the note on the schema field.
                Do not remove this hint without either wiring the field up or removing the control. */}
            <p className="text-xs text-muted-foreground">
              Stored, but not currently applied to agent executions. Retries today are fixed: one
              automatic retry if a response is truncated, and one reflection pass if confidence lands
              in the 50&ndash;69 band.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Model Parameters */}
      <ModelParametersSection
        parameters={modelParameters}
        onChange={updateModelParameters}
        availableModels={[
          { provider: LLMProvider.ANTHROPIC_SDK, models: toModelOptions(anthropicModels) }
        ]}
      />

      {/* Capabilities */}
      <Card>
        <CardHeader>
          <CardTitle>Capabilities</CardTitle>
          <CardDescription>
            Define agent capabilities as key-value pairs e.g. frameworks: React, Next.js, Vue.js or skills: API Testing, Security Testing, Performance Testing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(agentConfig.capabilities).map(([key, value]: [string, any]) => (
            <div key={key} className="flex items-center gap-2">
              <Input
                placeholder="Capability category"
                value={key}
                readOnly
                className="w-1/3"
              />
              <Input
                placeholder="Capability values (comma-separated)"
                value={value}
                onChange={(e) => {
                  const capabilities = { ...agentConfig.capabilities };
                  delete capabilities[key];
                  capabilities[key] = e.target.value;
                  updateAgentConfig({ capabilities });
                }}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => removeCapability(key)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="flex gap-2">
            <Input
              placeholder="Capability category"
              id="newCapabilityKey"
              className="w-1/3"
            />
            <Input
              placeholder="Capability values (comma-separated)"
              id="newCapabilityValue"
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={() => {
                const keyInput = document.getElementById('newCapabilityKey') as HTMLInputElement;
                const valueInput = document.getElementById('newCapabilityValue') as HTMLInputElement;
                if (keyInput?.value && valueInput?.value) {
                  addCapability(keyInput.value, valueInput.value);
                  keyInput.value = '';
                  valueInput.value = '';
                }
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Capability Suggestions */}
          {Object.keys(currentSuggestions).length > 0 && (
            <div className="mt-6 p-4 bg-muted/50 rounded-lg border border-dashed">
              <div className="flex items-center gap-2 mb-3">
                <Info className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium text-muted-foreground">
                  Suggested capabilities for {agentConfig.category} agents
                </Label>
              </div>
              
              {Object.entries(currentSuggestions).map(([categoryType, suggestions]) => (
                <div key={categoryType} className="mb-4 last:mb-0">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
                    {categoryType}
                  </Label>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => addCapability(categoryType, suggestions.join(', '))}
                    >
                      + Add All {categoryType}
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {suggestions.join(', ')}
                  </div>
                </div>
              ))}
              
              <div className="mt-3 text-xs text-muted-foreground">
                💡 Click &quot;Add All&quot; to add suggested capabilities for each category
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Constraints */}
      <Card>
        <CardHeader>
          <CardTitle>Constraints</CardTitle>
          <CardDescription>
            Tell the agent what not to do e.g. coding_standards: Must use TypeScript for all components, accessibility: Must follow WCAG 2.1 guidelines
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(agentConfig.constraints).map(([key, value]: [string, any]) => (
            <div key={key} className="flex items-center gap-2">
              <Input
                placeholder="Constraint name"
                value={key}
                readOnly
                className="w-1/3"
              />
              <Input
                placeholder="Constraint description"
                value={value}
                onChange={(e) => {
                  const constraints = { ...agentConfig.constraints };
                  delete constraints[key];
                  constraints[key] = e.target.value;
                  updateAgentConfig({ constraints });
                }}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => removeConstraint(key)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <div className="flex gap-2">
            <Input
              placeholder="Constraint name"
              id="newConstraintKey"
              className="w-1/3"
            />
            <Input
              placeholder="Constraint description"
              id="newConstraintValue"
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={() => {
                const keyInput = document.getElementById('newConstraintKey') as HTMLInputElement;
                const valueInput = document.getElementById('newConstraintValue') as HTMLInputElement;
                if (keyInput?.value && valueInput?.value) {
                  addConstraint(keyInput.value, valueInput.value);
                  keyInput.value = '';
                  valueInput.value = '';
                }
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
          <CardDescription>
            Add tags to help categorize and search for this template
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {agentConfig.tags.map((tag: string) => (
              <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                {tag}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-transparent"
                  onClick={() => removeTag(tag)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Add tag"
              id="newTag"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  const input = e.target as HTMLInputElement;
                  if (input.value) {
                    addTag(input.value);
                    input.value = '';
                  }
                }
              }}
            />
            <Button
              variant="outline"
              onClick={() => {
                const input = document.getElementById('newTag') as HTMLInputElement;
                if (input?.value) {
                  addTag(input.value);
                  input.value = '';
                }
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Agent Configuration Tab Definition
 */
export const AgentConfigTab: TemplateTab = {
  id: 'agent-config',
  label: 'Configuration',
  description: 'Configure agent role, capabilities, and constraints',
  component: AgentConfigTabComponent,
  icon: 'settings',
  order: 10,
  templateTypes: ['agent'],
  isRequired: true,
  validation: {
    required: ['defaultRole'],
    fields: {
      'defaultRole': {
        minLength: 3,
        maxLength: 100,
        message: 'Default role must be between 3 and 100 characters'
      }
    }
  }
};
