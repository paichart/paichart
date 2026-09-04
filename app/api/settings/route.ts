import { NextRequest } from 'next/server';
import { handleGetSettings } from '@/lib/settings/handlers/get';
import { handlePutSettings } from '@/lib/settings/handlers/put';

export async function GET(req: NextRequest) {
  return handleGetSettings(req);
}

export async function PUT(req: NextRequest) {
  return handlePutSettings(req);
}
