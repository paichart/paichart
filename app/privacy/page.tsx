import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy Policy for pAIchart - POV Management Platform',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p className="text-muted-foreground mb-6">
            Last updated: October 4, 2025
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p>
              pAIchart (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is committed to protecting your privacy. This Privacy Policy explains
              how we collect, use, disclose, and safeguard your information when you use our POV (Proof of Value)
              management platform and services.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>

            <h3 className="text-xl font-semibold mb-3">2.1 Information You Provide</h3>
            <ul className="list-disc pl-6 mb-4">
              <li>Account information (name, email address, profile information)</li>
              <li>OAuth authentication data from third-party providers (Microsoft, Google, GitHub)</li>
              <li>POV data, tasks, comments, and project information you create</li>
              <li>Team collaboration and communication data</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3">2.2 Automatically Collected Information</h3>
            <ul className="list-disc pl-6 mb-4">
              <li>Usage data and analytics</li>
              <li>Device and browser information</li>
              <li>IP address and location data</li>
              <li>Session and authentication tokens</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
            <p className="mb-3">We use your information to:</p>
            <ul className="list-disc pl-6 mb-4">
              <li>Provide, operate, and maintain our services</li>
              <li>Authenticate and authorize user access</li>
              <li>Enable collaboration features and team workflows</li>
              <li>Send administrative information and updates</li>
              <li>Improve and optimize our platform</li>
              <li>Detect and prevent fraud or abuse</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Data Sharing and Disclosure</h2>
            <p className="mb-3">We may share your information with:</p>
            <ul className="list-disc pl-6 mb-4">
              <li><strong>Team Members:</strong> Other users within your organization or POV teams</li>
              <li><strong>Service Providers:</strong> Third-party services that help us operate our platform (hosting, analytics, authentication)</li>
              <li><strong>OAuth Providers:</strong> Microsoft, Google, GitHub for authentication purposes</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
            </ul>
            <p>We do not sell your personal information to third parties.</p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Data Security</h2>
            <p>
              We implement industry-standard security measures to protect your data:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>SSL/TLS encryption for data in transit</li>
              <li>Encrypted storage for sensitive data</li>
              <li>JWT-based authentication with secure token management</li>
              <li>Role-based access control (RBAC)</li>
              <li>Regular security audits and monitoring</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. OAuth Authentication</h2>
            <p className="mb-3">
              When you authenticate using OAuth providers (Microsoft, Google, GitHub), we:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>Use PKCE (Proof Key for Code Exchange) for enhanced security</li>
              <li>Only request necessary scopes (email, profile, organization)</li>
              <li>Store OAuth tokens securely and encrypted</li>
              <li>Automatically refresh tokens to maintain secure access</li>
              <li>Allow you to revoke access at any time</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Data Retention</h2>
            <p>
              We retain your information for as long as your account is active or as needed to provide services.
              You may request deletion of your data by contacting us at{' '}
              <a href="mailto:privacy@paichart.app" className="text-primary hover:underline">
                privacy@paichart.app
              </a>
              .
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Your Rights</h2>
            <p className="mb-3">You have the right to:</p>
            <ul className="list-disc pl-6 mb-4">
              <li>Access your personal information</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Export your data</li>
              <li>Opt-out of marketing communications</li>
              <li>Revoke OAuth permissions</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Cookies and Tracking</h2>
            <p>
              We use cookies and similar technologies for authentication, preferences, and analytics.
              You can control cookie settings through your browser preferences.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. International Data Transfers</h2>
            <p>
              Your data may be transferred and processed in countries other than your own. We ensure
              appropriate safeguards are in place to protect your information in accordance with this policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">11. Children&apos;s Privacy</h2>
            <p>
              Our services are not intended for children under 13. We do not knowingly collect
              information from children under 13.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">12. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes
              by posting the new policy on this page and updating the &quot;Last updated&quot; date.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">13. Contact Us</h2>
            <p className="mb-3">
              If you have questions about this Privacy Policy, please contact us:
            </p>
            <ul className="list-none mb-4">
              <li>Email: <a href="mailto:privacy@paichart.app" className="text-primary hover:underline">privacy@paichart.app</a></li>
              <li>Website: <a href="https://paichart.app" className="text-primary hover:underline">https://paichart.app</a></li>
            </ul>
          </section>

          <div className="mt-12 pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">
              This privacy policy is effective as of October 4, 2025 and will remain in effect except with
              respect to any changes in its provisions in the future, which will be in effect immediately
              after being posted on this page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
