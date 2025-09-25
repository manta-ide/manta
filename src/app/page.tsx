'use client';

import { useState, useEffect } from 'react';
import FloatingChat from "@/components/FloatingChat";
import GraphView from "@/components/GraphView";
import SelectedNodeSidebar from "@/components/SelectedNodeSidebar";
import TopBar from "@/components/TopBar";
import WelcomeScreen from "@/components/WelcomeScreen";
import { useProjectStore } from "@/lib/store";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

export default function Home() {
  const [panels, setPanels] = useState({
    files: false,
    graph: true,
  });
  const [panelsLoaded, setPanelsLoaded] = useState(false);

  const [isEditMode, setIsEditMode] = useState(true);
  const [projectExistsState, setProjectExistsState] = useState<boolean | null>(null);
  const [hasNextJsProjectState, setHasNextJsProjectState] = useState<boolean | null>(null);
  const [needsPartialTemplateState, setNeedsPartialTemplateState] = useState<boolean | null>(null);
  const [isInstallingTemplate, setIsInstallingTemplate] = useState(false);

  const { loadProject: loadProjectFromFileSystem } = useProjectStore();

  // Check if project exists on mount and auto-install partial template if needed
  useEffect(() => {
    const checkProjectStatus = async () => {
      try {
        const response = await fetch('/api/project-status');
        if (response.ok) {
          const data = await response.json();
          setProjectExistsState(data.projectExists);
          setHasNextJsProjectState(data.hasNextJsProject);
          setNeedsPartialTemplateState(data.needsPartialTemplate);

          console.log('🏗️ Project exists:', data.projectExists);
          console.log('🔧 Has Next.js project:', data.hasNextJsProject);
          console.log('📦 Needs partial template:', data.needsPartialTemplate);

          // Auto-install partial template if needed
          if (data.needsPartialTemplate) {
            console.log('🚀 Auto-installing partial template...');
            await handleInstallTemplate('partial');
          } else if (data.projectExists) {
            // If project exists but doesn't need partial template, still regenerate agents
            console.log('🤖 Regenerating agents for existing project...');
            await generateAgents();
          }
        } else {
          console.warn('Failed to check project status:', response.status);
          setProjectExistsState(null);
          setHasNextJsProjectState(null);
          setNeedsPartialTemplateState(null);
        }
      } catch (error) {
        console.error('Error checking project status:', error);
        setProjectExistsState(null);
        setHasNextJsProjectState(null);
        setNeedsPartialTemplateState(null);
      }
    };

    checkProjectStatus();
  }, []);

  // Generate agents for existing project
  const generateAgents = async () => {
    try {
      console.log('🤖 Generating agents...');
      const agentResponse = await fetch('/api/project-status', {
        method: 'POST'
      });

      if (agentResponse.ok) {
        console.log('🤖 Agents generated successfully');
      } else {
        console.warn('⚠️ Failed to generate agents');
      }
    } catch (error) {
      console.error('Failed to generate agents:', error);
    }
  };

  // Handle installing template from branch
  const handleInstallTemplate = async (branch: string) => {
    console.log(`📦 Installing template from branch: ${branch}`);
    setIsInstallingTemplate(true);
    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateBranch: branch
        })
      });

      if (!response.ok) {
        throw new Error('Failed to install template');
      }

      const data = await response.json();
      console.log('✅ Template installed, now generating agents...');

      // Generate dynamic agents based on project structure
      await generateAgents();

      // Check if project now exists (since templates add graph files)
      const projectCheckResponse = await fetch('/api/project-status');
      if (projectCheckResponse.ok) {
        const projectData = await projectCheckResponse.json();
        setProjectExistsState(projectData.projectExists);
        setHasNextJsProjectState(projectData.hasNextJsProject);
        setNeedsPartialTemplateState(projectData.needsPartialTemplate);
      }
    } catch (error) {
      console.error('Failed to install template:', error);
    } finally {
      setIsInstallingTemplate(false);
    }
  };

  // Load project on mount
  useEffect(() => {
    console.log('🚀 Loading project');
    loadProjectFromFileSystem();
  }, [loadProjectFromFileSystem]);

  // Restore panel layout from localStorage
  useEffect(() => {
    if (panelsLoaded) return;
    try {
      const key = 'manta.panels';
      const raw = typeof window !== 'undefined' ? localStorage.getItem(key) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        const next = {
          files: typeof parsed?.files === 'boolean' ? parsed.files : panels.files,
          graph: typeof parsed?.graph === 'boolean' ? parsed.graph : panels.graph,
        };
        setPanels(next);
      }
    } catch (e) {
      console.warn('Failed to restore panel layout:', e);
    } finally {
      setPanelsLoaded(true);
    }
  }, [panelsLoaded, panels.files, panels.graph]);

  // Persist panel layout on change
  useEffect(() => {
    try {
      const key = 'manta.panels';
      if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(panels));
      }
    } catch (e) {
      console.warn('Failed to persist panel layout:', e);
    }
  }, [panels]);

  // Set root node as selected on mount - DISABLED to prevent auto-selection
  // useEffect(() => {
  //   const setRootNodeAsSelected = async () => {
  //     try {
  //       // Get the graph data from store
  //       const { graph } = useProjectStore.getState();
  //
  //       if (graph && graph.nodes.length > 0) {
  //         const rootNode = graph.nodes[0]; // First node is the root
  //         setSelectedNode(rootNode.id);
  //       }
  //     } catch (error) {
  //       console.error('Failed to set root node as selected:', error);
  //     }
  //   };

  //   // Wait a bit for the project to load, then set root node
  //   const timer = setTimeout(setRootNodeAsSelected, 1000);
  //   return () => clearTimeout(timer);
  // }, [setSelectedNode]);

  const togglePanel = (panel: keyof typeof panels) => {
    setPanels(prev => ({
      ...prev,
      [panel]: !prev[panel]
    }));
  };
  const hasSelected = true; // Sidebar always visible now

  // inner group (viewer + graph) requires min 30 each when present
  const mainMin = (panels.graph ? 30 : 0) || 0;

  // choose sane outer defaults that sum to <= 100
  const leftDefaults = (panels.files ? 15 : 0) + (hasSelected ? 20 : 0);

  const mainDefault = Math.max(
    mainMin,
    100 - leftDefaults
  );

  // Adjust panel sizes when SelectedNodeSidebar is visible
  // const selectedPanelSize = hasSelected ? 20 : 0;

  // Show welcome screen if no project exists
  if (projectExistsState === false) {
    return (
      <WelcomeScreen
        onInstallTemplate={handleInstallTemplate}
        isLoading={isInstallingTemplate}
      />
    );
  }

  // Show loading state while checking project existence
  if (projectExistsState === null || hasNextJsProjectState === null || needsPartialTemplateState === null) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Show loading state while auto-installing partial template
  if (needsPartialTemplateState && isInstallingTemplate) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-white text-xl">Setting up your project...</div>
          <div className="text-zinc-400 text-sm">Adding sample components and graphs to your existing Next.js project</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-900">
      <TopBar panels={panels} onTogglePanel={togglePanel} isEditMode={isEditMode} setIsEditMode={setIsEditMode} />
      
      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1"
      >
        {panels.files && null}


        <>
          <ResizablePanel defaultSize={16} minSize={15.5}>
            <div className="h-full border-r border-zinc-700">
              <SelectedNodeSidebar />
            </div>
          </ResizablePanel>
          <ResizableHandle className="bg-zinc-600 hover:bg-zinc-500 transition-colors" />
        </>

        {/* Main Content Area - outer main uses computed min/default */}
        <ResizablePanel minSize={mainMin} defaultSize={mainDefault}>
          <ResizablePanelGroup direction="horizontal">
            {panels.graph && (
              <ResizablePanel defaultSize={100} minSize={30}>
                <div className="h-full bg-zinc-900">
                  <GraphView />
                </div>
              </ResizablePanel>
            )}
          </ResizablePanelGroup>
        </ResizablePanel>

        
        
      </ResizablePanelGroup>
      
      {/* Floating Chat */}
      <FloatingChat />
      
    </div>
  );
}
