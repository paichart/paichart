'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCookies } from 'next-client-cookies';

export default function HomePage() {
  const router = useRouter();
  const cookies = useCookies();
  const accessToken = cookies.get('accessToken');

  try {
    useEffect(() => {
      console.log('accessToken:', accessToken);
      if (accessToken) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    }, [accessToken, router]);
  } catch (error) {
    console.error('Error in HomePage:', error);
    return <div>An error occurred. Please check the console.</div>;
  }

  return null;
}