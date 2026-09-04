'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/Form';
import { Input } from '@/components/ui/Input';
import { ArrayInputField } from '@/components/ui/ArrayInputField';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { DatePicker } from '@/components/ui/DatePicker';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { POVStatus, Priority } from '@/lib/types/pov';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import dayjs from 'dayjs';
import { GeographicalSelect } from '@/components/ui/GeographicalSelect';
import { SalesTheatre } from '@prisma/client';

// Fetch teams for the multi-select
const useTeams = () => {
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const response = await fetch('/api/teams');
        if (response.ok) {
          const data = await response.json();
          setTeams(data.teams || []);
        }
      } catch {
        // Could not fetch teams
      } finally {
        setLoading(false);
      }
    };

    fetchTeams();
  }, []);

  return { teams, loading };
};

const formSchema = z.object({
  title: z.string().min(1, 'POV Name is required'),
  description: z.string().min(1, 'Description is required'),
  status: z.nativeEnum(POVStatus),
  priority: z.nativeEnum(Priority),
  startDate: z.date(),
  endDate: z.date(),
  opportunityName: z.string().optional(),
  revenue: z.string().optional(), // Using string for currency input
  forecastDate: z.date().optional().nullable(),
  customerName: z.string().optional(),
  customerContact: z.string().optional(),
  partnerName: z.string().optional(),
  partnerContact: z.string().optional(),
  objective: z.string().min(1, 'Objective is required'),
  solution: z.string().min(1, 'Solution is required'),
  // Removed teamId as it's no longer needed in the basic form
  salesTheatre: z.nativeEnum(SalesTheatre),
  countryId: z.string().min(1, 'Country is required'),
  regionId: z.string().optional(),
  competitors: z.array(z.string()).optional().default([]),
});

type FormData = z.infer<typeof formSchema>;

const initialFormData: Partial<FormData> = {
  title: '',
  description: '',
  status: POVStatus.PROJECTED,
  priority: Priority.MEDIUM,
  startDate: new Date(),
  endDate: dayjs().add(1, 'month').toDate(),
  opportunityName: '',
  revenue: '',
  forecastDate: null,
  customerName: '',
  customerContact: '',
  partnerName: '',
  partnerContact: '',
  objective: '',
  solution: '',
  salesTheatre: SalesTheatre.NORTH_AMERICA,
  competitors: [],
};

export default function CreatePoVForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { teams, loading: teamsLoading } = useTeams();
  const { preferences, loading: preferencesLoading } = useUserPreferences();

  // Create form with default values
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: initialFormData as any,
  });

  // Update form values when user preferences are loaded
  useEffect(() => {
    if (!preferencesLoading && preferences) {
      // Only update if preferences exist and have values
      if (preferences.preferredSalesTheatre) {
        form.setValue('salesTheatre', preferences.preferredSalesTheatre);
      }
      if (preferences.preferredCountryId) {
        form.setValue('countryId', preferences.preferredCountryId);
      }
      if (preferences.preferredRegionId) {
        form.setValue('regionId', preferences.preferredRegionId);
      }
    }
  }, [preferences, preferencesLoading, form]);

  const onSubmit = async (data: FormData) => {
    if (data.endDate < data.startDate) {
      form.setError('endDate', {
        type: 'manual',
        message: 'End date must be after start date',
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Map form fields to API expected format
      const formattedData = {
        title: data.title,
        description: data.description,
        objective: data.objective,
        status: data.status,
        priority: data.priority,
        startDate: data.startDate,
        endDate: data.endDate,
        opportunityName: data.opportunityName,
        revenue: data.revenue ? parseFloat(data.revenue) : undefined,
        forecastDate: data.forecastDate,
        customerName: data.customerName,
        customerContact: data.customerContact,
        partnerName: data.partnerName,
        partnerContact: data.partnerContact,
        solution: data.solution,
        salesTheatre: data.salesTheatre,
        countryId: data.countryId,
        regionId: data.regionId,
        competitors: data.competitors,
      };

      const response = await fetch('/api/pov', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formattedData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create POV');
      }

      await router.replace('/pov/list');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Handle geographical selection
  const handleGeographicalChange = (data: {
    theatre?: SalesTheatre;
    countryId?: string;
    regionId?: string;
  }) => {
    if (data.theatre) {
      form.setValue('salesTheatre', data.theatre);
    }
    if (data.countryId !== undefined) {
      form.setValue('countryId', data.countryId);
    }
    if (data.regionId !== undefined) {
      form.setValue('regionId', data.regionId);
    }
  };

  return (
    <Card>
      <CardContent className="p-6">
        <Form form={form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-6">Basic Information</h2>

              {error && (
                <Alert variant="destructive" className="mb-6">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>POV Name *</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="opportunityName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Opportunity Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="revenue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Revenue</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="number" 
                            step="0.01" 
                            placeholder="0.00" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="forecastDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Forecast Date</FormLabel>
                        <FormControl>
                          <DatePicker
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="customerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="customerContact"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Customer Contact</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="partnerName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Partner Name</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="partnerContact"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Partner Contact</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={POVStatus.PROJECTED}>Projected</SelectItem>
                            <SelectItem value={POVStatus.IN_PROGRESS}>In Progress</SelectItem>
                            <SelectItem value={POVStatus.STALLED}>Stalled</SelectItem>
                            <SelectItem value={POVStatus.VALIDATION}>Validation</SelectItem>
                            <SelectItem value={POVStatus.WON}>Successful</SelectItem>
                            <SelectItem value={POVStatus.LOST}>Unsuccessful</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value={Priority.LOW}>Low</SelectItem>
                            <SelectItem value={Priority.MEDIUM}>Medium</SelectItem>
                            <SelectItem value={Priority.HIGH}>High</SelectItem>
                            <SelectItem value={Priority.URGENT}>Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date</FormLabel>
                          <FormControl>
                            <DatePicker
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Date</FormLabel>
                          <FormControl>
                            <DatePicker
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Team Selection field removed as requested */}

                  {/* Geographical Selection */}
                  <div className="space-y-4 mt-4">
                    <h3 className="text-md font-medium">Geographical Information</h3>
                    <GeographicalSelect
                      selectedTheatre={form.watch('salesTheatre')}
                      selectedCountry={form.watch('countryId')}
                      selectedRegion={form.watch('regionId')}
                      onChange={handleGeographicalChange}
                    />
                    {form.formState.errors.countryId && (
                      <p className="text-sm font-medium text-destructive">
                        {form.formState.errors.countryId.message}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Full Width Fields */}
              <div className="space-y-4 mt-6">
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description *</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} />
                      </FormControl>
                      <FormDescription>
                        Provide a comprehensive description of the POV
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="objective"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Objective *</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} />
                      </FormControl>
                      <FormDescription>
                        Describe the specific objectives and key goals of this POV
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="solution"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Solution *</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} />
                      </FormControl>
                      <FormDescription>
                        Brief description of the proposed solution
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="competitors"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Competitors</FormLabel>
                      <FormControl>
                        <ArrayInputField
                          value={field.value || []}
                          onChange={(value) => form.setValue('competitors', value, { shouldValidate: true })}
                          placeholder="Enter competitors (comma-separated)"
                        />
                      </FormControl>
                      <FormDescription>
                        List the competitors in this space (comma-separated)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-4 mt-6">
                <Button
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create POV'}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
