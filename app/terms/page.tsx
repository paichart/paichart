import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of Service for pAIchart - POV Management Platform',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p className="text-muted-foreground mb-6">
            Last updated: October 4, 2025
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing or using pAIchart (&quot;Service,&quot; &quot;Platform,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), you agree to be bound
              by these Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, please do not use our Service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
            <p>
              pAIchart is a Proof of Value (POV) management platform that provides:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>POV creation, tracking, and management</li>
              <li>Task and project collaboration tools</li>
              <li>Team coordination and communication features</li>
              <li>AI-powered automation and insights</li>
              <li>Integration with third-party services via OAuth</li>
              <li>MCP (Model Context Protocol) server for AI integration</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>

            <h3 className="text-xl font-semibold mb-3">3.1 Account Creation</h3>
            <p className="mb-3">To use our Service, you must:</p>
            <ul className="list-disc pl-6 mb-4">
              <li>Create an account with accurate information</li>
              <li>Authenticate via OAuth (Microsoft, Google, or GitHub)</li>
              <li>Be at least 13 years of age</li>
              <li>Maintain the security of your account credentials</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3">3.2 Account Responsibility</h3>
            <p>You are responsible for:</p>
            <ul className="list-disc pl-6 mb-4">
              <li>All activities that occur under your account</li>
              <li>Maintaining the confidentiality of your authentication tokens</li>
              <li>Notifying us immediately of any unauthorized access</li>
              <li>Complying with all applicable laws and regulations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Acceptable Use</h2>

            <h3 className="text-xl font-semibold mb-3">4.1 Permitted Use</h3>
            <p className="mb-3">You may use the Service to:</p>
            <ul className="list-disc pl-6 mb-4">
              <li>Manage POVs and projects for legitimate business purposes</li>
              <li>Collaborate with team members</li>
              <li>Integrate with approved third-party services</li>
              <li>Access AI-powered features via MCP protocol</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3">4.2 Prohibited Activities</h3>
            <p className="mb-3">You agree NOT to:</p>
            <ul className="list-disc pl-6 mb-4">
              <li>Violate any laws or regulations</li>
              <li>Infringe on intellectual property rights</li>
              <li>Transmit malware, viruses, or malicious code</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Interfere with the Service or other users</li>
              <li>Scrape, data mine, or harvest information without permission</li>
              <li>Reverse engineer or decompile the Service</li>
              <li>Use the Service for competitive purposes</li>
              <li>Abuse API rate limits or authentication systems</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. OAuth and Third-Party Authentication</h2>
            <p className="mb-3">When using OAuth authentication:</p>
            <ul className="list-disc pl-6 mb-4">
              <li>You authorize us to access information from your OAuth provider (Microsoft, Google, GitHub)</li>
              <li>We only request necessary scopes and permissions</li>
              <li>You can revoke OAuth access at any time through your provider&apos;s settings</li>
              <li>We use PKCE for enhanced security</li>
              <li>OAuth tokens are stored securely and encrypted</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Content and Data</h2>

            <h3 className="text-xl font-semibold mb-3">6.1 Your Content</h3>
            <p>
              You retain ownership of all content you create or upload to the Service (POVs, tasks, comments, etc.).
              You grant us a license to use, store, and process your content solely to provide the Service.
            </p>

            <h3 className="text-xl font-semibold mb-3">6.2 Data Backup</h3>
            <p>
              While we implement regular backups, you are responsible for maintaining your own backups of
              critical data. We are not liable for data loss.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. API and MCP Server Usage</h2>
            <p className="mb-3">When using our API or MCP server:</p>
            <ul className="list-disc pl-6 mb-4">
              <li>Respect rate limits and fair use policies</li>
              <li>Use secure authentication methods (API keys, JWT tokens)</li>
              <li>Do not abuse or overload our systems</li>
              <li>Follow MCP protocol specifications</li>
              <li>Properly handle authentication tokens and sessions</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Fees and Payment</h2>
            <p>
              Some features may require payment. You agree to:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>Provide accurate billing information</li>
              <li>Pay all applicable fees</li>
              <li>Authorize automatic renewals if applicable</li>
              <li>Be responsible for any taxes</li>
            </ul>
            <p>
              We reserve the right to modify pricing with 30 days&apos; notice.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Intellectual Property</h2>

            <h3 className="text-xl font-semibold mb-3">9.1 Our IP</h3>
            <p>
              The Service, including software, design, logos, and content, is our intellectual property
              and protected by copyright, trademark, and other laws.
            </p>

            <h3 className="text-xl font-semibold mb-3">9.2 Limited License</h3>
            <p>
              We grant you a limited, non-exclusive, non-transferable license to use the Service
              for its intended purpose.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Termination</h2>

            <h3 className="text-xl font-semibold mb-3">10.1 By You</h3>
            <p>
              You may terminate your account at any time by contacting us or through account settings.
            </p>

            <h3 className="text-xl font-semibold mb-3">10.2 By Us</h3>
            <p className="mb-3">We may suspend or terminate your account if you:</p>
            <ul className="list-disc pl-6 mb-4">
              <li>Violate these Terms</li>
              <li>Engage in fraudulent or illegal activities</li>
              <li>Fail to pay required fees</li>
              <li>Pose a security risk</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">11. Disclaimers</h2>
            <p className="mb-3">
              THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND. WE DISCLAIM ALL WARRANTIES,
              EXPRESS OR IMPLIED, INCLUDING:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>Merchantability and fitness for a particular purpose</li>
              <li>Uninterrupted or error-free operation</li>
              <li>Accuracy or reliability of results</li>
              <li>Security of data transmission</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">12. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>Indirect, incidental, or consequential damages</li>
              <li>Loss of profits, data, or business opportunities</li>
              <li>Damages exceeding the amount paid to us in the past 12 months</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">13. Indemnification</h2>
            <p>
              You agree to indemnify and hold us harmless from any claims, damages, or expenses arising
              from your use of the Service or violation of these Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">14. Changes to Terms</h2>
            <p>
              We may modify these Terms at any time. We will notify users of material changes via email
              or platform notification. Continued use after changes constitutes acceptance.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">15. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the jurisdiction in which our company is registered,
              without regard to conflict of law provisions.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">16. Dispute Resolution</h2>
            <p className="mb-3">
              Any disputes shall be resolved through:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>Good faith negotiation</li>
              <li>Mediation if negotiation fails</li>
              <li>Binding arbitration as a last resort</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">17. Contact Information</h2>
            <p className="mb-3">
              For questions about these Terms, contact us:
            </p>
            <ul className="list-none mb-4">
              <li>Email: <a href="mailto:legal@paichart.app" className="text-primary hover:underline">legal@paichart.app</a></li>
              <li>Website: <a href="https://paichart.app" className="text-primary hover:underline">https://paichart.app</a></li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">18. Severability</h2>
            <p>
              If any provision of these Terms is found invalid or unenforceable, the remaining
              provisions shall continue in full force and effect.
            </p>
          </section>

          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">
              By using pAIchart, you acknowledge that you have read, understood, and agree to be bound
              by these Terms of Service.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
