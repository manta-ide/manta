'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface WelcomeScreenProps {
  onInstallFullTemplate: () => void;
  onApplyPartialTemplate?: () => void;
  isLoading?: boolean;
  templateResult?: {
    added: string[];
    updated: string[];
    skipped: string[];
    removed: string[];
  };
}

export default function WelcomeScreen({
  onInstallFullTemplate,
  onApplyPartialTemplate,
  isLoading = false,
  templateResult
}: WelcomeScreenProps) {
  const [selectedOption, setSelectedOption] = useState<'install' | 'partial' | null>(null);

  return (
    <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-white">Welcome to Manta</h1>
          <p className="text-xl text-zinc-400">
            A visual development environment for building React applications with graphs
          </p>
        </div>

        {/* Template Result */}
        {templateResult && (
          <Card className="bg-zinc-800 border-green-500">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                ✅ Template Applied Successfully
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {templateResult.added.length > 0 && (
                <div>
                  <div className="text-sm text-green-400 font-medium mb-1">Added Files:</div>
                  <div className="flex flex-wrap gap-1">
                    {templateResult.added.map(file => (
                      <Badge key={file} variant="secondary" className="text-xs bg-green-900 text-green-200">
                        {file}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {templateResult.updated.length > 0 && (
                <div>
                  <div className="text-sm text-blue-400 font-medium mb-1">Updated Files:</div>
                  <div className="flex flex-wrap gap-1">
                    {templateResult.updated.map(file => (
                      <Badge key={file} variant="secondary" className="text-xs bg-blue-900 text-blue-200">
                        {file}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {templateResult.skipped.length > 0 && (
                <div>
                  <div className="text-sm text-yellow-400 font-medium mb-1">Skipped (Already Exist):</div>
                  <div className="flex flex-wrap gap-1">
                    {templateResult.skipped.map(file => (
                      <Badge key={file} variant="secondary" className="text-xs bg-yellow-900 text-yellow-200">
                        {file}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Options */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Apply Partial Template */}
          {onApplyPartialTemplate && (
            <Card
              className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${
                selectedOption === 'partial'
                  ? 'ring-2 ring-purple-500 bg-zinc-800'
                  : 'bg-zinc-800/50 hover:bg-zinc-800'
              }`}
              onClick={() => setSelectedOption('partial')}
            >
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  ➕ Apply Partial Template
                </CardTitle>
                <CardDescription className="text-zinc-400">
                  Extend your project with sample components and graphs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-500 mb-4">
                  Add sample React components and graph structures to your existing project without overwriting files.
                </p>
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    onApplyPartialTemplate();
                  }}
                  disabled={isLoading}
                  className="w-full"
                  variant={selectedOption === 'partial' ? 'default' : 'outline'}
                >
                  {isLoading ? 'Applying...' : 'Apply Partial Template'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Install Full Template */}
          <Card
            className={`cursor-pointer transition-all duration-200 hover:shadow-lg ${
              selectedOption === 'install'
                ? 'ring-2 ring-green-500 bg-zinc-800'
                : 'bg-zinc-800/50 hover:bg-zinc-800'
            }`}
            onClick={() => setSelectedOption('install')}
          >
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                🚀 Install Full Template
              </CardTitle>
              <CardDescription className="text-zinc-400">
                Start fresh with a complete project template
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-500 mb-4">
                Install a complete template to your current directory. This will set up a new project with all necessary files and graph structure.
              </p>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  onInstallFullTemplate();
                }}
                disabled={isLoading}
                className="w-full"
                variant={selectedOption === 'install' ? 'default' : 'outline'}
              >
                {isLoading ? 'Installing...' : 'Install Template'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Additional Info */}
        <div className="text-center space-y-2">
          <p className="text-sm text-zinc-500">
            If you already have graph files in your project, Manta will automatically detect and open them.
          </p>
          <p className="text-xs text-zinc-600">
            Choose "Apply Partial Template" to extend your project, or "Install Full Template" to start fresh.
          </p>
        </div>
      </div>
    </div>
  );
}
