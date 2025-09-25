'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Template {
  id: string;
  branch: string;
  name: string;
  description: string;
  image: string;
  glowColor: string;
  features: string[];
}

interface WelcomeScreenProps {
  onInstallTemplate: (branch: string) => void;
  isLoading?: boolean;
}


export default function WelcomeScreen({
  onInstallTemplate,
  isLoading = false
}: WelcomeScreenProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const response = await fetch('/api/templates');
        if (response.ok) {
          const data = await response.json();
          setTemplates(data.templates || []);
        }
      } catch (error) {
        console.error('Failed to fetch templates:', error);
      } finally {
        setLoadingTemplates(false);
      }
    };

    fetchTemplates();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-8">
      <div className="max-w-7xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-white">Welcome to Manta</h1>
          <p className="text-xl text-zinc-400">
            Select your template to get started.
          </p>
        </div>


        {/* Template Options */}
        {loadingTemplates ? (
          <div className="text-center text-zinc-400">Loading templates...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-2xl mx-auto">
  {templates.map((template) => (
    <Card
      key={template.id}
      className={`flex flex-col cursor-pointer overflow-hidden transition-all duration-200 hover:shadow-lg w-full min-w-[280px] ${
        selectedTemplate === template.id ? 'ring-2 ring-primary' : ''
      }`}
      onClick={() => {
        setSelectedTemplate(template.id);
        onInstallTemplate(template.branch);
      }}
    >
      {/* Image Section - Top (taller) */}
      <div className="relative h-30 overflow-hidden">
        <img
          src={template.image}
          alt={template.name}
          className="w-full h-full object-cover"
        />
      </div>

      {/* Content Section - Bottom (no tags) */}
      <CardContent className="flex flex-col justify-between flex-1 p-6">
        <div className="space-y-3">
          <div className="text-center">
            <h3 className="text-xl font-bold text-foreground">{template.name}</h3>
            <p className="text-sm text-muted-foreground">{template.description}</p>
          </div>
        </div>

        {/* Install Button (black) */}
        <div className="mt-6">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              setSelectedTemplate(template.id);
              onInstallTemplate(template.branch);
            }}
            disabled={isLoading}
            className="w-full bg-black text-white hover:bg-black/90"
          >
            {isLoading && selectedTemplate === template.id ? 'Installing...' : 'Install'}
          </Button>
        </div>
      </CardContent>
    </Card>
  ))}
</div>
        )}
      </div>
    </div>
  );
}
