import { z } from 'zod';
export declare const PropertyTypeEnum: z.ZodEnum<["color", "text", "textarea", "number", "select", "boolean", "checkbox", "radio", "slider", "font", "object", "object-list"]>;
export type PropertyType = z.infer<typeof PropertyTypeEnum>;
export declare const PropertySchema: z.ZodType<any>;
export type Property = z.infer<typeof PropertySchema>;
export declare const GraphNodeSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    prompt: z.ZodString;
    state: z.ZodOptional<z.ZodDefault<z.ZodEnum<["built", "unbuilt", "building"]>>>;
    properties: z.ZodOptional<z.ZodArray<z.ZodType<any, z.ZodTypeDef, any>, "many">>;
    position: z.ZodOptional<z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        z: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        x: number;
        y: number;
        z?: number | undefined;
    }, {
        x: number;
        y: number;
        z?: number | undefined;
    }>>;
    width: z.ZodOptional<z.ZodNumber>;
    height: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    id: string;
    title: string;
    prompt: string;
    state?: "built" | "unbuilt" | "building" | undefined;
    properties?: any[] | undefined;
    position?: {
        x: number;
        y: number;
        z?: number | undefined;
    } | undefined;
    width?: number | undefined;
    height?: number | undefined;
}, {
    id: string;
    title: string;
    prompt: string;
    state?: "built" | "unbuilt" | "building" | undefined;
    properties?: any[] | undefined;
    position?: {
        x: number;
        y: number;
        z?: number | undefined;
    } | undefined;
    width?: number | undefined;
    height?: number | undefined;
}>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export declare const GraphEdgeSchema: z.ZodObject<{
    id: z.ZodString;
    source: z.ZodString;
    target: z.ZodString;
    role: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    source: string;
    target: string;
    role?: string | undefined;
}, {
    id: string;
    source: string;
    target: string;
    role?: string | undefined;
}>;
export declare const GraphSchema: z.ZodObject<{
    nodes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        prompt: z.ZodString;
        state: z.ZodOptional<z.ZodDefault<z.ZodEnum<["built", "unbuilt", "building"]>>>;
        properties: z.ZodOptional<z.ZodArray<z.ZodType<any, z.ZodTypeDef, any>, "many">>;
        position: z.ZodOptional<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            z: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
            z?: number | undefined;
        }, {
            x: number;
            y: number;
            z?: number | undefined;
        }>>;
        width: z.ZodOptional<z.ZodNumber>;
        height: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        title: string;
        prompt: string;
        state?: "built" | "unbuilt" | "building" | undefined;
        properties?: any[] | undefined;
        position?: {
            x: number;
            y: number;
            z?: number | undefined;
        } | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }, {
        id: string;
        title: string;
        prompt: string;
        state?: "built" | "unbuilt" | "building" | undefined;
        properties?: any[] | undefined;
        position?: {
            x: number;
            y: number;
            z?: number | undefined;
        } | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }>, "many">;
    edges: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        source: z.ZodString;
        target: z.ZodString;
        role: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        source: string;
        target: string;
        role?: string | undefined;
    }, {
        id: string;
        source: string;
        target: string;
        role?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    nodes: {
        id: string;
        title: string;
        prompt: string;
        state?: "built" | "unbuilt" | "building" | undefined;
        properties?: any[] | undefined;
        position?: {
            x: number;
            y: number;
            z?: number | undefined;
        } | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }[];
    edges?: {
        id: string;
        source: string;
        target: string;
        role?: string | undefined;
    }[] | undefined;
}, {
    nodes: {
        id: string;
        title: string;
        prompt: string;
        state?: "built" | "unbuilt" | "building" | undefined;
        properties?: any[] | undefined;
        position?: {
            x: number;
            y: number;
            z?: number | undefined;
        } | undefined;
        width?: number | undefined;
        height?: number | undefined;
    }[];
    edges?: {
        id: string;
        source: string;
        target: string;
        role?: string | undefined;
    }[] | undefined;
}>;
export type Graph = z.infer<typeof GraphSchema>;
export { graphToXml, xmlToGraph } from './xml-utils.js';
