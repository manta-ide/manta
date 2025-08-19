'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectStore } from '@/lib/store';
import { useChatService } from '@/lib/chatService';
import PropertyEditor from './property-editors';
import { Property } from '@/app/api/lib/schemas';

export default function SelectedNodeSidebar() {
	// Set to false to disable debouncing and apply property changes immediately
	const DEBOUNCE_PROPERTY_CHANGES = true;
	
	const { selectedNodeId, selectedNode, setSelectedNode, loadProject: loadProjectFromFileSystem, triggerRefresh, refreshGraph } = useProjectStore();
	const { actions } = useChatService();
	const [promptDraft, setPromptDraft] = useState<string>('');
	const [isRebuilding, setIsRebuilding] = useState(false);
	const [isGeneratingProperties, setIsGeneratingProperties] = useState(false);
	const [propertyValues, setPropertyValues] = useState<Record<string, any>>({});
	const [rebuildError, setRebuildError] = useState<string | null>(null);
	const [rebuildSuccess, setRebuildSuccess] = useState(false);
	const propertyChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		setPromptDraft(selectedNode?.prompt ?? '');
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
		}
	}, [selectedNodeId, selectedNode?.prompt, selectedNode?.properties]);

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (propertyChangeTimeoutRef.current) {
				clearTimeout(propertyChangeTimeoutRef.current);
			}
		};
	}, []);

	if (!selectedNodeId) return null;

	const handleRebuild = async () => {
		if (!selectedNodeId) return;
		try {
			setIsRebuilding(true);
			setRebuildError(null); // Clear previous errors
			setRebuildSuccess(false); // Clear previous success
			
			// 1) Save latest prompt before rebuild via new backend storage API
			const previousPrompt = selectedNode?.prompt ?? '';
			const saveRes = await fetch(`/api/backend/storage`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ nodeId: selectedNodeId, prompt: promptDraft })
			});
			
			if (!saveRes.ok) {
				console.error('Failed to save prompt before rebuild');
				throw new Error('Failed to save prompt before rebuild');
			}
			
			const saved = await saveRes.json();
			if (saved?.node) {
				setSelectedNode(selectedNodeId, saved.node);
			}

			// 2) Trigger rebuild through chat service (agent-request orchestration)
			await actions.rebuildNode(selectedNodeId, previousPrompt, promptDraft);

			// 3) Refresh the graph to get the latest state
			try {
				await refreshGraph();
				// Find the updated node in the refreshed graph
				const { graph } = useProjectStore.getState();
				const updatedNode = graph?.nodes.find(n => n.id === selectedNodeId);
				if (updatedNode) {
					setSelectedNode(selectedNodeId, updatedNode);
				}
			} catch (e) {
				console.warn('Failed to refresh graph after rebuild:', e);
			}

			// 4) Ensure freshest filesystem state
			try {
				await loadProjectFromFileSystem();
			} catch (e) {
				console.warn('Reload after rebuild failed:', e);
			}
			triggerRefresh();
			
			// 5) Show success message
			setRebuildSuccess(true);
			// Clear success message after 3 seconds
			setTimeout(() => setRebuildSuccess(false), 3000);
		} catch (error) {
			console.error('Rebuild failed:', error);
			setRebuildError('Failed to rebuild node. Please try again.');
		} finally {
			setIsRebuilding(false);
		}
	};

	const handleGenerateProperties = async () => {
		if (!selectedNodeId) return;
		try {
			setIsGeneratingProperties(true);
			
			// Get current graph from store
			const { graph, getFileContent } = useProjectStore.getState();
			if (!graph) {
				console.error('No graph found for property generation');
				return;
			}
			
			// Get current code content from store
			const generatedCode = getFileContent('src/app/page.tsx') || '';
			
			// Generate properties for the selected node
			const propertyRes = await fetch('/api/agents/generate-properties', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					graph: graph,
					nodeId: selectedNodeId,
					generatedCode,
					filePath: 'base-template/src/app/page.tsx'
				}),
			});
			
			if (propertyRes.ok) {
				const propertyData = await propertyRes.json();
				if (propertyData.success && propertyData.properties.length > 0) {
					// Use the updated graph from the response
					const updatedGraph = propertyData.updatedGraph;
					const updatedNode = updatedGraph.nodes.find((n: any) => n.id === selectedNodeId);
					
					if (updatedNode) {
						// Update local state
						setSelectedNode(selectedNodeId, updatedNode);
						
						// Initialize property values
						const initialValues: Record<string, any> = {};
						for (const prop of propertyData.properties) {
							initialValues[prop.id] = prop.value;
						}
						setPropertyValues(initialValues);
						
						// Trigger refresh to ensure UI is updated
						triggerRefresh();
					} else {
						console.error('Updated node not found in response');
					}
				} else {
					console.log('No properties generated for this node');
				}
			} else {
				const errorData = await propertyRes.json().catch(() => ({}));
				console.error('Failed to generate properties:', errorData.error || propertyRes.statusText);
			}
		} catch (error) {
			console.error('Error generating properties:', error);
		} finally {
			setIsGeneratingProperties(false);
		}
	};

	const handlePropertyChange = useCallback(async (propertyId: string, value: any) => {
		// Update local state immediately for responsive UI
		const newPropertyValues = {
			...propertyValues,
			[propertyId]: value
		};
		setPropertyValues(newPropertyValues);

		// Log the property change for now (mock functionality)
		console.log('Property change:', {
			nodeId: selectedNodeId,
			propertyId,
			oldValue: propertyValues[propertyId],
			newValue: value,
			allProperties: newPropertyValues
		});

		// If debouncing is disabled, apply changes immediately
		if (!DEBOUNCE_PROPERTY_CHANGES) {
			await applyPropertyChanges(newPropertyValues);
			return;
		}

		// Clear any existing timeout
		if (propertyChangeTimeoutRef.current) {
			clearTimeout(propertyChangeTimeoutRef.current);
		}

		// Debounce the file system update
		propertyChangeTimeoutRef.current = setTimeout(async () => {
			await applyPropertyChanges(newPropertyValues);
		}, 300); // 300ms debounce delay
	}, [propertyValues, selectedNodeId, DEBOUNCE_PROPERTY_CHANGES]);

	// Helper function to apply property changes (mock implementation)
	const applyPropertyChanges = useCallback(async (newPropertyValues: Record<string, any>) => {
		if (selectedNode?.properties) {
			try {
				// Update each changed property through the graph API
				const updatePromises = selectedNode.properties.map(async (prop) => {
					const oldValue = propertyValues[prop.id];
					const newValue = newPropertyValues[prop.id];
					
					// Only update if the value actually changed
					if (oldValue !== newValue) {
						console.log(`Updating property ${prop.id} from "${oldValue}" to "${newValue}"`);
						
						const response = await fetch('/api/backend/graph-api', {
							method: 'PATCH',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								nodeId: selectedNodeId,
								propertyId: prop.id,
								value: newValue
							})
						});
						
						if (!response.ok) {
							const errorData = await response.json().catch(() => ({}));
							throw new Error(`Failed to update property ${prop.id}: ${errorData.error || response.statusText}`);
						}
						
						const result = await response.json();
						if (result.success && result.updatedNode) {
							// Update the local node state with the updated node
							setSelectedNode(selectedNodeId, result.updatedNode);
						}
						
						return {
							propertyId: prop.id,
							oldValue,
							newValue,
							success: true
						};
					}
					
					return {
						propertyId: prop.id,
						oldValue: oldValue,
						newValue: newValue,
						success: true,
						unchanged: true
					};
				});
				
				const results = await Promise.all(updatePromises);
				const updatedProperties = results.filter(r => r.success && !r.unchanged);
				
				if (updatedProperties.length > 0) {
					console.log('✅ Successfully updated properties:', updatedProperties);
					
					// Refresh the graph to ensure UI is updated
					await refreshGraph();
					
					// Trigger refresh to show changes in the file viewer
					triggerRefresh();
				} else {
					console.log('ℹ️ No properties were changed');
				}
			} catch (error) {
				console.error('Failed to apply property changes:', error);
				// Revert the local state change on error
				setPropertyValues(propertyValues);
				
				// Show error to user (you might want to add a toast notification here)
				setRebuildError(`Failed to update properties: ${error instanceof Error ? error.message : 'Unknown error'}`);
				setTimeout(() => setRebuildError(null), 5000);
			}
		}
	}, [selectedNode?.properties, selectedNodeId, propertyValues, setSelectedNode, refreshGraph, triggerRefresh]);

	return (
		<div className="flex-none border-r border-zinc-700 bg-zinc-900 text-white overflow-y-auto">
			<div className="p-4 border-b border-zinc-700 flex items-center justify-between">
				<div className="flex flex-col">
					<span className="text-xs text-zinc-400">Selected Node</span>
					<span className="font-semibold truncate max-w-[320px]" title={selectedNode?.title || selectedNodeId}>
						{selectedNode?.title || selectedNodeId}
					</span>
				</div>
				<button
					className="text-zinc-400 hover:text-white"
					onClick={() => setSelectedNode(null, null)}
					aria-label="Close node details"
				>
					×
				</button>
			</div>
			<div className="p-4 space-y-4">
				<div>
					<div className="text-xs uppercase text-zinc-400">ID</div>
					<div className="text-sm break-all">{selectedNodeId}</div>
				</div>

				{selectedNode && (
					<>
						<div className="space-y-2">
							<div className="text-xs uppercase text-zinc-400">Prompt</div>
							<textarea
								className="w-full h-40 text-xs bg-zinc-800 border border-zinc-700 rounded p-2 text-white"
								value={promptDraft}
								onChange={(e) => setPromptDraft(e.target.value)}
							/>
							{rebuildError && (
								<div className="text-xs text-red-400 bg-red-900/20 border border-red-700 rounded p-2">
									{rebuildError}
								</div>
							)}
							{rebuildSuccess && (
								<div className="text-xs text-green-400 bg-green-900/20 border border-green-700 rounded p-2">
									Node rebuilt successfully!
								</div>
							)}
							<div className="flex gap-2">
								<button
									className={`px-3 py-1.5 rounded text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed`}
									disabled={isRebuilding}
									onClick={handleRebuild}
								>{isRebuilding ? 'Rebuilding…' : 'Rebuild'}</button>
								<button
									className={`px-3 py-1.5 rounded text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed`}
									disabled={isGeneratingProperties}
									onClick={handleGenerateProperties}
								>{isGeneratingProperties ? 'Generating…' : 'Generate Properties'}</button>
							</div>
						</div>

						{selectedNode.properties && selectedNode.properties.length > 0 && (
							<div className="space-y-4">
								<div className="text-xs uppercase text-zinc-400">Properties</div>
								{selectedNode.properties.map((property: Property) => (
									<div key={property.id} className="space-y-2">
										<div className="text-sm font-medium">{property.title}</div>
										<PropertyEditor
											property={{
												...property,
												value: propertyValues[property.id] || property.value
											}}
											onChange={handlePropertyChange}
										/>
									</div>
								))}
							</div>
						)}

						{selectedNode.children?.length > 0 && (
							<div>
								<div className="text-xs uppercase text-zinc-400">Children ({selectedNode.children.length})</div>
								<ul className="list-disc list-inside text-sm break-words">
									{selectedNode.children.map((child: any) => (
										<li key={child.id}>{child.title}</li>
									))}
								</ul>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}


