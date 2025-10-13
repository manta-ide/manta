'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectStore } from '@/lib/store';
import { useChatService } from '@/lib/chatService';
import PropertyEditor from './property-editors';
import ResizeHandle from './ResizeHandle';
import { Property } from '@/app/api/lib/schemas';
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SelectNative } from "@/components/ui/select-native";

export default function SelectedNodeSidebar() {
	
	const {
		selectedNodeId,
		selectedNode,
		setSelectedNode,
		selectedNodeIds,
		setSelectedNodeIds,
		triggerRefresh,
		refreshGraph,
		updateNode,
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
  const [shapeDraft, setShapeDraft] = useState<'rectangle' | 'circle' | 'triangle'>('rectangle');
	// Building state is tracked locally since node.state was removed
	const [isGeneratingProperties, setIsGeneratingProperties] = useState(false);
	const metadataFiles = Array.from(new Set(
		(selectedNode?.metadata?.files ?? [])
			.filter((file): file is string => typeof file === 'string')
			.map((file) => file.trim())
			.filter((file) => file.length > 0)
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
		setPromptDraft(selectedNode?.prompt ?? '');
		setTitleDraft(selectedNode?.title ?? '');
		setShapeDraft(((selectedNode as any)?.shape as any) || 'rectangle');
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
	}, [selectedNodeId, selectedNode?.title, selectedNode?.prompt, selectedNode?.properties]);

  const handleShapeChange = useCallback((newShape: 'rectangle') => {
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
			if (selectedNode && newDescription !== selectedNode.prompt) {
				console.log('💾 Debounced update: saving description for node:', selectedNodeId);
				const updatedNode = { ...selectedNode, prompt: newDescription };
				setSelectedNode(selectedNodeId, updatedNode);

				if (selectedNodeId) {
					updateNode(selectedNodeId!, { prompt: newDescription }).catch((error) => {
						console.error('Failed to save description:', error);
						setRebuildError('Failed to save description');
						setTimeout(() => setRebuildError(null), 3000);
					});
				}
			}
		}, DESCRIPTION_DEBOUNCE_DELAY);
	}, [selectedNode, selectedNodeId, setSelectedNode, updateNode]);


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
					/>
					<div className="text-xs font-medium text-zinc-300 mt-3 mb-2">Node Shape</div>
					<SelectNative
					  value={shapeDraft}
					  onChange={(e) => handleShapeChange(e.target.value as 'rectangle' )}
					  className="bg-zinc-800 border-zinc-700 text-white"
					>
					  <option value="rectangle">Rectangle</option>
					  {/* <option value="circle">Circle</option>
					  <option value="triangle">Triangle</option> */}
					</SelectNative>
				</div>
			)}
			<ScrollArea className="h-[calc(100vh-7rem)] px-3 py-2 [&_[data-radix-scroll-area-thumb]]:bg-zinc-600">
				<div className="space-y-3 pb-8 min-w-0 overflow-hidden">
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
				{(!selectedNodeId || !selectedNode) && (!selectedNodeIds || selectedNodeIds.length === 0) && (
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
								/>
								{rebuildError && (
									<div className="text-xs text-red-300 bg-red-900/20 border border-red-700/30 rounded p-1.5">
										{rebuildError}
									</div>
								)}
								{rebuildSuccess && (
									<div className="text-xs text-green-300 bg-green-900/20 border border-green-700/30 rounded p-1.5">
										Node rebuilt successfully!
									</div>
								)}
							</div>
						</div>

						{selectedNode.properties && selectedNode.properties.length > 0 && (
							<div className="space-y-1.5 border-t border-zinc-700/30 pt-3">
								{/* Preserve original order from graph (no sorting) */}
								{selectedNode.properties.map((property: Property, index: number) => (
									<div key={property.id} className={index < (selectedNode.properties?.length || 0) - 1 ? "border-b border-zinc-700/20 pb-1.5 mb-1.5" : ""}>
										<PropertyEditor
											property={{
												...property,
												value: (propertyValues[property.id] !== undefined ? propertyValues[property.id] : property.value)
											}}
											onChange={handlePropertyChange}
											onPreview={handlePropertyPreview}
											onBackendUpdate={handleBackendUpdate}
										/>
									</div>
								))}
							</div>
						)}

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

