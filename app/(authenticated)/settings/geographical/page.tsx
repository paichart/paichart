import React from 'react';
import { GeographicalPreferences } from '@/components/settings/GeographicalPreferences';
import { Container } from '@/components/ui/Container';

export const metadata = {
  title: 'Geographical Preferences',
  description: 'Manage your default geographical preferences for new POVs',
};

export default function GeographicalPreferencesPage() {
  return (
    <Container>
      <div className="py-6">
        <h1 className="text-3xl font-bold mb-6">Geographical Preferences</h1>
        <p className="text-muted-foreground mb-8">
          Set your default geographical preferences for new POVs. These settings will be automatically applied when creating new POVs.
        </p>
        
        <GeographicalPreferences />
      </div>
    </Container>
  );
}
