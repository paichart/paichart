'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { useTheme } from 'next-themes'
import type { ThemeProviderProps } from 'next-themes'

function ThemeKeyboardShortcuts() {
  const { setTheme, theme } = useTheme()
  
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+Shift+D for Dusk theme
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        setTheme('dusk')
      }
    }
    
    // Add the event listener to the document to ensure it works globally
    document.addEventListener('keydown', handleKeyDown)
    
    // Clean up
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [setTheme])
  
  return null
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      themes={['light', 'dark', 'dusk']} // Add dusk theme
      {...props}
    >
      <ThemeKeyboardShortcuts />
      {children}
    </NextThemesProvider>
  )
}
