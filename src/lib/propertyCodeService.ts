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
    // Map property IDs to their target element IDs
    const elementIdMap: Record<string, string> = {
      'cta-button-color': 'node-element-cta-button',
      'cta-button-text-color': 'node-element-cta-button',
      'cta-button-font': 'node-element-cta-button',
      'cta-button-font-style': 'node-element-cta-button',
      'cta-button-roundness': 'node-element-cta-button'
    };
    
    const targetElementId = elementIdMap[property.id];
    if (!targetElementId) {
      return null;
    }
    
    // Look for the element with the specific ID
    const elementPattern = new RegExp(`<[^>]*id="${targetElementId}"[^>]*>`, 'i');
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
    
    // Extract values based on property type
    switch (property.propertyType.type) {
      case 'color':
        if (property.id === 'cta-button-color') {
          // Extract background color from bg-[#color] pattern
          const bgColorPattern = /bg-\[#([0-9a-fA-F]{6})\]/;
          const bgColorMatch = className.match(bgColorPattern);
          if (bgColorMatch) {
            return `#${bgColorMatch[1]}`;
          }
        } else if (property.id === 'cta-button-text-color') {
          // Extract text color from text-[#color] pattern
          const textColorPattern = /text-\[#([0-9a-fA-F]{6})\]/;
          const textColorMatch = className.match(textColorPattern);
          if (textColorMatch) {
            return `#${textColorMatch[1]}`;
          }
        }
        break;
      case 'select':
        if (property.id === 'cta-button-font') {
          // Extract font family
          const fontPattern = /font-(sans|serif|mono)/;
          const fontMatch = className.match(fontPattern);
          if (fontMatch) {
            return fontMatch[1];
          }
        } else if (property.id === 'cta-button-font-style') {
          // Extract font style
          if (className.includes('italic')) {
            return 'italic';
          }
          return 'normal';
        } else if (property.id === 'cta-button-roundness') {
          // Extract roundness
          const roundnessPattern = /rounded-(none|sm|md|lg|xl|full)/;
          const roundnessMatch = className.match(roundnessPattern);
          if (roundnessMatch) {
            return roundnessMatch[1];
          }
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

    // For className-based properties, we need to build the complete className
    // Check if any of the properties affect className
    const hasClassNameProperties = properties.some(p => 
      p.propertyType.type === 'color' || p.propertyType.type === 'select'
    );

    if (hasClassNameProperties) {
      // Build the complete className from all properties
      const classNameValue = this.buildClassNameFromProperties(properties, propertyValues);
      
      console.log('Building complete className:', classNameValue);
      
      updates.push({
        file: properties[0].codeBinding.file, // All properties share the same file
        start: properties[0].codeBinding.start,
        end: properties[0].codeBinding.end,
        newValue: classNameValue,
        propertyId: 'cta-button-className' // Special ID for className updates
      });
    } else {
      // Handle individual property updates (for non-className properties)
      for (const property of properties) {
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
  private static buildClassNameFromProperties(properties: Property[], propertyValues: Record<string, any>): string {
    const classes: string[] = ['mt-8'];
    
    // Process each property and add corresponding classes
    for (const property of properties) {
      const value = propertyValues[property.id];
      if (value !== undefined) {
        switch (property.propertyType.type) {
          case 'color':
            if (property.id === 'cta-button-color') {
              classes.push(`bg-[${value}]`, `hover:bg-[${value}]/90`);
            } else if (property.id === 'cta-button-text-color') {
              classes.push(`text-[${value}]`);
            }
            break;
          case 'select':
            if (property.id === 'cta-button-font') {
              classes.push(`font-${value}`);
            } else if (property.id === 'cta-button-font-style') {
              if (value === 'italic') {
                classes.push('italic');
              }
            } else if (property.id === 'cta-button-roundness') {
              if (value !== 'none') {
                classes.push(`rounded-${value}`);
              }
            }
            break;
        }
      }
    }
    
    return `className="${classes.join(' ')}"`;
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
    // Map property IDs to their target element IDs
    const elementIdMap: Record<string, string> = {
      'cta-button-color': 'node-element-cta-button',
      'cta-button-text-color': 'node-element-cta-button',
      'cta-button-font': 'node-element-cta-button',
      'cta-button-font-style': 'node-element-cta-button',
      'cta-button-roundness': 'node-element-cta-button',
      'cta-button-className': 'node-element-cta-button' // Special ID for className updates
    };
    
    const targetElementId = elementIdMap[update.propertyId || ''];
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
    
    if (!classNameMatch) {
      console.error('Could not find className attribute in element');
      return null;
    }
    
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
  }
}
