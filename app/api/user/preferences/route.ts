import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth/get-auth-user';
import { SalesTheatre } from '@prisma/client';
import { logger } from '@/lib/logger';

// GET /api/user/preferences
// Get the current user's geographical preferences
export async function GET(req: NextRequest) {
  try {
    // Get authenticated user
    const user = await getAuthUser(req);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get user preferences from database
    const preferences = await prisma.user.findUnique({
      where: { id: user.userId },
      select: {
        preferredSalesTheatre: true,
        preferredCountryId: true,
        preferredRegionId: true,
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
        }
      }
    });
    
    return NextResponse.json({ success: true, data: preferences });
  } catch (error) {
    logger.error({ err: error }, 'User Preferences API error (GET)');
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user preferences' },
      { status: 500 }
    );
  }
}

// PUT /api/user/preferences
// Update the current user's geographical preferences
export async function PUT(req: NextRequest) {
  try {
    // Get authenticated user
    const user = await getAuthUser(req);
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Parse request body
    const body = await req.json();

    // ✅ P1-3 FIX: Zod validation with safeParse (replaces manual validation)
    const { UserPreferencesSchema } = await import('@/lib/validation/user-validation');
    const result = UserPreferencesSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: result.error.errors
        },
        { status: 400 }
      );
    }

    const { preferredSalesTheatre, preferredCountryId, preferredRegionId } = result.data;
    
    // If country is provided, ensure it exists
    if (preferredCountryId) {
      const country = await prisma.country.findUnique({
        where: { id: preferredCountryId }
      });
      
      if (!country) {
        return NextResponse.json(
          { success: false, error: 'Country not found' },
          { status: 400 }
        );
      }
    }
    
    // If region is provided, ensure it exists and belongs to the selected country
    if (preferredRegionId) {
      const region = await prisma.region.findUnique({
        where: { id: preferredRegionId }
      });
      
      if (!region) {
        return NextResponse.json(
          { success: false, error: 'Region not found' },
          { status: 400 }
        );
      }
      
      if (preferredCountryId && region.countryId !== preferredCountryId) {
        return NextResponse.json(
          { success: false, error: 'Region does not belong to the selected country' },
          { status: 400 }
        );
      }
    }
    
    // Update user preferences
    const updatedUser = await prisma.user.update({
      where: { id: user.userId },
      data: {
        preferredSalesTheatre,
        preferredCountryId,
        preferredRegionId
      },
      select: {
        id: true,
        preferredSalesTheatre: true,
        preferredCountryId: true,
        preferredRegionId: true,
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
        }
      }
    });
    
    return NextResponse.json({ success: true, data: updatedUser });
  } catch (error) {
    logger.error({ err: error }, 'User Preferences API error (PUT)');
    return NextResponse.json(
      { success: false, error: 'Failed to update user preferences' },
      { status: 500 }
    );
  }
}
