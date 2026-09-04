"use client";

import { useEditorContext } from '../context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';
import { useState } from 'react';
import { PlusCircle, Trash2, Edit, BarChart } from 'lucide-react';

// KPI types
type KPIType = 'PERCENTAGE' | 'NUMERIC' | 'BOOLEAN' | 'CUSTOM';

interface KPI {
  id: string;
  name: string;
  target: any;
  current: any;
  templateId?: string;
  weight?: number;
}

export default function KPISection() {
  const { state, updateField, addEntity, removeEntity, updateEntity } = useEditorContext();
  
  // Local state for KPI form
  const [showForm, setShowForm] = useState(false);
  const [editingKpiId, setEditingKpiId] = useState<string | null>(null);
  const [kpiName, setKpiName] = useState('');
  const [kpiType, setKpiType] = useState<KPIType>('NUMERIC');
  const [kpiTarget, setKpiTarget] = useState('');
  const [kpiWeight, setKpiWeight] = useState('');
  
  // Get KPIs from state
  const kpis = state.entities.kpis ? Object.values(state.entities.kpis) : [];
  
  // Reset form
  const resetForm = () => {
    setKpiName('');
    setKpiType('NUMERIC');
    setKpiTarget('');
    setKpiWeight('');
    setEditingKpiId(null);
    setShowForm(false);
  };
  
  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const kpiData = {
      name: kpiName,
      target: formatKpiValue(kpiType, kpiTarget),
      current: formatKpiValue(kpiType, '0'),
      weight: kpiWeight ? parseFloat(kpiWeight) : undefined,
    };
    
    if (editingKpiId) {
      // Update existing KPI
      updateEntity('kpis', editingKpiId, kpiData);
    } else {
      // Add new KPI
      addEntity('kpis', kpiData);
    }
    
    resetForm();
  };
  
  // Format KPI value based on type
  const formatKpiValue = (type: KPIType, value: string) => {
    switch (type) {
      case 'PERCENTAGE':
        return { value: parseFloat(value) / 100, format: 'percentage' };
      case 'NUMERIC':
        return { value: parseFloat(value), format: 'number' };
      case 'BOOLEAN':
        return { value: value === 'true', format: 'boolean' };
      case 'CUSTOM':
        return { value: value, format: 'custom' };
      default:
        return { value: value, format: 'text' };
    }
  };
  
  // Format KPI value for display
  const formatKpiValueForDisplay = (kpi: KPI) => {
    if (!kpi.target || !kpi.target.format) return '-';
    
    switch (kpi.target.format) {
      case 'percentage':
        return `${(kpi.target.value * 100).toFixed(1)}%`;
      case 'number':
        return kpi.target.value.toLocaleString();
      case 'boolean':
        return kpi.target.value ? 'Yes' : 'No';
      default:
        return kpi.target.value;
    }
  };
  
  // Format current value for display
  const formatCurrentValueForDisplay = (kpi: KPI) => {
    if (!kpi.current || !kpi.current.format) return '-';
    
    switch (kpi.current.format) {
      case 'percentage':
        return `${(kpi.current.value * 100).toFixed(1)}%`;
      case 'number':
        return kpi.current.value.toLocaleString();
      case 'boolean':
        return kpi.current.value ? 'Yes' : 'No';
      default:
        return kpi.current.value;
    }
  };
  
  // Calculate progress
  const calculateProgress = (kpi: KPI) => {
    if (!kpi.target || !kpi.current) return 0;
    
    switch (kpi.target.format) {
      case 'percentage':
      case 'number':
        return Math.min(100, Math.max(0, (kpi.current.value / kpi.target.value) * 100));
      case 'boolean':
        return kpi.current.value ? 100 : 0;
      default:
        return 0;
    }
  };
  
  // Edit KPI
  const handleEditKpi = (kpi: KPI) => {
    setEditingKpiId(kpi.id);
    setKpiName(kpi.name);
    setKpiType(kpi.target.format === 'percentage' ? 'PERCENTAGE' : 
               kpi.target.format === 'number' ? 'NUMERIC' :
               kpi.target.format === 'boolean' ? 'BOOLEAN' : 'CUSTOM');
    
    if (kpi.target.format === 'percentage') {
      setKpiTarget((kpi.target.value * 100).toString());
    } else if (kpi.target.format === 'boolean') {
      setKpiTarget(kpi.target.value ? 'true' : 'false');
    } else {
      setKpiTarget(kpi.target.value.toString());
    }
    
    setKpiWeight(kpi.weight?.toString() || '');
    setShowForm(true);
  };
  
  // Delete KPI
  const handleDeleteKpi = (kpiId: string) => {
    removeEntity('kpis', kpiId);
  };
  
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Key Performance Indicators</CardTitle>
            <CardDescription>
              Define and track KPIs for this POV
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? 'Cancel' : (
              <>
                <PlusCircle className="h-4 w-4 mr-2" />
                Add KPI
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* KPI Form */}
        {showForm && (
          <Card className="border border-muted">
            <CardHeader className="py-4">
              <CardTitle className="text-lg">
                {editingKpiId ? 'Edit KPI' : 'Add New KPI'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="kpi-name">KPI Name</Label>
                  <Input
                    id="kpi-name"
                    value={kpiName}
                    onChange={(e) => setKpiName(e.target.value)}
                    placeholder="Enter KPI name"
                    required
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="kpi-type">KPI Type</Label>
                    <Select
                      value={kpiType}
                      onValueChange={(value) => setKpiType(value as KPIType)}
                    >
                      <SelectTrigger id="kpi-type">
                        <SelectValue placeholder="Select KPI type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                        <SelectItem value="NUMERIC">Numeric</SelectItem>
                        <SelectItem value="BOOLEAN">Boolean (Yes/No)</SelectItem>
                        <SelectItem value="CUSTOM">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="kpi-target">Target Value</Label>
                    {kpiType === 'BOOLEAN' ? (
                      <Select
                        value={kpiTarget}
                        onValueChange={setKpiTarget}
                      >
                        <SelectTrigger id="kpi-target-boolean">
                          <SelectValue placeholder="Select target value" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Yes</SelectItem>
                          <SelectItem value="false">No</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="kpi-target"
                        type={kpiType === 'NUMERIC' || kpiType === 'PERCENTAGE' ? 'number' : 'text'}
                        value={kpiTarget}
                        onChange={(e) => setKpiTarget(e.target.value)}
                        placeholder="Enter target value"
                        required
                      />
                    )}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="kpi-weight">Weight (Optional)</Label>
                  <Input
                    id="kpi-weight"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={kpiWeight}
                    onChange={(e) => setKpiWeight(e.target.value)}
                    placeholder="Enter weight (0-100)"
                  />
                  <p className="text-xs text-muted-foreground">
                    Weight determines the importance of this KPI relative to others
                  </p>
                </div>
                
                <div className="flex justify-end space-x-2 pt-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={resetForm}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingKpiId ? 'Update KPI' : 'Add KPI'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
        
        {/* KPIs Table */}
        {kpis.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>KPI Name</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Current</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kpis.map((kpi: any) => (
                <TableRow key={kpi.id}>
                  <TableCell className="font-medium">{kpi.name}</TableCell>
                  <TableCell>{formatKpiValueForDisplay(kpi)}</TableCell>
                  <TableCell>{formatCurrentValueForDisplay(kpi)}</TableCell>
                  <TableCell>
                    <div className="w-full bg-muted rounded-full h-2.5">
                      <div 
                        className="bg-primary h-2.5 rounded-full" 
                        style={{ width: `${calculateProgress(kpi)}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {calculateProgress(kpi).toFixed(0)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleEditKpi(kpi)}
                      >
                        <Edit className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDeleteKpi(kpi.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 border rounded-md bg-muted/20">
            <BarChart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No KPIs defined</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Define key performance indicators to track the success of your POV
            </p>
            <Button 
              variant="outline" 
              onClick={() => setShowForm(true)}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Your First KPI
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
