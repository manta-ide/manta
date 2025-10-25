'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectStore } from '@/lib/store';
import { useChatService } from '@/lib/chatService';
import PropertyEditor from './property-editors';
import ResizeHandle from './ResizeHandle';
import { Property, NodeType } from '@/app/api/lib/schemas';
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SelectNative } from "@/components/ui/select-native";

type EdgeShape = 'relates' | 'refines';

export default function SelectedNodeSidebar() {
	
	const {
		selectedNodeId,
		selectedNode,
		setSelectedNode,
		selectedNodeIds,
		setSelectedNodeIds,
		selectedEdgeId,
		selectedEdge,
		selectedEdgeIds,
		setSelectedEdge,
		triggerRefresh,
		refreshGraph,
		updateNode,
		updateEdge,
		updateProperty,
		updatePropertyLocal,
		connectToGraphEvents,
		graph,
		leftSidebarWidth,
		setLeftSidebarWidth
	} = useProjectStore();
	const { actions } = useChatService();
	const [promptDraft, setPromptDraft] = useState<string>('');
	const [titleDraft, setTitleDraft] = useState<string>('');
  const [shapeDraft, setShapeDraft] = useState<'rectangle' | 'circle' | 'diamond' | 'hexagon' | 'arrow-rectangle' | 'cylinder' | 'parallelogram' | 'round-rectangle'>('round-rectangle');
  const [typeDraft, setTypeDraft] = useState<NodeType>('component');
  const [edgeShapeDraft, setEdgeShapeDraft] = useState<EdgeShape>('relates');
  const [edgeShapeError, setEdgeShapeError] = useState<string | null>(null);
	// Building state is tracked locally since node.state was removed
	const [isGeneratingProperties, setIsGeneratingProperties] = useState(false);
	const metadataFiles = Array.from(new Set(
		(selectedNode?.metadata?.files ?? [])
			.filter((file): file is string => typeof file === 'string')
			.map((file) => file.trim())
			.filter((file) => file.length > 0)
	));
	const metadataBugs = Array.from(new Set(
		(selectedNode?.metadata?.bugs ?? [])
			.filter((bug): bug is string => typeof bug === 'string')
			.map((bug) => bug.trim())
			.filter((bug) => bug.length > 0)
	));

	// Helper function to get all connections (both incoming and outgoing)
	const getNodeConnections = (nodeId: string) => {
		if (!graph?.edges) return [];

		const connections: Array<{ node: any; direction: 'outgoing' | 'incoming' }> = [];

		// Get outgoing connections (this node -> other nodes)
		graph.edges
			.filter(edge => edge.source === nodeId)
			.forEach(edge => {
				const targetNode = graph.nodes.find(n => n.id === edge.target);
				if (targetNode) {
					connections.push({ node: targetNode, direction: 'outgoing' });
				}
			});

		// Get incoming connections (other nodes -> this node)
		graph.edges
			.filter(edge => edge.target === nodeId)
			.forEach(edge => {
				const sourceNode = graph.nodes.find(n => n.id === edge.source);
				if (sourceNode) {
					connections.push({ node: sourceNode, direction: 'incoming' });
				}
			});

		return connections;
	};
	const [propertyValues, setPropertyValues] = useState<Record<string, any>>({});
	const [rebuildError, setRebuildError] = useState<string | null>(null);
	const [rebuildSuccess, setRebuildSuccess] = useState(false);
	const titleDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const descriptionDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const TITLE_DEBOUNCE_DELAY = 300; // Wait 300ms after last change before saving title
	const DESCRIPTION_DEBOUNCE_DELAY = 500; // Wait 500ms after last change before saving description

    const handlePropertyPreview = useCallback((propertyId: string, value: any) => {
        // Lightweight preview: update local state and in-memory graph without saving
        setPropertyValues(prev => ({ ...prev, [propertyId]: value }));
        if (selectedNodeId) {
            updatePropertyLocal(selectedNodeId, propertyId, value);
        }
    }, [selectedNodeId, updatePropertyLocal]);

    // Removed iframe connection checks

	useEffect(() => {
		// Only reset drafts when switching to a different node, not when the values change
		setPromptDraft(selectedNode?.description ?? '');
		setTitleDraft(selectedNode?.title ?? '');
		setShapeDraft(((selectedNode as any)?.shape as any) || 'rectangle');
		setTypeDraft(((selectedNode as any)?.type as NodeType) || 'component');
		setRebuildError(null);
		setRebuildSuccess(false);

		// Initialize property values from current properties
		if (selectedNode?.properties && selectedNode.properties.length > 0) {
			const initialValues: Record<string, any> = {};
			for (const prop of selectedNode.properties) {
				initialValues[prop.id] = prop.value;
			}
			setPropertyValues(initialValues);
		}
	}, [selectedNodeId, selectedNode?.title, selectedNode?.description, selectedNode?.properties, selectedNode?.shape]);

  useEffect(() => {
    if (!Array.isArray(selectedEdgeIds) || selectedEdgeIds.length === 0) {
      setEdgeShapeDraft('relates');
      setEdgeShapeError(null);
      return;
    }

    const edgeId = selectedEdgeId ?? selectedEdgeIds[0];
    const graphEdge = graph?.edges?.find((edge) => edge.id === edgeId || `${edge.source}-${edge.target}` === edgeId);
    const shapeValue = ((graphEdge as any)?.shape === 'refines') ? 'refines' : 'relates';
    setEdgeShapeDraft(shapeValue);
    setEdgeShapeError(null);
  }, [selectedEdgeId, selectedEdgeIds, graph?.edges]);

  const handleShapeChange = useCallback((newShape: 'rectangle' | 'circle' | 'diamond' | 'hexagon' | 'arrow-rectangle' | 'cylinder' | 'parallelogram' | 'round-rectangle') => {
    setShapeDraft(newShape);
    if (selectedNode) {
      const updatedNode = { ...selectedNode, shape: newShape } as any;
      setSelectedNode(selectedNodeId, updatedNode);
    }
    if (selectedNodeId) {
      updateNode(selectedNodeId, { shape: newShape }).catch((error) => {
        console.error('Failed to save shape:', error);
        setRebuildError('Failed to save shape');
        setTimeout(() => setRebuildError(null), 3000);
      });
    }
  }, [selectedNode, selectedNodeId, setSelectedNode, updateNode]);

  const handleTypeChange = useCallback((newType: NodeType) => {
    setTypeDraft(newType);
    if (selectedNode) {
      const updatedNode = { ...selectedNode, type: newType } as any;
      setSelectedNode(selectedNodeId, updatedNode);
    }
    if (selectedNodeId) {
      updateNode(selectedNodeId, { type: newType }).catch((error) => {
        console.error('Failed to save type:', error);
        setRebuildError('Failed to save type');
        setTimeout(() => setRebuildError(null), 3000);
      });
    }
  }, [selectedNode, selectedNodeId, setSelectedNode, updateNode]);


  const handleEdgeShapeChange = useCallback((newShape: EdgeShape) => {
    setEdgeShapeDraft(newShape);
    setEdgeShapeError(null);

    const edgeId = selectedEdgeId ?? selectedEdgeIds[0];
    if (!edgeId) return;

    if (selectedEdge) {
      setSelectedEdge(edgeId, { ...selectedEdge, shape: newShape } as any);
    }

    updateEdge(edgeId, { shape: newShape })
      .catch((error) => {
        console.error('Failed to save edge shape:', error);
        setEdgeShapeError('Failed to save edge shape');
        setTimeout(() => setEdgeShapeError(null), 3000);
      });
  }, [selectedEdgeId, selectedEdgeIds, selectedEdge, setSelectedEdge, updateEdge]);

	// Cleanup timeouts on unmount and when node changes
	useEffect(() => {
		return () => {
			if (titleDebounceTimeoutRef.current) {
				clearTimeout(titleDebounceTimeoutRef.current);
			}
			if (descriptionDebounceTimeoutRef.current) {
				clearTimeout(descriptionDebounceTimeoutRef.current);
			}
		};
	}, []);

	// Clear pending timeouts when node changes
	useEffect(() => {
		if (titleDebounceTimeoutRef.current) {
			clearTimeout(titleDebounceTimeoutRef.current);
			titleDebounceTimeoutRef.current = null;
		}
		if (descriptionDebounceTimeoutRef.current) {
			clearTimeout(descriptionDebounceTimeoutRef.current);
			descriptionDebounceTimeoutRef.current = null;
		}
	}, [selectedNodeId]);

	// Sidebar should always render; handle empty and multi-select states below

	const handlePropertyChange = useCallback((propertyId: string, value: any) => {
		// Update local state immediately for responsive UI
		setPropertyValues(prev => ({ ...prev, [propertyId]: value }));

		// Update in-memory graph for immediate UI feedback
		if (selectedNodeId) {
			updatePropertyLocal(selectedNodeId, propertyId, value);
		}
	}, [selectedNodeId, updatePropertyLocal]);

	const handleBackendUpdate = useCallback(async (propertyId: string, value: any) => {
		if (selectedNodeId) {
			await updateProperty(selectedNodeId, propertyId, value);
		}
	}, [selectedNodeId, updateProperty]);

	// Debounced update functions for title and description
	const debouncedUpdateTitle = useCallback((newTitle: string) => {
		// Clear any existing timeout
		if (titleDebounceTimeoutRef.current) {
			clearTimeout(titleDebounceTimeoutRef.current);
		}

		// Set new timeout to save after delay
		titleDebounceTimeoutRef.current = setTimeout(() => {
			if (selectedNode && newTitle !== selectedNode.title) {
				console.log('💾 Debounced update: saving title for node:', selectedNodeId);
				const updatedNode = { ...selectedNode, title: newTitle };
				setSelectedNode(selectedNodeId, updatedNode);

				if (selectedNodeId) {
					updateNode(selectedNodeId!, { title: newTitle }).catch((error) => {
						console.error('Failed to save title:', error);
						setRebuildError('Failed to save title');
						setTimeout(() => setRebuildError(null), 3000);
					});
				}
			}
		}, TITLE_DEBOUNCE_DELAY);
	}, [selectedNode, selectedNodeId, setSelectedNode, updateNode]);

	const debouncedUpdateDescription = useCallback((newDescription: string) => {
		// Clear any existing timeout
		if (descriptionDebounceTimeoutRef.current) {
			clearTimeout(descriptionDebounceTimeoutRef.current);
		}

		// Set new timeout to save after delay
		descriptionDebounceTimeoutRef.current = setTimeout(() => {
			if (selectedNode && newDescription !== selectedNode.description) {
				console.log('💾 Debounced update: saving description for node:', selectedNodeId);
				const updatedNode = { ...selectedNode, description: newDescription };
				setSelectedNode(selectedNodeId, updatedNode);

				if (selectedNodeId) {
					updateNode(selectedNodeId!, { description: newDescription }).catch((error) => {
						console.error('Failed to save description:', error);
						setRebuildError('Failed to save description');
						setTimeout(() => setRebuildError(null), 3000);
					});
				}
			}
		}, DESCRIPTION_DEBOUNCE_DELAY);
	}, [selectedNode, selectedNodeId, setSelectedNode, updateNode]);


	const hasEdgeSelection = Array.isArray(selectedEdgeIds) && selectedEdgeIds.length > 0;
	const singleEdgeId = hasEdgeSelection && selectedEdgeIds.length === 1 ? (selectedEdgeId ?? selectedEdgeIds[0]) : null;
	const singleGraphEdge = singleEdgeId ? graph?.edges?.find((edge) => edge.id === singleEdgeId || `${edge.source}-${edge.target}` === singleEdgeId) : null;
	const singleEdgeSource = singleGraphEdge ? graph?.nodes?.find((n) => n.id === singleGraphEdge.source) : null;
	const singleEdgeTarget = singleGraphEdge ? graph?.nodes?.find((n) => n.id === singleGraphEdge.target) : null;

	return (
		<div
			className="flex-none border-r border-zinc-700 bg-zinc-900 text-white relative"
			style={{ width: `${leftSidebarWidth}px` }}
		>
			{/* Show Title only for single selection */}
			{selectedNode && (!selectedNodeIds || selectedNodeIds.length <= 1) && (
				<div className="px-3 py-2 border-b border-zinc-700">
					<div className="text-xs font-medium text-zinc-300 mb-2">
						Title
					</div>
					<Input
						className="w-full !text-xs bg-zinc-800 border-zinc-700 text-white focus:border-blue-500/50 focus:ring-blue-500/50 font-medium leading-tight"
						value={titleDraft}
						onChange={(e) => {
							const newValue = e.target.value;
							setTitleDraft(newValue);
							debouncedUpdateTitle(newValue);
						}}
						placeholder="Enter node title..."
						readOnly
					/>
					{/* Only show shape selector for non-comment nodes */}
					{(() => {
						const isCommentNode = Array.isArray(selectedNode.properties) &&
							selectedNode.properties.some(p => p.id === 'width') &&
							selectedNode.properties.some(p => p.id === 'height');
						return !isCommentNode && (
							<>
								<div className="text-xs font-medium text-zinc-300 mt-3 mb-2">Node Shape</div>
								<SelectNative
								  value={shapeDraft}
								  onChange={(e) => handleShapeChange(e.target.value as 'rectangle' | 'circle' | 'diamond' | 'hexagon' | 'arrow-rectangle' | 'cylinder' | 'parallelogram' | 'round-rectangle')}
								  className="bg-zinc-800 border-zinc-700 text-white"
								  disabled
								>
								  <option value="rectangle">Rectangle</option>
								  <option value="circle">Circle</option>
								  <option value="diamond">Diamond</option>
								  <option value="hexagon">Hexagon</option>
								  <option value="arrow-rectangle">Arrow Rectangle</option>
								  <option value="cylinder">Cylinder</option>
								  <option value="parallelogram">Parallelogram</option>
								  <option value="round-rectangle">Round Rectangle</option>
								</SelectNative>
								<div className="text-xs font-medium text-zinc-300 mt-3 mb-2">C4 Type</div>
								<SelectNative
								  value={typeDraft}
								  onChange={(e) => handleTypeChange(e.target.value as NodeType)}
								  className="bg-zinc-800 border-zinc-700 text-white"
								  disabled
								>
								  <option value="system">System</option>
								  <option value="container">Container</option>
								  <option value="component">Component</option>
								  <option value="code">Code</option>
								</SelectNative>
							</>
						);
					})()}
				</div>
			)}
		<ScrollArea className="h-[calc(100vh-7rem)] px-3 py-2 [&_[data-radix-scroll-area-thumb]]:bg-zinc-600">
			<div className="space-y-3 pb-8 min-w-0 overflow-hidden">
			{hasEdgeSelection && (
				<div className="border border-zinc-700/40 rounded p-2 bg-zinc-800/30">
					{selectedEdgeIds.length > 1 ? (
						<>
							<div className="text-xs font-medium text-zinc-300 mb-1">Multiple edges selected ({selectedEdgeIds.length})</div>
							<div className="text-[11px] text-zinc-400">Select a single edge to change its shape.</div>
						</>
					) : singleGraphEdge ? (
						<>
							<div className="text-xs font-medium text-zinc-300 mb-2">Edge</div>
							<div className="text-[11px] text-zinc-400 mb-3 truncate" title={`${singleEdgeSource?.title || singleGraphEdge.source} → ${singleEdgeTarget?.title || singleGraphEdge.target}`}>
								{singleEdgeSource?.title || singleGraphEdge.source} → {singleEdgeTarget?.title || singleGraphEdge.target}
							</div>
							<div className="text-xs font-medium text-zinc-300 mb-2">Edge Shape</div>
							<SelectNative
								value={edgeShapeDraft}
								onChange={(e) => handleEdgeShapeChange(e.target.value as EdgeShape)}
								className="bg-zinc-800 border-zinc-700 text-white"
								disabled
							>
								<option value="relates">Relates</option>
								<option value="refines">Refines</option>
							</SelectNative>
							{edgeShapeError && (
								<div className="text-xs text-red-300 bg-red-900/20 border border-red-700/30 rounded p-1.5 mt-2">
									{edgeShapeError}
								</div>
							)}
						</>
					) : (
						<div className="text-[11px] text-zinc-400">Edge data unavailable.</div>
					)}
				</div>
			)}
			{/* Multi-select summary */}
			{Array.isArray(selectedNodeIds) && selectedNodeIds.length > 1 && (
				<div className="border border-zinc-700/40 rounded p-2 bg-zinc-800/30">
					<div className="text-xs font-medium text-zinc-300 mb-2">Multiple selection ({selectedNodeIds.length})</div>
						<ul className="space-y-1">
							{selectedNodeIds.map((id) => {
								const n = graph?.nodes?.find(n => n.id === id);
								return (
									<li key={id}>
										<button
											onClick={() => {
												if (n) setSelectedNode(id, n);
											}}
											className={`w-full text-left text-xs px-2 py-1 rounded border ${selectedNodeId === id ? 'border-blue-500/50 bg-blue-500/10 text-zinc-100' : 'border-zinc-700/30 bg-zinc-900/40 text-zinc-300'} hover:bg-zinc-700/30`}
											title={n?.title || id}
										>
											{n?.title || id}
										</button>
									</li>
								);
							})}
						</ul>
						<div className="text-[11px] text-zinc-400 mt-2">Select a single node to edit its properties.</div>
					</div>
				)}

			{/* No selection state - sidebar remains visible with hint */}
			{(!selectedNodeId || !selectedNode) && (!selectedNodeIds || selectedNodeIds.length === 0) && !hasEdgeSelection && (
				<div className="text-xs text-zinc-400 bg-zinc-800/30 rounded p-2 border border-zinc-700/20">
					Select a node to edit properties.
				</div>
			)}

				{/* Single selection details */}
				{selectedNode && (!selectedNodeIds || selectedNodeIds.length <= 1) && (
					<>
						{/* Description Section */}
						<div>
							<div className="flex items-center justify-between mb-3">
								<div className="text-xs font-medium text-zinc-300">
									Description
								</div>
							</div>
							<div className="space-y-1.5">
								<Textarea
									className="w-full h-48 !text-xs bg-zinc-800 border-zinc-700 text-white leading-relaxed focus:border-blue-500/50 focus:ring-blue-500/50"
									value={promptDraft}
									onChange={(e) => {
										const newValue = e.target.value;
										setPromptDraft(newValue);
										debouncedUpdateDescription(newValue);
									}}
									placeholder="Enter description..."
									readOnly
								/>
								{rebuildError && (
									<div className="text-xs text-red-300 bg-red-900/20 border border-red-700/30 rounded p-1.5">
										{rebuildError}
									</div>
								)}
								{rebuildSuccess && (
									<div className="text-xs text-green-300 bg-green-900/20 border border-green-700/30 rounded p-1.5">
										Node saved successfully!
									</div>
								)}
							</div>
						</div>

						{(() => {
							// Filter out width/height properties for comment nodes
							const isCommentNode = Array.isArray(selectedNode.properties) &&
								selectedNode.properties.some(p => p.id === 'width') &&
								selectedNode.properties.some(p => p.id === 'height');
							const visibleProperties = selectedNode.properties ?
								selectedNode.properties.filter(p => {
									if (isCommentNode && (p.id === 'width' || p.id === 'height')) {
										return false;
									}
									return true;
								}) : [];

							return visibleProperties.length > 0 && (
								<div className="space-y-1.5 border-t border-zinc-700/30 pt-3">
									{/* Preserve original order from graph (no sorting) */}
									{visibleProperties.map((property: Property, index: number) => (
										<div key={property.id} className={index < visibleProperties.length - 1 ? "border-b border-zinc-700/20 pb-1.5 mb-1.5" : ""}>
											<PropertyEditor
												property={{
													...property,
													value: (propertyValues[property.id] !== undefined ? propertyValues[property.id] : property.value)
												}}
												onChange={handlePropertyChange}
												onPreview={handlePropertyPreview}
												onBackendUpdate={handleBackendUpdate}
												disabled={true}
											/>
										</div>
									))}
								</div>
							);
						})()}

						{(() => {
							const connections = getNodeConnections(selectedNode.id);
							return connections.length > 0 && (
								<div className="border-t border-zinc-700/30 pt-3">
									<div className="text-xs font-medium text-zinc-300 border-b border-zinc-700/30 pb-1 mb-1.5">Connections ({connections.length})</div>
									<ul className="space-y-0.5">
										{connections.map((connection, index) => (
											<li key={`${connection.node.id}-${index}`}>
												<button
													onClick={() => {
														setSelectedNode(connection.node.id, connection.node);
														setSelectedNodeIds([connection.node.id]);
													}}
													className="w-full text-left text-xs bg-zinc-800/30 rounded px-2 py-1 border border-zinc-700/20 hover:bg-zinc-700/50 hover:border-zinc-600/50 transition-colors"
												>
													<div className="flex items-center">
														<span className="text-zinc-400 truncate">{connection.node.title}</span>
														<span className="text-zinc-500 ml-2 text-[10px]">{connection.direction === 'outgoing' ? '→' : '←'}</span>
													</div>
												</button>
											</li>
										))}
									</ul>
								</div>
							);
						})()}

						<div className="border-t border-zinc-700/30 pt-3 min-w-0 overflow-hidden">
							<div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
								<span>Implementation Files</span>
							</div>
							{metadataFiles.length > 0 ? (
								<ul className="mt-2 space-y-1">
									{metadataFiles.map((file) => (
										<li
											key={file}
											title={file}
											className="relative"
											style={{
												display: 'block',
												maxWidth: `${leftSidebarWidth - 40}px`,
												overflow: 'hidden',
												textOverflow: 'ellipsis',
												whiteSpace: 'nowrap',
												fontSize: '11px',
												color: 'rgb(228 228 231)',
												fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Inconsolata, "Roboto Mono", "Source Code Pro", monospace'
											}}
										>
											{file}
										</li>
									))}
								</ul>
							) : (
								<div className="mt-2 text-[11px] text-zinc-500">
									No implementation files recorded yet.
								</div>
							)}
						</div>

						{metadataBugs.length > 0 && (
							<div className="border-t border-zinc-700/30 pt-3 min-w-0 overflow-hidden">
								<div className="flex items-center gap-2 text-xs font-medium text-red-300">
									<span>Bugs ({metadataBugs.length})</span>
								</div>
								<ul className="mt-2 space-y-1">
									{metadataBugs.map((bug) => (
										<li
											key={bug}
											className="relative"
											style={{
												display: 'block',
												maxWidth: `${leftSidebarWidth - 40}px`,
												overflow: 'hidden',
												textOverflow: 'ellipsis',
												whiteSpace: 'nowrap'
											}}
										>
											<span
												className="inline-block px-2 py-1 text-xs bg-red-500/20 border border-red-500/30 text-red-200 rounded"
												title={bug}
											>
												{bug}
											</span>
										</li>
									))}
								</ul>
							</div>
						)}
					</>
				)}
				</div>
			</ScrollArea>
			<ResizeHandle
				direction="right"
				onResize={setLeftSidebarWidth}
				initialWidth={leftSidebarWidth}
				minWidth={200}
				maxWidth={600}
			/>
		</div>
	);
}

