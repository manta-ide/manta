'use client';

import { useAuth } from '@clerk/nextjs';
import { SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { SidebarProvider, useSidebar } from '@/components/DashboardSidebar';

function DashboardContent() {
  const { sidebarWidth } = useSidebar();

  return (
    <div className="flex-1 flex flex-col" style={{ marginLeft: sidebarWidth }}>
      <header className="flex items-center justify-between p-4 border-b border-zinc-800">
        <h1 className="text-xl font-semibold text-zinc-100">Dashboard</h1>
        <UserButton
          appearance={{
            baseTheme: undefined,
            variables: {
              colorPrimary: '#3b82f6',
            },
            elements: {
              avatarBox: 'h-8 w-8',
            },
          }}
        />
      </header>
      <main className="flex-1 overflow-auto">
        <div className="p-8">
          <h2 className="text-2xl font-bold text-zinc-100 mb-6">Welcome back!</h2>
          <div className="text-zinc-400 mb-6">
            Select an option from the sidebar to get started with your projects.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors">
              <h3 className="text-lg font-semibold text-zinc-100 mb-2">Projects</h3>
              <p className="text-zinc-400 text-sm mb-4">
                Manage your graph visualization projects and collaborate with your team.
              </p>
              <button className="text-blue-400 hover:text-blue-300 text-sm font-medium">
                View Projects →
              </button>
            </div>
            <div className="p-6 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors">
              <h3 className="text-lg font-semibold text-zinc-100 mb-2">API Keys</h3>
              <p className="text-zinc-400 text-sm mb-4">
                Manage your API keys for integrations and external access.
              </p>
              <button className="text-blue-400 hover:text-blue-300 text-sm font-medium">
                Manage Keys →
              </button>
            </div>
            <div className="p-6 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors">
              <h3 className="text-lg font-semibold text-zinc-100 mb-2">Billing</h3>
              <p className="text-zinc-400 text-sm mb-4">
                View your subscription and manage billing information.
              </p>
              <button className="text-blue-400 hover:text-blue-300 text-sm font-medium">
                View Billing →
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Dashboard() {
  const { isLoaded, userId } = useAuth();

  if (!isLoaded) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-bold text-zinc-100">Welcome to Manta</h1>
          <p className="text-zinc-400 max-w-md">
            Sign in to access your projects, API keys, and graph visualization tools.
          </p>
          <div className="flex gap-4 justify-center">
            <SignInButton mode="modal">
              <button className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                Sign In
              </button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="px-6 py-2 border border-zinc-600 text-zinc-300 rounded-md hover:bg-zinc-800 transition-colors">
                Sign Up
              </button>
            </SignUpButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <div className="flex h-full">
          <DashboardContent />
        </div>
      </div>
    </SidebarProvider>
  );
}
