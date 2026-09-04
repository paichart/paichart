'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function EditRedirectPage({ params }: { params: { povId: string } }) {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the advanced form with the POV ID
    router.replace(`/pov/new/advanced?id=${params.povId}`);
  }, [params.povId, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh]">
      <Loader2 className="h-8 w-8 animate-spin mb-4" />
      <p className="text-muted-foreground">Redirecting to advanced editor...</p>
    </div>
  );
}
