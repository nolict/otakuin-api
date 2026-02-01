export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}

class Logger {
  private level: LogLevel;

  constructor() {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase() ?? 'INFO';
    this.level = LogLevel[envLevel as keyof typeof LogLevel] ?? LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms.toFixed(0)}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const output = data !== undefined
        ? `[DEBUG] ${message} ${JSON.stringify(data)}`
        : `[DEBUG] ${message}`;
      console.log(output);
    }
  }

  info(message: string): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(`[INFO] ${message}`);
    }
  }

  warn(message: string): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(`[WARN] ${message}`);
    }
  }

  error(message: string, error?: Error): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const output = error !== undefined
        ? `[ERROR] ${message}: ${error.message}`
        : `[ERROR] ${message}`;
      console.error(output);
    }
  }

  perf(message: string, details?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const output = details !== undefined
        ? `[PERF] ${message} ${JSON.stringify(details)}`
        : `[PERF] ${message}`;
      console.log(output);
    } else if (this.shouldLog(LogLevel.INFO)) {
      console.log(`[INFO] ${message}`);
    }
  }

  performance(operation: string, duration: number, details?: Record<string, unknown>): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const formatted = this.formatDuration(duration);
      const output = details !== undefined
        ? `[PERF] ${operation} completed in ${formatted} ${JSON.stringify(details)}`
        : `[PERF] ${operation} completed in ${formatted}`;
      console.log(output);
    } else if (this.shouldLog(LogLevel.INFO)) {
      console.log(`[INFO] ${operation} completed in ${this.formatDuration(duration)}`);
    }
  }

  timer(): PerformanceTimer {
    return new PerformanceTimer(this);
  }
}

class PerformanceTimer {
  private startTime: number;
  private logger: Logger;

  constructor(logger: Logger) {
    this.startTime = performance.now();
    this.logger = logger;
  }

  elapsed(): string {
    const duration = performance.now() - this.startTime;
    return this.formatDuration(duration);
  }

  end(operation: string, details?: Record<string, unknown>): number {
    const duration = performance.now() - this.startTime;
    this.logger.performance(operation, duration, details);
    return duration;
  }

  split(label: string): number {
    const duration = performance.now() - this.startTime;
    this.logger.debug(`${label}: ${this.formatDuration(duration)}`);
    return duration;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms.toFixed(0)}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  }
}

export const logger = new Logger();

export function createTimer(): PerformanceTimer {
  return logger.timer();
}
