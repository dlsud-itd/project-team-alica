import { Injectable, signal } from '@angular/core';

export type DiagnosticCategory = 'camera' | 'torch' | 'debounce' | 'routing' | 'api' | 'station';

export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ScannerDiagnosticEntry {
  id: string;
  timestamp: string;
  level: DiagnosticLevel;
  category: DiagnosticCategory;
  message: string;
  context?: Record<string, unknown>;
}

const MAX_LOG_ENTRIES = 60;

@Injectable({ providedIn: 'root' })
export class ScannerDiagnosticsService {
  private readonly entriesState = signal<ScannerDiagnosticEntry[]>([]);
  readonly entries = this.entriesState.asReadonly();

  log(
    level: DiagnosticLevel,
    category: DiagnosticCategory,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    const entry: ScannerDiagnosticEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      ...(context ? { context } : {}),
    };

    this.entriesState.update((prev) => [entry, ...prev].slice(0, MAX_LOG_ENTRIES));

    const tag = `[Scanner:${category}] ${message}`;
    if (level === 'error') {
      console.error(tag, context ?? '');
    } else if (level === 'warn') {
      console.warn(tag, context ?? '');
    } else if (level === 'debug') {
      console.debug(tag, context ?? '');
    } else {
      console.info(tag, context ?? '');
    }
  }

  info(category: DiagnosticCategory, message: string, context?: Record<string, unknown>): void {
    this.log('info', category, message, context);
  }

  warn(category: DiagnosticCategory, message: string, context?: Record<string, unknown>): void {
    this.log('warn', category, message, context);
  }

  error(category: DiagnosticCategory, message: string, context?: Record<string, unknown>): void {
    this.log('error', category, message, context);
  }

  debug(category: DiagnosticCategory, message: string, context?: Record<string, unknown>): void {
    this.log('debug', category, message, context);
  }

  clear(): void {
    this.entriesState.set([]);
  }
}
