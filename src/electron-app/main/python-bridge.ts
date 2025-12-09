/**
 * Python Bridge Module
 *
 * Provides a TypeScript interface to call the Python pipeline as a subprocess.
 * Handles process spawning, data serialization, error handling, and result parsing.
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

/**
 * Result from Python pipeline operations
 */
export interface PythonResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  stderr?: string;
}

/**
 * Payment matching results from Python pipeline
 */
export interface PaymentMatchResult {
  payment_id: string;
  invoice_number: string;
  confidence: number;
  match_reason: string;
  amount: number;
  payment_date: string;
  invoice_date: string;
}

/**
 * Invoice generation results from Python pipeline
 */
export interface InvoiceGenerationResult {
  invoice_number: string;
  customer_id: string;
  date: string;
  line_items: Array<{
    service: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  total: number;
}

/**
 * Configuration for Python bridge
 */
interface PythonBridgeConfig {
  pythonPath?: string;
  pipelinePath?: string;
  timeout?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<PythonBridgeConfig> = {
  pythonPath: 'python3',
  pipelinePath: path.join(__dirname, '../../../python_pipeline'),
  timeout: 60000, // 60 seconds
};

/**
 * Main Python Bridge class
 */
export class PythonBridge {
  private config: Required<PythonBridgeConfig>;

  constructor(config: PythonBridgeConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a Python pipeline command
   *
   * @param command - The medspa command to run (e.g., 'match', 'generate-invoices')
   * @param args - Command arguments
   * @param options - Additional options
   */
  private async executePipeline(
    command: string,
    args: string[] = [],
    options: { stdin?: string } = {}
  ): Promise<PythonResult> {
    return new Promise((resolve, reject) => {
      // Build the command: python -m medspa_pipeline.cli <command> <args>
      const pythonArgs = [
        '-m',
        'medspa_pipeline.cli',
        command,
        ...args,
      ];

      const proc = spawn(this.config.pythonPath, pythonArgs, {
        cwd: this.config.pipelinePath,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Send stdin if provided
      if (options.stdin) {
        proc.stdin.write(options.stdin);
        proc.stdin.end();
      }

      // Set timeout
      const timeout = setTimeout(() => {
        proc.kill();
        reject(new Error(`Python pipeline timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      proc.on('close', (code) => {
        clearTimeout(timeout);

        if (code === 0) {
          // Try to parse JSON output
          try {
            const data = JSON.parse(stdout);
            resolve({
              success: true,
              data,
              stderr: stderr || undefined,
            });
          } catch (e) {
            // If not JSON, return raw stdout
            resolve({
              success: true,
              data: stdout,
              stderr: stderr || undefined,
            });
          }
        } else {
          resolve({
            success: false,
            error: `Python process exited with code ${code}`,
            stderr: stderr || stdout,
          });
        }
      });

      proc.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: `Failed to spawn Python process: ${err.message}`,
        });
      });
    });
  }

  /**
   * Write data to a temporary CSV file
   */
  private async writeTempCsv(data: string, prefix: string): Promise<string> {
    const tmpDir = os.tmpdir();
    const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.csv`;
    const filepath = path.join(tmpDir, filename);
    await writeFile(filepath, data, 'utf-8');
    return filepath;
  }

  /**
   * Read and delete a temporary file
   */
  private async readAndDeleteTempFile(filepath: string): Promise<string> {
    try {
      const content = await readFile(filepath, 'utf-8');
      await unlink(filepath);
      return content;
    } catch (err) {
      console.error(`Failed to read/delete temp file ${filepath}:`, err);
      throw err;
    }
  }

  /**
   * Match payments using Python pipeline
   *
   * @param gravityPaymentsCsv - CSV content of Gravity payments
   * @param emrInvoicesCsv - CSV content of EMR invoices
   * @returns Payment match results
   */
  async matchPayments(
    gravityPaymentsCsv: string,
    emrInvoicesCsv: string
  ): Promise<PythonResult<PaymentMatchResult[]>> {
    try {
      // Write CSV data to temporary files
      const gravityPath = await this.writeTempCsv(gravityPaymentsCsv, 'gravity_payments');
      const emrPath = await this.writeTempCsv(emrInvoicesCsv, 'emr_invoices');
      const outputPath = path.join(os.tmpdir(), `matches_${Date.now()}.json`);

      // Execute the match command
      const result = await this.executePipeline('match', [
        '--gravity-file', gravityPath,
        '--emr-file', emrPath,
        '--output', outputPath,
        '--format', 'json',
      ]);

      // Clean up input files
      await unlink(gravityPath).catch(() => {});
      await unlink(emrPath).catch(() => {});

      if (!result.success) {
        return result;
      }

      // Read the output file
      const outputContent = await readAndDeleteTempFile(outputPath);
      const matches = JSON.parse(outputContent);

      return {
        success: true,
        data: matches,
        stderr: result.stderr,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Generate invoices using Python pipeline
   *
   * @param emrTransactionsCsv - CSV content of EMR transactions
   * @returns Invoice generation results
   */
  async generateInvoices(
    emrTransactionsCsv: string
  ): Promise<PythonResult<InvoiceGenerationResult[]>> {
    try {
      // Write CSV data to temporary file
      const emrPath = await this.writeTempCsv(emrTransactionsCsv, 'emr_transactions');
      const outputPath = path.join(os.tmpdir(), `invoices_${Date.now()}.json`);

      // Execute the generate-invoices command
      const result = await this.executePipeline('generate-invoices', [
        '--emr-file', emrPath,
        '--output', outputPath,
        '--format', 'json',
      ]);

      // Clean up input file
      await unlink(emrPath).catch(() => {});

      if (!result.success) {
        return result;
      }

      // Read the output file
      const outputContent = await readAndDeleteTempFile(outputPath);
      const invoices = JSON.parse(outputContent);

      return {
        success: true,
        data: invoices,
        stderr: result.stderr,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Test Python pipeline availability
   *
   * @returns Success if Python and pipeline are available
   */
  async testConnection(): Promise<PythonResult<{ version: string }>> {
    try {
      const result = await this.executePipeline('--version');

      if (result.success) {
        return {
          success: true,
          data: { version: result.data?.trim() || 'unknown' },
        };
      }

      return result;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Debug command - test the pipeline with sample data
   */
  async debug(): Promise<PythonResult> {
    return this.executePipeline('debug');
  }
}

/**
 * Singleton instance for easy access
 */
let bridgeInstance: PythonBridge | null = null;

/**
 * Get or create the Python bridge instance
 */
export function getPythonBridge(config?: PythonBridgeConfig): PythonBridge {
  if (!bridgeInstance) {
    bridgeInstance = new PythonBridge(config);
  }
  return bridgeInstance;
}

/**
 * Export convenience functions
 */
export async function matchPaymentsViaPython(
  gravityPaymentsCsv: string,
  emrInvoicesCsv: string
): Promise<PythonResult<PaymentMatchResult[]>> {
  const bridge = getPythonBridge();
  return bridge.matchPayments(gravityPaymentsCsv, emrInvoicesCsv);
}

export async function generateInvoicesViaPython(
  emrTransactionsCsv: string
): Promise<PythonResult<InvoiceGenerationResult[]>> {
  const bridge = getPythonBridge();
  return bridge.generateInvoices(emrTransactionsCsv);
}

export async function testPythonConnection(): Promise<PythonResult<{ version: string }>> {
  const bridge = getPythonBridge();
  return bridge.testConnection();
}
