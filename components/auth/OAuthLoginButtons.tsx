'use client';

import { useState } from 'react';
import { GitHubIcon } from './oauth-icons/GitHubIcon';
import { MicrosoftIcon } from './oauth-icons/MicrosoftIcon';
import { GoogleIcon } from './oauth-icons/GoogleIcon';

interface OAuthProvider {
  name: string;
  displayName: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
}

export function OAuthLoginButtons() {
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  const providers: OAuthProvider[] = [
    {
      name: 'github',
      displayName: 'GitHub',
      subtitle: 'For Claude Desktop & Gemini',
      icon: GitHubIcon,
      enabled: true, // GitHub is configured
    },
    {
      name: 'microsoft',
      displayName: 'Microsoft',
      subtitle: 'For ChatGPT',
      icon: MicrosoftIcon,
      enabled: true, // Configured with Azure AD app
    },
    {
      name: 'google',
      displayName: 'Google',
      subtitle: 'Coming soon',
      icon: GoogleIcon,
      enabled: false, // Temporarily disabled - credentials not configured in production
    },
  ];

  const handleOAuthLogin = (provider: string) => {
    setLoadingProvider(provider);

    // Get the return URL from the current page or default to profile
    const currentUrl = window.location.pathname;
    const returnTo = currentUrl === '/login' ? '/profile' : currentUrl;

    // Redirect to OAuth endpoint
    window.location.href = `/api/auth/oauth/${provider}?returnTo=${encodeURIComponent(returnTo)}`;
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-center text-muted-foreground">
        Sign in with your AI platform
      </p>
      <div className="grid grid-cols-1 gap-3">
        {providers.map((provider) => {
          const Icon = provider.icon;
          const isLoading = loadingProvider === provider.name;
          const isDisabled = !provider.enabled || loadingProvider !== null;

          return (
            <button
              key={provider.name}
              onClick={() => handleOAuthLogin(provider.name)}
              disabled={isDisabled}
              className={`
                w-full inline-flex items-center px-4 py-3
                border rounded-lg shadow-sm text-sm
                transition-all duration-150
                ${
                  provider.enabled
                    ? 'border-border bg-card text-foreground hover:bg-muted'
                    : 'border-border bg-muted text-muted-foreground cursor-not-allowed'
                }
                ${isLoading ? 'opacity-75' : ''}
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
              `}
              title={!provider.enabled ? `${provider.displayName} login coming soon` : `Continue with ${provider.displayName}`}
            >
              {isLoading ? (
                <svg
                  className="animate-spin h-5 w-5 mr-3 flex-shrink-0"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) : (
                <Icon className="h-5 w-5 mr-3 flex-shrink-0" />
              )}
              <div className="flex flex-col items-start">
                <span className="font-medium">
                  {isLoading ? 'Redirecting...' : provider.displayName}
                </span>
                {!isLoading && (
                  <span className="text-xs text-muted-foreground">
                    {provider.subtitle}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

    </div>
  );
}