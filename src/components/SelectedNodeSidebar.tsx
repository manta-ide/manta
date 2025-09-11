'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useProjectStore } from '@/lib/store';
import { useChatService } from '@/lib/chatService';
import PropertyEditor from './property-editors';
import { Property } from '@/app/api/lib/schemas';
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from '@/lib/auth-context';
import { postVarsUpdate } from '@/lib/child-bridge';

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
		updatePropertyLocal,
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

		const handlePropertyPreview = useCallback((propertyId: string, value: any) => {
			// Lightweight preview: update local state and in-memory graph without saving
			setPropertyValues(prev => ({ ...prev, [propertyId]: value }));
			if (selectedNodeId) {
				updatePropertyLocal(selectedNodeId, propertyId, value);
				postVarsUpdate({ [propertyId]: value });
			}
		}, [selectedNodeId, updatePropertyLocal]);

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

	const handlePropertyChange = useCallback((propertyId: string, value: any) => {
		// Update local state immediately for responsive UI
    const propMeta = selectedNode?.properties?.find(p => p.id === propertyId);
    // Only treat truly high-frequency primitives as high-frequency; complex objects should re-render immediately
    const isHighFrequency = ['color','number','slider'].includes((propMeta?.type as any) || '');

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

		// Immediately update in-memory graph so UI/preview can reflect changes
			if (selectedNodeId) {
				updatePropertyLocal(selectedNodeId, propertyId, value);
				postVarsUpdate({ [propertyId]: value });
			}

    // For high-frequency props (e.g., color), opportunistically persist faster (throttled)
    if (isHighFrequency && selectedNodeId) {
      const now = Date.now();
      const last = lastPropertyUpdate.current[propertyId] || 0;
      if (now - last >= 120) {
        lastPropertyUpdate.current[propertyId] = now;
        updatePropertyInSupabase(selectedNodeId, propertyId, value).catch(() => {});
      }
    }

    // Debounced file save via backend API (writes _graph/vars.json)
		const nextValues = isHighFrequency ? { ...stagedPropertyValuesRef.current, [propertyId]: value } : { ...propertyValues, [propertyId]: value };
		if (DEBOUNCE_PROPERTY_CHANGES) {
			if (propertyChangeTimeoutRef.current) clearTimeout(propertyChangeTimeoutRef.current);
			propertyChangeTimeoutRef.current = setTimeout(() => {
				// Persist the latest staged values for all changed properties
				applyPropertyChangesToSupabase(nextValues);
			}, 250);
		} else {
			if (selectedNodeId) updatePropertyInSupabase(selectedNodeId, propertyId, value);
		}
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

		// (preview handler defined above)

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
												value: (propertyValues[property.id] !== undefined ? propertyValues[property.id] : property.value)
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
