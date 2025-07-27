/**
 * In-Memory Job Storage for Evaluation Jobs
 * 
 * Simple in-memory storage for evaluation jobs. In production, this should be
 * replaced with a proper database or Redis for persistence and scalability.
 */

import { EvalJob } from './schemas';

// In-memory storage
const jobStorage = new Map<string, EvalJob>();

export function createJob(jobId: string, initialJob: Omit<EvalJob, 'jobId'>): EvalJob {
  const job: EvalJob = {
    jobId,
    ...initialJob,
  };
  
  jobStorage.set(jobId, job);
  return job;
}

export function getJob(jobId: string): EvalJob | undefined {
  return jobStorage.get(jobId);
}

export function updateJob(jobId: string, updates: Partial<EvalJob>): EvalJob | undefined {
  const job = jobStorage.get(jobId);
  if (!job) return undefined;
  
  const updatedJob = { ...job, ...updates };
  jobStorage.set(jobId, updatedJob);
  return updatedJob;
}

export function deleteJob(jobId: string): boolean {
  return jobStorage.delete(jobId);
}

export function listJobs(): EvalJob[] {
  return Array.from(jobStorage.values());
}

export function generateJobId(): string {
  return `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Statistics calculation utilities
export function calculateStatistics(scores: number[]) {
  if (scores.length === 0) {
    return {
      average: 0,
      median: 0,
      standardDeviation: 0,
      count: 0,
    };
  }

  const count = scores.length;
  const average = scores.reduce((sum, score) => sum + score, 0) / count;
  
  // Calculate median
  const sortedScores = [...scores].sort((a, b) => a - b);
  const median = count % 2 === 0
    ? (sortedScores[count / 2 - 1] + sortedScores[count / 2]) / 2
    : sortedScores[Math.floor(count / 2)];
  
  // Calculate standard deviation
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - average, 2), 0) / count;
  const standardDeviation = Math.sqrt(variance);
  
  return {
    average: Math.round(average * 100) / 100, // Round to 2 decimal places
    median: Math.round(median * 100) / 100,
    standardDeviation: Math.round(standardDeviation * 100) / 100,
    count,
  };
} 