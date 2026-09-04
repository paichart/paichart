import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth/get-auth-user";
import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { adminCRMLimiter } from "@/lib/middleware/rate-limit";
import { CRMSettingsSchema } from "@/lib/validation/crm-validation";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) {
    throw new ApiError("UNAUTHORIZED", "Unauthorized");
  }

  // Check if user has admin permissions
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    throw new ApiError("FORBIDDEN", "Insufficient permissions");
  }

  const settings = await prisma.cRMSettings.findFirst();

  if (!settings) {
    return Response.json({
      apiUrl: "",
      apiKey: "",
      clientId: "",
      clientSecret: "",
      autoSync: true,
      syncInterval: 30,
      retryAttempts: 3,
    });
  }

  // BC68 FIX: Mask sensitive credentials — only show last 4 chars
  const mask = (s: string) => s.length > 4 ? '•'.repeat(s.length - 4) + s.slice(-4) : '••••';
  return Response.json({
    ...settings,
    apiKey: settings.apiKey ? mask(settings.apiKey) : "",
    clientSecret: settings.clientSecret ? mask(settings.clientSecret) : "",
  });
}

export async function POST(request: NextRequest) {
  // ✅ Rate limiting (P2.3): 10 CRM operations per hour
  const rateLimitResponse = adminCRMLimiter(request);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const user = await getAuthUser(request);
  if (!user) {
    throw new ApiError("UNAUTHORIZED", "Unauthorized");
  }

  // Check if user has admin permissions
  if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    throw new ApiError("FORBIDDEN", "Insufficient permissions");
  }

  // ✅ SECURITY: Validate with Zod schema (URL format, string maxes, numeric ranges, coercion)
  const body = await request.json();
  const validation = CRMSettingsSchema.safeParse(body);
  if (!validation.success) {
    throw new ApiError("BAD_REQUEST", validation.error.errors.map(e => e.message).join(', '));
  }
  const { apiUrl, apiKey, clientId, clientSecret, autoSync, syncInterval, retryAttempts } = validation.data;

  const settings = await prisma.cRMSettings.upsert({
    where: { id: "default" },
    update: { apiUrl, apiKey, clientId, clientSecret, autoSync, syncInterval, retryAttempts },
    create: { id: "default", apiUrl, apiKey, clientId, clientSecret, autoSync, syncInterval, retryAttempts },
  });

  // BC68 FIX: Mask credentials in POST response too (GET already masks)
  const mask = (s: string) => s.length > 4 ? '•'.repeat(s.length - 4) + s.slice(-4) : '••••';
  return Response.json({
    ...settings,
    apiKey: settings.apiKey ? mask(settings.apiKey) : "",
    clientSecret: settings.clientSecret ? mask(settings.clientSecret) : "",
  });
}
