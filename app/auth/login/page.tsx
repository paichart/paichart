import { redirect } from 'next/navigation';

// Redirect /auth/login to /login for backwards compatibility
// All login functionality is now at /login with the clean design
export default function AuthLoginRedirect() {
  redirect('/login');
}