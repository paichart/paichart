import { ReactNode } from 'react';

/**
 * Workflows Layout
 *
 * This layout wraps the workflows pages. Admin-only access control is
 * enforced at the page level (server component) following the dashboard pattern.
 */
export default function WorkflowsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
