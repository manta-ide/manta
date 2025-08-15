import { NextRequest, NextResponse } from 'next/server';
import { Graph, GraphNode, Property, CodeBinding } from '../../lib/schemas';
import { getTemplate, parseTemplate } from '../../lib/promptTemplateUtils';
import { storeGraph } from '../../lib/graphStorage';

interface GeneratePropertiesRequest {
  graph: Graph;
  nodeId: string;
  generatedCode: string;
  filePath: string;
}

interface GeneratePropertiesResponse {
  properties: Property[];
  success: boolean;
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { graph, nodeId, generatedCode, filePath }: GeneratePropertiesRequest = await req.json();

    if (!graph || !nodeId || !generatedCode || !filePath) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: graph, nodeId, generatedCode, filePath'
      }, { status: 400 });
    }

    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) {
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

    return NextResponse.json({
      properties,
      success: true,
      updatedGraph
    });

  } catch (error) {
    console.error('Error generating properties:', error);
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 });
  }
}

async function generatePropertiesForNode(node: GraphNode, generatedCode: string, filePath: string): Promise<Property[]> {
  try {
    // Load the property generation template
    const template = await getTemplate('property-generation-template');
    
    // Prepare variables for the template
    const variables = {
      nodeId: node.id,
      nodeTitle: node.title,
      nodePrompt: node.prompt || '',
      generatedCode: generatedCode
    };
    
    // Parse the template with variables
    const prompt = parseTemplate(template, variables);
    
    // Call the LLM to analyze and generate properties
    const llmResponse = await callLLMForPropertyGeneration(prompt);
    
    // Extract properties from structured output and convert to proper Property format
    const rawProperties = llmResponse.properties || [];
    console.log('Raw properties from LLM:', JSON.stringify(rawProperties, null, 2));
    
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
      codeBinding: rawProp.codeBinding
    }));
    
    console.log('Converted properties:', JSON.stringify(properties, null, 2));
    
    // Validate and adjust code bindings
    const validatedProperties = await validateAndAdjustCodeBindings(properties, generatedCode, filePath);
    
    return validatedProperties;
  } catch (error) {
    console.error('Error generating properties with LLM:', error);
    return [];
  }
}

async function callLLMForPropertyGeneration(prompt: string): Promise<any> {
  try {
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
        }
      })
    });

    if (!response.ok) {
      console.error('LLM request failed:', response.statusText);
      throw new Error(`LLM request failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.result.object;
  } catch (error) {
    console.error('Error calling LLM for property generation:', error);
    throw error;
  }
}



async function validateAndAdjustCodeBindings(properties: Property[], generatedCode: string, filePath: string): Promise<Property[]> {
  const validatedProperties: Property[] = [];
  
  for (const property of properties) {
    try {
      // Extract the base element ID from property ID
      // Handle various property suffixes more comprehensively
      let elementId = property.id;
      
      // Remove common property suffixes
      const suffixes = [
        '-bg-color', '-background-color', '-color', '-text-color',
        '-font-family', '-font', '-font-style', '-font-size',
        '-roundness', '-border-radius', '-border-color',
        '-padding', '-margin', '-width', '-height',
        '-hover-bg-color', '-hover-color', '-hover-text-color'
      ];
      
      for (const suffix of suffixes) {
        if (elementId.endsWith(suffix)) {
          elementId = elementId.slice(0, -suffix.length);
          break;
        }
      }
      
      console.log(`Looking for element with ID: ${elementId} for property: ${property.id}`);
      
      // Find the element in the code
      const elementPattern = new RegExp(`<[^>]*id="${elementId}"[^>]*>`, 'i');
      const match = generatedCode.match(elementPattern);
      
      if (match) {
        const elementContent = match[0];
        const elementStart = match.index!;
        
        console.log(`Found element: ${elementContent}`);
        
        // Find className attribute position
        const classNamePattern = /className="[^"]*"/;
        const classNameMatch = elementContent.match(classNamePattern);
        
        if (classNameMatch) {
          const classNameStart = elementStart + classNameMatch.index!;
          const classNameEnd = classNameStart + classNameMatch[0].length;
          
          console.log(`Found className at positions ${classNameStart}-${classNameEnd}: ${classNameMatch[0]}`);
          
          // Update the code binding with correct positions
          const validatedProperty = {
            ...property,
            codeBinding: {
              file: filePath,
              start: classNameStart,
              end: classNameEnd
            }
          };
          
          validatedProperties.push(validatedProperty);
        } else {
          console.log(`No className found in element: ${elementContent}`);
        }
      } else {
        console.log(`Element with ID "${elementId}" not found in code`);
      }
    } catch (error) {
      console.error(`Error validating property ${property.id}:`, error);
    }
  }
  
  console.log(`Validated ${validatedProperties.length} properties out of ${properties.length} total`);
  return validatedProperties;
}


