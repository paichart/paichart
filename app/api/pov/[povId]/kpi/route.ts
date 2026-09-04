import { NextRequest, NextResponse } from 'next/server'
import { withPOVAccess } from '@/lib/auth/validate-pov-access'
import { kpiService } from '@/lib/pov/services/kpi'
import {
  KPITemplateCreateSchema,
  KPITemplateUpdateSchema,
  KPICreateSchema,
  KPIUpdateSchema,
} from '@/lib/validation/kpi-validation'

export const GET = withPOVAccess(async (req, { params, user, pov }) => {
  const url = new URL(req.url)
  const povId = params.povId
  const type = url.searchParams.get('type')
  const kpiId = url.searchParams.get('kpiId')

  if (type === 'templates') {
    const templates = await kpiService.getTemplates()
    return NextResponse.json({ data: templates })
  }

  if (kpiId) {
    const kpi = await kpiService.getKPI(kpiId)
    if (!kpi) {
      return NextResponse.json(
        { error: 'KPI not found' },
        { status: 404 }
      )
    }
    // BC28 IDOR FIX: Verify KPI belongs to this POV
    if (kpi.povId !== povId) {
      return NextResponse.json(
        { error: 'KPI not found' },
        { status: 404 }
      )
    }
    return NextResponse.json({ data: kpi })
  }

  const kpis = await kpiService.getPOVKPIs(povId)
  return NextResponse.json({ data: kpis })
})

export const POST = withPOVAccess(async (req, { params, user, pov }) => {
  const url = new URL(req.url)
  const povId = params.povId
  const type = url.searchParams.get('type')
  const body = await req.json()

  if (type === 'template') {
    // BC30 FIX: Zod validation replaces TypeScript `as` cast
    const result = KPITemplateCreateSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', details: result.error.errors }, { status: 400 })
    }
    const template = await kpiService.createTemplate(result.data as any)
    return NextResponse.json({ data: template })
  }

  // Default: create KPI
  // BC30 FIX: Zod validation replaces TypeScript `as` cast
  const result = KPICreateSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: 'Validation failed', details: result.error.errors }, { status: 400 })
  }
  const { templateId, ...kpiData } = result.data
  const kpi = await kpiService.createKPI(povId, templateId ?? null, kpiData as any)
  return NextResponse.json({ data: kpi })
})

export const PUT = withPOVAccess(async (req, { params, user, pov }) => {
  const url = new URL(req.url)
  const povId = params.povId
  const type = url.searchParams.get('type')
  const id = url.searchParams.get('id')

  if (!id) {
    return NextResponse.json(
      { error: 'ID is required' },
      { status: 400 }
    )
  }

  if (type === 'template') {
    const rawData = await req.json()
    // BC30 FIX: Zod validation replaces TypeScript `as` cast
    const result = KPITemplateUpdateSchema.safeParse(rawData)
    if (!result.success) {
      return NextResponse.json({ error: 'Validation failed', details: result.error.errors }, { status: 400 })
    }
    const template = await kpiService.updateTemplate(id, result.data as any)
    return NextResponse.json({ data: template })
  }

  // BC28 IDOR FIX: Verify KPI belongs to this POV before update/calculate
  if (type !== 'template') {
    const existing = await kpiService.getKPI(id)
    if (!existing || existing.povId !== povId) {
      return NextResponse.json({ error: 'KPI not found' }, { status: 404 })
    }
  }

  if (type === 'calculate') {
    const result = await kpiService.calculateKPI(id)
    if (!result) {
      return NextResponse.json(
        { error: 'Failed to calculate KPI' },
        { status: 400 }
      )
    }
    return NextResponse.json({ data: result })
  }

  // Default: update KPI
  const rawData = await req.json()
  // BC30 FIX: Zod validation replaces TypeScript `as` cast
  const updateResult = KPIUpdateSchema.safeParse(rawData)
  if (!updateResult.success) {
    return NextResponse.json({ error: 'Validation failed', details: updateResult.error.errors }, { status: 400 })
  }
  const kpi = await kpiService.updateKPI(id, updateResult.data as any)
  return NextResponse.json({ data: kpi })
})

export const DELETE = withPOVAccess(async (req, { params, user, pov }) => {
  const url = new URL(req.url)
  const povId = params.povId
  const type = url.searchParams.get('type')
  const id = url.searchParams.get('id')

  if (!id) {
    return NextResponse.json(
      { error: 'ID is required' },
      { status: 400 }
    )
  }

  if (type === 'template') {
    await kpiService.deleteTemplate(id)
  } else {
    // BC28 IDOR FIX: Verify KPI belongs to this POV before deletion
    const existing = await kpiService.getKPI(id)
    if (!existing || existing.povId !== povId) {
      return NextResponse.json({ error: 'KPI not found' }, { status: 404 })
    }
    await kpiService.deleteKPI(id)
  }

  return NextResponse.json({ data: { success: true } })
})
