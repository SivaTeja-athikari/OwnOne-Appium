import { resolve as pathResolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';

const EXTENSIONS = ['.ts', '.tsx', '.js', '/index.ts', '/index.js'];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd();
    const parentDir = dirname(parentPath);
    const resolvedPath = pathResolve(parentDir, specifier);

    if (existsSync(resolvedPath)) {
      return nextResolve(specifier, context);
    }

    for (const ext of EXTENSIONS) {
      const candidate = resolvedPath + ext;
      if (existsSync(candidate)) {
        return {
          shortCircuit: true,
          url: pathToFileURL(candidate).href,
        };
      }
    }
  }

  // Handle alias @/*
  if (specifier.startsWith('@/')) {
    const target = specifier.replace(/^@\//, './src/');
    const resolvedPath = pathResolve(process.cwd(), target);
    for (const ext of ['', ...EXTENSIONS]) {
      const candidate = resolvedPath + ext;
      if (existsSync(candidate)) {
        return {
          shortCircuit: true,
          url: pathToFileURL(candidate).href,
        };
      }
    }
  }

  return nextResolve(specifier, context);
}
