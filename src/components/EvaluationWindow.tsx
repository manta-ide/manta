'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, CheckCircle, Clock, TrendingUp, BarChart3, FileText, Play, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

interface EvaluationResult {
  testCaseId: string;
  input: string;
  aiResponse: string;
  judgeScore: number;
  judgeReasoning: string;
  toolCalls?: any[];
  fileOperations?: any[];
}

interface EvaluationJob {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  results: EvaluationResult[];
  statistics?: {
    average: number;
    median: number;
    standardDeviation: number;
    count: number;
  };
  isCompleted: boolean;
  error?: string;
  createdAt: string;
  completedAt?: string;
}

interface EvaluationWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

const defaultDataset = `{
  "dataset": [
    {
      "id": "test_1",
      "input": "Create a simple React component for a button with a click handler"
    },
    {
      "id": "test_2", 
      "input": "Add error handling to the login function",
      "currentFile": "src/components/LoginForm.tsx"
    },
    {
      "id": "test_3",
      "input": "Fix the styling issues in the selected area",
      "currentFile": "src/app/page.tsx",
      "selection": {
        "x": 100,
        "y": 200,
        "width": 300,
        "height": 150
      }
    }
  ]
}`;

export default function EvaluationWindow({ isOpen, onClose }: EvaluationWindowProps) {
  const [datasetInput, setDatasetInput] = useState(defaultDataset);
  const [currentJob, setCurrentJob] = useState<EvaluationJob | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isPolling, setIsPolling] = useState(false);

  // Poll for job status updates
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (currentJob && !currentJob.isCompleted && isPolling) {
      interval = setInterval(async () => {
        try {
          const response = await fetch(`/api/eval/status/${currentJob.jobId}`);
          if (response.ok) {
            const updatedJob = await response.json();
            setCurrentJob(updatedJob);
            
            if (updatedJob.isCompleted) {
              setIsPolling(false);
              if (updatedJob.status === 'completed') {
                toast.success('Evaluation completed successfully!');
              } else if (updatedJob.status === 'failed') {
                toast.error('Evaluation failed: ' + updatedJob.error);
              }
            }
          }
        } catch (error) {
          console.error('Error polling job status:', error);
        }
      }, 2000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentJob, isPolling]);

  const startEvaluation = async () => {
    try {
      setIsStarting(true);
      
      // Parse and validate dataset
      const dataset = JSON.parse(datasetInput);
      
      const response = await fetch('/api/eval', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(dataset),
      });

      if (!response.ok) {
        throw new Error('Failed to start evaluation');
      }

      const job = await response.json();
      setCurrentJob({
        ...job,
        results: [],
        isCompleted: false,
      });
      
      setIsPolling(true);
      toast.success('Evaluation started!');
    } catch (error) {
      console.error('Error starting evaluation:', error);
      toast.error('Failed to start evaluation: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsStarting(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 9) return 'bg-green-100 text-green-800';
    if (score >= 7) return 'bg-blue-100 text-blue-800';
    if (score >= 5) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  if (!isOpen) return null;

  return (
    <div className="w-[600px] flex flex-col h-full bg-zinc-900 border-l border-zinc-700">
      {/* Header */}
      <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-zinc-400" />
          <h2 className="text-lg font-semibold text-white">AI Evaluation</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-zinc-400 hover:text-white"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="setup" className="h-full flex flex-col">
          <TabsList className="mx-4 mt-4 grid w-auto grid-cols-2 bg-zinc-800">
            <TabsTrigger value="setup" className="data-[state=active]:bg-zinc-700">
              <FileText className="h-4 w-4 mr-2" />
              Setup
            </TabsTrigger>
            <TabsTrigger value="results" className="data-[state=active]:bg-zinc-700">
              <TrendingUp className="h-4 w-4 mr-2" />
              Results
            </TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="flex-1 overflow-hidden m-4 mt-2">
            <div className="space-y-4 h-full flex flex-col">
              <Card className="bg-zinc-800 border-zinc-700">
                <CardHeader>
                  <CardTitle className="text-white">Test Dataset</CardTitle>
                  <CardDescription className="text-zinc-400">
                    Define your evaluation test cases in JSON format. Each test case can include optional context like currentFile and selection.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    value={datasetInput}
                    onChange={(e) => setDatasetInput(e.target.value)}
                    placeholder="Enter test dataset JSON..."
                    className="min-h-[300px] font-mono text-sm bg-zinc-900 border-zinc-600 text-white"
                  />
                  <Button 
                    onClick={startEvaluation} 
                    disabled={isStarting || isPolling}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {isStarting ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Starting Evaluation...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Start Evaluation
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>

              {currentJob && (
                <Card className="bg-zinc-800 border-zinc-700">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white">Current Job</CardTitle>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(currentJob.status)}
                        <Badge className={getStatusColor(currentJob.status)}>
                          {currentJob.status}
                        </Badge>
                      </div>
                    </div>
                    <CardDescription className="text-zinc-400">
                      Job ID: {currentJob.jobId}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-400">Progress</span>
                        <span className="text-white">{currentJob.progress}%</span>
                      </div>
                      <Progress value={currentJob.progress} className="bg-zinc-700" />
                      {currentJob.error && (
                        <div className="text-red-400 text-sm mt-2">
                          Error: {currentJob.error}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="results" className="flex-1 overflow-hidden m-4 mt-2">
            <ScrollArea className="h-full">
              <div className="space-y-4">
                {currentJob?.statistics && (
                  <Card className="bg-zinc-800 border-zinc-700">
                    <CardHeader>
                      <CardTitle className="text-white">Statistics</CardTitle>
                      <CardDescription className="text-zinc-400">
                        Overall performance metrics
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-4 text-center">
                        <div>
                          <div className="text-2xl font-bold text-blue-400">
                            {currentJob.statistics.average.toFixed(1)}
                          </div>
                          <div className="text-xs text-zinc-400">Average</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-green-400">
                            {currentJob.statistics.median.toFixed(1)}
                          </div>
                          <div className="text-xs text-zinc-400">Median</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-yellow-400">
                            {currentJob.statistics.standardDeviation.toFixed(1)}
                          </div>
                          <div className="text-xs text-zinc-400">Std Dev</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-zinc-400">
                            {currentJob.statistics.count}
                          </div>
                          <div className="text-xs text-zinc-400">Total</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {currentJob?.results && (
                  <Card className="bg-zinc-800 border-zinc-700">
                    <CardHeader>
                      <CardTitle className="text-white">Detailed Results</CardTitle>
                      <CardDescription className="text-zinc-400">
                        Individual test case results and judge reasoning
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {currentJob.results.map((result) => (
                          <div key={result.testCaseId} className="p-4 rounded-lg border border-zinc-600 bg-zinc-900">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-medium text-white">{result.testCaseId}</h4>
                              <Badge className={getScoreColor(result.judgeScore)}>
                                {result.judgeScore}/10
                              </Badge>
                            </div>
                            
                            <div className="space-y-3">
                              <div>
                                <div className="text-sm font-medium text-zinc-400 mb-1">Input:</div>
                                <div className="text-sm bg-zinc-800 p-2 rounded text-zinc-200">
                                  {result.input}
                                </div>
                              </div>
                              
                              <div>
                                <div className="text-sm font-medium text-zinc-400 mb-1">AI Response:</div>
                                <div className="text-sm bg-zinc-800 p-2 rounded max-h-32 overflow-y-auto text-zinc-200">
                                  {result.aiResponse}
                                </div>
                              </div>
                              
                              {/* Tool Calls */}
                              {result.toolCalls && result.toolCalls.length > 0 && (
                                <div>
                                  <div className="text-sm font-medium text-zinc-400 mb-1">Tool Calls ({result.toolCalls.length}):</div>
                                  <div className="text-sm bg-zinc-800 p-2 rounded text-zinc-200 max-h-64 overflow-y-auto">
                                    {result.toolCalls.map((toolCall, i) => (
                                      <div key={i} className="mb-2 border-b border-zinc-700 pb-2 last:border-b-0 last:pb-0">
                                        <span className="text-blue-400">{toolCall.toolName}</span>: {' '}
                                        <pre className="text-xs mt-1 overflow-x-auto">
                                          {JSON.stringify(toolCall.args, null, 2)}
                                        </pre>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              {/* File Operations */}
                              {result.fileOperations && result.fileOperations.length > 0 && (
                                <div>
                                  <div className="text-sm font-medium text-zinc-400 mb-1">File Operations ({result.fileOperations.length}):</div>
                                  <div className="text-sm bg-zinc-800 p-2 rounded text-zinc-200 max-h-64 overflow-y-auto">
                                    {result.fileOperations.map((op, i) => (
                                      <div key={i} className="mb-2 border-b border-zinc-700 pb-2 last:border-b-0 last:pb-0">
                                        <span className={
                                          op.type === 'create' ? 'text-green-400' :
                                          op.type === 'update' ? 'text-blue-400' :
                                          op.type === 'patch' ? 'text-yellow-400' : 'text-red-400'
                                        }>
                                          {op.type}
                                        </span>: {op.path}
                                        {(op.type === 'create' || op.type === 'update' || op.type === 'patch') && op.content && (
                                          <div className="mt-1">
                                            <div className="text-xs opacity-75">Content preview:</div>
                                            <pre className="text-xs mt-1 overflow-x-auto max-h-20">
                                              {op.content.length > 500 
                                                ? op.content.substring(0, 500) + '...' 
                                                : op.content}
                                            </pre>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              
                              <div>
                                <div className="text-sm font-medium text-zinc-400 mb-1">Judge Reasoning:</div>
                                <div className="text-sm bg-zinc-800 p-2 rounded text-zinc-200">
                                  {result.judgeReasoning}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!currentJob && (
                  <Card className="bg-zinc-800 border-zinc-700">
                    <CardContent className="text-center py-8">
                      <BarChart3 className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
                      <p className="text-zinc-400">No evaluation results yet</p>
                      <p className="text-zinc-500 text-sm">Start an evaluation to see results here</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
} 