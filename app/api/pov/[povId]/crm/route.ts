import { NextRequest, NextResponse } from 'next/server'
import { withPOVAccess } from '@/lib/auth/validate-pov-access'
import { crmService } from '@/lib/pov/services/crm'
import type {
  CRMFieldMappingCreateInput,
  CRMFieldMappingUpdateInput,
  CRMSyncResult
} from '@/lib/pov/types/crm'
import type { CRMFieldMapping, CRMSyncHistory } from '@prisma/client'

export const GET = withPOVAccess(async (req, { params, user, pov }) => {
  const url = new URL(req.url)
  const poVId = params.povId
  const type = url.searchParams.get('type')

  if (type === 'history') {
    const history = await crmService.getSyncHistory(poVId)
    return NextResponse.json({ data: history })
  }

  const lastSync = await crmService.getLastSync(poVId)
  const fieldMappings = await crmService.getFieldMapping()

  return NextResponse.json({
    data: {
      lastSync,
      fieldMappings
    }
  })
})

export const POST = withPOVAccess(async (req, { params, user, pov }) => {
  const url = new URL(req.url)
  const poVId = params.povId
  const type = url.searchParams.get('type')

  if (type === 'mapping') {
    const data = await req.json() as CRMFieldMappingCreateInput
    const mapping = await crmService.createFieldMapping(data)
    return NextResponse.json({ data: mapping })
  }

  // Default: trigger sync
  const result = await crmService.syncPoV(poVId)
  return NextResponse.json({ data: result })
})

export const PUT = withPOVAccess(async (req, { params, user, pov }) => {
  const url = new URL(req.url)
  const mappingId = url.searchParams.get('mappingId')

  if (!mappingId) {
    return NextResponse.json(
      { error: 'Mapping ID is required' },
      { status: 400 }
    )
  }

  const data = await req.json() as CRMFieldMappingUpdateInput
  const mapping = await crmService.updateFieldMapping(mappingId, data)
  return NextResponse.json({ data: mapping })
})

export const DELETE = withPOVAccess(async (req, { params, user, pov }) => {
  const url = new URL(req.url)
  const mappingId = url.searchParams.get('mappingId')

  if (!mappingId) {
    return NextResponse.json(
      { error: 'Mapping ID is required' },
      { status: 400 }
    )
  }

  await crmService.deleteFieldMapping(mappingId)
  return NextResponse.json({ data: { success: true } })
})
