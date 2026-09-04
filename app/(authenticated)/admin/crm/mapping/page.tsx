'use client';

import React, { useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from '@/components/ui/Form';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { Loader2Icon, PlusIcon, Pencil, Trash2 } from 'lucide-react';
import { useForm, type ControllerRenderProps } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

interface FieldMapping {
  id: string;
  crmField: string;
  localField: string;
  transformer?: string;
  isRequired: boolean;
}

const mappingFormSchema = z.object({
  crmField: z.string().min(1, 'CRM field is required'),
  localField: z.string().min(1, 'Local field is required'),
  transformer: z.string().optional(),
  isRequired: z.boolean().default(false),
});

type MappingFormData = z.infer<typeof mappingFormSchema>;

export default function CRMFieldMappingPage() {
  const [mappings, setMappings] = React.useState<FieldMapping[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingMapping, setEditingMapping] = React.useState<FieldMapping | null>(null);
  const form = useForm<MappingFormData>({
    resolver: zodResolver(mappingFormSchema),
    defaultValues: {
      crmField: '',
      localField: '',
      transformer: '',
      isRequired: false,
    }
  });

  useEffect(() => {
    loadMappings();
  }, []);

  const loadMappings = async () => {
    try {
      const response = await fetch('/api/admin/crm/mapping');
      if (!response.ok) {
        throw new Error('Failed to load field mappings');
      }
      const data = await response.json();
      setMappings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mappings');
    }
  };

  const handleOpenDialog = (mapping?: FieldMapping) => {
    if (mapping) {
      setEditingMapping(mapping);
      form.reset({
        crmField: mapping.crmField,
        localField: mapping.localField,
        transformer: mapping.transformer || '',
        isRequired: mapping.isRequired,
      });
    } else {
      setEditingMapping(null);
      form.reset({
        crmField: '',
        localField: '',
        transformer: '',
        isRequired: false,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingMapping(null);
    form.reset();
  };

  const onSubmit = async (data: MappingFormData) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/crm/mapping', {
        method: editingMapping ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editingMapping ? { id: editingMapping.id, ...data } : data),
      });

      if (!response.ok) {
        throw new Error('Failed to save field mapping');
      }

      await loadMappings();
      handleCloseDialog();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this mapping?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/crm/mapping/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete field mapping');
      }

      await loadMappings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete mapping');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">CRM Field Mapping</h1>
        <p className="text-muted-foreground">
          Configure field mappings between your CRM and PoV data.
        </p>
      </div>

      <Card>
        <div className="p-6 space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          )}

          <div>
            <Button
              onClick={() => handleOpenDialog()}
              className="gap-2"
            >
              <PlusIcon className="h-4 w-4" />
              Add Field Mapping
            </Button>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CRM Field</TableHead>
                  <TableHead>Local Field</TableHead>
                  <TableHead>Transformer</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((mapping) => (
                  <TableRow key={mapping.id}>
                    <TableCell>{mapping.crmField}</TableCell>
                    <TableCell>{mapping.localField}</TableCell>
                    <TableCell>{mapping.transformer || '-'}</TableCell>
                    <TableCell>{mapping.isRequired ? 'Yes' : 'No'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(mapping)}
                          className="h-8 w-8"
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(mapping.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {mappings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">
                      No field mappings configured
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMapping ? 'Edit Field Mapping' : 'Add Field Mapping'}
            </DialogTitle>
          </DialogHeader>

          <Form form={form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="crmField"
                  render={({ field }: { field: ControllerRenderProps<MappingFormData, "crmField"> }) => (
                    <FormItem>
                      <FormLabel>CRM Field</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter CRM field name"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="localField"
                  render={({ field }: { field: ControllerRenderProps<MappingFormData, "localField"> }) => (
                    <FormItem>
                      <FormLabel>Local Field</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter local field name"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="transformer"
                  render={({ field }: { field: ControllerRenderProps<MappingFormData, "transformer"> }) => (
                    <FormItem>
                      <FormLabel>Transformer Function</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Optional JavaScript function"
                        />
                      </FormControl>
                      <FormDescription>
                        Optional JavaScript function to transform data
                      </FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isRequired"
                  render={({ field }: { field: ControllerRenderProps<MappingFormData, "isRequired"> }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Switch
                          id="required"
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormLabel htmlFor="required">Required Field</FormLabel>
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={handleCloseDialog}
                  type="button"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading || form.formState.isSubmitting}
                >
                  {loading || form.formState.isSubmitting ? <Loader2Icon className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
