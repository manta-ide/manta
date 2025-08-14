'use client';

import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/lib/store';
import { useChatService } from '@/lib/chatService';
import PropertyEditor from './property-editors';
import { PropertyCodeService } from '@/lib/propertyCodeService';

export default function SelectedNodeSidebar() {
	const { selectedNodeId, selectedNode, setSelectedNode, loadProject: loadProjectFromFileSystem, triggerRefresh } = useProjectStore();
	const { actions } = useChatService();
	const [promptDraft, setPromptDraft] = useState<string>('');
	const [isRebuilding, setIsRebuilding] = useState(false);
	const [propertyValues, setPropertyValues] = useState<Record<string, any>>({});

  console.log('selectedNode', selectedNode);

	useEffect(() => {
		setPromptDraft(selectedNode?.prompt ?? '');
		// Initialize property values from current code
		if (selectedNode?.properties) {
			const initializeProperties = async () => {
				const initialValues: Record<string, any> = {};
				for (const prop of selectedNode.properties) {
					try {
						const currentValue = await PropertyCodeService.readPropertyValue(prop);
						initialValues[prop.id] = currentValue;
					} catch (error) {
						console.error(`Failed to read property ${prop.id}:`, error);
						initialValues[prop.id] = prop.propertyType.value; // Fallback to default
					}
				}
				setPropertyValues(initialValues);
			};
			initializeProperties();
		}
	}, [selectedNodeId, selectedNode?.prompt, selectedNode?.properties]);

	if (!selectedNodeId) return null;

	const handleRebuild = async () => {
		if (!selectedNodeId) return;
		try {
			setIsRebuilding(true);
			// 1) Save latest prompt before rebuild via new backend storage API
			const previousPrompt = selectedNode?.prompt ?? '';
			const saveRes = await fetch(`/api/backend/storage`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ nodeId: selectedNodeId, prompt: promptDraft })
			});
			if (!saveRes.ok) {
				console.error('Failed to save prompt before rebuild');
				return;
			}
			const saved = await saveRes.json();
			if (saved?.node) {
				setSelectedNode(selectedNodeId, saved.node);
			}

			// 2) Trigger rebuild through chat service (agent-request orchestration)
			await actions.rebuildNode(selectedNodeId, previousPrompt, promptDraft);

			// 3) Ensure freshest filesystem state (chat service already refreshes, this is a best-effort extra)
			try {
				await loadProjectFromFileSystem();
			} catch (e) {
				console.warn('Reload after rebuild failed:', e);
			}
			triggerRefresh();
		} finally {
			setIsRebuilding(false);
		}
	};

	const handlePropertyChange = async (propertyId: string, value: any) => {
		setPropertyValues(prev => ({
			...prev,
			[propertyId]: value
		}));

		// Apply the property change to the code
		if (selectedNode?.properties) {
			try {
				const updates = await PropertyCodeService.applyPropertyChanges(
					selectedNode.properties,
					{ ...propertyValues, [propertyId]: value }
				);

				// Group updates by file and apply them
				const updatesByFile = updates.reduce((acc, update) => {
					if (!acc[update.file]) {
						acc[update.file] = [];
					}
					acc[update.file].push(update);
					return acc;
				}, {} as Record<string, typeof updates>);

				for (const [filePath, fileUpdates] of Object.entries(updatesByFile)) {
					await PropertyCodeService.updateFileContent(filePath, fileUpdates);
				}

				// Trigger refresh to show changes
				triggerRefresh();
			} catch (error) {
				console.error('Failed to apply property change:', error);
			}
		}
	};

	return (
		<div className="w-[420px] min-w-[420px] max-w-[420px] flex-none border-r border-zinc-700 bg-zinc-900 text-white overflow-y-auto overflow-x-hidden">
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
							<div className="flex gap-2">
								<button
									className={`px-3 py-1.5 rounded text-sm bg-blue-600 hover:bg-blue-700`}
									disabled={isRebuilding}
									onClick={handleRebuild}
								>{isRebuilding ? 'Rebuilding…' : 'Rebuild'}</button>
							</div>
						</div>

						{selectedNode.properties && selectedNode.properties.length > 0 && (
							<div className="space-y-4">
								<div className="text-xs uppercase text-zinc-400">Properties</div>
								{selectedNode.properties.map(property => (
									<div key={property.id} className="space-y-2">
										<div className="text-sm font-medium">{property.title}</div>
										<PropertyEditor
											property={{
												...property,
												propertyType: {
													...property.propertyType,
													value: propertyValues[property.id] || property.propertyType.value
												}
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
									{selectedNode.children.map(child => (
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


