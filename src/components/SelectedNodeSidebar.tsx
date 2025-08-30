'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectStore } from '@/lib/store';
import { useChatService } from '@/lib/chatService';
import PropertyEditor from './property-editors';
import { Property } from '@/app/api/lib/schemas';
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from '@/lib/auth-context';
import supabaseRealtimeService from '@/lib/supabase-realtime';

export default function SelectedNodeSidebar() {
	// Set to false to disable debouncing and apply property changes immediately
	const DEBOUNCE_PROPERTY_CHANGES = true;
	
	const {
		selectedNodeId,
		selectedNode,
		setSelectedNode,
		triggerRefresh,
		refreshGraph,
		updateNodeInSupabase,
		updatePropertyInSupabase,
		supabaseConnected,
		connectToGraphEvents
	} = useProjectStore();
	const { actions } = useChatService();
	const { user } = useAuth();
	const [promptDraft, setPromptDraft] = useState<string>('');
	// Building state is now tracked in node.state instead of local state
	const [isGeneratingProperties, setIsGeneratingProperties] = useState(false);
	const [propertyValues, setPropertyValues] = useState<Record<string, any>>({});
	const stagedPropertyValuesRef = useRef<Record<string, any>>({});
	const [rebuildError, setRebuildError] = useState<string | null>(null);
	const [rebuildSuccess, setRebuildSuccess] = useState(false);
	const propertyChangeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const lastPropertyUpdate = useRef<{ [propertyId: string]: number }>({});
	const PROPERTY_UPDATE_THROTTLE = 60; // Update every 60ms for smoother live updates

	// Just monitor connection status - let AuthProvider handle the actual connection
	useEffect(() => {
		console.log('👤 SelectedNodeSidebar: Connection status check:', {
			user: user ? { id: user.id, email: user.email } : null,
			supabaseConnected,
			hasUserId: !!user?.id
		});
		
		if (!user?.id) {
			console.log('⚠️ SelectedNodeSidebar: No user ID available');
		} else if (supabaseConnected) {
			console.log('✅ SelectedNodeSidebar: Supabase connected');
		} else {
			console.log('🔄 SelectedNodeSidebar: Waiting for Supabase connection (handled by AuthProvider)');
		}
	}, [user?.id, supabaseConnected]);

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
			stagedPropertyValuesRef.current = initialValues;
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
			setRebuildError(null); // Clear previous errors
			setRebuildSuccess(false); // Clear previous success

			// Store the previous prompt for the rebuild operation
			const previousPrompt = selectedNode?.prompt ?? '';

			// Update the node state to "building" via Supabase
			try {
				if (supabaseConnected) {
					await updateNodeInSupabase(selectedNodeId, {
						state: 'building',
						prompt: promptDraft // Update prompt in Supabase
					});
					console.log('✅ Node state and prompt updated to building via Supabase');
				} else {
					throw new Error('Supabase not connected');
				}
			} catch (supabaseError) {
				console.error('❌ Supabase update failed:', supabaseError);
				setRebuildError('Failed to update node state. Supabase connection required.');
				return;
			}

			// Trigger rebuild through chat service (agent-request orchestration)
			await actions.rebuildNode(selectedNodeId, previousPrompt, promptDraft);

			// Refresh the graph to get the latest state from Supabase
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

			// Update the node state to "built" upon success
			try {
				if (supabaseConnected) {
					await updateNodeInSupabase(selectedNodeId, { state: 'built' });
					console.log('✅ Node state updated to built via Supabase');
				} else {
					throw new Error('Supabase not connected');
				}
			} catch (supabaseError) {
				console.error('❌ Supabase final update failed:', supabaseError);
			}

			// Show success message
			setRebuildSuccess(true);
			// Clear success message after 3 seconds
			setTimeout(() => setRebuildSuccess(false), 3000);
		} catch (error) {
			console.error('Rebuild failed:', error);
			setRebuildError('Failed to rebuild node. Please try again.');

			// Update the node state back to its previous state via Supabase
			try {
				if (supabaseConnected) {
					await updateNodeInSupabase(selectedNodeId, {
						state: selectedNode?.state === 'built' ? 'built' : 'unbuilt'
					});
				}
			} catch (e) {
				console.error('Failed to revert node state after error:', e);
			}
		}
	};


	const handlePropertyChange = useCallback((propertyId: string, value: any) => {
		// Update local state immediately for responsive UI
		const propMeta = selectedNode?.properties?.find(p => p.id === propertyId);
		const isHighFrequency = propMeta?.type === 'color';

		// For high-frequency properties, avoid re-rendering the sidebar on every tick
		if (isHighFrequency) {
			stagedPropertyValuesRef.current = {
				...stagedPropertyValuesRef.current,
				[propertyId]: value
			};
		} else {
			const newPropertyValues = {
				...propertyValues,
				[propertyId]: value
			};
			setPropertyValues(newPropertyValues);
		}

		// Skip heavy tracking to avoid lag

		// Use broadcast for immediate real-time property updates (non-blocking, synchronous)
		if (supabaseConnected && selectedNodeId) {
			const now = Date.now();
			const lastUpdate = lastPropertyUpdate.current[propertyId] || 0;
			
			if (now - lastUpdate >= PROPERTY_UPDATE_THROTTLE) {
				lastPropertyUpdate.current[propertyId] = now;
				
				// Use broadcast for real-time updates (synchronous, non-blocking)
				supabaseRealtimeService.broadcastProperty(selectedNodeId, propertyId, value);
				console.debug(`📡 Property ${propertyId} broadcasted for real-time sync`);
			}
		}

		// Handle Supabase database updates (debounced for performance)
		if (!DEBOUNCE_PROPERTY_CHANGES) {
			const payloadValues = isHighFrequency ? stagedPropertyValuesRef.current : { ...propertyValues, [propertyId]: value };
			applyPropertyChangesToSupabase(payloadValues).catch(() => {});
			return;
		}

		// Clear any existing timeout
		if (propertyChangeTimeoutRef.current) {
			clearTimeout(propertyChangeTimeoutRef.current);
		}

		// Debounce the Supabase database update only
		propertyChangeTimeoutRef.current = setTimeout(async () => {
			const payloadValues = isHighFrequency ? stagedPropertyValuesRef.current : { ...propertyValues, [propertyId]: value };
			await applyPropertyChangesToSupabase(payloadValues);
		}, 250); // slightly faster debounce for smoother UX
	}, [propertyValues, selectedNodeId, selectedNode?.properties, DEBOUNCE_PROPERTY_CHANGES, supabaseConnected, updatePropertyInSupabase]);

	// Preview handler: update UI and broadcast without persisting
	const handlePropertyPreview = useCallback((propertyId: string, value: any) => {
		setPropertyValues(prev => ({ ...prev, [propertyId]: value }));
		if (supabaseConnected && selectedNodeId) {
			supabaseRealtimeService.broadcastProperty(selectedNodeId, propertyId, value);
		}
	}, [supabaseConnected, selectedNodeId]);

	// Helper function to apply property changes to Supabase database only
	const applyPropertyChangesToSupabase = useCallback(async (newPropertyValues: Record<string, any>) => {
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

				console.log('🔄 Updating properties via Supabase:', changedProperties);

				// Save properties to Supabase database only
				const updatePromises = changedProperties.map(async ({ propertyId, oldValue, newValue }) => {
					console.log(`🔄 Saving property ${propertyId} to Supabase database`);

					// Save to Supabase database for persistence
					try {
						await updatePropertyInSupabase(selectedNodeId, propertyId, newValue);
						console.log(`✅ Property ${propertyId} persisted to Supabase database`);

						return {
							propertyId,
							oldValue,
							newValue,
							success: true
						};
					} catch (supabaseError) {
						console.warn(`⚠️ Failed to persist property ${propertyId} to Supabase:`, supabaseError);
						return {
							propertyId,
							oldValue,
							newValue,
							success: false,
							error: supabaseError
						};
					}
				});

				const results = await Promise.all(updatePromises);
				const successfulUpdates = results.filter(r => r.success);
				const failedUpdates = results.filter(r => !r.success);

				if (successfulUpdates.length > 0) {
					console.log('✅ Successfully saved properties to Supabase:', successfulUpdates);

					// Property changes are now handled via Supabase realtime sync
					// No automatic refresh needed - changes will propagate via realtime events
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

	return (
		<div className="flex-none  border-r border-zinc-700 bg-zinc-900 text-white">
			<div className="px-3 py-2 border-b border-zinc-700">
				<span className="font-medium text-xs truncate max-w-[280px] leading-tight text-zinc-200" title={selectedNode?.title || selectedNodeId}>
					{selectedNode?.title || selectedNodeId}
				</span>
			</div>
			<ScrollArea className="h-[calc(100vh-7rem)] px-3 py-2 [&_[data-radix-scroll-area-thumb]]:bg-zinc-600">
				<div className="space-y-3 pr-2">
				{selectedNode && (
					<>
						{/* Prompt Section */}
						<div>
							<div className="flex items-center justify-between mb-3">
								<div className="text-xs font-medium text-zinc-300">
									Prompt
								</div>
								<button
									className={`px-2 py-1 rounded text-xs font-medium ${
										selectedNode?.state === 'built'
											? 'bg-blue-600 hover:bg-blue-700' 
											: selectedNode?.state === 'building'
											  ? 'bg-yellow-600 hover:bg-yellow-700'
											  : 'bg-orange-600 hover:bg-orange-700'
									} disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200`}
									disabled={selectedNode?.state === 'building'}
									onClick={handleRebuild}
								>{selectedNode?.state === 'building' 
									? 'Building…' 
									: selectedNode?.state === 'built' 
									  ? 'Rebuild' 
									  : 'Build'}</button>
							</div>
							<div className="space-y-1.5">
								<Textarea
									className="w-full h-24 !text-xs bg-zinc-800 border-zinc-700 text-white leading-relaxed focus:border-blue-500/50 focus:ring-blue-500/50"
									value={promptDraft}
									onChange={(e) => setPromptDraft(e.target.value)}
									placeholder="Enter prompt..."
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
								{[...selectedNode.properties].sort((a, b) => a.id.localeCompare(b.id)).map((property: Property, index: number) => (
									<div key={property.id} className={index < (selectedNode.properties?.length || 0) - 1 ? "border-b border-zinc-700/20 pb-1.5 mb-1.5" : ""}>
										<PropertyEditor
											property={{
												...property,
												value: (propertyValues[property.id] ?? property.value)
											}}
											onChange={handlePropertyChange}
											onPreview={handlePropertyPreview}
										/>
									</div>
								))}
							</div>
						)}

						{selectedNode.children?.length > 0 && (
							<div className="border-t border-zinc-700/30 pt-3">
								<div className="text-xs font-medium text-zinc-300 border-b border-zinc-700/30 pb-1 mb-1.5">Children ({selectedNode.children.length})</div>
								<ul className="space-y-0.5">
									{selectedNode.children.map((child: any) => (
										<li key={child.id} className="text-xs text-zinc-400 bg-zinc-800/30 rounded px-2 py-1 border border-zinc-700/20">
											{child.title}
										</li>
									))}
								</ul>
							</div>
						)}
					</>
				)}
				</div>
			</ScrollArea>
		</div>
	);
}


