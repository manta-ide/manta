import { AgentProcessor as AgentProcessorInterface, NodeDetailWithUidT, withRetry } from './graphTraversalUtils';
import { getTemplate, parseMessageWithTemplate } from '../promptTemplateUtils';

/**
 * Agent processor that uses the llm-agent/run endpoint for graph generation
 */
export class AgentProcessor implements AgentProcessorInterface {
  constructor(private baseUrl: string = 'http://localhost:3000') {}

  async processBatch({
    jobs,
    rootTask,
    childLimit,
    minChildComplexity,
    allowPrimitiveExpansion,
    model,
    temperature,
    topP,
    seed,
  }: {
    jobs: Array<{
      uid: string;
      nodePrompt: string;
      parent: { id: string | null; title: string | null; kind: string | null };
      ancestorPath: string[];
      depthRemaining: number;
      childLimitForThisJob: number;
    }>;
    rootTask: string;
    childLimit: number;
    minChildComplexity: number;
    allowPrimitiveExpansion: boolean;
    model: string;
    temperature: number;
    topP: number;
    seed?: number;
  }): Promise<NodeDetailWithUidT[]> {
    // Get the graph generation template
    const graphTemplate = await getTemplate('graph-generation-template');
    
    // Format jobs data for the template
    const jobsText = jobs.map((j, i) => {
      return [
        `- job[${i}]`,
        `  uid: ${j.uid}`,
        `  parent: ${JSON.stringify(j.parent)}`,
        `  ancestorPath: ${JSON.stringify(j.ancestorPath)}`,
        `  nodePrompt: ${j.nodePrompt}`,
        `  depthRemaining: ${j.depthRemaining}`,
        `  childLimitForThisJob: ${j.childLimitForThisJob}`,
      ].join('\n');
    }).join('\n');

    // Create variables for template
    const templateVariables = {
      GRAPH_GENERATION_TASK: rootTask,
      JOBS_DATA: jobsText,
      CHILD_LIMIT: childLimit.toString(),
      MIN_CHILD_COMPLEXITY: minChildComplexity.toString(),
      ALLOW_PRIMITIVE_EXPANSION: allowPrimitiveExpansion.toString(),
      MODEL: model,
      TEMPERATURE: temperature.toString(),
      TOP_P: topP.toString(),
      SEED: seed?.toString() || '',
    };

    // Parse the template with variables
    const prompt = parseMessageWithTemplate(graphTemplate, templateVariables);

    // Create the graph generation message
    const graphMessage = {
      role: 'user' as const,
      content: prompt,
      variables: templateVariables
    };

    const t0 = Date.now();
    
    const response = await withRetry(
      async () => {
        const res = await fetch(`${this.baseUrl}/api/llm-agent/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userMessage: graphMessage,
            sessionId: 'graph-generation',
            parsedMessages: [graphMessage],
            config: {
              model,
              maxSteps: 1, // Single step for graph generation
              tools: [], // No tools for graph generation
              streaming: false, // Non-streaming for structured output
              structuredOutput: true, // Use structured output
              providerOptions: {
                azure: {
                  reasoning_effort: 'high'
                }
              }
            }
          })
        });

        if (!res.ok) {
          throw new Error(`Graph generation failed: ${res.statusText}`);
        }

        const result = await res.json();
        return result;
      },
      'agent-processor(batch)'
    );

    const dt = Date.now() - t0;

    // Debug: Log the actual response structure

    // Extract the structured result
    const structuredResult = response.result.object;

    if (!structuredResult || !structuredResult.results) {
      console.error(`[graph] agent-processor Invalid response format:`, JSON.stringify(response, null, 2));
      throw new Error('Invalid response format from agent');
    }

    // prune children per job-specific depth + global rules
    const results = structuredResult.results.map((node: any, idx: number) => {
      const j = jobs[idx];
      let children = (node.children ?? []).slice(0, j.childLimitForThisJob);
      children = children.filter((c: any) => {
        // Allow all kinds to be expanded for deeper UI hierarchies
        const okKind = ['page','section','group','component','primitive','behavior'].includes(c.kind);
        const meetsComplexity = (c.complexity ?? 1) >= minChildComplexity;
        const isExpandable = c.expandable === true;
        return j.depthRemaining > 0 && okKind && isExpandable && meetsComplexity;
      });
      return { ...node, children };
    });

    return results;
  }
} 