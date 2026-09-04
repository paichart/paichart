// Note: Don't import cookies from next/headers - causes AsyncLocalStorage error with custom server
// The CookiesProvider will read cookies client-side via document.cookie instead
import { Providers as RootProviders } from '@/components/providers/Providers';

export function Providers({ children }: { children: React.ReactNode }) {
  // Pass empty array - CookiesProvider will hydrate from document.cookie on client
  // This avoids AsyncLocalStorage issues with custom server setup
  return (
    <RootProviders initialCookies={[]}>
      {children}
    </RootProviders>
  );
}
