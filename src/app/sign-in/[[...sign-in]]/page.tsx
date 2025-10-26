import { SignIn } from '@clerk/nextjs';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <SignIn
        appearance={{
          baseTheme: undefined,
          variables: {
            colorPrimary: '#3b82f6',
            colorBackground: '#09090b',
            colorInputBackground: '#27272a',
            colorInputText: '#f4f4f5',
            colorText: '#f4f4f5',
            borderRadius: '0.5rem',
          },
          elements: {
            card: 'shadow-xl border border-zinc-800',
            headerTitle: 'text-zinc-100',
            headerSubtitle: 'text-zinc-400',
            formButtonPrimary: 'bg-blue-600 hover:bg-blue-700',
            formFieldLabel: 'text-zinc-300',
            formFieldInput: 'border-zinc-700 focus:border-blue-500',
            footerActionText: 'text-zinc-400',
            footerActionLink: 'text-blue-400 hover:text-blue-300',
          },
        }}
      />
    </div>
  );
}
