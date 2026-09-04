import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Phase Details'
}

export default function PhaseDetailsPage({ params }: { params: { phaseId: string } }) {
  return (
    <div>
      <h1>Phase Details</h1>
      {/* PhaseApprovalWorkflow component will be implemented here */}
    </div>
  )
}
