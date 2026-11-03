import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'KPI Details'
}

export default function KPIDetailsPage({ params: _params }: { params: Promise<{ kpiId: string }> }) {
  return (
    <div>
      <h1>KPI Details</h1>
      {/* KPIHistoryChart component will be implemented here */}
    </div>
  )
}
