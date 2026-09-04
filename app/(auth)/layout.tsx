'use client';

import { Card, CardContent } from "@/components/ui/Card"
import { Container } from "@/components/ui/Container"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Container>
        <Card className="w-full max-w-md mx-auto">
          <CardContent className="p-6">
            {children}
          </CardContent>
        </Card>
      </Container>
    </div>
  );
}
