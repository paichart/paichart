/**
 * OAuth Success Page
 * AESTHETIC: Clean professional light mode with comprehensive dialogs
 * Light backgrounds, professional polish, tabbed configuration guides
 */

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PAIChartLogoAuto } from '@/components/ui/PAIChartLogo';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/Tabs';
import { Link2, BookOpen } from 'lucide-react';

interface UserInfo {
  name: string;
  email: string;
  provider: string;
}

export default function OAuthSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-emerald-500/20 border-t-emerald-500 mx-auto"></div>
          <p className="mt-6 text-emerald-600 font-mono text-sm animate-pulse">Loading...</p>
        </div>
      </div>
    }>
      <OAuthSuccessPageContent />
    </Suspense>
  );
}

function OAuthSuccessPageContent() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showContent, setShowContent] = useState(false);
  const [showMCPConfig, setShowMCPConfig] = useState(false);
  const [showUserGuide, setShowUserGuide] = useState(false);
  const [showDetailedChatGPT, setShowDetailedChatGPT] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    try {
      const userParam = searchParams.get('user');
      if (userParam) {
        const user = JSON.parse(userParam) as UserInfo;
        setUserInfo(user);
      }
    } catch (error) {
      console.error('Failed to parse user info:', error);
    } finally {
      setLoading(false);
      setTimeout(() => setShowContent(true), 100);
    }
  }, [searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-12 w-12 border-2 border-emerald-500/20 border-t-emerald-500 mx-auto"></div>
            <div className="animate-ping absolute inset-0 rounded-full h-12 w-12 border-2 border-emerald-500/30 mx-auto"></div>
          </div>
          <p className="mt-6 text-emerald-600 font-mono text-sm animate-pulse">Completing OAuth authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30"></div>

      {/* Gentle glow effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-200/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl"></div>

      <div className="relative min-h-screen flex items-center justify-center p-4 py-12">
        <div className={`max-w-5xl w-full transition-all duration-1000 ${showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {/* Header with logo */}
          <div className="mb-8 text-center space-y-6">
            {/* SVG Logo */}
            <div className="flex justify-center animate-[fadeIn_0.8s_ease-in,float_3s_ease-in-out_infinite]">
              <PAIChartLogoAuto className="w-64 md:w-80 h-auto drop-shadow-lg" />
            </div>

            {/* Product Description */}
            <div className="max-w-3xl mx-auto animate-[fadeIn_1s_ease-in_0.3s_both] space-y-3">
              <p className="text-base md:text-lg text-slate-700 leading-relaxed">
                Manage Proof of Value projects through natural conversation.
              </p>
              <p className="text-base md:text-lg text-slate-700 leading-relaxed">
                Using ChatGPT, Claude, or Gemini (via MCP), ask &quot;What POVs need attention?&quot; or say &quot;Update
                ACME status to validation&quot;—and it&apos;s done. Your AI assistant is the interface.
              </p>
              <p className="text-base md:text-lg text-slate-700 leading-relaxed">
                The web app handles admin tasks. That&apos;s it.
              </p>
            </div>

            {userInfo && (
              <div className="inline-block bg-white/80 backdrop-blur-sm border border-emerald-200 rounded-lg px-6 py-3 shadow-lg animate-[fadeIn_1s_ease-in_0.6s_both]">
                <p className="text-emerald-700 font-mono text-sm">
                  <span className="text-slate-400">$</span> user.authenticated <span className="text-slate-400">=</span> <strong>{userInfo.name}</strong>
                </p>
                <p className="text-slate-600 font-mono text-xs mt-1">
                  {userInfo.email} <span className="text-slate-300">|</span> {userInfo.provider}
                </p>
              </div>
            )}
          </div>

          {/* Hero CTAs - 2 Rows */}
          <div className="space-y-4 animate-[fadeIn_1s_ease-in_0.9s_both]">
            {/* Row 1: Guide Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Connect to MCP - LEFT */}
              <button
                onClick={() => setShowMCPConfig(true)}
                className="group relative overflow-hidden bg-gradient-to-br from-orange-600 via-orange-500 to-amber-600 text-white py-7 px-8 rounded-xl hover:shadow-2xl hover:shadow-orange-500/30 transition-all duration-300 transform hover:scale-[1.02] border border-orange-400/20"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.05)_50%,transparent_75%,transparent_100%)] bg-[length:250%_250%] animate-[shimmer_3s_linear_infinite]"></div>
                <div className="relative">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <Link2 className="h-6 w-6" strokeWidth="2.5" />
                    <span className="font-bold text-xl">Connect to pAIchart MCP</span>
                  </div>
                  <p className="text-xs text-orange-50/90 font-mono">How to configure ChatGPT/Claude/Gemini</p>
                </div>
              </button>

              {/* User Guide - RIGHT */}
              <button
                onClick={() => setShowUserGuide(true)}
                className="group relative overflow-hidden bg-gradient-to-br from-purple-600 via-purple-500 to-indigo-600 text-white py-7 px-8 rounded-xl hover:shadow-2xl hover:shadow-purple-500/30 transition-all duration-300 transform hover:scale-[1.02] border border-purple-400/20"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.05)_50%,transparent_75%,transparent_100%)] bg-[length:250%_250%] animate-[shimmer_3s_linear_infinite]" style={{ animationDelay: '0.5s' }}></div>
                <div className="relative">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <BookOpen className="h-6 w-6" strokeWidth="2.5" />
                    <span className="font-bold text-xl">User Guide</span>
                  </div>
                  <p className="text-xs text-purple-50/90 font-mono">Using prompts and tools</p>
                </div>
              </button>
            </div>

            {/* Row 2: Primary Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Explore Dashboard - LEFT */}
              <button
                onClick={() => window.location.href = '/pov/list'}
                className="group relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-600 text-white py-7 px-8 rounded-xl hover:shadow-2xl hover:shadow-blue-500/30 transition-all duration-300 transform hover:scale-[1.02] border border-blue-400/20"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.05)_50%,transparent_75%,transparent_100%)] bg-[length:250%_250%] animate-[shimmer_3s_linear_infinite]" style={{ animationDelay: '1s' }}></div>
                <div className="relative">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span className="font-bold text-xl">Explore Dashboard</span>
                  </div>
                  <p className="text-xs text-blue-50/90 font-mono">View your projects</p>
                </div>
              </button>

              {/* User Settings - RIGHT */}
              <button
                onClick={() => window.location.href = '/profile'}
                className="group relative overflow-hidden bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-600 text-white py-7 px-8 rounded-xl hover:shadow-2xl hover:shadow-emerald-500/30 transition-all duration-300 transform hover:scale-[1.02] border border-emerald-400/20"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,.05)_50%,transparent_75%,transparent_100%)] bg-[length:250%_250%] animate-[shimmer_3s_linear_infinite]" style={{ animationDelay: '1.5s' }}></div>
                <div className="relative">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="font-bold text-xl">User Settings</span>
                  </div>
                  <p className="text-xs text-emerald-50/90 font-mono">Generate API Key</p>
                </div>
              </button>
            </div>
          </div>

          {/* Demo Data Notice - Stays Visible */}
          <div className="mt-12 bg-white/80 backdrop-blur-sm border border-indigo-200 rounded-xl p-6 shadow-lg hover:shadow-indigo-200/50 transition-shadow animate-[fadeIn_1s_ease-in_1.2s_both]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-50 border border-indigo-200 rounded-lg p-4">
                <p className="text-indigo-700 font-mono mb-2">Demo Data Included</p>
                <p className="text-slate-600">
                  Access demonstration projects showcasing pAIchart&apos;s full capabilities.
                  Production-like experience to explore all features.
                </p>
              </div>

              <div className="bg-slate-50 border border-indigo-200 rounded-lg p-4">
                <p className="text-indigo-700 font-mono mb-2">Want Real Data?</p>
                <p className="text-slate-600">
                  Customized experience with admin controls and real project data.
                </p>
                <p className="text-indigo-700 mt-2">
                  → <a href="mailto:sales@paichart.com" className="hover:text-indigo-600 underline transition-colors">sales@paichart.com</a>
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center animate-[fadeIn_1s_ease-in_2.2s_both]">
            <p className="text-slate-400 font-mono text-xs">
              <span className="text-emerald-500">■</span> pAIchart MCP Hub <span className="text-slate-300">|</span> Powered by AI
            </p>
          </div>
        </div>
      </div>

      {/* MCP Configuration Dialog */}
      <Dialog open={showMCPConfig} onOpenChange={setShowMCPConfig}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <Link2 className="h-6 w-6 text-orange-600" />
              MCP Configuration Guide
            </DialogTitle>
            <DialogDescription>
              Step-by-step setup instructions for connecting your AI assistant to pAIchart
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="requirements" className="mt-4">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="requirements">Requirements</TabsTrigger>
              <TabsTrigger value="claude-desktop">Claude Desktop</TabsTrigger>
              <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
              <TabsTrigger value="gemini">Gemini</TabsTrigger>
              <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
            </TabsList>

            {/* Requirements Tab */}
            <TabsContent value="requirements" className="space-y-4 mt-6">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-6">
                <h3 className="font-mono text-sm mb-4 text-emerald-700">Platform Requirements:</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                  <div className="bg-white p-4 rounded-lg border border-emerald-300 shadow-sm">
                    <div className="text-emerald-700 font-bold mb-2">ChatGPT</div>
                    <div className="text-slate-600 space-y-1">
                      <div>• Plus Plan Required</div>
                      <div>• Microsoft account</div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-purple-300 shadow-sm">
                    <div className="text-purple-700 font-bold mb-2">Claude Desktop</div>
                    <div className="text-slate-600 space-y-1">
                      <div>• Pro Plan Required</div>
                      <div>• pAIchart API key</div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-blue-300 shadow-sm">
                    <div className="text-blue-700 font-bold mb-2">Claude Code</div>
                    <div className="text-slate-600 space-y-1">
                      <div>• Pro Plan Required</div>
                      <div>• GitHub account</div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-lg border border-yellow-300 shadow-sm">
                    <div className="text-yellow-700 font-bold mb-2">Gemini CLI</div>
                    <div className="text-slate-600 space-y-1">
                      <div>• Free Initially</div>
                      <div>• GitHub account</div>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 italic mt-4 font-mono">
                  <span className="text-slate-400">#</span> ChatGPT uses Microsoft OAuth | Claude/Gemini use GitHub OAuth
                </p>
              </div>
            </TabsContent>

            {/* Claude Desktop Tab */}
            <TabsContent value="claude-desktop" className="space-y-4 mt-6">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-purple-700 font-mono font-bold mb-2">→ Step 1: Generate API Key</p>
                    <p className="text-slate-600 pl-4">Click &quot;User Settings&quot; button on the main page to generate your free API key</p>
                  </div>

                  <div>
                    <p className="text-purple-700 font-mono font-bold mb-2">→ Step 2: Add Configuration</p>
                    <p className="text-slate-600 pl-4 mb-3">Add this to your claude_desktop_config.json file:</p>
                    <div className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs overflow-x-auto">
                      <pre>{`{
  "mcpServers": {
    "paichart": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://paichart.app/mcp",
        "--header",
        "X-API-Key: YOUR_API_KEY"
      ]
    }
  }
}`}</pre>
                    </div>
                    <div className="text-slate-500 text-xs font-mono pl-4 mt-3 space-y-1">
                      <p className="font-bold text-purple-600">Config file location:</p>
                      <p>📁 macOS: ~/Library/Application Support/Claude/claude_desktop_config.json</p>
                      <p>📁 Windows: %APPDATA%/Claude/claude_desktop_config.json</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-purple-700 font-mono font-bold mb-2">→ Step 3: Restart Claude Desktop</p>
                    <p className="text-slate-600 pl-4">Replace YOUR_API_KEY with your generated key and restart the application</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ChatGPT Tab */}
            <TabsContent value="chatgpt" className="space-y-4 mt-6">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                {/* Quick Setup - Always Visible */}
                <div className="mb-4">
                  <h4 className="text-green-700 font-bold mb-3 text-sm">Quick Setup:</h4>
                  <div className="space-y-2 text-sm text-slate-700">
                    <p>1. Enable Developer Mode in ChatGPT Settings</p>
                    <p>2. Create pAIchart MCP app (name, URL, OAuth)</p>
                    <p>3. Use in chats via + → More → paichart</p>
                  </div>
                </div>

                {/* Toggle Button */}
                <button
                  onClick={() => setShowDetailedChatGPT(!showDetailedChatGPT)}
                  className="text-green-700 hover:text-green-800 font-mono text-xs underline mb-4"
                >
                  {showDetailedChatGPT ? '▼ Hide detailed walkthrough' : '▶ Show detailed walkthrough'}
                </button>

                {/* Detailed Steps - Conditionally Visible */}
                {showDetailedChatGPT && (
                  <div className="space-y-4 text-sm border-t border-green-200 pt-4">
                    <div>
                      <p className="text-green-700 font-mono font-bold mb-2">→ Step 1: Open Settings</p>
                      <p className="text-slate-600 pl-4">Choose Settings → Apps & Connectors</p>
                    </div>

                    <div>
                      <p className="text-green-700 font-mono font-bold mb-2">→ Step 2: Enable Developer Mode</p>
                      <p className="text-slate-600 pl-4">Scroll to the bottom and choose Advanced Settings</p>
                      <p className="text-slate-600 pl-4 mt-1">Toggle the Developer Mode button</p>
                    </div>

                    <div>
                      <p className="text-green-700 font-mono font-bold mb-2">→ Step 3: Create App</p>
                      <p className="text-slate-600 pl-4">Click Back, then choose Create App button</p>
                    </div>

                    <div>
                      <p className="text-green-700 font-mono font-bold mb-2">→ Step 4: Define pAIchart MCP Application</p>
                      <div className="bg-white border border-green-200 rounded-lg p-4 space-y-2 pl-4 mt-2">
                        <p className="text-slate-700"><span className="text-green-600 font-bold">•</span> Name: <code className="text-emerald-700 bg-slate-100 px-2 py-1 rounded">paichart</code> (or any name)</p>
                        <p className="text-slate-700"><span className="text-green-600 font-bold">•</span> MCP Server URL: <code className="text-emerald-700 bg-slate-100 px-2 py-1 rounded text-xs">https://paichart.app/mcp</code></p>
                        <p className="text-slate-700"><span className="text-green-600 font-bold">•</span> Authentication: <code className="text-emerald-700 bg-slate-100 px-2 py-1 rounded">OAuth</code></p>
                        <p className="text-slate-700 text-xs italic mt-2">(No optional settings needed)</p>
                      </div>
                    </div>

                    <div>
                      <p className="text-green-700 font-mono font-bold mb-2">→ Step 5: Confirm and Create</p>
                      <p className="text-slate-600 pl-4">Choose &quot;I understand and want to continue&quot;</p>
                      <p className="text-slate-600 pl-4 mt-1">Click Create button</p>
                    </div>

                    <div>
                      <p className="text-green-700 font-mono font-bold mb-2">→ Step 6: Use in Chat</p>
                      <p className="text-slate-600 pl-4">In the chat box, choose + button</p>
                      <p className="text-slate-600 pl-4 mt-1">Scroll down to ... More and choose paichart</p>
                      <p className="text-slate-600 pl-4 mt-1">Start chatting to your POVs in pAIchart</p>
                    </div>

                    {/* Important Note */}
                    <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mt-4">
                      <p className="text-amber-800 font-bold text-xs mb-1">💡 Important:</p>
                      <p className="text-amber-700 text-xs">Each new chat session requires you to select paichart from + → More</p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Gemini Tab */}
            <TabsContent value="gemini" className="space-y-4 mt-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-yellow-700 font-mono font-bold mb-2">→ Step 1: Open MCP Configuration</p>
                    <p className="text-slate-600 pl-4">In Gemini CLI, navigate to MCP server configuration</p>
                  </div>

                  <div>
                    <p className="text-yellow-700 font-mono font-bold mb-2">→ Step 2: Add pAIchart Server</p>
                    <div className="bg-white border border-yellow-200 rounded-lg p-4 space-y-2 pl-4 mt-2">
                      <p className="text-slate-700"><span className="text-yellow-600 font-bold">•</span> Endpoint: <code className="text-emerald-700 bg-slate-100 px-2 py-1 rounded text-xs">https://paichart.app/mcp</code></p>
                      <p className="text-slate-700"><span className="text-yellow-600 font-bold">•</span> Authentication: <code className="text-emerald-700 bg-slate-100 px-2 py-1 rounded">OAuth 2.0 (GitHub)</code></p>
                    </div>
                  </div>

                  <div>
                    <p className="text-yellow-700 font-mono font-bold mb-2">→ Step 3: Authorize with GitHub</p>
                    <p className="text-slate-600 pl-4">The CLI will open a browser window for GitHub OAuth. Approve permissions and return to Gemini.</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Claude Code Tab */}
            <TabsContent value="claude-code" className="space-y-4 mt-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-blue-700 font-mono font-bold mb-2">→ Step 1: Open Settings → Connectors</p>
                    <p className="text-slate-600 pl-4">In Claude Code, navigate to connector configuration</p>
                  </div>

                  <div>
                    <p className="text-blue-700 font-mono font-bold mb-2">→ Step 2: Add New Connector</p>
                    <div className="bg-white border border-blue-200 rounded-lg p-4 space-y-2 pl-4 mt-2">
                      <p className="text-slate-700"><span className="text-blue-600 font-bold">•</span> Name: <code className="text-emerald-700 bg-slate-100 px-2 py-1 rounded">pAIchart MCP Hub</code></p>
                      <p className="text-slate-700"><span className="text-blue-600 font-bold">•</span> Endpoint: <code className="text-emerald-700 bg-slate-100 px-2 py-1 rounded text-xs">https://paichart.app/mcp</code></p>
                      <p className="text-slate-700"><span className="text-blue-600 font-bold">•</span> Authentication: <code className="text-emerald-700 bg-slate-100 px-2 py-1 rounded">OAuth 2.0 (GitHub)</code></p>
                    </div>
                  </div>

                  <div>
                    <p className="text-blue-700 font-mono font-bold mb-2">→ Step 3: Authorize with GitHub</p>
                    <p className="text-slate-600 pl-4">GitHub OAuth will be requested automatically. Approve the permissions to connect.</p>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* User Guide Dialog */}
      <Dialog open={showUserGuide} onOpenChange={setShowUserGuide}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <BookOpen className="h-6 w-6 text-purple-600" />
              Quick Start Guide
            </DialogTitle>
            <DialogDescription>
              Learn how to use pAIchart through prompts, tools, and natural conversation
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 space-y-6">
            {/* Common Commands */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-blue-800 mb-4">
                Easy ways to chat to pAIchart
              </h3>

              {/* For Users */}
              <div className="mb-6">
                <p className="font-bold text-blue-700 mb-4 text-sm">For Users:</p>
                <p className="text-xs text-slate-600 italic mb-3">(Important: Steps 1, 2 & 3 populate the chat context)</p>

                <div className="space-y-3">
                  {/* Step 1 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">1</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">list all my povs</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Shows which POVs you are assigned across all POVs (PROJECTED, IN_PROGRESS, VALIDATION, STALLED, WON, LOST). Ensures context is populated in chat session.</p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">2</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">show me the details of an important pov</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Provides essential project Phases, Stages, dates and team members.</p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">3</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">show me the tasks for the security policy stage</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Displays task description and assignee and status.</p>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">4</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">set the status of the first task to in progress</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Allows the user to identify what they are working on.</p>
                    </div>
                  </div>

                  {/* Step 5 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">5</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">what do I have to do to complete this task</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">AI reads the task description and provides detailed instructions.</p>
                    </div>
                  </div>

                  {/* Step 6 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">6</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">make a comment saying that im working on this for the whole week</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Updates the comments field for the task describing the users engagement of the task and associated pov.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* For Managers */}
              <div>
                <p className="font-bold text-blue-700 mb-4 text-sm">For Managers:</p>

                <div className="space-y-3">
                  {/* Step 1 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">1</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">/prompt audit_all_tasks</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Runs a full audit of all tasks (OPEN, IN_PROGRESS, BLOCKED) across all POVs. Ensures context is populated in chat session.</p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">2</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">list all the pov&apos;s in validation</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Lists all POVs currently in VALIDATION status.</p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">3</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">show me the pov details</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Displays full POV information including phases, stages, tasks, team, budget, and progress.</p>
                    </div>
                  </div>

                  {/* Step 4 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">4</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">show me the tasks of each stage that has a task that is in progress</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Identifies which stages contain IN_PROGRESS tasks and lists those tasks.</p>
                    </div>
                  </div>

                  {/* Step 5 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">5</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">show me all tasks (open + in-progress) in these stages</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Shows all OPEN and IN_PROGRESS tasks for each active stage.</p>
                    </div>
                  </div>

                  {/* Step 6 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">6</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">generate remediation plan for these stages</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Produces a detailed remediation plan for progressing or unblocking the work.</p>
                    </div>
                  </div>

                  {/* Step 7 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">7</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">generate a risk mitigation report</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Generates a risk analysis with recommendations for reducing delays and issues.</p>
                    </div>
                  </div>

                  {/* Step 8 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">8</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">can you run the pov health check prompt for the CyberDefense Pro pov</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Runs a deep-dive health assessment on the specified POV including tasks, risks, comments, and next steps.</p>
                    </div>
                  </div>

                  {/* Step 9 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">9</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">can you run the task_audit_and_planning prompt</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Comprehensive workflow using multiple tools (only Claude Desktop can manage the complexity of this prompt at the moment).</p>
                    </div>
                  </div>

                  {/* Step 10 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">10</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">can you list my chat items</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Lists all chat commands you used in sequence.</p>
                    </div>
                  </div>

                  {/* Step 11 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">11</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">can you put in a table (step, chat, result)</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Creates a workflow table (the one you&apos;re reading now).</p>
                    </div>
                  </div>

                  {/* Step 12 */}
                  <div className="grid grid-cols-[2rem_1fr] gap-3 items-start">
                    <span className="text-blue-400 text-xs font-mono">12</span>
                    <div>
                      <p className="text-slate-800 font-semibold text-sm">can you run the pov health check prompt for the CyberDefense Pro pov</p>
                      <p className="text-slate-600 text-xs mt-1 hidden md:block">Runs a deep-dive health assessment on the specified POV including tasks, risks, comments, and next steps.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Start Prompts */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-amber-800 mb-4">
                Using the /prompt command automates workflows
              </h3>

              <div className="space-y-4">
                <div className="bg-white border border-amber-200 rounded-lg p-4">
                  <p className="font-mono text-sm text-amber-700 mb-3">Essential Prompts:</p>
                  <div className="space-y-2 font-mono text-xs">
                    <p className="text-slate-700">
                      <code className="text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-300">/prompt list</code>
                      <span className="text-slate-500 ml-2">{`// View all available prompts`}</span>
                    </p>
                    <p className="text-slate-700">
                      <code className="text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-300">/prompt list_tasks_guided</code>
                      <span className="text-slate-500 ml-2">{`// Interactive task exploration (users)`}</span>
                    </p>
                    <p className="text-slate-700">
                      <code className="text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-300">/prompt task_audit_and_planning</code>
                      <span className="text-slate-500 ml-2">{`// Strategic project review (managers)`}</span>
                    </p>
                    <p className="text-slate-700">
                      <code className="text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-300">/prompt pov_health_check</code>
                      <span className="text-slate-500 ml-2">{`// Check specific POV status`}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* MCP Tools Overview */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-purple-800 mb-4">
                Using tools directly
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="bg-white border border-purple-200 rounded-lg p-3">
                  <p className="font-bold text-purple-700 mb-2">Project Data</p>
                  <ul className="text-slate-600 space-y-1">
                    <li>• project (pov.list, pov.details, task.list, task.context)</li>
                  </ul>
                </div>

                <div className="bg-white border border-purple-200 rounded-lg p-3">
                  <p className="font-bold text-purple-700 mb-2">Actions & Services</p>
                  <ul className="text-slate-600 space-y-1">
                    <li>• perform (task/agent/pov operations)</li>
                    <li>• services (discover, call, workflows)</li>
                  </ul>
                </div>

                <div className="bg-white border border-purple-200 rounded-lg p-3">
                  <p className="font-bold text-purple-700 mb-2">Analytics & Templates</p>
                  <ul className="text-slate-600 space-y-1">
                    <li>• analytics (recommendations, team performance)</li>
                    <li>• template (list, details - ADMIN)</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Best Practices */}
            <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-6">
              <h3 className="text-lg font-bold text-cyan-800 mb-4">
                Best practices
              </h3>

              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex items-start gap-3">
                  <span className="text-cyan-600 font-bold">✓</span>
                  <div>
                    <p className="font-bold text-cyan-700">Use Natural Language</p>
                    <p className="text-xs">Just ask questions like you would to a colleague. pAIchart understands context.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-cyan-600 font-bold">✓</span>
                  <div>
                    <p className="font-bold text-cyan-700">Start with Prompts</p>
                    <p className="text-xs">Use built-in prompts like /prompt list_tasks_guided for guided workflows.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-cyan-600 font-bold">✓</span>
                  <div>
                    <p className="font-bold text-cyan-700">Be Specific</p>
                    <p className="text-xs">Mention POV names, task titles, or team members for precise results.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <span className="text-cyan-600 font-bold">✓</span>
                  <div>
                    <p className="font-bold text-cyan-700">Iterate</p>
                    <p className="text-xs">Follow-up questions work great: &quot;Show more details&quot; or &quot;What about the next one?&quot;</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes shimmer {
          0% {
            background-position: -250% 0;
          }
          100% {
            background-position: 250% 0;
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }
      `}</style>
    </div>
  );
}
