import { Property, CodeBinding } from '@/app/api/lib/schemas';

export interface CodeUpdate {
  file: string;
  start: number;
  end: number;
  newValue: string;
  propertyId?: string; // Optional property ID for dynamic positioning
}

export class PropertyCodeService {
  /**
   * Gets the target element ID from a property ID
   */
  private static getTargetElementId(propertyId: string): string | null {
    // Property IDs are in format: "node-element-{elementName}-{propertyName}"
    // We need to extract the element ID by removing the property suffix
    
    // Common property suffixes to remove
    const suffixes = [
      '-bg-color', '-background-color', '-color', '-text-color',
      '-font-family', '-font', '-font-style', '-font-size',
      '-roundness', '-border-radius', '-border-color',
      '-padding', '-margin', '-width', '-height',
      '-hover-bg-color', '-hover-color', '-hover-text-color'
    ];
    
    let elementId = propertyId;
    
    // Remove the property suffix
    for (const suffix of suffixes) {
      if (elementId.endsWith(suffix)) {
        elementId = elementId.slice(0, -suffix.length);
        break;
      }
    }
    
    // The elementId should already start with "node-element-"
    if (elementId.startsWith('node-element-')) {
      return elementId;
    }
    
    return null;
  }

  /**
   * Reads the current property value from the code
   */
  static async readPropertyValue(property: Property): Promise<any> {
    try {
      const projectPath = property.codeBinding.file.replace('base-template/', '');
      const response = await fetch(`/api/files?path=${encodeURIComponent(projectPath)}`);
      
      if (!response.ok) {
        console.warn(`Failed to read file for property ${property.id}:`, projectPath);
        return property.propertyType.value; // Fallback to default
      }
      
      const { content } = await response.json();
      
      // For color and select properties, extract the value from className
      if (property.propertyType.type === 'color' || property.propertyType.type === 'select') {
        const extractedValue = this.extractPropertyFromCode(content, property);
        return extractedValue || property.propertyType.value;
      }
      
      return property.propertyType.value;
    } catch (error) {
      console.error('Error reading property value:', error);
      return property.propertyType.value;
    }
  }

  /**
   * Extracts property value from className attribute
   */
  private static extractPropertyFromCode(content: string, property: Property): string | null {
    // Extract element ID from property ID (e.g., "cta-button-color" -> "cta-button" -> "node-element-cta-button")
    const elementId = this.getTargetElementId(property.id);
    if (!elementId) {
      return null;
    }
    
    // Look for the element with the specific ID
    const elementPattern = new RegExp(`<[^>]*id="${elementId}"[^>]*>`, 'i');
    const match = content.match(elementPattern);
    
    if (!match) {
      return null;
    }
    
    const elementContent = match[0];
    
    // Find the className attribute within the element
    const classNamePattern = /className="[^"]*"/;
    const classNameMatch = elementContent.match(classNamePattern);
    
    if (!classNameMatch) {
      return null;
    }
    
    const className = classNameMatch[0];
    
