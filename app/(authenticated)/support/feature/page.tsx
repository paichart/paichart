'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
} from '@/components/ui/Form';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { FeatureRequestCreate, FEATURE_REQUEST_CATEGORIES } from '@/lib/types/support';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

// Define the impact levels as a const array
const IMPACT_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

const featureRequestSchema = z.object({
  category: z.enum(FEATURE_REQUEST_CATEGORIES),
  impact: z.enum(IMPACT_LEVELS),
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  businessCase: z.string().min(1, 'Business case is required'),
  isUrgent: z.boolean().default(false),
});

type FeatureRequestFormData = z.infer<typeof featureRequestSchema>;

export default function FeatureRequestPage() {
  const { user } = useAuth();
  const [success, setSuccess] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<FeatureRequestFormData>({
    resolver: zodResolver(featureRequestSchema),
    defaultValues: {
      category: 'functionality',
      impact: 'MEDIUM',
      title: '',
      description: '',
      businessCase: '',
      isUrgent: false,
    },
  });

  const onSubmit = async (data: FeatureRequestFormData) => {
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/support/feature', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('Failed to submit feature request');
      }

      setSuccess(true);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Feature Request</h1>

      <Card className="p-6 max-w-3xl mx-auto">
        {success && (
          <Alert className="mb-6 bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
            <AlertDescription>Feature request submitted successfully</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Form form={form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {FEATURE_REQUEST_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category === 'functionality' && 'New Functionality'}
                            {category === 'improvement' && 'Improvement'}
                            {category === 'integration' && 'Integration'}
                            {category === 'usability' && 'Usability'}
                            {category === 'performance' && 'Performance'}
                            {category === 'other' && 'Other'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="impact"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Impact</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select impact" />
                      </SelectTrigger>
                      <SelectContent>
                        {IMPACT_LEVELS.map((impact) => (
                          <SelectItem key={impact} value={impact}>
                            {impact.charAt(0) + impact.slice(1).toLowerCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Feature Title</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Brief title for the feature" />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Detailed description of the feature and how it should work"
                      className="min-h-[100px]"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="businessCase"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Case</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Explain why this feature would be valuable to the business"
                      className="min-h-[80px]"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isUrgent"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      This feature request is time-sensitive
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={form.formState.isSubmitting}
                className="min-w-[120px]"
              >
                {form.formState.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Submit'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </Card>
    </div>
  );
}
