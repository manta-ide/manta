import { z } from 'zod';
export const PropertyTypeEnum = z.enum([
    'color',
    'text',
    'textarea',
    'number',
    'select',
    'boolean',
    'checkbox',
    'radio',
    'slider',
    'font',
    'object',
    'object-list'
]);
// Base schema without recursion for better control
const BasePropertySchema = z.object({
    id: z.string().describe('Unique identifier for the property (should follow pattern: property-name)'),
    title: z.string().describe('Human-readable title/name for the property'),
    type: PropertyTypeEnum.describe('The type of property'),
    options: z.array(z.string()).nullable().optional(),
    maxLength: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    itemTitle: z.string().optional(),
    addLabel: z.string().optional(),
});
// Define value based on type for better validation
const PropertyValueSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.record(z.any())), // For object-list: array of objects with field values
    z.record(z.any()), // For object: single object with field values
]);
export const PropertySchema = BasePropertySchema.extend({
    value: PropertyValueSchema.optional(),
    fields: z.array(z.lazy(() => PropertySchema)).optional(),
    itemFields: z.array(z.lazy(() => PropertySchema)).optional(),
}).refine((data) => {
    // For object-list type, ensure itemFields is defined
    if (data.type === 'object-list' && !data.itemFields) {
        return false;
    }
    return true;
}, {
    message: "object-list properties must have itemFields defined",
    path: ["itemFields"]
});
export const GraphNodeSchema = z.object({
    id: z.string(),
    title: z.string(),
    prompt: z.string(),
    state: z.enum(["built", "unbuilt", "building"]).default("unbuilt").optional(),
    properties: z.array(PropertySchema).optional(),
    position: z.object({ x: z.number(), y: z.number() }).optional(),
    width: z.number().optional(),
    height: z.number().optional(),
});
export const GraphEdgeSchema = z.object({ id: z.string(), source: z.string(), target: z.string() });
export const GraphSchema = z.object({ nodes: z.array(GraphNodeSchema), edges: z.array(GraphEdgeSchema).optional() });
// Export XML conversion utilities
export { graphToXml, xmlToGraph } from './xml-utils.js';
