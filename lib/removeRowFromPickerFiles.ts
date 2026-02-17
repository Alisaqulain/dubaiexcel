import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import CreatedExcelFile from '@/models/CreatedExcelFile';

/**
 * When admin assigns a row to another employee or releases it, remove that template row
 * from ALL saved pick files that the previous picker had created (e.g. "mydata" and any
 * other file in "My data (saved picks)"). So row 1 will not show in any of Emp1's saved
 * files after admin reassigns row 1 to Emp2.
 */
export async function removeRowFromPreviousPickerFiles(
  formatIdObj: mongoose.Types.ObjectId,
  rowIndex: number,
  previousPickerId: mongoose.Types.ObjectId
): Promise<void> {
  const pickerIdStr =
    previousPickerId && typeof (previousPickerId as any).toString === 'function'
      ? (previousPickerId as any).toString()
      : String(previousPickerId);
  const isObjectId = /^[a-fA-F0-9]{24}$/.test(pickerIdStr);
  const pickerIdObj = isObjectId ? new mongoose.Types.ObjectId(pickerIdStr) : null;
  let filesToUpdate = await CreatedExcelFile.find({
    pickedTemplateRowIndices: rowIndex,
    ...(pickerIdObj ? { createdBy: pickerIdObj } : { createdBy: pickerIdStr }),
    $or: [
      { formatId: formatIdObj },
      { formatId: { $exists: false } },
      { formatId: null },
    ],
  }).select('+fileData');

  // Fallback: if no files found (e.g. formatId mismatch or missing), find by creator + row index only
  if (filesToUpdate.length === 0 && pickerIdObj) {
    filesToUpdate = await CreatedExcelFile.find({
      pickedTemplateRowIndices: rowIndex,
      createdBy: pickerIdObj,
    }).select('+fileData');
  }

  for (const file of filesToUpdate) {
    const indices = file.pickedTemplateRowIndices || [];
    const pos = indices.indexOf(rowIndex);
    if (pos === -1) continue;

    const fileBuffer = Buffer.isBuffer(file.fileData)
      ? file.fileData
      : Buffer.from(file.fileData as ArrayBuffer);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    const newRows = rows.filter((_: Record<string, unknown>, i: number) => i !== pos);
    const newIndices = indices.filter((_: number, i: number) => i !== pos);

    if (newRows.length === 0) {
      const emptyWorkbook = XLSX.utils.book_new();
      const emptySheet = XLSX.utils.json_to_sheet([{}]);
      XLSX.utils.book_append_sheet(emptyWorkbook, emptySheet, 'Data');
      const newBuffer = XLSX.write(emptyWorkbook, { type: 'buffer', bookType: 'xlsx' });
      file.fileData = newBuffer;
      file.rowCount = 0;
      file.pickedTemplateRowIndices = [];
    } else {
      const updatedWorkbook = XLSX.utils.book_new();
      const updatedWorksheet = XLSX.utils.json_to_sheet(newRows);
      XLSX.utils.book_append_sheet(updatedWorkbook, updatedWorksheet, firstSheetName || 'Data');
      const newBuffer = XLSX.write(updatedWorkbook, { type: 'buffer', bookType: 'xlsx' });
      file.fileData = newBuffer;
      file.rowCount = newRows.length;
      file.pickedTemplateRowIndices = newIndices;
    }

    await file.save();
  }
}