    // Extract values based on property type and name
    switch (property.propertyType.type) {
      case 'color':
        if (property.id.endsWith('-bg-color') || property.id.endsWith('-background-color')) {
          // Extract background color from bg-[#color] pattern
          const bgColorPattern = /bg-\[#([0-9a-fA-F]{6})\]/;
          const bgColorMatch = className.match(bgColorPattern);
          if (bgColorMatch) {
            return `#${bgColorMatch[1]}`;
          }
        } else if (property.id.endsWith('-hover-bg-color') || property.id.endsWith('-hover-color')) {
          // Extract hover background color from hover:bg-[#color]/90 pattern
          const hoverBgColorPattern = /hover:bg-\[#([0-9a-fA-F]{6})\]/;
          const hoverBgColorMatch = className.match(hoverBgColorPattern);
          if (hoverBgColorMatch) {
            return `#${hoverBgColorMatch[1]}`;
          }
        } else if (property.id.endsWith('-text-color')) {
          // Extract text color from text-[#color] pattern
          const textColorPattern = /text-\[#([0-9a-fA-F]{6})\]/;
          const textColorMatch = className.match(textColorPattern);
          if (textColorMatch) {
            return `#${textColorMatch[1]}`;
          }
        } else if (property.id.endsWith('-color')) {
          // Fallback for generic color properties - extract background color
          const bgColorPattern = /bg-\[#([0-9a-fA-F]{6})\]/;
          const bgColorMatch = className.match(bgColorPattern);
          if (bgColorMatch) {
            return `#${bgColorMatch[1]}`;
          }
        }
        break;
      case 'select':
        if (property.id.endsWith('-font-family') || property.id.endsWith('-font')) {
          // Extract font family
          const fontPattern = /font-(sans|serif|mono)/;
          const fontMatch = className.match(fontPattern);
          if (fontMatch) {
            return fontMatch[1];
          }
        } else if (property.id.endsWith('-font-style')) {
          // Extract font style
          if (className.includes('italic')) {
            return 'italic';
          }
          return 'normal';
        } else if (property.id.endsWith('-roundness') || property.id.endsWith('-border-radius')) {
          // Extract roundness
          const roundnessPattern = /rounded-(none|sm|md|lg|xl|full)/;
          const roundnessMatch = className.match(roundnessPattern);
          if (roundnessMatch) {
            return roundnessMatch[1];
          }
          // If no rounded class found, return 'none'
          return 'none';
        }
        break;
    }
    
    return null;
  }

  /**
   * Applies property changes to the code based on code bindings
   */
  static async applyPropertyChanges(
    properties: Property[],
    propertyValues: Record<string, any>
  ): Promise<CodeUpdate[]> {
    const updates: CodeUpdate[] = [];

    // Group properties by their target element (based on code binding)
    const propertiesByElement = new Map<string, Property[]>();
    
    for (const property of properties) {
      const elementKey = `${property.codeBinding.file}:${property.codeBinding.start}:${property.codeBinding.end}`;
      if (!propertiesByElement.has(elementKey)) {
        propertiesByElement.set(elementKey, []);
      }
      propertiesByElement.get(elementKey)!.push(property);
    }

    // Process each element's properties separately
    for (const [elementKey, elementProperties] of propertiesByElement) {
      const hasClassNameProperties = elementProperties.some(p => 
        p.propertyType.type === 'color' || p.propertyType.type === 'select'
      );

      if (hasClassNameProperties) {
        // Build the complete className for this specific element
        const classNameValue = await this.buildClassNameFromProperties(elementProperties, propertyValues);
        
        console.log(`Building complete className for element ${elementKey}:`, classNameValue);
        
        // Use the first property's code binding for this element
        const firstProperty = elementProperties[0];
        updates.push({
          file: firstProperty.codeBinding.file,
          start: firstProperty.codeBinding.start,
          end: firstProperty.codeBinding.end,
          newValue: classNameValue,
          propertyId: `className-update-${this.getTargetElementId(firstProperty.id)}`
        });
      } else {
        // Handle individual property updates (for non-className properties)
        for (const property of elementProperties) {
          const newValue = propertyValues[property.id];
          if (newValue !== undefined && newValue !== property.propertyType.value) {
            const codeValue = this.convertPropertyValueToCode(property.propertyType.type, newValue);
            console.log('Property change:', {
              propertyId: property.id,
              oldValue: property.propertyType.value,
              newValue,
              codeValue,
              file: property.codeBinding.file,
              start: property.codeBinding.start,
              end: property.codeBinding.end
            });
            updates.push({
              file: property.codeBinding.file,
              start: property.codeBinding.start,
              end: property.codeBinding.end,
              newValue: codeValue,
              propertyId: property.id
            });
          }
        }
      }
    }

    return updates;
  }

  /**
   * Converts property values to their code representation
   */
  private static convertPropertyValueToCode(propertyType: string, value: any): string {
    switch (propertyType) {
      case 'color':
        // Convert hex color to Tailwind class with background color
        return `className="mt-8 bg-[${value}] hover:bg-[${value}]/90"`;
      case 'text':
        return value;
      case 'number':
        return value.toString();
      case 'select':
        return value;
      default:
        return value;
    }
  }

  /**
   * Builds the complete className string from all property values
   */
  private static async buildClassNameFromProperties(properties: Property[], propertyValues: Record<string, any>): Promise<string> {
    // Get the current className from the code to preserve existing classes
    const firstProperty = properties[0];
    const elementId = this.getTargetElementId(firstProperty.id);
    
    // Read the current file content to get existing className
    let existingClasses: string[] = [];
    try {
      const projectPath = firstProperty.codeBinding.file.replace('base-template/', '');
      const response = await fetch(`/api/files?path=${encodeURIComponent(projectPath)}`);
      if (response.ok) {
        const { content } = await response.json();
        const elementPattern = new RegExp(`<[^>]*id="${elementId}"[^>]*>`, 'i');
        const match = content.match(elementPattern);
        if (match) {
          const classNamePattern = /className="([^"]*)"/;
          const classNameMatch = match[0].match(classNamePattern);
          if (classNameMatch) {
            existingClasses = classNameMatch[1].split(' ').filter((c: string) => c.trim());
          }
        }
      }
    } catch (error) {
      console.warn('Could not read existing classes, using defaults');
    }
    
    // Start with existing classes, removing any that will be overridden
    const classes = [...existingClasses];
    
    // Remove classes that will be overridden by properties
    const classesToRemove = new Set<string>();
    const patternsToRemove = new Set<RegExp>();
    for (const property of properties) {
      const value = propertyValues[property.id];
      if (value !== undefined) {
        switch (property.propertyType.type) {
          case 'color':
            if (property.id.endsWith('-bg-color') || property.id.endsWith('-background-color')) {
              patternsToRemove.add(/bg-\[#[0-9a-fA-F]{6}\]/);
              patternsToRemove.add(/bg-[a-z-]+/);
            } else if (property.id.endsWith('-hover-bg-color') || property.id.endsWith('-hover-color')) {
              patternsToRemove.add(/hover:bg-\[#[0-9a-fA-F]{6}\]/);
              patternsToRemove.add(/hover:bg-[a-z-]+/);
            } else if (property.id.endsWith('-text-color')) {
              patternsToRemove.add(/text-\[#[0-9a-fA-F]{6}\]/);
              patternsToRemove.add(/text-[a-z-]+/);
            }
            break;
          case 'select':
            if (property.id.endsWith('-font-family') || property.id.endsWith('-font')) {
              patternsToRemove.add(/font-(sans|serif|mono)/);
            } else if (property.id.endsWith('-font-size')) {
              patternsToRemove.add(/text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)/);
            } else if (property.id.endsWith('-roundness') || property.id.endsWith('-border-radius')) {
              patternsToRemove.add(/rounded-(none|sm|md|lg|xl|full)/);
            }
            break;
        }
      }
    }
    
    // Filter out classes that will be overridden
    const filteredClasses = classes.filter((cls: string) => {
      for (const pattern of patternsToRemove) {
        if (pattern.test(cls)) return false;
      }
      return true;
    });
    
    // Process each property and add corresponding classes
    for (const property of properties) {
      const value = propertyValues[property.id];
      if (value !== undefined) {
        switch (property.propertyType.type) {
          case 'color':
            if (property.id.endsWith('-bg-color') || property.id.endsWith('-background-color')) {
              filteredClasses.push(`bg-[${value}]`);
            } else if (property.id.endsWith('-hover-bg-color') || property.id.endsWith('-hover-color')) {
              filteredClasses.push(`hover:bg-[${value}]/90`);
            } else if (property.id.endsWith('-text-color')) {
              filteredClasses.push(`text-[${value}]`);
            } else if (property.id.endsWith('-color')) {
              // Fallback for generic color properties
              filteredClasses.push(`bg-[${value}]`, `hover:bg-[${value}]/90`);
            }
            break;
          case 'select':
            if (property.id.endsWith('-font-family') || property.id.endsWith('-font')) {
              filteredClasses.push(`font-${value}`);
            } else if (property.id.endsWith('-font-size')) {
              filteredClasses.push(`text-${value}`);
            } else if (property.id.endsWith('-font-style')) {
              if (value === 'italic') {
                filteredClasses.push('italic');
              }
            } else if (property.id.endsWith('-roundness') || property.id.endsWith('-border-radius')) {
              if (value !== 'none') {
                filteredClasses.push(`rounded-${value}`);
              }
            }
            break;
        }
      }
    }
    
    return `className="${filteredClasses.join(' ')}"`;
  }

  /**
   * Updates the actual file content with the code changes
   */
  static async updateFileContent(filePath: string, updates: CodeUpdate[]): Promise<string> {
    try {
      // Since project root is ./base-template, we need to remove the base-template/ prefix
      const projectPath = filePath.replace('base-template/', '');
      
      // Read the current file content
      const response = await fetch(`/api/files?path=${encodeURIComponent(projectPath)}`);
      if (!response.ok) {
        throw new Error(`Failed to read file: ${projectPath}`);
      }
      
      const { content: currentContent } = await response.json();
      let content = currentContent;
      
      // Apply updates in reverse order to maintain correct positions
      const sortedUpdates = [...updates].sort((a, b) => b.start - a.start);
      
      for (const update of sortedUpdates) {
        // For className updates, find the current position dynamically
        if (update.newValue.includes('className=')) {
          const dynamicUpdate = this.findClassNamePosition(content, update);
          if (dynamicUpdate) {
            const before = content.substring(0, dynamicUpdate.start);
            const after = content.substring(dynamicUpdate.end);
            content = before + dynamicUpdate.newValue + after;
          }
        } else {
          // Use original fixed positions for other updates
          const before = content.substring(0, update.start);
          const after = content.substring(update.end);
          content = before + update.newValue + after;
        }
      }
      
      // Write the updated content back
      const writeResponse = await fetch('/api/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: projectPath,
          content: content
        })
      });
      
      if (!writeResponse.ok) {
        throw new Error(`Failed to write file: ${projectPath}`);
      }
      
      return content;
    } catch (error) {
      console.error('Error updating file content:', error);
      throw error;
    }
  }

  /**
   * Finds the current position of className attribute for the target element
   */
  private static findClassNamePosition(content: string, update: CodeUpdate): { start: number; end: number; newValue: string } | null {
    // For className updates, extract the element ID from the propertyId
    let targetElementId: string | null = null;
    
    if (update.propertyId && update.propertyId.startsWith('className-update-')) {
      // Extract element ID from className update propertyId
      targetElementId = update.propertyId.replace('className-update-', '');
    } else {
      // For regular property updates, extract from property ID
      targetElementId = this.getTargetElementId(update.propertyId || '');
    }
    
    if (!targetElementId) {
      console.error('Unknown property ID for dynamic positioning:', update.propertyId);
      return null;
    }
    
    // Look for the element with the specific ID
    const elementPattern = new RegExp(`<[^>]*id="${targetElementId}"[^>]*>`, 'i');
    const match = content.match(elementPattern);
    
    if (!match) {
      console.error(`Could not find element with id="${targetElementId}"`);
      return null;
    }
    
    const elementStart = match.index!;
    const elementContent = match[0];
    
    // Find the className attribute within the element
    const classNamePattern = /className="[^"]*"/;
    const classNameMatch = elementContent.match(classNamePattern);
    
    if (classNameMatch) {
      // Element has className attribute - update it
      const classNameStart = elementStart + classNameMatch.index!;
      const classNameEnd = classNameStart + classNameMatch[0].length;
      
      console.log('Found className position:', {
        elementStart,
        classNameStart,
        classNameEnd,
        currentValue: classNameMatch[0],
        newValue: update.newValue
      });
      
      return {
        start: classNameStart,
        end: classNameEnd,
        newValue: update.newValue
      };
    } else {
      // Element doesn't have className attribute - insert it before the closing >
      const tagEndIndex = elementContent.lastIndexOf('>');
      if (tagEndIndex > 0) {
        const classNameStart = elementStart + tagEndIndex;
        const classNameEnd = classNameStart;
        
        console.log('No className found, inserting at position:', {
          elementStart,
          classNameStart,
          classNameEnd,
          newValue: update.newValue
        });
        
        return {
          start: classNameStart,
          end: classNameEnd,
          newValue: ` ${update.newValue}` // Add space before className
        };
      } else {
        console.error('Could not determine where to insert className in element');
        return null;
      }
    }
  }
}
