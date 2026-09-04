import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'KPI Details'
}

export default function KPIDetailsPage({ params }: { params: { kpiId: string } }) {
  return (
    <div>
      <h1>KPI Details</h1>
      {/* KPIHistoryChart component will be implemented here */}
    </div>
  )
}
