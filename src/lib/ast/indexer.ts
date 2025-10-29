import path from 'path';
import fs from 'fs';
import fg from 'fast-glob';
import { Project, ScriptTarget, SyntaxKind } from 'ts-morph';

export type AstSymbol = {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'enum' | 'type' | 'variable' | 'export' | 'import';
  loc?: { line: number; column: number };
};

export type AstIndexEntry = {
  file: string;
  language: 'ts' | 'tsx' | 'js' | 'jsx';
  symbols: AstSymbol[];
  exports: string[];
  imports: Array<{ from: string; names: string[] }>;
};

export type AstIndex = {
  root: string;
  files: AstIndexEntry[];
};

function detectLang(file: string): AstIndexEntry['language'] {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.ts') return 'ts';
  if (ext === '.tsx') return 'tsx';
  if (ext === '.jsx') return 'jsx';
  return 'js';
}

export async function indexDirectory(dir: string, include: string[] = ['**/*.{ts,tsx,js,jsx}'], exclude: string[] = ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/build/**']): Promise<AstIndex> {
  const root = path.resolve(dir);
  const patterns = include.length > 0 ? include : ['**/*.{ts,tsx,js,jsx}'];
  const files = await fg(patterns, { cwd: root, ignore: exclude, dot: false, onlyFiles: true, absolute: false });

  const project = new Project({
    compilerOptions: { target: ScriptTarget.ES2020, allowJs: true, skipLibCheck: true, jsx: 1 },
    useInMemoryFileSystem: false,
  });

  const entries: AstIndexEntry[] = [];

  for (const rel of files) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const sourceFile = project.addSourceFileAtPath(abs);
    const symbols: AstSymbol[] = [];
    const exports: string[] = [];
    const imports: Array<{ from: string; names: string[] }> = [];

    // Collect imports
    sourceFile.getImportDeclarations().forEach((imp) => {
      const from = imp.getModuleSpecifierValue();
      const names = imp.getNamedImports().map(n => n.getName());
      if (imp.getDefaultImport()) names.unshift('default');
      imports.push({ from, names });
    });

    // Collect exports
    sourceFile.getExportedDeclarations().forEach((decls, name) => {
      exports.push(String(name));
      decls.forEach(d => {
        const node = d.getFirstChild() || d;
        const kind = node.getKind();
        const pos = node.getStartLinePos ? node.getStartLinePos() : undefined;
        const line = node.getStartLineNumber ? node.getStartLineNumber() : undefined;
        const column = node.getNonWhitespaceStart ? node.getNonWhitespaceStart() : undefined;
        const mappedKind = mapKind(kind);
        if (mappedKind) {
          symbols.push({ name: String(name), kind: mappedKind, loc: line ? { line, column: (column ?? 0) } : undefined });
        }
      });
    });

    // Collect top-level declarations
    sourceFile.forEachChild((child) => {
      const kind = child.getKind();
      const name = (child as any).getName?.() || SyntaxKind[kind] || 'anonymous';
      const line = (child as any).getStartLineNumber?.();
      const column = (child as any).getNonWhitespaceStart?.();
      const mapped = mapKind(kind);
      if (mapped) {
        symbols.push({ name: String(name), kind: mapped, loc: line ? { line, column: (column ?? 0) } : undefined });
      }
    });

    entries.push({ file: rel.replace(/\\/g, '/'), language: detectLang(rel), symbols, exports: Array.from(new Set(exports)), imports });
  }

  return { root, files: entries };
}

function mapKind(kind: SyntaxKind): AstSymbol['kind'] | undefined {
  switch (kind) {
    case SyntaxKind.FunctionDeclaration:
      return 'function';
    case SyntaxKind.ClassDeclaration:
      return 'class';
    case SyntaxKind.InterfaceDeclaration:
      return 'interface';
    case SyntaxKind.EnumDeclaration:
      return 'enum';
    case SyntaxKind.TypeAliasDeclaration:
      return 'type';
    case SyntaxKind.VariableStatement:
      return 'variable';
    case SyntaxKind.ExportDeclaration:
    case SyntaxKind.ExportAssignment:
      return 'export';
    case SyntaxKind.ImportDeclaration:
      return 'import';
    default:
      return undefined;
  }
}

