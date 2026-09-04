'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/Form";
import { config } from '@/lib/config';

const verifySchema = z.object({
  password: z.string()
    .min(config.auth.passwordMinLength, `Password must be at least ${config.auth.passwordMinLength} characters`)
    .max(config.auth.passwordMaxLength, `Password must be less than ${config.auth.passwordMaxLength} characters`)
    .regex(config.auth.passwordPattern, {
      message: "Password must include uppercase, lowercase, number, and special character",
    }),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type VerifyFormData = z.infer<typeof verifySchema>;

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <Card className="p-6 max-w-md mx-auto mt-8">
        <div className="text-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </Card>
    }>
      <VerifyPageContent />
    </Suspense>
  );
}

function VerifyPageContent() {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token');

  const form = useForm<VerifyFormData>({
    resolver: zodResolver(verifySchema),
    defaultValues: {
      password: '',
      confirmPassword: ''
    }
  });

  const onSubmit = async (data: VerifyFormData) => {
    if (!token) {
      setError('Verification token is missing');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const res = await fetch(`/api/auth/verify/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: data.password,
        }),
      });

      if (!res.ok) {
        const responseData = await res.json();
        throw new Error(responseData.error || 'Verification failed');
      }

      router.push('/login?verified=true');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <Card className="p-6 max-w-md mx-auto mt-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Invalid Verification Link</h2>
          <p className="text-muted-foreground mb-6">
            The verification link is invalid or has expired. Please try registering again.
          </p>
          <Button
            onClick={() => router.push('/register')}
            className="w-full"
          >
            Register
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 max-w-md mx-auto mt-8">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold">Set Your Password</h2>
        <p className="text-muted-foreground mt-2">
          Please set a password to complete your account verification
        </p>
      </div>

      <Form form={form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {error}
              </AlertDescription>
            </Alert>
          )}
          
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="password"
                    autoComplete="new-password"
                    disabled={isLoading}
                    required
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm Password</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="password"
                    autoComplete="new-password"
                    disabled={isLoading}
                    required
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-2">
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? 'Verifying...' : 'Set Password'}
            </Button>
          </div>
        </form>
      </Form>
    </Card>
  );
}
