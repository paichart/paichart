import { Metadata } from 'next';

// Bare string, no suffix — the root layout's title template appends "| pAIchart", so this
// renders as "POVs | pAIchart". Hardcoding a suffix here would double it. ("POV List | COPO"
// carried the pre-rename product name into every browser tab on this route.)
export const metadata: Metadata = {
  title: 'POVs',
  description: 'View and manage all Proof of Value (POV) projects',
};

export default function POVLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
