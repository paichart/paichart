import { NextRequest, NextResponse } from 'next/server';
import { geographicalService } from '@/lib/services/geographicalService';
import { handleApiError } from '@/lib/api-handler';
import { getAuthUser } from '@/lib/auth/get-auth-user';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const regions = await geographicalService.getAllRegions();
    return NextResponse.json(regions);
  } catch (error) {
    return handleApiError(error);
  }
}
