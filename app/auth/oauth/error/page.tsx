/**
 * OAuth Error Page
 * Displays OAuth authentication errors with helpful recovery guidance
 */

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface ErrorInfo {
  error: string;
  details?: string;
  provider: string;
}

export default function OAuthErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
      </div>
    }>
      <OAuthErrorPageContent />
    </Suspense>
  );
}

function OAuthErrorPageContent() {
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get('error') || 'unknown_error';
    const details = searchParams.get('details');
    const provider = searchParams.get('provider') || 'unknown';
    
    setErrorInfo({ error, details: details || undefined, provider });
    setLoading(false);
  }, [searchParams]);

  const getErrorMessage = (error: string) => {
    switch (error) {
      case 'github_no_verified_email':
        return {
          title: 'No Verified GitHub Email',
          message: 'We could not retrieve a verified email address from your GitHub account, which prevents us from creating your account.',
          suggestion: 'To fix this: 1) Go to GitHub Settings → Emails (https://github.com/settings/emails), 2) Add an email address and verify it (check your inbox for GitHub’s confirmation), 3) Try signing in again.'
        };
      case 'access_denied':
        return {
          title: 'Access Denied',
          message: 'You declined the OAuth authorization request.',
          suggestion: 'Click "Allow" to grant pAIchart access to your account.'
        };
      case 'invalid_request':
        return {
          title: 'Invalid Request',
          message: 'The OAuth request was malformed or invalid.',
          suggestion: 'Please try again or contact support if the issue persists.'
        };
      case 'authentication_failed':
        return {
          title: 'Authentication Failed',
          message: 'OAuth authentication could not be completed.',
          suggestion: 'Verify your account credentials and try again.'
        };
      case 'missing_parameters':
        return {
          title: 'Missing Parameters',
          message: 'Required OAuth parameters were not provided.',
          suggestion: 'Please restart the authentication process.'
        };
      default:
        return {
          title: 'Authentication Error',
          message: 'An unexpected error occurred during OAuth authentication.',
          suggestion: 'Please try again or contact support for assistance.'
        };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
      </div>
    );
  }

  if (!errorInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600">No error information available.</p>
        </div>
      </div>
    );
  }

  const errorMessage = getErrorMessage(errorInfo.error);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
            </svg>
          </div>
          
          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            {errorMessage.title}
          </h1>
          
          <p className="mt-2 text-gray-600">
            {errorMessage.message}
          </p>
          
          {errorInfo.details && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">
                <strong>Details:</strong> {errorInfo.details}
              </p>
            </div>
          )}
          
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="text-sm font-medium text-blue-800">
              💡 Suggestion
            </h3>
            <p className="mt-1 text-sm text-blue-700">
              {errorMessage.suggestion}
            </p>
          </div>
          
          <div className="mt-6 space-y-3">
            <button 
              onClick={() => window.location.href = `/api/auth/oauth/${errorInfo.provider}`}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Try Again with {errorInfo.provider}
            </button>
            
            <div className="flex space-x-2">
              <button 
                onClick={() => window.location.href = '/auth/login'}
                className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 transition-colors"
              >
                Use Email/Password
              </button>
              
              <button 
                onClick={() => window.location.href = '/'}
                className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 transition-colors"
              >
                Back to Home
              </button>
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                Need help? Contact us at{' '}
                <a href="mailto:support@paichart.app" className="text-blue-600 hover:text-blue-700">
                  support@paichart.app
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}