import { NextRequest, NextResponse } from 'next/server';
import { Graph, GraphNode, Property, CodeBinding, GeneratePropertiesRequest, GeneratePropertiesResponse } from '../../lib/schemas';
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
      codeBinding: rawProp.codeBinding
    }));
    
    console.log('🔄 Converted properties:', JSON.stringify(properties, null, 2));
    console.log('🔄 Converted properties count:', properties.length);
    
    // Validate and adjust code bindings
    const validatedProperties = await validateAndAdjustCodeBindings(properties, generatedCode, filePath);
    
    console.log('🔄 Validated properties count:', validatedProperties.length);
    
    return validatedProperties;
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
        }
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
      
      // Search for the element in the entire src/ directory
      const foundElement = await findElementInSrcDirectory(elementId);
      
      if (foundElement) {
        const { elementContent, elementStart, filePath: foundFilePath } = foundElement;
        
        console.log(`Found element in ${foundFilePath}: ${elementContent}`);
        
        // Find className attribute position
        const classNamePattern = /className=["'][^"']*["']/;
        const classNameMatch = elementContent.match(classNamePattern);
        
        if (classNameMatch) {
          // Element has className attribute
          const classNameStart = elementStart + classNameMatch.index!;
          const classNameEnd = classNameStart + classNameMatch[0].length;
          
          console.log(`Found className at positions ${classNameStart}-${classNameEnd}: ${classNameMatch[0]}`);
          
          // Update the code binding with correct positions
          const validatedProperty = {
            ...property,
            codeBinding: {
              file: foundFilePath,
              start: classNameStart,
              end: classNameEnd
            }
          };
          
          validatedProperties.push(validatedProperty);
        } else {
          // Element doesn't have className attribute - we'll add it dynamically
          // Find the position right after the opening tag (before the closing >)
          const tagEndIndex = elementContent.lastIndexOf('>');
          if (tagEndIndex > 0) {
            // Insert className right before the closing >
            const classNameStart = elementStart + tagEndIndex;
            const classNameEnd = classNameStart;
            
            console.log(`No className found, will insert at position ${classNameStart}`);
            
            // Update the code binding with position where className should be inserted
            const validatedProperty = {
              ...property,
              codeBinding: {
                file: foundFilePath,
                start: classNameStart,
                end: classNameEnd
              }
            };
            
            validatedProperties.push(validatedProperty);
          } else {
            console.log(`Could not determine where to insert className for element: ${elementContent}`);
          }
        }
      } else {
        console.log(`Element with ID "${elementId}" not found in any src/ files`);
        
        // Even if element not found, still add the property with a fallback binding
        // This allows the property to be used for dynamic styling
        const validatedProperty = {
          ...property,
          codeBinding: {
            file: 'base-template/src/app/page.tsx', // Fallback to main page
            start: 0,
            end: 0
          }
        };
        
        validatedProperties.push(validatedProperty);
        console.log(`Added property "${property.id}" with fallback binding`);
      }
    } catch (error) {
      console.error(`❌ Error validating property ${property.id}:`, error);
      console.error(`❌ Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    }
  }
  
  console.log(`Validated ${validatedProperties.length} properties out of ${properties.length} total`);
  return validatedProperties;
}

async function findElementInSrcDirectory(elementId: string): Promise<{ elementContent: string; elementStart: number; filePath: string } | null> {
  console.log(`🔍 Searching for element with ID: "${elementId}"`);
  
  try {
    const allFilesResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/files`);
    if (!allFilesResponse.ok) {
      console.warn('⚠️ Failed to get files list');
      return null;
    }
    
    const allFilesData = await allFilesResponse.json();
    
    if (!allFilesData.files || !Array.isArray(allFilesData.files)) {
      console.warn('⚠️ No files data available');
      return null;
    }
    
    // Filter for TypeScript/TSX files in src directory
    const tsxFiles = allFilesData.files.filter((file: string) => 
      file.startsWith('src/') && (file.endsWith('.tsx') || file.endsWith('.ts'))
    );
    
    console.log(`🔍 Searching in ${tsxFiles.length} TSX/TS files:`, tsxFiles);
    
    for (const file of tsxFiles) {
      try {
        const fileResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/files?path=${encodeURIComponent(file)}`);
        if (!fileResponse.ok) {
          console.warn(`⚠️ Failed to read file: ${file}`);
          continue;
        }
        
        const fileData = await fileResponse.json();
        if (!fileData.content) {
          console.warn(`⚠️ No content in file: ${file}`);
          continue;
        }
        
        // First try to find by exact ID
        const exactIdPattern = new RegExp(`<[^>]*id=["']${elementId}["'][^>]*>`, 'i');
        let match = fileData.content.match(exactIdPattern);
        
        if (match) {
          console.log(`✅ Found element with exact ID "${elementId}" in ${file}`);
          return {
            elementContent: match[0],
            elementStart: match.index!,
            filePath: file
          };
        }
        
        // If not found by exact ID, try to find by partial ID (for cases where the ID might be slightly different)
        const partialIdPattern = new RegExp(`<[^>]*id=["'][^"']*${elementId.replace(/^node-element-/, '')}[^"']*["'][^>]*>`, 'i');
        match = fileData.content.match(partialIdPattern);
        
        if (match) {
          console.log(`✅ Found element with partial ID match "${elementId}" in ${file}`);
          return {
            elementContent: match[0],
            elementStart: match.index!,
            filePath: file
          };
        }
        
        // If still not found, try to find by element type (button, input, etc.)
        const elementType = elementId.replace(/^node-element-/, '').replace(/-.*$/, '');
        if (elementType && ['button', 'input', 'form', 'section', 'div'].includes(elementType)) {
          const elementTypePattern = new RegExp(`<${elementType}[^>]*>`, 'i');
          match = fileData.content.match(elementTypePattern);
          
          if (match) {
            console.log(`✅ Found ${elementType} element in ${file} (fallback for "${elementId}")`);
            return {
              elementContent: match[0],
              elementStart: match.index!,
              filePath: file
            };
          }
        }
        
      } catch (error) {
        console.warn(`⚠️ Error reading file ${file}:`, error);
      }
    }
    
    console.log(`❌ Element with ID "${elementId}" not found in any src/ files`);
    return null;
    
  } catch (error) {
    console.warn('⚠️ Error getting all files:', error);
    return null;
  }
}


