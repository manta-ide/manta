'use client';

import React from 'react';
import { useProjectStore } from '@/lib/store';
import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { X } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export default function FileEditor() {
  const { currentFile, getFileContent, setFileContent, setCurrentFile } = useProjectStore();
  const [content, setContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    console.log('📂 File changed:', currentFile);
    if (currentFile) {
      const fileContent = getFileContent(currentFile);
      console.log('📝 File content length:', fileContent.length);
      console.log('📝 File content preview:', fileContent.substring(0, 100) + '...');
      setContent(fileContent);
      setIsEditing(false);
    } else {
      setContent('');
    }
  }, [currentFile, getFileContent]);

  const handleContentChange = (value: string | undefined) => {
    const newContent = value || '';
    setContent(newContent);
    setIsEditing(true);
  };

  const handleSave = () => {
    if (currentFile && isEditing && content.length > 0) {
      setFileContent(currentFile, content);
      setIsEditing(false);
    }
  };

  const handleCloseFile = () => {
    setCurrentFile(null);
  };

  const getFileExtension = (filename: string) => {
    return filename.split('.').pop()?.toLowerCase() || '';
  };

  const getLanguageFromExtension = (filename: string) => {
    const ext = getFileExtension(filename);
    let language = '';
    switch (ext) {
      case 'tsx':
        language = 'typescript';
        break;
      case 'ts':
        language = 'typescript';
        break;
      case 'jsx':
        language = 'javascript'; // JSX files should use javascript, not typescriptreact
        break;
      case 'js':
        language = 'javascript';
        break;
      case 'css':
        language = 'css';
        break;
      case 'json':
        language = 'json';
        break;
      case 'md':
        language = 'markdown';
        break;
      case 'html':
        language = 'html';
        break;
      default:
        language = 'plaintext';
    }
    console.log(`🔍 Language detection for ${filename} (ext: ${ext}) -> ${language}`);
    return language;
  };

  const getFileName = (fullPath: string) => {
    return fullPath.split('/').pop() || fullPath;
  };

  const getPathSegments = (fullPath: string) => {
    const segments = fullPath.split('/');
    return segments.slice(0, -1); // All except the last segment (filename)
  };

  const getFileTypePrefix = (filename: string) => {
    const ext = getFileExtension(filename);
    switch (ext) {
      case 'tsx':
      case 'ts':
        return 'TS';
      case 'jsx':
      case 'js':
        return 'JS';
      case 'css':
        return 'CSS';
      case 'json':
        return 'JSON';
      case 'md':
        return 'MD';
      case 'html':
        return 'HTML';
      default:
        return '';
    }
  };

  if (!currentFile) {
    return (
      <div className="flex items-center justify-center bg-zinc-900 h-full">
        <div className="text-center">
          <p className="text-zinc-400 mb-2">No file selected</p>
          <p className="text-sm text-zinc-500">Choose a file from the file tree to start editing</p>
        </div>
      </div>
    );
  }

  const pathSegments = getPathSegments(currentFile);
  const fileName = getFileName(currentFile);
  const fileTypePrefix = getFileTypePrefix(fileName);

  return (
    <div className="flex flex-col h-full bg-zinc-900 border-l border-zinc-700">
      {/* Tab Area */}
      <div className="bg-zinc-800 border-b border-zinc-700 flex-shrink-0">
        <div className="flex items-center">
          <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border-r border-zinc-700 text-zinc-200 text-sm min-w-0">
            {fileTypePrefix && (
              <span className="text-zinc-400 font-bold text-sm">{fileTypePrefix}</span>
            )}
            <span className="flex items-center gap-1 min-w-0">
              {fileName}
              {isEditing && (
                <span className="text-zinc-400 ml-1 animate-pulse">●</span>
              )}
            </span>
            <button
              onClick={handleCloseFile}
              className="text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 p-1 rounded ml-auto transition-colors duration-150"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center gap-2 ml-auto px-3 py-2">
            {isEditing && (
              <button
                onClick={handleSave}
                className="text-xs bg-zinc-700 text-zinc-200 px-3 py-1.5 rounded hover:bg-zinc-600 font-medium transition-all duration-150"
              >
                Save
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      <div className="bg-zinc-800 border-b border-zinc-700 px-3 py-2 flex-shrink-0">
        <Breadcrumb>
          <BreadcrumbList>
            {pathSegments.map((segment, index) => (
              <div key={index} className="flex items-center">
                <BreadcrumbItem>
                  <BreadcrumbLink href="#" className="text-zinc-400 hover:text-zinc-300 text-sm transition-colors duration-150">
                    {segment}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="text-zinc-500" />
              </div>
            ))}
            <BreadcrumbItem>
              <BreadcrumbPage className="text-zinc-200 text-sm font-medium">
                {fileTypePrefix && <span className="text-zinc-400 font-bold text-sm mr-1">{fileTypePrefix}</span>}
                {fileName}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      
      <div className="flex-1 min-h-0">
        <Editor
          value={content}
          onChange={handleContentChange}
          language={(() => {
            const detectedLanguage = getLanguageFromExtension(currentFile);
            console.log('🎯 Setting editor language to:', detectedLanguage);
            return detectedLanguage;
          })()}
          path={currentFile}
          theme="vs-dark"
          beforeMount={(monaco: any) => {
            console.log('🔧 Monaco beforeMount - setting up models');
            console.log('📄 Current file for beforeMount:', currentFile);
          }}
          options={{
            fontSize: 14,
            lineNumbers: 'on',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'off',
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
            renderWhitespace: 'none',
            folding: true,
            lineDecorationsWidth: 10,
            lineNumbersMinChars: 3,
            glyphMargin: false,
            contextmenu: true,
            selectOnLineNumbers: true,
            roundedSelection: false,
            readOnly: false,
            cursorStyle: 'line',
            cursorWidth: 2,
            cursorBlinking: 'blink',
            renderLineHighlight: 'line',
            smoothScrolling: true,
            scrollbar: {
              vertical: 'auto',
              horizontal: 'auto',
              useShadows: false,
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
            // Disable error markers for cleaner look
            'semanticHighlighting.enabled': true,
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            acceptSuggestionOnEnter: 'on',
            acceptSuggestionOnCommitCharacter: true,
            snippetSuggestions: 'inline',
            wordBasedSuggestions: "currentDocument",
            formatOnType: true,
            formatOnPaste: true,
          }}
          onMount={(editor: any, monaco: any) => {
            console.log('🚀 Monaco editor mounted');
            console.log('📄 Current file:', currentFile);
            console.log('🔧 Monaco object:', monaco);
            
            // Add Ctrl+S shortcut
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
              handleSave();
            });
            
            // Get current language
            const model = editor.getModel();
            const currentLanguage = model?.getLanguageId();
            console.log('🗣️ Current language ID:', currentLanguage);
            console.log('🔗 Model URI:', model?.uri?.toString());
            
            // Configure TypeScript compiler options for JSX
            const tsOptions = {
              target: monaco.languages.typescript.ScriptTarget.Latest,
              allowNonTsExtensions: true,
              moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
              module: monaco.languages.typescript.ModuleKind.ESNext,
              noEmit: true,
              esModuleInterop: true,
              jsx: monaco.languages.typescript.JsxEmit.ReactJSX, // Changed from React to ReactJSX
              jsxFactory: 'React.createElement',
              jsxFragmentFactory: 'React.Fragment',
              allowJs: true,
              typeRoots: ['node_modules/@types'],
              skipLibCheck: true,
              allowSyntheticDefaultImports: true,
              strict: false,
              declaration: false,
              removeComments: false,
              lib: ['ES2020', 'DOM', 'DOM.Iterable']
            };
            
            console.log('⚙️ Applying TypeScript options:', tsOptions);
            
            try {
              // Apply settings to both TypeScript and TypeScript React
              monaco.languages.typescript.typescriptDefaults.setCompilerOptions(tsOptions);
              monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                noSemanticValidation: false,
                noSyntaxValidation: false,
                noSuggestionDiagnostics: false
              });
              console.log('✅ TypeScript configuration applied successfully');
            } catch (error) {
              console.error('❌ Error applying TypeScript configuration:', error);
            }

            // Add React types and JSX global types
            const reactTypes = `
              declare module 'react' {
                export = React;
                export as namespace React;
                declare namespace React {
                  type ReactElement = any;
                  type ReactNode = any;
                  type ComponentType<P = {}> = any;
                  function createElement(type: any, props?: any, ...children: any[]): ReactElement;
                  const Fragment: ComponentType<{}>;
                  function useState<T>(initialState: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void];
                  function useEffect(effect: () => void | (() => void), deps?: any[]): void;
                }
              }
              
              declare global {
                namespace JSX {
                  interface Element extends React.ReactElement<any, any> { }
                  interface ElementClass extends React.Component<any> {
                    render(): React.ReactNode;
                  }
                  interface ElementAttributesProperty { props: {}; }
                  interface ElementChildrenAttribute { children: {}; }
                  interface IntrinsicElements {
                    [elemName: string]: any;
                  }
                }
              }
            `;
            
            try {
              monaco.languages.typescript.typescriptDefaults.addExtraLib(
                reactTypes,
                'file:///node_modules/@types/react/index.d.ts'
              );
              console.log('✅ React types added successfully');
            } catch (error) {
              console.error('❌ Error adding React types:', error);
            }

            // Add jsx-runtime types
            const jsxRuntimeTypes = `
              declare module 'react/jsx-runtime' {
                export function jsx(type: any, props: any, key?: any): any;
                export function jsxs(type: any, props: any, key?: any): any;
                export { jsx as jsxDEV };
                export { jsxs as jsxsDEV };
                export const Fragment: any;
              }
            `;

            try {
              monaco.languages.typescript.typescriptDefaults.addExtraLib(
                jsxRuntimeTypes,
                'file:///node_modules/@types/react/jsx-runtime.d.ts'
              );
              console.log('✅ JSX runtime types added successfully');
            } catch (error) {
              console.error('❌ Error adding JSX runtime types:', error);
            }
            
            // Log available languages
            console.log('🌍 Available languages:', monaco.languages.getLanguages().map((l: any) => l.id));
          }}
        />
      </div>
    </div>
  );
} 