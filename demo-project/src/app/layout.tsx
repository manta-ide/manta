import './globals.css';

export const metadata = {
  title: 'Manta Editor Demo',
  description: 'A demo Next.js application showcasing Manta Editor capabilities',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
} 