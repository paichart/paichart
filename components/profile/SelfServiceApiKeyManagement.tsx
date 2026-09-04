'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';
import { Card } from '@/components/ui/Card';
import {
  KeyIcon,
  CopyIcon,
  TrashIcon,
  EyeIcon,
  EyeOffIcon,
  RefreshCwIcon,
  CheckIcon,
  AlertTriangleIcon,
  ClockIcon,
  InfoIcon
} from 'lucide-react';
import { useToast } from '@/lib/hooks/useToast';
import { useAuth } from '@/lib/hooks/useAuth';

interface ApiKeyData {
  hasKey: boolean;
  createdAt?: string;
  expiresAt?: string;
  purpose?: string;
  status?: 'active' | 'expired' | 'revoked';
  tokenPreview?: string;
}

export function SelfServiceApiKeyManagement() {
  const [loading, setLoading] = useState(false);
  const [apiKeyData, setApiKeyData] = useState<ApiKeyData | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [expirationDays, setExpirationDays] = useState(365);
  const [purpose, setPurpose] = useState('mcp-authentication');
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchApiKeyData = async () => {
    if (!user?.id) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/api-key`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to fetch API key data');
      }

      const data = await response.json();
      setApiKeyData(data.data.apiKey);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load API key information",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApiKeyData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const generateApiKey = async () => {
    if (!user?.id) {
      toast({
        title: "Error",
        description: "User session not found. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/api-key`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          expirationDays,
          purpose,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to generate API key');
      }

      const data = await response.json();
      setGeneratedToken(data.data.apiKey.token);
      setShowToken(true);

      await fetchApiKeyData();

      toast({
        title: "API Key Generated",
        description: "New API key has been generated successfully",
        variant: "default",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate API key",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const revokeApiKey = async () => {
    if (!user?.id) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/api-key`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || 'Failed to revoke API key');
      }

      await fetchApiKeyData();
      setGeneratedToken(null);
      setShowToken(false);

      toast({
        title: "API Key Revoked",
        description: "API key has been revoked successfully",
        variant: "default",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to revoke API key",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied",
        description: "API key copied to clipboard",
        variant: "default",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="success">Active</Badge>;
      case 'expired':
        return <Badge variant="outline">Expired</Badge>;
      case 'revoked':
        return <Badge variant="destructive">Revoked</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <KeyIcon className="h-5 w-5" />
            <h2 className="text-xl font-semibold">MCP API Key</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Generate and manage your MCP authentication key for Claude Desktop, ChatGPT, and other AI clients
          </p>
        </div>

        <Alert>
          <InfoIcon className="h-4 w-4" />
          <AlertDescription>
            <strong>Security Best Practice:</strong> By generating your own API key, you maintain full control without needing an administrator to handle your credentials. Never share your API key with anyone.
          </AlertDescription>
        </Alert>

        {/* Current API Key Status */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Current API Key</h3>

          {loading && !apiKeyData ? (
            <div className="flex items-center gap-2">
              <RefreshCwIcon className="h-4 w-4 animate-spin" />
              <span>Loading...</span>
            </div>
          ) : apiKeyData?.hasKey ? (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusBadge(apiKeyData.status || 'unknown')}
                  <span className="text-sm text-muted-foreground">
                    Created {formatDate(apiKeyData.createdAt!)}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={revokeApiKey}
                  disabled={loading || apiKeyData.status !== 'active'}
                  className="text-destructive hover:text-destructive"
                >
                  <TrashIcon className="h-4 w-4 mr-1" />
                  Revoke
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <ClockIcon className="h-4 w-4" />
                  <span>Expires: {formatDate(apiKeyData.expiresAt!)}</span>
                </div>
                <div className="text-sm">
                  <span className="font-medium">Purpose:</span> {apiKeyData.purpose}
                </div>
                <div className="text-sm">
                  <span className="font-medium">Token Preview:</span>
                  <code className="ml-2 text-xs bg-muted px-2 py-1 rounded">
                    {apiKeyData.tokenPreview}
                  </code>
                </div>
              </div>

              {apiKeyData.status === 'expired' && (
                <Alert>
                  <AlertTriangleIcon className="h-4 w-4" />
                  <AlertDescription>
                    This API key has expired. Generate a new one to continue using MCP tools.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <Alert>
              <AlertTriangleIcon className="h-4 w-4" />
              <AlertDescription>
                No API key found. Generate one to enable MCP authentication.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Generate New Key */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Generate New API Key</h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expirationDays">Expiration (days)</Label>
              <Input
                id="expirationDays"
                type="number"
                value={expirationDays}
                onChange={(e) => setExpirationDays(parseInt(e.target.value) || 365)}
                min={1}
                max={3650}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="purpose">Purpose</Label>
              <Input
                id="purpose"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="mcp-authentication"
              />
            </div>
          </div>

          <Button
            onClick={generateApiKey}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <KeyIcon className="h-4 w-4 mr-2" />
            )}
            Generate New API Key
          </Button>
        </div>

        {/* Generated Token Display */}
        {generatedToken && (
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-green-600">New API Key Generated</h3>

            <Alert>
              <CheckIcon className="h-4 w-4" />
              <AlertDescription>
                <strong>Important:</strong> Copy this API key now. You won&apos;t be able to see it again.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Label>API Key:</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowToken(!showToken)}
                >
                  {showToken ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </Button>
              </div>

              <div className="relative">
                <Textarea
                  value={showToken ? generatedToken : '•'.repeat(200)}
                  readOnly
                  className="font-mono text-xs"
                  rows={4}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(generatedToken)}
                  className="absolute top-2 right-2"
                >
                  <CopyIcon className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
