import { DiffExtraction } from "../types/recap-data.js";
import * as path from "path";

/**
 * Extract structured information from a diff string
 */
export function extractDiffInfo(diff: string): DiffExtraction {
  const filesChanged = extractFilesChanged(diff);
  const fileTypes = extractFileTypes(filesChanged);

  // Only parse added lines (lines starting with +)
  const addedLines = diff
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1)); // Remove the + prefix

  return {
    filesChanged,
    fileTypes,
    functionsAdded: extractFunctionsAdded(addedLines, fileTypes),
    classesAdded: extractClassesAdded(addedLines, fileTypes),
    importsAdded: extractImportsAdded(addedLines),
    hasTests: detectTests(filesChanged),
    hasConfig: detectConfig(filesChanged),
    hasMigration: detectMigration(filesChanged),
    hasAPI: detectAPI(filesChanged, addedLines),
  };
}

/**
 * Extract file paths from diff headers
 */
function extractFilesChanged(diff: string): string[] {
  const files: string[] = [];
  const regex = /^diff --git a\/(.+?) b\//gm;
  let match;
  while ((match = regex.exec(diff)) !== null) {
    files.push(match[1]);
  }
  return files;
}

/**
 * Extract unique file extensions
 */
function extractFileTypes(files: string[]): string[] {
  const types = new Set<string>();
  for (const file of files) {
    const ext = path.extname(file);
    if (ext) {
      types.add(ext);
    }
  }
  return Array.from(types);
}

/**
 * Extract function names from added lines
 */
function extractFunctionsAdded(addedLines: string[], fileTypes: string[]): string[] {
  const functions: string[] = [];

  // Language-specific patterns
  const patterns: RegExp[] = [];

  // TypeScript/JavaScript
  if (fileTypes.some((t) => [".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(t))) {
    patterns.push(
      /(?:function|async function)\s+(\w+)\s*\(/g, // function foo()
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g, // const foo = () =>
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?function/g, // const foo = function
      /(\w+)\s*\([^)]*\)\s*{/g // method definition in class
    );
  }

  // Java
  if (fileTypes.some((t) => [".java"].includes(t))) {
    patterns.push(
      /(?:public|private|protected)?\s*(?:static)?\s*\w+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+\w+)?\s*\{/g
    );
  }

  // Python
  if (fileTypes.some((t) => [".py"].includes(t))) {
    patterns.push(
      /def\s+(\w+)\s*\(/g, // def foo()
      /async\s+def\s+(\w+)\s*\(/g // async def foo()
    );
  }

  // Go
  if (fileTypes.some((t) => [".go"].includes(t))) {
    patterns.push(/func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/g);
  }

  // Rust
  if (fileTypes.some((t) => [".rs"].includes(t))) {
    patterns.push(/fn\s+(\w+)\s*[<(]/g);
  }

  for (const line of addedLines) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0; // Reset regex state
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const name = match[1];
        // Filter out common false positives
        if (name && !["if", "for", "while", "switch", "catch", "return"].includes(name)) {
          functions.push(name);
        }
      }
    }
  }

  // Deduplicate and limit
  return [...new Set(functions)].slice(0, 20);
}

/**
 * Extract class/interface names from added lines
 */
function extractClassesAdded(addedLines: string[], fileTypes: string[]): string[] {
  const classes: string[] = [];

  const patterns: RegExp[] = [];

  // TypeScript/JavaScript
  if (fileTypes.some((t) => [".ts", ".tsx", ".js", ".jsx", ".mjs"].includes(t))) {
    patterns.push(/class\s+(\w+)/g, /interface\s+(\w+)/g, /type\s+(\w+)\s*=/g, /enum\s+(\w+)/g);
  }

  // Java
  if (fileTypes.some((t) => [".java"].includes(t))) {
    patterns.push(/class\s+(\w+)/g, /interface\s+(\w+)/g, /enum\s+(\w+)/g, /@interface\s+(\w+)/g);
  }

  // Python
  if (fileTypes.some((t) => [".py"].includes(t))) {
    patterns.push(/class\s+(\w+)/g);
  }

  // Go (structs)
  if (fileTypes.some((t) => [".go"].includes(t))) {
    patterns.push(/type\s+(\w+)\s+struct/g, /type\s+(\w+)\s+interface/g);
  }

  // Rust
  if (fileTypes.some((t) => [".rs"].includes(t))) {
    patterns.push(/struct\s+(\w+)/g, /enum\s+(\w+)/g, /trait\s+(\w+)/g, /impl\s+(\w+)/g);
  }

  for (const line of addedLines) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        if (match[1]) {
          classes.push(match[1]);
        }
      }
    }
  }

  return [...new Set(classes)].slice(0, 10);
}

