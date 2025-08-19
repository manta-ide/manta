import { NextRequest, NextResponse } from 'next/server';
import { Graph, GraphNode, Property, GeneratePropertiesRequest, GeneratePropertiesResponse } from '../../lib/schemas';
import { getTemplate, parseTemplate } from '../../lib/promptTemplateUtils';
import { storeGraph } from '../../lib/graphStorage';

export async function POST(req: NextRequest) {
  try {
    console.log('🔄 Property generation endpoint called');
    const { graph, nodeId, generatedCode, filePath }: GeneratePropertiesRequest = await req.json();
    
    console.log(`🔄 Property generation for node: ${nodeId}, filePath: ${filePath}, code length: ${generatedCode.length}`);

    if (!graph || !nodeId || !generatedCode || !filePath) {
      console.log('Missing required fields: graph, nodeId, generatedCode, filePath');
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: graph, nodeId, generatedCode, filePath'
      }, { status: 400 });
    }

    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) {
      console.log(`Node with ID ${nodeId} not found`);
      return NextResponse.json({
        success: false,
        error: `Node with ID ${nodeId} not found`
      }, { status: 404 });
    }

    // Generate properties based on the node type and generated code
    const properties = await generatePropertiesForNode(node, generatedCode, filePath);

    console.log('properties', properties);
    // Update the node with the generated properties
    const updatedNode = {
      ...node,
      properties: properties
    };

    // Update the graph with the new node
    const updatedGraph = {
      ...graph,
      nodes: graph.nodes.map(n => n.id === nodeId ? updatedNode : n)
    };
    console.log('updatedGraph', updatedGraph);
    // Save the updated graph
    await storeGraph(updatedGraph);

    console.log('🔄 Property generation completed successfully');
    return NextResponse.json({
      properties,
      success: true,
      updatedGraph
    });

  } catch (error) {
    console.error('❌ Error generating properties:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

async function generatePropertiesForNode(node: GraphNode, generatedCode: string, filePath: string): Promise<Property[]> {
  try {
    console.log('🔄 Loading property generation template');
    // Load the property generation template
    const template = await getTemplate('property-generation-template');
    console.log('🔄 Template loaded, length:', template.length);
    
    // Prepare variables for the template
    const variables = {
      nodeId: node.id,
      nodeTitle: node.title,
      nodePrompt: node.prompt || '',
      generatedCode: generatedCode
    };
    
    console.log('🔄 Template variables:', JSON.stringify(variables, null, 2));
    
    // Parse the template with variables
    const prompt = parseTemplate(template, variables);
    
    console.log('🔄 Property generation prompt:', prompt.substring(0, 500) + '...');
    
    // Call the LLM to analyze and generate properties
    const llmResponse = await callLLMForPropertyGeneration(prompt);
    
    // Extract properties from structured output and convert to proper Property format
    const rawProperties = llmResponse.properties || [];
    console.log('🔄 Raw properties from LLM:', JSON.stringify(rawProperties, null, 2));
    console.log('🔄 Raw properties count:', rawProperties.length);
    
    const properties = rawProperties.map((rawProp: any) => ({
      id: rawProp.id,
      title: rawProp.title,
      propertyType: {
        type: rawProp.propertyType.type,
        value: rawProp.propertyType.value,
        ...(rawProp.propertyType.options && { options: rawProp.propertyType.options }),
        ...(rawProp.propertyType.maxLength && { maxLength: rawProp.propertyType.maxLength }),
        ...(rawProp.propertyType.min && { min: rawProp.propertyType.min }),
        ...(rawProp.propertyType.max && { max: rawProp.propertyType.max }),
        ...(rawProp.propertyType.step && { step: rawProp.propertyType.step }),
      },

    }));
    
    console.log('🔄 Converted properties:', JSON.stringify(properties, null, 2));
    console.log('🔄 Converted properties count:', properties.length);
    
    console.log('🔄 Properties count:', properties.length);
    
    return properties;
  } catch (error) {
    console.error('❌ Error generating properties with LLM:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return [];
  }
}

async function callLLMForPropertyGeneration(prompt: string): Promise<any> {
  try {
    console.log('🔄 Calling LLM for property generation');
    // Call the LLM agent to generate properties with structured output
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/llm-agent/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parsedMessages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        config: {
          model: 'gpt-4o',
          maxSteps: 1,
          streaming: false,
          temperature: 1,
          providerOptions: { azure: { reasoning_effort: 'high' } },
          structuredOutput: true,
          schemaName: 'property-generation'
        },
        operationName: 'generate-properties'
      })
    });

    if (!response.ok) {
      console.error('LLM request failed:', response.statusText);
      throw new Error(`LLM request failed: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('🔄 LLM response:', JSON.stringify(result, null, 2));
    return result.result.object;
  } catch (error) {
    console.error('❌ Error calling LLM for property generation:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  }
}








