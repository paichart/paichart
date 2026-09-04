export const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  lastLogin: true,
  createdAt: true,
  // ✅ SECURITY FIX: Exclude sensitive fields (Week 1 P0 Fix #4)
  password: false,              // ❌ NEVER expose passwords!
  resetTokenHash: false,        // ❌ Sensitive
  verificationToken: false,     // ❌ Sensitive
  isVerified: true,
  verifiedAt: true,
  updatedAt: true,
  customRoleId: true,
  preferredSalesTheatre: true,
  preferredCountryId: true,
  preferredRegionId: true,
  // OAuth 2.0 fields (Plan 9)
  oauthProvider: true,
  oauthProviderId: true,
  avatarUrl: true,
  organizationDomain: true,
  lastLoginAt: true,
  preferredCountry: {
    select: {
      id: true,
      name: true,
      code: true,
      theatre: true
    }
  },
  preferredRegion: {
    select: {
      id: true,
      name: true,
      type: true,
      countryId: true
    }
  },
  customRole: {
    select: {
      id: true,
      name: true,
    }
  },
} as const;

export const roleSelect = {
  id: true,
  name: true,
  permissions: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const roleWithUsersSelect = {
  ...roleSelect,
  users: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
    },
  },
} as const;

export const activitySelect = {
  id: true,
  userId: true,
  type: true,
  action: true,
  metadata: true,
  createdAt: true,
} as const;

export const activityWithUserSelect = {
  ...activitySelect,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
} as const;

export const systemSettingsSelect = {
  id: true,
  notifications: true,
  twoFactor: true,
  darkMode: true,
  updatedAt: true,
} as const;
