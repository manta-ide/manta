import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '../../../lib/evalJobStorage';

interface RouteParams {
  params: {
    jobId: string;
  };
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { jobId } = await params;
    
    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      );
    }
    
    const job = getJob(jobId);
    
    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }
    
    // Return job status and results
    return NextResponse.json({
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      results: job.results,
      statistics: job.statistics,
      isCompleted: job.status === 'completed' || job.status === 'failed',
      error: job.error,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    });
    
  } catch (error) {
    console.error('Status API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 