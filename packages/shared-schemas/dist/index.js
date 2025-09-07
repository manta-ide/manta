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
export const PropertySchema = z.lazy(() => z.object({
    id: z.string().describe('Unique identifier for the property (should follow pattern: property-name)'),
    title: z.string().describe('Human-readable title/name for the property'),
    type: PropertyTypeEnum.describe('The type of property'),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.any()), z.record(z.any())]).optional(),
    options: z.array(z.string()).nullable().optional(),
    maxLength: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    fields: z.array(z.lazy(() => PropertySchema)).optional(),
    itemFields: z.array(z.lazy(() => PropertySchema)).optional(),
    itemTitle: z.string().optional(),
    addLabel: z.string().optional(),
}));
export const GraphNodeSchema = z.object({
    id: z.string(),
    title: z.string(),
    prompt: z.string(),
    children: z.array(z.object({ id: z.string(), title: z.string() })),
    parentId: z.string().optional(),
    state: z.enum(["built", "unbuilt", "building"]).default("unbuilt").optional(),
    properties: z.array(PropertySchema).optional(),
    position: z.object({ x: z.number(), y: z.number() }).optional(),
    width: z.number().optional(),
    height: z.number().optional(),
});
export const GraphEdgeSchema = z.object({ id: z.string(), source: z.string(), target: z.string() });
export const GraphSchema = z.object({ nodes: z.array(GraphNodeSchema), edges: z.array(GraphEdgeSchema).optional() });
