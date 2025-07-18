import { create } from 'zustand';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  content?: string;
}

interface ProjectStore {
  files: Map<string, string>;
  currentFile: string | null;
  selectedFile: string | null;
  fileTree: FileNode[];
  selection: { x: number; y: number; width: number; height: number } | null;
  
  loadProjectFromFileSystem: () => Promise<void>;
  setFileContent: (path: string, content: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  createFile: (path: string, content: string) => Promise<void>;
  setCurrentFile: (path: string | null) => void;
  setSelectedFile: (path: string | null) => void;
  setSelection: (selection: { x: number; y: number; width: number; height: number } | null) => void;
  getFileContent: (path: string) => string;
  getAllFiles: () => Map<string, string>;
  buildFileTree: () => void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  files: new Map(),
  currentFile: null,
  selectedFile: null,
  fileTree: [],
  selection: null,

  loadProjectFromFileSystem: async () => {
    try {
      const response = await fetch('/api/files');
      const data = await response.json();
      
      if (response.ok) {
        const files = new Map(Object.entries(data.files as Record<string, string>));
        set({ files, fileTree: data.fileTree });
      } else {
        console.error('Error loading project:', data.error);
      }
    } catch (error) {
      console.error('Error loading project from filesystem:', error);
    }
  },
  
  setFileContent: async (filePath, content) => {
    try {
      const response = await fetch('/api/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, content })
      });
      
      if (response.ok) {
        const files = new Map(get().files);
        files.set(filePath, content);
        set({ files });
      } else {
        const data = await response.json();
        console.error('Error updating file:', data.error);
      }
    } catch (error) {
      console.error('Error writing file:', error);
    }
  },
  
  deleteFile: async (filePath) => {
    try {
      const response = await fetch('/api/files', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath })
      });
      
      if (response.ok) {
        const files = new Map(get().files);
        files.delete(filePath);
        const state = get();
        set({ 
          files,
          currentFile: state.currentFile === filePath ? null : state.currentFile
        });
      } else {
        const data = await response.json();
        console.error('Error deleting file:', data.error);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    }
  },
  
  createFile: async (filePath, content) => {
    try {
      const response = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, content })
      });
      
      if (response.ok) {
        const files = new Map(get().files);
        files.set(filePath, content);
        set({ files });
      } else {
        const data = await response.json();
        console.error('Error creating file:', data.error);
      }
    } catch (error) {
      console.error('Error creating file:', error);
    }
  },
  
  setCurrentFile: (path) => set({ currentFile: path }),
  setSelectedFile: (path) => set({ selectedFile: path }),
  setSelection: (selection) => set({ selection }),
  
  getFileContent: (path) => {
    return get().files.get(path) || '';
  },
  
  getAllFiles: () => {
    return new Map(get().files);
  },
  
  buildFileTree: () => {
    // This will be handled by loadProjectFromFileSystem
  }
})); 