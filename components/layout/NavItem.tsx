'use client';

import { useRouter, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavItemProps {
  item: {
    title: string;
    icon: React.ReactNode;
    path: string;
  };
  onMobileClose?: () => void;
}

export function NavItem({ item, onMobileClose }: NavItemProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleClick = () => {
    router.push(item.path);
    if (onMobileClose) {
      onMobileClose();
    }
  };

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return pathname === path || pathname === '/';
    }
    return pathname.startsWith(path);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'flex items-center gap-3 w-full px-3 py-2 rounded-md transition-colors text-left',
        isActive(item.path)
          ? 'bg-primary text-primary-foreground'
          : 'hover:bg-muted text-foreground hover:text-foreground'
      )}
    >
      {item.icon}
      <span className="font-medium">{item.title}</span>
    </button>
  );
}
