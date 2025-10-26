'use client';

import { SidebarProvider, useSidebar } from '@/components/DashboardSidebar';

function BillingContent() {
  const { sidebarWidth } = useSidebar();

  return (
    <div className="flex-1 flex flex-col" style={{ marginLeft: sidebarWidth }}>
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <h1 className="text-3xl font-bold text-zinc-100 mb-6">Billing</h1>
          <div className="text-zinc-400">
            Manage your billing and subscriptions here. This page is under development.
          </div>
        </div>
      </main>
    </div>
  );
}

export default function BillingPage() {
  return (
    <SidebarProvider>
      <div className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <div className="flex h-full">
          <BillingContent />
        </div>
      </div>
    </SidebarProvider>
  );
}
