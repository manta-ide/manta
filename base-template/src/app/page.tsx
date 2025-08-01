import React from 'react';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'SWE Hub - Empower Your Software Engineering Journey',
  description: 'Join a community of passionate software engineers, access curated resources, and accelerate your career.',
};

export default function Home() {
  return (
    <main className="relative overflow-hidden">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white min-h-screen flex items-center">
        <div className="container mx-auto px-6 flex flex-col items-start space-y-8">

            <Button className="bg-black text-white hover:bg-gray-800">
              Get Started
            </Button>
           
          
        </div>
      </section>

      
    </main>
  );
}