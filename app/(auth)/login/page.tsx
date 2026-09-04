'use client';

import { useState } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';
import { OAuthLoginButtons } from '@/components/auth/OAuthLoginButtons';
import { PAIChartLogoAuto } from '@/components/ui/PAIChartLogo';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { LockKeyhole, Shield, ExternalLink } from 'lucide-react';

export default function LoginPage() {
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative">
      {/* Admin Login Button - Top Right */}
      <div className="absolute top-6 right-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setShowAdminLogin(true)}
          className="rounded-full hover:bg-muted transition-colors"
          title="Admin Login"
        >
          <LockKeyhole className="h-5 w-5 text-muted-foreground" />
        </Button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-12">
          <PAIChartLogoAuto className="w-72 h-auto" />
        </div>
      </div>

      <div className="mt-12 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-card py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {/* OAuth Login Buttons - Primary Method */}
          <OAuthLoginButtons />
        </div>

        {/* Security Trust Signal */}
        <div className="mt-6 px-4">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-3">
            <Shield className="h-4 w-4 text-emerald-500" />
            <span className="font-medium text-foreground/80">MCP Security Best Practices Compliant</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-muted-foreground max-w-sm mx-auto">
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-500">&#10003;</span>
              <span>First-party RS256 tokens</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-500">&#10003;</span>
              <span>Provider credentials never stored</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-500">&#10003;</span>
              <span>PKCE mandatory (OAuth 2.1)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-500">&#10003;</span>
              <span>Session-user identity binding</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-500">&#10003;</span>
              <span>JWKS public key validation</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-emerald-500">&#10003;</span>
              <span>6-tier trust level system</span>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3 mt-3 text-xs text-muted-foreground">
            <a
              href="https://paichart.app/api/auth/jwks"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              JWKS
              <ExternalLink className="h-3 w-3" />
            </a>
            <span className="text-muted-foreground/40">|</span>
            <a
              href="https://modelcontextprotocol.io/specification/draft/basic/security_best_practices"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              Anthropic MCP Security Spec
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>

      {/* Admin Login Dialog */}
      <Dialog open={showAdminLogin} onOpenChange={setShowAdminLogin}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockKeyhole className="h-5 w-5" />
              Admin Login
            </DialogTitle>
            <DialogDescription>
              Sign in with email and password for admin and users with credentials.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <LoginForm />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}