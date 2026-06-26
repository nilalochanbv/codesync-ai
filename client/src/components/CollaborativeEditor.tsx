import { useEffect, useRef, useState } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import { useProjectStore } from '../store/useProjectStore';
import { Users, Save, FileCode, Play, Square } from 'lucide-react';

interface Collaborator {
  socketId: string;
  id: string;
  username: string;
  avatar: string;
  color: string;
}

const colorMap: Record<string, string> = {
  '#a78bfa': 'purple',
  '#22d3ee': 'cyan',
  '#34d399': 'emerald',
  '#fbbf24': 'amber',
  '#f472b6': 'pink',
  '#60a5fa': 'blue',
  '#f87171': 'red',
};

interface CollaborativeEditorProps {
  socket: any;
  debugActiveLine: number | null;
  diagnostics: Array<{ line: number; message: string; severity: 'error' | 'warning' }>;
  isRunning: boolean;
  onRunCode: () => void;
  onStopCode: () => void;
  parentEditorRef?: React.RefObject<any>;
}

export default function CollaborativeEditor({ 
  socket, 
  debugActiveLine, 
  diagnostics,
  isRunning,
  onRunCode,
  onStopCode,
  parentEditorRef
}: CollaborativeEditorProps) {
  const { 
    activeProject, 
    activeFileId, 
    setActiveFileContent,
    breakpoints,
    toggleBreakpoint,
    isLocalWorkspace,
    localFiles,
    unsavedFiles
  } = useProjectStore();

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);
  
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [isTypingLocal, setIsTypingLocal] = useState(false);
  const [codeValue, setCodeValue] = useState('');

  const isRemoteChange = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Track decorations
  const remoteDecorationsMap = useRef<Map<string, string[]>>(new Map());
  const breakpointDecorations = useRef<string[]>([]);
  const debugDecorations = useRef<string[]>([]);

  // Find active file details
  const activeFile = isLocalWorkspace 
    ? localFiles.find(f => f._id === activeFileId)
    : activeProject?.files.find(f => f._id === activeFileId);

  const language = activeFile?.language || 'javascript';

  // Update editor value when active file content changes
  useEffect(() => {
    if (activeFile) {
      setCodeValue(activeFile.content);
      if (editorRef.current) {
        const editor = editorRef.current;
        const model = editor.getModel();
        if (model && model.getValue() !== activeFile.content) {
          isRemoteChange.current = true;
          model.setValue(activeFile.content);
          setTimeout(() => {
            isRemoteChange.current = false;
          }, 50);
        }
      }
    } else {
      setCodeValue('');
    }
  }, [activeFileId, isLocalWorkspace]);

  // Listen to collaborative socket events (cloud workspaces only)
  useEffect(() => {
    if (!socket || !activeProject || isLocalWorkspace) {
      setCollaborators([]);
      return;
    }

    socket.on('room-users', (data: { collaborators: Collaborator[] }) => {
      const others = data.collaborators.filter(c => c.socketId !== socket.id);
      setCollaborators(others);
    });

    socket.on('code-update', (data: { fileId: string; content: string }) => {
      if (data.fileId !== activeFileId) {
        // Just update in activeProject.files list in the store, so it's fresh when opened
        useProjectStore.setState((state) => {
          if (!state.activeProject) return {};
          return {
            activeProject: {
              ...state.activeProject,
              files: state.activeProject.files.map(f => f._id === data.fileId ? { ...f, content: data.content } : f)
            }
          };
        });
        return;
      }

      isRemoteChange.current = true;
      setCodeValue(data.content);

      if (editorRef.current) {
        const editor = editorRef.current;
        const pos = editor.getPosition();
        const model = editor.getModel();
        if (model && model.getValue() !== data.content) {
          model.setValue(data.content);
        }
        if (pos) {
          editor.setPosition(pos);
        }
      }
      
      setTimeout(() => {
        isRemoteChange.current = false;
      }, 50);
    });

    socket.on('typing', (data: { socketId: string; isTyping: boolean }) => {
      setTypingUsers(prev => ({ ...prev, [data.socketId]: data.isTyping }));
    });

    socket.on('cursor-move', (data: { 
      socketId: string; 
      cursor: { lineNumber: number; column: number };
      selection: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null;
    }) => {
      updateRemoteCursor(data.socketId, data.cursor, data.selection);
    });

    socket.on('user-left', (data: { socketId: string; username: string }) => {
      removeRemoteCursor(data.socketId);
      setTypingUsers(prev => {
        const next = { ...prev };
        delete next[data.socketId];
        return next;
      });
    });

    return () => {
      socket.off('room-users');
      socket.off('code-update');
      socket.off('typing');
      socket.off('cursor-move');
      socket.off('user-left');
      clearAllDecorations();
    };
  }, [socket, activeProject, activeFileId, isLocalWorkspace, collaborators]);

  // Breakpoints Rendering
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !activeFileId) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const lines = breakpoints[activeFileId] || [];

    const newDecs = lines.map(line => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: 'monaco-breakpoint-glyph',
        glyphMarginHoverMessage: { value: 'Breakpoint' }
      }
    }));

    breakpointDecorations.current = editor.deltaDecorations(breakpointDecorations.current, newDecs);
  }, [breakpoints, activeFileId]);

  // Debugger Active Line highlighting
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !activeFileId) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;

    const newDecs: any[] = [];
    if (debugActiveLine) {
      newDecs.push({
        range: new monaco.Range(debugActiveLine, 1, debugActiveLine, 1),
        options: {
          isWholeLine: true,
          className: 'monaco-debug-active-line',
          glyphMarginClassName: 'monaco-debug-active-glyph'
        }
      });
    }

    debugDecorations.current = editor.deltaDecorations(debugDecorations.current, newDecs);
    if (debugActiveLine) {
      editor.revealLineInCenter(debugActiveLine);
    }
  }, [debugActiveLine, activeFileId]);

  // Diagnostics Rendering (squiggly lines)
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !activeFileId) return;
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor.getModel();
    if (!model) return;

    if (diagnostics && diagnostics.length > 0) {
      const markers = diagnostics.map(d => ({
        startLineNumber: d.line,
        startColumn: 1,
        endLineNumber: d.line,
        endColumn: model.getLineLength(d.line) + 1,
        message: d.message,
        severity: d.severity === 'warning' ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Error
      }));
      monaco.editor.setModelMarkers(model, 'compiler', markers);
    } else {
      monaco.editor.setModelMarkers(model, 'compiler', []);
    }
  }, [diagnostics, activeFileId]);

  const clearAllDecorations = () => {
    if (!editorRef.current) return;
    const editor = editorRef.current;
    remoteDecorationsMap.current.forEach((decIds) => {
      editor.deltaDecorations(decIds, []);
    });
    remoteDecorationsMap.current.clear();
  };

  const removeRemoteCursor = (socketId: string) => {
    if (!editorRef.current || !remoteDecorationsMap.current.has(socketId)) return;
    const editor = editorRef.current;
    const decIds = remoteDecorationsMap.current.get(socketId)!;
    editor.deltaDecorations(decIds, []);
    remoteDecorationsMap.current.delete(socketId);
  };

  const updateRemoteCursor = (
    socketId: string, 
    cursor: { lineNumber: number; column: number }, 
    selection: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null
  ) => {
    if (!editorRef.current || !monacoRef.current || isLocalWorkspace) return;

    const editor = editorRef.current;
    const monaco = monacoRef.current;

    const collab = collaborators.find(c => c.socketId === socketId);
    if (!collab) return;

    const colorHex = collab.color;
    const colorName = colorMap[colorHex] || 'purple';
    const username = collab.username;

    const newDecs: any[] = [];

    newDecs.push({
      range: new monaco.Range(cursor.lineNumber, cursor.column, cursor.lineNumber, cursor.column),
      options: {
        className: `remote-cursor-bar remote-cursor-${colorName}`,
        after: {
          content: username,
          inlineClassName: `remote-cursor-label remote-cursor-${colorName}`,
        }
      }
    });

    if (selection && (
      selection.startLineNumber !== selection.endLineNumber || 
      selection.startColumn !== selection.endColumn
    )) {
      newDecs.push({
        range: new monaco.Range(
          selection.startLineNumber, 
          selection.startColumn, 
          selection.endLineNumber, 
          selection.endColumn
        ),
        options: {
          className: `remote-selection-${colorName}`,
          isWholeLine: false,
        }
      });
    }

    const oldDecs = remoteDecorationsMap.current.get(socketId) || [];
    const updatedIds = editor.deltaDecorations(oldDecs, newDecs);
    remoteDecorationsMap.current.set(socketId, updatedIds);
  };

  const handleEditorMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    if (parentEditorRef) {
      (parentEditorRef as any).current = editor;
    }

    registerMonacoIntelliSense(monaco);

    editor.focus();

    // Add Ctrl+S keybinding
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      useProjectStore.getState().saveActiveFile(socket);
    });

    // Toggle breakpoint on margin click
    editor.onMouseDown((e: any) => {
      const target = e.target;
      if (target.type === 2 || target.type === 3) { // 2 = GlyphMargin, 3 = LineNumbers
        const line = target.position.lineNumber;
        if (activeFileId) {
          toggleBreakpoint(activeFileId, line);
        }
      }
    });

    // Listen for cursor position updates
    editor.onDidChangeCursorPosition((e: any) => {
      if (!socket || !activeProject || isLocalWorkspace) return;

      const cursor = { lineNumber: e.position.lineNumber, column: e.position.column };
      const selectionObj = editor.getSelection();
      let selection = null;

      if (selectionObj) {
        selection = {
          startLineNumber: selectionObj.startLineNumber,
          startColumn: selectionObj.startColumn,
          endLineNumber: selectionObj.endLineNumber,
          endColumn: selectionObj.endColumn,
        };
      }

      socket.emit('cursor-move', {
        projectId: activeProject._id,
        cursor,
        selection
      });
    });

    // Listen for selection highlights
    editor.onDidChangeCursorSelection((e: any) => {
      if (!socket || !activeProject || isLocalWorkspace) return;

      const cursor = { lineNumber: e.selection.positionLineNumber, column: e.selection.positionColumn };
      const selection = {
        startLineNumber: e.selection.startLineNumber,
        startColumn: e.selection.startColumn,
        endLineNumber: e.selection.endLineNumber,
        endColumn: e.selection.endColumn,
      };

      socket.emit('cursor-move', {
        projectId: activeProject._id,
        cursor,
        selection
      });
    });
  };

  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined || !activeFileId) return;
    
    setCodeValue(value);
    setActiveFileContent(value);

    // Skip emitting if change originated from remote socket broadcast
    if (isRemoteChange.current) return;

    // Broadcast code updates to socket channel
    if (socket && activeProject && !isLocalWorkspace) {
      socket.emit('code-update', {
        projectId: activeProject._id,
        fileId: activeFileId,
        content: value
      });

      // Manage Typing Indicator status
      if (!isTypingLocal) {
        setIsTypingLocal(true);
        socket.emit('typing', { projectId: activeProject._id, isTyping: true });
      }

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        setIsTypingLocal(false);
        if (socket && activeProject) {
          socket.emit('typing', { projectId: activeProject._id, isTyping: false });
        }
      }, 1000);
    }
  };

  const saveManually = async () => {
    await useProjectStore.getState().saveActiveFile(socket);
  };

  if (!activeFileId || !activeFile) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#1e1e1e] border-r border-border text-text-muted">
        <FileCode className="h-16 w-16 text-text-dark mb-4 animate-pulse" />
        <h3 className="text-sm font-bold text-white mb-1">No Active File</h3>
        <p className="text-xs text-text-muted max-w-xs text-center px-4">
          Select a file from the explorer sidebar, or create a new file to start coding.
        </p>
      </div>
    );
  }

  const isUnsaved = unsavedFiles[activeFileId];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1e] border-r border-border">
      {/* Editor subheader toolbar */}
      <div className="border-b border-border bg-[#181818] px-4 py-2 flex items-center justify-between shrink-0 z-10 h-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-xs text-text font-bold font-mono">
              {(activeFile.path || (activeFile as any).name || 'untitled').split('/').pop()}
            </span>
            {isUnsaved && (
              <span className="h-2 w-2 rounded-full bg-primary inline-block" title="Unsaved changes (Ctrl + S)" />
            )}
          </div>

          {/* Active collaborators list */}
          {!isLocalWorkspace && (
            <div className="flex items-center gap-1.5 border-l border-border pl-3">
              <Users className="h-3.5 w-3.5 text-text-dark" />
              {collaborators.length === 0 ? (
                <span className="text-[10px] text-text-dark font-medium italic">Editing alone</span>
              ) : (
                <div className="flex items-center gap-1 ml-1.5">
                  {collaborators.map(c => {
                    const isUserTyping = typingUsers[c.socketId];
                    return (
                      <div 
                        key={c.socketId} 
                        className={`h-5 px-1.5 rounded border text-[9px] font-bold flex items-center gap-1`}
                        style={{ 
                          color: c.color, 
                          backgroundColor: `${c.color}08`, 
                          borderColor: isUserTyping ? c.color : `${c.color}25`
                        }}
                        title={`${c.username}${isUserTyping ? ' is typing...' : ''}`}
                      >
                        <span className={`h-1 w-1 rounded-full bg-current ${isUserTyping ? 'animate-ping' : ''}`} />
                        <span>{c.username}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Panel */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              onClick={onStopCode}
              className="flex items-center gap-1 py-1 px-2.5 rounded bg-red-600 hover:bg-red-700 text-[10px] font-bold text-white transition-all active:scale-95 border border-red-700"
              title="Stop Code"
            >
              <Square className="h-3 w-3 fill-current" />
              Stop
            </button>
          ) : (
            <button
              onClick={onRunCode}
              className="flex items-center gap-1 py-1 px-2.5 rounded bg-primary text-white hover:bg-primary-hover text-[10px] font-bold transition-all active:scale-95 border border-primary/50"
              title="Run Code"
            >
              <Play className="h-3 w-3 fill-current" />
              Run
            </button>
          )}
          <button
            onClick={saveManually}
            disabled={!isUnsaved}
            className={`flex items-center gap-1 py-1 px-2.5 rounded text-[10px] font-bold border transition-all active:scale-95 ${
              isUnsaved 
                ? 'bg-primary/10 border-primary/30 text-primary hover:bg-primary/20' 
                : 'border-border text-text-dark cursor-default'
            }`}
            title="Save file (Ctrl + S)"
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </button>
        </div>
      </div>

      {/* Code Editor Frame */}
      <div className="flex-1 min-h-0 relative">
        <Editor
          height="100%"
          language={language.toLowerCase()}
          theme="vs-dark"
          value={codeValue}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
          options={{
            fontSize: 13,
            fontFamily: 'Fira Code, JetBrains Mono, monospace',
            minimap: { enabled: true },
            lineHeight: 20,
            glyphMargin: true, // required for breakpoints
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            padding: { top: 12, bottom: 12 },
            bracketPairColorization: { enabled: true },
            wordWrap: 'on',
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
              vertical: 'visible',
              horizontal: 'visible'
            }
          }}
        />
      </div>
    </div>
  );
}

function registerMonacoIntelliSense(monaco: Monaco) {
  if ((monaco as any)._intelliSenseRegistered) return;
  (monaco as any)._intelliSenseRegistered = true;

  // 1. JAVA completions (snippets, keywords, autocompletion, auto-imports)
  monaco.languages.registerCompletionItemProvider('java', {
    provideCompletionItems: (model: any, position: any) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      const suggestions = [
        {
          label: 'sysout',
          kind: monaco.languages.CompletionItemKind.Snippet,
          documentation: 'Prints a line of text to standard output (System.out.println)',
          detail: 'System.out.println() snippet',
          insertText: 'System.out.println(${1});',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range
        },
        {
          label: 'sys',
          kind: monaco.languages.CompletionItemKind.Keyword,
          documentation: 'System class',
          detail: 'java.lang.System',
          insertText: 'System',
          range
        },
        {
          label: 'psvm',
          kind: monaco.languages.CompletionItemKind.Snippet,
          documentation: 'Main entry method template',
          detail: 'public static void main method',
          insertText: 'public static void main(String[] args) {\n\t${1}\n}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range
        },
        {
          label: 'Scanner',
          kind: monaco.languages.CompletionItemKind.Class,
          documentation: 'A text scanner primitive parsing system. Auto-imports java.util.Scanner.',
          detail: 'java.util.Scanner',
          insertText: 'Scanner ${1:scanner} = new Scanner(System.in);',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          additionalTextEdits: [{
            range: new monaco.Range(1, 1, 1, 1),
            text: 'import java.util.Scanner;\n'
          }],
          range
        },
        {
          label: 'ArrayList',
          kind: monaco.languages.CompletionItemKind.Class,
          documentation: 'Resizable-array list. Auto-imports java.util.ArrayList.',
          detail: 'java.util.ArrayList',
          insertText: 'ArrayList<${1:String}> ${2:list} = new ArrayList<>();',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          additionalTextEdits: [{
            range: new monaco.Range(1, 1, 1, 1),
            text: 'import java.util.ArrayList;\n'
          }],
          range
        },
        {
          label: 'HashMap',
          kind: monaco.languages.CompletionItemKind.Class,
          documentation: 'Map implementation. Auto-imports java.util.HashMap.',
          detail: 'java.util.HashMap',
          insertText: 'HashMap<${1:String}, ${2:String}> ${3:map} = new HashMap<>();',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          additionalTextEdits: [{
            range: new monaco.Range(1, 1, 1, 1),
            text: 'import java.util.HashMap;\n'
          }],
          range
        },
        ...['public', 'private', 'class', 'static', 'void', 'int', 'double', 'boolean', 'String', 'import', 'package', 'return', 'if', 'else', 'for', 'while', 'new', 'this', 'super'].map(kw => ({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range
        }))
      ];

      return { suggestions };
    }
  });

  // 2. JAVA Hovers
  monaco.languages.registerHoverProvider('java', {
    provideHover: (model: any, position: any) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const docMap: Record<string, string> = {
        'System': 'The `System` class contains several useful class fields and methods. It cannot be instantiated.',
        'Scanner': 'A simple text scanner which can parse primitive types and strings using regular expressions. Typically initialized as `new Scanner(System.in)`.',
        'ArrayList': 'Resizable-array implementation of the `List` interface. Implements all optional list operations, and permits all elements, including null.',
        'HashMap': 'Hash table based implementation of the `Map` interface. Permitting null values and the null key.',
        'sysout': 'Prints a line of text to standard output.'
      };

      if (docMap[word.word]) {
        return {
          contents: [
            { value: `**Java Standard Library**` },
            { value: docMap[word.word] }
          ]
        };
      }
      return null;
    }
  });

  // 3. PYTHON completions
  monaco.languages.registerCompletionItemProvider('python', {
    provideCompletionItems: (model: any, position: any) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };

      const suggestions = [
        {
          label: 'main',
          kind: monaco.languages.CompletionItemKind.Snippet,
          documentation: 'Python script entry main template',
          insertText: 'def main():\n\t${1:pass}\n\nif __name__ == "__main__":\n\tmain()',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range
        },
        ...['def', 'class', 'import', 'from', 'if', 'elif', 'else', 'for', 'while', 'in', 'is', 'not', 'and', 'or', 'return', 'print', 'None', 'True', 'False', 'try', 'except', 'pass'].map(kw => ({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range
        }))
      ];
      return { suggestions };
    }
  });
}
