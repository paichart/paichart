'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Mail } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function CheckEmailPage() {
  const router = useRouter();

  return (
    <Card className="p-6 max-w-md mx-auto mt-8">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <Mail className="h-12 w-12 text-primary" />
        </div>
        <h2 className="text-2xl font-bold mb-4">Check your email</h2>
        <p className="text-muted-foreground mb-6">
          We&apos;ve sent you a verification link. Please check your email and click the link to verify your account.
        </p>
        <div className="space-y-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push('/login')}
          >
            Return to login
          </Button>
          <p className="text-sm text-muted-foreground">
            Didn&apos;t receive the email? Check your spam folder or{' '}
            <Button
              variant="link"
              className="p-0 h-auto"
              onClick={() => router.push('/register')}
            >
              try again
            </Button>
          </p>
        </div>
      </div>
    </Card>
  );
}
