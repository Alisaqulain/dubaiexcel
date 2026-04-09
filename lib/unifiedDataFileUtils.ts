import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export const EXCEL_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'excel');

export async function ensureExcelUploadDir() {
  await fs.mkdir(EXCEL_UPLOAD_DIR, { recursive: true });
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'file';
}

export async function saveUploadedBuffer(originalName: string, buffer: Buffer): Promise<{ fileName: string; filePath: string }> {
  await ensureExcelUploadDir();
  const ext = path.extname(originalName) || '.bin';
  const fileName = `${Date.now()}_${randomUUID()}${ext}`;
  const filePath = path.join(EXCEL_UPLOAD_DIR, fileName);
  await fs.writeFile(filePath, buffer);
  return { fileName, filePath };
}

export function deriveRowName(row: Record<string, unknown>): string {
  const preferred = ['Name', 'name', 'NAME', 'Full Name', 'full name'];
  for (const k of preferred) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  const vals = Object.values(row).filter((v) => v != null && String(v).trim() !== '');
  if (vals.length) return String(vals[0]).trim();
  return 'Unnamed';
}

export function normalizeRowFields(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof k === 'string' && k.trim() !== '') {
      out[k.trim()] = v === undefined || v === null ? '' : v;
    }
  }
  return out;
}

export function parseSpreadsheetBuffer(
  buffer: Buffer,
  originalName: string
): Record<string, unknown>[] {
  const lower = originalName.toLowerCase();
  if (lower.endsWith('.csv')) {
    const text = buffer.toString('utf8');
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => String(h).trim(),
    });
    if (parsed.errors?.length) {
      const fatal = parsed.errors.find((e) => e.type === 'Quotes' || e.type === 'FieldMismatch');
      if (fatal) throw new Error(fatal.message || 'CSV parse error');
    }
    return (parsed.data || []).filter((r) => Object.keys(r).some((k) => String(r[k] ?? '').trim() !== ''));
  }

  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
}
