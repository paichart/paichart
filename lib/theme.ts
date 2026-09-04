export const theme = {
  light: {
    "--background": "248 249 250", // #f8f9fa
    "--foreground": "33 37 41", // #212529
    "--card": "255 255 255", // #ffffff
    "--card-foreground": "33 37 41", // #212529
    "--popover": "255 255 255", // #ffffff
    "--popover-foreground": "33 37 41", // #212529
    "--primary": "0 123 255", // #007bff
    "--primary-foreground": "255 255 255", // #ffffff
    "--secondary": "108 117 125", // #6c757d
    "--secondary-foreground": "255 255 255", // #ffffff
    "--muted": "233 236 239", // #e9ecef
    "--muted-foreground": "108 117 125", // #6c757d
    "--accent": "23 162 184", // #17a2b8
    "--accent-foreground": "255 255 255", // #ffffff
    "--destructive": "220 53 69", // #dc3545
    "--destructive-foreground": "255 255 255", // #ffffff
    "--border": "222 226 230", // #dee2e6
    "--input": "233 236 239", // #e9ecef
    "--ring": "0 123 255", // #007bff
    "--radius": "0.5rem",
  },
  dark: {
    "--background": "33 37 41", // #212529
    "--foreground": "248 249 250", // #f8f9fa
    "--card": "52 58 64", // #343a40
    "--card-foreground": "248 249 250", // #f8f9fa
    "--popover": "52 58 64", // #343a40
    "--popover-foreground": "248 249 250", // #f8f9fa
    "--primary": "0 123 255", // #007bff
    "--primary-foreground": "255 255 255", // #ffffff
    "--secondary": "108 117 125", // #6c757d
    "--secondary-foreground": "255 255 255", // #ffffff
    "--muted": "73 80 87", // #495057
    "--muted-foreground": "173 181 189", // #adb5bd
    "--accent": "23 162 184", // #17a2b8
    "--accent-foreground": "255 255 255", // #ffffff
    "--destructive": "220 53 69", // #dc3545
    "--destructive-foreground": "255 255 255", // #ffffff
    "--border": "73 80 87", // #495057
    "--input": "73 80 87", // #495057
    "--ring": "0 123 255", // #007bff
    "--radius": "0.5rem",
  },
} as const;

export type Theme = typeof theme;

// Font configuration is now handled in tailwind.config.ts
// with the fontFamily extension using Inter as the primary font
