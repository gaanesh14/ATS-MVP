import { AuthProvider } from '@/components/shell/auth-provider';
import { DashboardShell } from '@/components/shell/dashboard-shell';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
