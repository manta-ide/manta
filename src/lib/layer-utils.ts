// Client-safe utility functions for layer path operations
// These functions don't use Node.js modules and can be used in client components

// Get parent layer path for a given layer
export function getParentLayerPath(layerPath: string): string | null {
  const parts = layerPath.split('/');
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join('/');
}

// Get layer name (last part of path)
export function getLayerName(layerPath: string): string {
  const parts = layerPath.split('/');
  return parts[parts.length - 1];
}

// Check if a layer path is a direct child of another layer
export function isDirectChild(childPath: string, parentPath: string): boolean {
  const parentParts = parentPath.split('/');
  const childParts = childPath.split('/');

  if (childParts.length !== parentParts.length + 1) return false;

  for (let i = 0; i < parentParts.length; i++) {
    if (childParts[i] !== parentParts[i]) return false;
  }

  return true;
}

// Build a tree structure from a flat list of layer paths
export interface LayerNode {
  name: string;
  children: LayerNode[];
  level: number;
  isLast: boolean;
  parentPath: boolean[];
}

export function buildLayerTree(layerPaths: string[]): LayerNode[] {
  const layerMap = new Map<string, LayerNode>();
  const rootLayers: LayerNode[] = [];

  // First pass: create all layer nodes
  layerPaths.forEach((layerPath) => {
    const node: LayerNode = {
      name: layerPath,
      children: [],
      level: (layerPath.match(/\//g) || []).length,
      isLast: false, // Will be set later
      parentPath: []
    };
    layerMap.set(layerPath, node);
  });

  // Second pass: build the tree structure
  layerPaths.forEach((layerPath) => {
    const node = layerMap.get(layerPath)!;
    const parentPath = getParentLayerPath(layerPath);

    if (parentPath === null) {
      // This is a root layer
      rootLayers.push(node);
    } else {
      // This is a child layer
      const parentNode = layerMap.get(parentPath);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        // Parent doesn't exist (orphaned), add to root
        rootLayers.push(node);
      }
    }
  });

  // Third pass: sort children and set tree properties
  const sortLayers = (nodes: LayerNode[]): void => {
    nodes.sort((a, b) => getLayerName(a.name).localeCompare(getLayerName(b.name)));

    nodes.forEach((node, index) => {
      node.isLast = index === nodes.length - 1;
      if (node.level > 0) {
        // Set parentPath for tree lines
        const parentPath = getParentLayerPath(node.name);
        if (parentPath) {
          const parentNode = layerMap.get(parentPath);
          if (parentNode) {
            node.parentPath = parentNode.parentPath.concat(parentNode.isLast);
          }
        }
      }

      // Recursively sort children
      if (node.children.length > 0) {
        sortLayers(node.children);
      }
    });
  };

  sortLayers(rootLayers);

  return rootLayers;
}