/**
 * Extract import statements from added lines
 */
function extractImportsAdded(addedLines: string[]): string[] {
  const imports: string[] = [];

  const patterns = [
    /import\s+.*?from\s+['"]([^'"]+)['"]/g, // ES6 imports
    /import\s+['"]([^'"]+)['"]/g, // import "module"
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // CommonJS
    /from\s+(\w+)\s+import/g, // Python
    /import\s+(\w+(?:\.\w+)*)/g, // Java
  ];

  for (const line of addedLines) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        if (match[1]) {
          imports.push(match[1]);
        }
      }
    }
  }

  return [...new Set(imports)].slice(0, 15);
}

/**
 * Detect if test files are modified
 */
function detectTests(files: string[]): boolean {
  const testPatterns = [
    /test/i,
    /spec/i,
    /__tests__/i,
    /\.test\./i,
    /\.spec\./i,
    /Test\.java$/,
    /Tests\.java$/,
  ];
  return files.some((f) => testPatterns.some((p) => p.test(f)));
}

/**
 * Detect if config files are modified
 */
function detectConfig(files: string[]): boolean {
  const configPatterns = [
    /package\.json$/,
    /tsconfig\.json$/,
    /\.yml$/,
    /\.yaml$/,
    /\.env/,
    /config\./i,
    /\.eslintrc/,
    /\.prettierrc/,
    /pom\.xml$/,
    /build\.gradle$/,
    /Cargo\.toml$/,
    /go\.mod$/,
    /requirements\.txt$/,
    /Dockerfile$/,
    /docker-compose/,
  ];
  return files.some((f) => configPatterns.some((p) => p.test(f)));
}

/**
 * Detect if migration files are modified
 */
function detectMigration(files: string[]): boolean {
  const migrationPatterns = [
    /migration/i,
    /migrate/i,
    /flyway/i,
    /liquibase/i,
    /schema/i,
    /db\/.*\.sql$/i,
  ];
  return files.some((f) => migrationPatterns.some((p) => p.test(f)));
}

/**
 * Detect if API-related files are modified
 */
function detectAPI(files: string[], addedLines: string[]): boolean {
  const apiFilePatterns = [
    /route/i,
    /controller/i,
    /endpoint/i,
    /handler/i,
    /api\//i,
    /rest\//i,
    /graphql/i,
  ];

  const apiCodePatterns = [
    /@(Get|Post|Put|Delete|Patch|RequestMapping)/i, // Java Spring
    /app\.(get|post|put|delete|patch)\s*\(/i, // Express
    /@app\.(get|post|put|delete|patch)/i, // FastAPI/Flask
    /router\.(get|post|put|delete|patch)\s*\(/i, // Various routers
  ];

  const hasApiFile = files.some((f) => apiFilePatterns.some((p) => p.test(f)));
  const hasApiCode = addedLines.some((line) => apiCodePatterns.some((p) => p.test(line)));

  return hasApiFile || hasApiCode;
}

/**
 * Format diff extraction for display in prompts
 */
export function formatDiffExtraction(extraction: DiffExtraction): string {
  const parts: string[] = [];

  if (extraction.filesChanged.length > 0) {
    parts.push(`Files: ${extraction.filesChanged.slice(0, 5).join(", ")}`);
  }

  const added: string[] = [];
  if (extraction.classesAdded.length > 0) {
    added.push(`class ${extraction.classesAdded.join(", ")}`);
  }
  if (extraction.functionsAdded.length > 0) {
    added.push(`function ${extraction.functionsAdded.slice(0, 5).join(", ")}`);
  }
  if (added.length > 0) {
    parts.push(`Added: ${added.join("; ")}`);
  }

  const patterns: string[] = [];
  if (extraction.hasTests) patterns.push("hasTests");
  if (extraction.hasConfig) patterns.push("hasConfig");
  if (extraction.hasMigration) patterns.push("hasMigration");
  if (extraction.hasAPI) patterns.push("hasAPI");
  if (patterns.length > 0) {
    parts.push(`Patterns: ${patterns.join(", ")}`);
  }

  return parts.join("\n  ");
}
