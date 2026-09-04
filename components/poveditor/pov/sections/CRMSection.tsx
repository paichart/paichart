"use client";

import { useEditorContext } from '../context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { Spinner } from '@/components/ui/Spinner';
import { useState } from 'react';

export default function CRMSection() {
  const { state, updateField } = useEditorContext();
  const { data } = state;
  
  // Local state for CRM sync
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(false);
  
  // Handle text input changes
  const handleInputChange = (field: string, value: string | string[]) => {
    updateField(['data', field], value);
  };
  
  // Handle CRM sync
  const handleSync = async () => {
    setIsSyncing(true);
    setSyncError(null);
    
    try {
      // This would be replaced with an actual API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Simulate successful sync
      updateField(['data', 'lastCrmSync'], new Date().toISOString());
      updateField(['data', 'crmSyncStatus'], 'SUCCESS');
      
      // For demo purposes, we'll update some fields with "synced" data
      if (!data.dealId) {
        updateField(['data', 'dealId'], `CRM-${Math.floor(Math.random() * 10000)}`);
      }
      
      if (!data.opportunityName && data.title) {
        updateField(['data', 'opportunityName'], `Opportunity: ${data.title}`);
      }
    } catch {
      setSyncError('Failed to sync with CRM. Please try again.');
      updateField(['data', 'crmSyncStatus'], 'FAILED');
    } finally {
      setIsSyncing(false);
    }
  };
  
  // Format date for display
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'Invalid date';
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>CRM Integration</CardTitle>
        <CardDescription>
          Connect and synchronize with your CRM system
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* CRM Sync Status */}
        <div className="bg-muted p-4 rounded-md">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="font-medium">CRM Sync Status</h3>
              <p className="text-sm text-muted-foreground">
                Last synced: {formatDate(data.lastCrmSync)}
              </p>
            </div>
            <Button 
              onClick={handleSync} 
              disabled={isSyncing}
              variant="outline"
            >
              {isSyncing ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  Syncing...
                </>
              ) : (
                'Sync Now'
              )}
            </Button>
          </div>
          
          {syncError && (
            <div className="text-sm text-destructive mb-4">
              {syncError}
            </div>
          )}
          
          <div className="flex items-center space-x-2">
            <Switch
              id="auto-sync"
              checked={autoSync}
              onCheckedChange={setAutoSync}
            />
            <Label htmlFor="auto-sync">Enable automatic sync</Label>
          </div>
        </div>
        
        {/* CRM Fields */}
        <div className="space-y-4">
          <h3 className="font-medium">CRM Data</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dealId">Deal ID</Label>
              <Input
                id="dealId"
                value={data.dealId || ''}
                onChange={(e) => handleInputChange('dealId', e.target.value)}
                placeholder="CRM Deal ID"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="opportunityName">Opportunity Name</Label>
              <Input
                id="opportunityName"
                value={data.opportunityName || ''}
                onChange={(e) => handleInputChange('opportunityName', e.target.value)}
                placeholder="CRM Opportunity Name"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="revenue">Expected Revenue</Label>
            <Input
              id="revenue"
              type="number"
              value={data.revenue?.toString() || ''}
              onChange={(e) => handleInputChange('revenue', e.target.value)}
              placeholder="Expected revenue amount"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="forecastDate">Forecast Date</Label>
            <Input
              id="forecastDate"
              type="date"
              value={data.forecastDate ? new Date(data.forecastDate).toISOString().split('T')[0] : ''}
              onChange={(e) => handleInputChange('forecastDate', new Date(e.target.value).toISOString())}
            />
          </div>
        </div>
        
        {/* Partner Information */}
        <div className="space-y-4">
          <h3 className="font-medium">Partner Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="partnerName">Partner Name</Label>
              <Input
                id="partnerName"
                value={data.partnerName || ''}
                onChange={(e) => handleInputChange('partnerName', e.target.value)}
                placeholder="Partner organization name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="partnerContact">Partner Contact</Label>
              <Input
                id="partnerContact"
                value={data.partnerContact || ''}
                onChange={(e) => handleInputChange('partnerContact', e.target.value)}
                placeholder="Partner contact person"
              />
            </div>
          </div>
        </div>
        
        {/* Competitors */}
        <div className="space-y-2">
          <Label htmlFor="competitors">Competitors</Label>
          <Textarea
            id="competitors"
            value={data.competitors ? data.competitors.join(', ') : ''}
            onChange={(e) => handleInputChange('competitors', e.target.value.split(',').map(item => item.trim()))}
            placeholder="Enter competitors, separated by commas"
            rows={3}
          />
          <p className="text-xs text-muted-foreground">
            Enter competitor names separated by commas
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
