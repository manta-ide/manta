'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectStore } from '@/lib/store';
import { useChatService } from '@/lib/chatService';
import PropertyEditor from './property-editors';
import { Property } from '@/app/api/lib/schemas';
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { postVarsUpdate } from '@/lib/child-bridge';

export default function SelectedNodeSidebar() {
	// Set to false to disable debouncing and apply property changes immediately
	const DEBOUNCE_PROPERTY_CHANGES = true;
	
	const {
		selectedNodeId,
		selectedNode,
		setSelectedNode,
		selectedNodeIds,
		triggerRefresh,
		refreshGraph,
		updateNode,
		updateProperty,
		updatePropertyLocal,
		connectToGraphEvents,
		graph
	} = useProjectStore();
	const { actions } = useChatService();
	const [promptDraft, setPromptDraft] = useState<string>('');
	const [titleDraft, setTitleDraft] = useState<string>('');
	// Building state is tracked locally since node.state was removed
	const [isGeneratingProperties, setIsGeneratingProperties] = useState(false);

	// Helper function to get children from edges
	const getNodeChildren = (nodeId: string) => {
		if (!graph?.edges) return [];
		return graph.edges
			.filter(edge => edge.source === nodeId)
			.map(edge => graph.nodes.find(n => n.id === edge.target))
			.filter(Boolean);
	};
	const [propertyValues, setPropertyValues] = useState<Record<string, any>>({});
	const stagedPropertyValuesRef = useRef<Record<string, any>>({});
	const [rebuildError, setRebuildError] = useState<string | null>(null);
	const [rebuildSuccess, setRebuildSuccess] = useState(false);
	const propertyChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const lastPropertyUpdate = useRef<{ [propertyId: string]: number }>({});
	const PROPERTY_UPDATE_THROTTLE = 60; // Update every 60ms for smoother live updates
	const titleDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const descriptionDebounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const TITLE_DEBOUNCE_DELAY = 300; // Wait 300ms after last change before saving title
	const DESCRIPTION_DEBOUNCE_DELAY = 500; // Wait 500ms after last change before saving description

		const handlePropertyPreview = useCallback((propertyId: string, value: any) => {
			// Lightweight preview: update local state and in-memory graph without saving
			setPropertyValues(prev => ({ ...prev, [propertyId]: value }));
			if (selectedNodeId) {
				updatePropertyLocal(selectedNodeId, propertyId, value);
				postVarsUpdate({ [propertyId]: value });
			}
		}, [selectedNodeId, updatePropertyLocal]);

	// Monitor iframe connection and reconnect when needed
	useEffect(() => {
		const checkIframeConnection = () => {
			const childWindow = (window as any).__mantaChildWindow;
			if (!childWindow) {
				console.log('👤 SelectedNodeSidebar: No child window connection, iframe may not be ready');
			} else {
				console.log('👤 SelectedNodeSidebar: Child window connection established');
			}
		};

		// Check immediately
		checkIframeConnection();

		// Listen for iframe ready events
		const handleIframeReady = (event: MessageEvent) => {
			if (event.data?.type === 'manta:child:ready') {
				console.log('👤 SelectedNodeSidebar: Detected iframe ready signal');
				setTimeout(checkIframeConnection, 100); // Small delay to ensure setup is complete
			}
		};

		window.addEventListener('message', handleIframeReady);

		// Also check periodically in case of missed events
		const interval = setInterval(checkIframeConnection, 2000);

		return () => {
			window.removeEventListener('message', handleIframeReady);
			clearInterval(interval);
		};
	}, []);

	useEffect(() => {
		// Only reset drafts when switching to a different node, not when the values change
		setPromptDraft(selectedNode?.prompt ?? '');
		setTitleDraft(selectedNode?.title ?? '');
		setRebuildError(null);
		setRebuildSuccess(false);
		
		// Clear any pending property change timeout when node changes
		if (propertyChangeTimeoutRef.current) {
			clearTimeout(propertyChangeTimeoutRef.current);
			propertyChangeTimeoutRef.current = null;
		}
		
		// Initialize property values from current properties
		if (selectedNode?.properties && selectedNode.properties.length > 0) {
			const initialValues: Record<string, any> = {};
			for (const prop of selectedNode.properties) {
				initialValues[prop.id] = prop.value;
			}
			setPropertyValues(initialValues);
			stagedPropertyValuesRef.current = initialValues;
		}
	}, [selectedNodeId]);

	// Cleanup timeouts on unmount and when node changes
	useEffect(() => {
		return () => {
			if (propertyChangeTimeoutRef.current) {
				clearTimeout(propertyChangeTimeoutRef.current);
			}
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
    const propMeta = selectedNode?.properties?.find(p => p.id === propertyId);
    // Only treat truly high-frequency primitives as high-frequency; complex objects should re-render immediately
    const isHighFrequency = ['color','slider'].includes((propMeta?.type as any) || '');

		// Always update propertyValues for UI responsiveness, even for high-frequency properties
    const newPropertyValues = {
      ...propertyValues,
      [propertyId]: value
    };
    setPropertyValues(newPropertyValues);

    // For high-frequency properties, also update staged values for batch processing
    if (isHighFrequency) {
      stagedPropertyValuesRef.current = {
        ...stagedPropertyValuesRef.current,
        [propertyId]: value
      };
    }

		// Skip heavy tracking to avoid lag

		// For high-frequency properties, throttle in-memory graph updates to reduce re-renders
		if (selectedNodeId) {
			const now = Date.now();
			const lastLocalUpdate = lastPropertyUpdate.current[`${propertyId}_local`] || 0;

			// Only update in-memory graph for high-frequency properties every 100ms
			if (!isHighFrequency || now - lastLocalUpdate >= 100) {
				lastPropertyUpdate.current[`${propertyId}_local`] = now;
				updatePropertyLocal(selectedNodeId, propertyId, value);
			}

			// Always update vars for live preview, but throttle for high-frequency
			const lastVarsUpdate = lastPropertyUpdate.current[`${propertyId}_vars`] || 0;
			if (!isHighFrequency || now - lastVarsUpdate >= 50) {
				lastPropertyUpdate.current[`${propertyId}_vars`] = now;
				postVarsUpdate({ [propertyId]: value });
			}
		}

    // For high-frequency props (e.g., color), opportunistically persist faster (throttled)
    if (isHighFrequency && selectedNodeId) {
      const now = Date.now();
      const last = lastPropertyUpdate.current[propertyId] || 0;
      if (now - last >= 200) { // Increased throttle from 120ms to 200ms
        lastPropertyUpdate.current[propertyId] = now;
        updateProperty(selectedNodeId, propertyId, value).catch(() => {});
      }
    }

		const nextValues = isHighFrequency ? { ...stagedPropertyValuesRef.current, [propertyId]: value } : { ...propertyValues, [propertyId]: value };
		if (DEBOUNCE_PROPERTY_CHANGES) {
			if (propertyChangeTimeoutRef.current) clearTimeout(propertyChangeTimeoutRef.current);
			propertyChangeTimeoutRef.current = setTimeout(() => {
            // Persist the latest staged values for all changed properties
            applyPropertyChanges(nextValues);
			}, isHighFrequency ? 500 : 250); // Longer debounce for high-frequency properties
      } else {
        if (selectedNodeId) updateProperty(selectedNodeId, propertyId, value);
      }
      if (!DEBOUNCE_PROPERTY_CHANGES) {
        const payloadValues = isHighFrequency ? stagedPropertyValuesRef.current : { ...propertyValues, [propertyId]: value };
        applyPropertyChanges(payloadValues).catch(() => {});
        return;
      }

		// Clear any existing timeout
		if (propertyChangeTimeoutRef.current) {
			clearTimeout(propertyChangeTimeoutRef.current);
		}

    // Debounce the persistence update only
    propertyChangeTimeoutRef.current = setTimeout(async () => {
      const payloadValues = isHighFrequency ? stagedPropertyValuesRef.current : { ...propertyValues, [propertyId]: value };
      await applyPropertyChanges(payloadValues);
    }, isHighFrequency ? 500 : 250); // Longer debounce for high-frequency properties
  }, [propertyValues, selectedNodeId, selectedNode?.properties, DEBOUNCE_PROPERTY_CHANGES, updateProperty]);

		// (preview handler defined above)

  // Helper function to apply property changes (persist via API)
  const applyPropertyChanges = useCallback(async (newPropertyValues: Record<string, any>) => {
		if (selectedNode?.properties) {
			try {
				// Track which properties actually changed
				const changedProperties: Array<{propertyId: string, oldValue: any, newValue: any}> = [];

				// Check which properties changed
				for (const prop of selectedNode.properties) {
					const oldValue = propertyValues[prop.id];
					const newValue = newPropertyValues[prop.id];

					if (oldValue !== newValue) {
						changedProperties.push({ propertyId: prop.id, oldValue, newValue });
					}
				}

				if (changedProperties.length === 0) {
					console.log('ℹ️ No properties were changed');
					return;
				}

        console.log('🔄 Updating properties:', changedProperties);

        // Save properties via API
        const updatePromises = changedProperties.map(async ({ propertyId, oldValue, newValue }) => {
          console.log(`🔄 Saving property ${propertyId}`);

          // Persist
          try {
            await updateProperty(selectedNodeId!, propertyId, newValue);
            console.log(`✅ Property ${propertyId} persisted`);

						return {
							propertyId,
							oldValue,
							newValue,
							success: true
						};
          } catch (persistError) {
            console.warn(`⚠️ Failed to persist property ${propertyId}:`, persistError);
            return {
              propertyId,
              oldValue,
              newValue,
              success: false,
              error: persistError
            };
          }
        });

				const results = await Promise.all(updatePromises);
				const successfulUpdates = results.filter(r => r.success);
				const failedUpdates = results.filter(r => !r.success);

        if (successfulUpdates.length > 0) {
          console.log('✅ Successfully saved properties:', successfulUpdates);
        }

				if (failedUpdates.length > 0) {
					console.warn('⚠️ Some property updates failed:', failedUpdates);
					setRebuildError(`Failed to update ${failedUpdates.length} properties. Please try again.`);
					setTimeout(() => setRebuildError(null), 5000);
				}
			} catch (error) {
				console.error('Failed to apply property changes:', error);
				// Revert the local state change on error
				setPropertyValues(propertyValues);

				// Show error to user
				setRebuildError(`Failed to update properties: ${error instanceof Error ? error.message : 'Unknown error'}`);
				setTimeout(() => setRebuildError(null), 5000);
			}
		}
	}, [selectedNode?.properties, selectedNodeId, propertyValues, setSelectedNode]);

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
		<div className="flex-none  border-r border-zinc-700 bg-zinc-900 text-white">
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
			</div>
			<ScrollArea className="h-[calc(100vh-7rem)] px-3 py-2 [&_[data-radix-scroll-area-thumb]]:bg-zinc-600">
				<div className="space-y-3 pr-2">
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
									className="w-full h-24 !text-xs bg-zinc-800 border-zinc-700 text-white leading-relaxed focus:border-blue-500/50 focus:ring-blue-500/50"
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
										/>
									</div>
								))}
							</div>
						)}

						{(() => {
							const children = getNodeChildren(selectedNode.id);
							return children.length > 0 && (
								<div className="border-t border-zinc-700/30 pt-3">
									<div className="text-xs font-medium text-zinc-300 border-b border-zinc-700/30 pb-1 mb-1.5">Children ({children.length})</div>
									<ul className="space-y-0.5">
										{children.map((child: any) => (
											<li key={child.id} className="text-xs text-zinc-400 bg-zinc-800/30 rounded px-2 py-1 border border-zinc-700/20">
												{child.title}
											</li>
										))}
									</ul>
								</div>
							);
						})()}
					</>
				)}
				</div>
			</ScrollArea>
		</div>
	);
}
