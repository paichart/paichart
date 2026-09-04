import { NextRequest } from "next/server";
import { getAuthUser } from "@/lib/auth/get-auth-user";
import { ApiError } from "@/lib/errors";
import { handleApiError } from "@/lib/api-handler";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      throw new ApiError("UNAUTHORIZED", "Unauthorized");
    }

    // Check if user has admin permissions
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      throw new ApiError("FORBIDDEN", "Insufficient permissions");
    }

    const { id } = params;

    // Check if mapping exists
    const mapping = await prisma.cRMFieldMapping.findUnique({
      where: { id }
    });

    if (!mapping) {
      throw new ApiError("NOT_FOUND", "Field mapping not found");
    }

    // Delete the mapping
    await prisma.cRMFieldMapping.delete({
      where: { id }
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
