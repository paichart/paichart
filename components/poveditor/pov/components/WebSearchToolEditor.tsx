import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Switch } from '@/components/ui/Switch';
import { Separator } from '@/components/ui/Separator';
import { Plus, Trash2 } from 'lucide-react';

interface WebSearchToolConfig {
  maxUses?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  userLocation?: {
    type: 'approximate';
    city: string;
    region: string;
    country: string;
    timezone: string;
  };
}

interface WebSearchToolEditorProps {
  config: WebSearchToolConfig;
  onChange: (config: WebSearchToolConfig) => void;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export const WebSearchToolEditor: React.FC<WebSearchToolEditorProps> = ({
  config,
  onChange,
  enabled,
  onToggle
}) => {
  // Add a new allowed domain
  const handleAddAllowedDomain = () => {
    const domains = config.allowedDomains || [];
    onChange({
      ...config,
      allowedDomains: [...domains, ''],
      blockedDomains: undefined // Can't use both allowed and blocked domains
    });
  };

  // Remove an allowed domain
  const handleRemoveAllowedDomain = (index: number) => {
    const domains = [...(config.allowedDomains || [])];
    domains.splice(index, 1);
    onChange({
      ...config,
      allowedDomains: domains.length > 0 ? domains : undefined
    });
  };

  // Update an allowed domain
  const handleUpdateAllowedDomain = (index: number, value: string) => {
    const domains = [...(config.allowedDomains || [])];
    domains[index] = value;
    onChange({
      ...config,
      allowedDomains: domains
    });
  };

  // Add a new blocked domain
  const handleAddBlockedDomain = () => {
    const domains = config.blockedDomains || [];
    onChange({
      ...config,
      blockedDomains: [...domains, ''],
      allowedDomains: undefined // Can't use both allowed and blocked domains
    });
  };

  // Remove a blocked domain
  const handleRemoveBlockedDomain = (index: number) => {
    const domains = [...(config.blockedDomains || [])];
    domains.splice(index, 1);
    onChange({
      ...config,
      blockedDomains: domains.length > 0 ? domains : undefined
    });
  };

  // Update a blocked domain
  const handleUpdateBlockedDomain = (index: number, value: string) => {
    const domains = [...(config.blockedDomains || [])];
    domains[index] = value;
    onChange({
      ...config,
      blockedDomains: domains
    });
  };

  // Update user location
  const handleUpdateLocation = (field: string, value: string) => {
    const location = config.userLocation || {
      type: 'approximate',
      city: '',
      region: '',
      country: '',
      timezone: ''
    };

    onChange({
      ...config,
      userLocation: {
        ...location,
        [field]: value
      } as WebSearchToolConfig['userLocation']
    });
  };

  // Clear user location
  const handleClearLocation = () => {
    onChange({
      ...config,
      userLocation: undefined
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h3 className="text-lg font-medium">Web Search Tool</h3>
          <p className="text-sm text-muted-foreground">
            Allow the agent to search the web for real-time information
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
        />
      </div>

      {enabled && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <Label htmlFor="maxUses">Maximum Searches</Label>
              <Input
                id="maxUses"
                type="number"
                min={1}
                max={10}
                value={config.maxUses || 5}
                onChange={(e) => onChange({ ...config, maxUses: parseInt(e.target.value) || 5 })}
              />
              <p className="text-sm text-muted-foreground">
                Limit the number of searches the agent can perform (1-10)
              </p>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Allowed Domains</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddAllowedDomain}
                  disabled={!!config.blockedDomains?.length}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Domain
                </Button>
              </div>
              
              {config.blockedDomains?.length ? (
                <p className="text-xs text-amber-500">
                  You cannot use both allowed and blocked domains. Remove blocked domains first.
                </p>
              ) : config.allowedDomains?.length ? (
                <div className="space-y-2">
                  {config.allowedDomains.map((domain, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Input
                        value={domain}
                        onChange={(e) => handleUpdateAllowedDomain(index, e.target.value)}
                        placeholder="example.com"
                        className="font-mono text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAllowedDomain(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No allowed domains specified. The agent can search all domains.
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Blocked Domains</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddBlockedDomain}
                  disabled={!!config.allowedDomains?.length}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Domain
                </Button>
              </div>
              
              {config.allowedDomains?.length ? (
                <p className="text-xs text-amber-500">
                  You cannot use both allowed and blocked domains. Remove allowed domains first.
                </p>
              ) : config.blockedDomains?.length ? (
                <div className="space-y-2">
                  {config.blockedDomains.map((domain, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <Input
                        value={domain}
                        onChange={(e) => handleUpdateBlockedDomain(index, e.target.value)}
                        placeholder="example.com"
                        className="font-mono text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveBlockedDomain(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No blocked domains specified. The agent can search all domains.
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>User Location</Label>
                {config.userLocation && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleClearLocation}
                  >
                    Clear Location
                  </Button>
                )}
              </div>
              
              {config.userLocation ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="city" className="text-xs">City</Label>
                    <Input
                      id="city"
                      value={config.userLocation.city}
                      onChange={(e) => handleUpdateLocation('city', e.target.value)}
                      placeholder="San Francisco"
                    />
                  </div>
                  <div>
                    <Label htmlFor="region" className="text-xs">Region/State</Label>
                    <Input
                      id="region"
                      value={config.userLocation.region}
                      onChange={(e) => handleUpdateLocation('region', e.target.value)}
                      placeholder="California"
                    />
                  </div>
                  <div>
                    <Label htmlFor="country" className="text-xs">Country</Label>
                    <Input
                      id="country"
                      value={config.userLocation.country}
                      onChange={(e) => handleUpdateLocation('country', e.target.value)}
                      placeholder="US"
                    />
                  </div>
                  <div>
                    <Label htmlFor="timezone" className="text-xs">Timezone</Label>
                    <Input
                      id="timezone"
                      value={config.userLocation.timezone}
                      onChange={(e) => handleUpdateLocation('timezone', e.target.value)}
                      placeholder="America/Los_Angeles"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onChange({
                      ...config,
                      userLocation: {
                        type: 'approximate',
                        city: '',
                        region: '',
                        country: '',
                        timezone: ''
                      }
                    })}
                  >
                    Add Location
                  </Button>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Localize search results based on a specific location
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default WebSearchToolEditor;
