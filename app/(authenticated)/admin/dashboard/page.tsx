'use client';

import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function AdminDashboardPage() {
  return (
    <div className="p-6">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">
            System administration and configuration.
          </p>
        </div>

      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mt-4">
        <Card>
          <CardHeader>
            <CardTitle>User Management</CardTitle>
            <CardDescription>
              Add, edit, and manage user accounts. Control access and permissions for your team members.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/users" className="no-underline">
              <Button>Manage</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>User Permissions</CardTitle>
            <CardDescription>
              Configure system-level permissions and access controls for different user roles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/permissions" className="no-underline">
              <Button>Manage</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Job Titles</CardTitle>
            <CardDescription>
              Manage organizational roles and job titles for team members.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/roles" className="no-underline">
              <Button>Manage</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CRM Integration</CardTitle>
            <CardDescription>
              Configure CRM field mappings, sync settings, and global templates for PoV integration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/crm" className="no-underline">
              <Button>Manage</Button>
            </Link>
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <CardTitle>Template Management</CardTitle>
            <CardDescription>
              Advanced template management with analytics, import/export, and visual builder tools.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/templates" className="no-underline">
              <Button>Manage</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audit Log</CardTitle>
            <CardDescription>
              View detailed activity logs and audit trails. Track user actions and system changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/audit" className="no-underline">
              <Button>View</Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Settings</CardTitle>
            <CardDescription>
              Configure global system settings, including AI providers, security, and general options.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/admin/settings" className="no-underline">
              <Button>Manage</Button>
            </Link>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
