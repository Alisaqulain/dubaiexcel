'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { evaluateFormula, isFormula, formatCell } from '../utils/formulaEngine';

interface CellData {
  [key: string]: string | { formula: string; value: any; format?: string };
}

interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  numberFormat?: string;
  border?: {
    top?: boolean;
    bottom?: boolean;
    left?: boolean;
    right?: boolean;
    style?: string;
    color?: string;
  };
  merged?: boolean;
  mergeRange?: string;
  conditionalFormat?: {
    type: 'greaterThan' | 'lessThan' | 'equalTo' | 'between';
    value1?: number | string;
    value2?: number | string;
    backgroundColor?: string;
    fontColor?: string;
  };
}

interface MergedCell {
  startCell: string;
  endCell: string;
  rowSpan: number;
  colSpan: number;
}

interface Sheet {
  id: string;
  name: string;
  data: CellData;
  formats?: { [key: string]: CellFormat };
  columnWidths?: { [key: string]: number };
  rowHeights?: { [key: number]: number };
  mergedCells?: MergedCell[];
  freezePane?: { row: number; col: number };
}

// Generate Excel columns (A-Z, AA-ZZ, AAA-XFD = 16,384 columns)
function generateColumns(): string[] {
  const cols: string[] = [];
  for (let i = 0; i < 16384; i++) {
    let col = '';
    let num = i + 1; // Start from 1
    while (num > 0) {
      num--;
      col = String.fromCharCode(65 + (num % 26)) + col;
      num = Math.floor(num / 26);
    }
    cols.push(col);
  }
  return cols;
}

const COLUMNS = generateColumns();
const ROWS = 1048576; // Excel max rows
const VISIBLE_ROWS = 100; // Show 100 rows initially
const VISIBLE_COLS = 50; // Show 50 columns initially
const DEFAULT_COLUMN_WIDTH = 96; // w-24 = 96px
const DEFAULT_ROW_HEIGHT = 24; // h-6 = 24px
const MIN_COLUMN_WIDTH = 20;
const MIN_ROW_HEIGHT = 15;

interface SpreadsheetProps {
  onLogout?: () => void;
  userEmail?: string;
  onNavigateToAdmin?: () => void;
}

export default function Spreadsheet({ onLogout, userEmail, onNavigateToAdmin }: SpreadsheetProps) {
  const [sheets, setSheets] = useState<Sheet[]>([
    { id: '1', name: 'Sheet1', data: {}, formats: {}, mergedCells: [] }
  ]);
  const [activeSheetId, setActiveSheetId] = useState('1');
  const [selectedCell, setSelectedCell] = useState<string | null>(null);
  const [selectedRange, setSelectedRange] = useState<{ start: string; end: string } | null>(null);
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [cellValue, setCellValue] = useState('');
  const [isResizing, setIsResizing] = useState(false);
  const [resizingType, setResizingType] = useState<'column' | 'row' | null>(null);
  const [resizingIndex, setResizingIndex] = useState<number | string | null>(null);
  const [resizeStartPos, setResizeStartPos] = useState(0);
  const [resizeStartSize, setResizeStartSize] = useState(0);
  const [scrollPosition, setScrollPosition] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<Sheet[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showGridLines, setShowGridLines] = useState(true);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ row: number; col: number } | null>(null);
  const [isFilling, setIsFilling] = useState(false);
  const [fillStart, setFillStart] = useState<string | null>(null);

  // Initialize history with initial state
  useEffect(() => {
    if (history.length === 0) {
      setHistory([JSON.parse(JSON.stringify(sheets))]);
      setHistoryIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
    };
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);
  const inputRef = useRef<HTMLInputElement>(null);
  const formulaBarRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const activeSheet = sheets.find(s => s.id === activeSheetId) || sheets[0];

  // Save state to history for undo/redo
  const saveToHistory = useCallback((newSheets: Sheet[]) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(newSheets)));
      return newHistory.slice(-50); // Keep last 50 states
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  // Clear selection when switching sheets
  useEffect(() => {
    setSelectedCell(null);
    setSelectedRange(null);
    setEditingCell(null);
    setCellValue('');
  }, [activeSheetId]);

  // Get column width with default (per sheet)
  const getColumnWidth = (col: string) => {
    return activeSheet.columnWidths?.[col] || DEFAULT_COLUMN_WIDTH;
  };

  // Get row height with default (per sheet)
  const getRowHeight = (row: number) => {
    return activeSheet.rowHeights?.[row] || DEFAULT_ROW_HEIGHT;
  };

  // Handle resize start
  const handleResizeStart = (type: 'column' | 'row', index: number | string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizingType(type);
    setResizingIndex(index);
    setResizeStartPos(type === 'column' ? e.clientX : e.clientY);
    setResizeStartSize(type === 'column' ? getColumnWidth(index as string) : getRowHeight(index as number));
  };

  // Update sheet column widths or row heights
  const updateSheetDimensions = useCallback((columnWidths?: { [key: string]: number }, rowHeights?: { [key: number]: number }) => {
    setSheets(prevSheets =>
      prevSheets.map(sheet =>
        sheet.id === activeSheetId
          ? {
              ...sheet,
              columnWidths: columnWidths !== undefined ? { ...sheet.columnWidths, ...columnWidths } : sheet.columnWidths,
              rowHeights: rowHeights !== undefined ? { ...sheet.rowHeights, ...rowHeights } : sheet.rowHeights,
            }
          : sheet
      )
    );
  }, [activeSheetId]);

  // Handle resize move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !resizingType || resizingIndex === null) return;

      const currentPos = resizingType === 'column' ? e.clientX : e.clientY;
      const diff = currentPos - resizeStartPos;
      const newSize = Math.max(
        resizingType === 'column' ? MIN_COLUMN_WIDTH : MIN_ROW_HEIGHT,
        resizeStartSize + diff
      );

      if (resizingType === 'column') {
        updateSheetDimensions({ [resizingIndex as string]: newSize }, undefined);
      } else {
        updateSheetDimensions(undefined, { [resizingIndex as number]: newSize });
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizingType(null);
      setResizingIndex(null);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = resizingType === 'column' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resizingType, resizingIndex, resizeStartPos, resizeStartSize, updateSheetDimensions]);

  const getCellId = (row: number, col: number) => `${COLUMNS[col]}${row + 1}`;

  const getCellValue = (row: number, col: number) => {
    const cellId = getCellId(row, col);
    const cellData = activeSheet.data[cellId];
    
    if (!cellData) return '';
    
    if (typeof cellData === 'string') {
      if (isFormula(cellData)) {
        const result = evaluateFormula(cellData, activeSheet.data, cellId);
        return result;
      }
      return cellData;
    }
    
    if (typeof cellData === 'object' && 'formula' in cellData) {
      // If value is already computed, return it; otherwise evaluate
      if (cellData.value !== undefined && cellData.value !== null) {
        return cellData.value;
      }
      if (cellData.formula && isFormula(cellData.formula)) {
        const result = evaluateFormula(cellData.formula, activeSheet.data, cellId);
        return result;
      }
      return '';
    }
    
    return cellData;
  };

  const getCellDisplayValue = (row: number, col: number) => {
    const cellId = getCellId(row, col);
    const value = getCellValue(row, col);
    const format = activeSheet.formats?.[cellId]?.numberFormat;
    return formatCell(value, format);
  };

  const getCellFormat = (row: number, col: number): CellFormat => {
    const cellId = getCellId(row, col);
    return activeSheet.formats?.[cellId] || {};
  };

  // Helper functions for cell references
  const parseCellReference = (ref: string): { column: string; row: number } | null => {
    const match = ref.match(/^([A-Z]+)(\d+)$/i);
    if (!match) return null;
    return { column: match[1].toUpperCase(), row: parseInt(match[2], 10) };
  };

  const columnToNumber = (col: string): number => {
    let result = 0;
    for (let i = 0; i < col.length; i++) {
      result = result * 26 + (col.charCodeAt(i) - 64);
    }
    return result;
  };

  // Check if cell is merged
  const isCellMerged = (row: number, col: number): MergedCell | null => {
    const cellId = getCellId(row, col);
    if (!activeSheet.mergedCells) return null;
    
    for (const merged of activeSheet.mergedCells) {
      const startRef = parseCellReference(merged.startCell);
      const endRef = parseCellReference(merged.endCell);
      if (!startRef || !endRef) continue;
      
      const startRow = startRef.row - 1;
      const startCol = columnToNumber(startRef.column) - 1;
      const endRow = endRef.row - 1;
      const endCol = columnToNumber(endRef.column) - 1;
      
      if (row >= startRow && row <= endRow && col >= startCol && col <= endCol) {
        return merged;
      }
    }
    return null;
  };

  const handleCellClick = (row: number, col: number, e?: React.MouseEvent) => {
    const cellId = getCellId(row, col);
    const cellData = activeSheet.data[cellId];
    
    setSelectedCell(cellId);
    setSelectedRange(null);
    
    if (e?.shiftKey && selectedCell) {
      // Range selection
      setSelectedRange({ start: selectedCell, end: cellId });
    } else {
    setEditingCell(cellId);
      const rawValue = typeof cellData === 'object' && 'formula' in cellData 
        ? cellData.formula 
        : (cellData || '');
      setCellValue(String(rawValue));
      setTimeout(() => {
        inputRef.current?.focus();
        formulaBarRef.current?.focus();
      }, 0);
    }
  };

  const handleCellChange = (value: string) => {
    setCellValue(value);
  };

  // Handle mouse down for selection dragging
  const handleCellMouseDown = (row: number, col: number, e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left mouse button
    
    setIsSelecting(true);
    setSelectionStart({ row, col });
    const cellId = getCellId(row, col);
    setSelectedCell(cellId);
    setSelectedRange(null);
    
    // Prevent default to allow text selection in input
    if (editingCell === cellId) {
      return;
    }
    e.preventDefault();
  };

  // Handle mouse move for selection dragging
  const handleCellMouseMove = (row: number, col: number, e: React.MouseEvent) => {
    if (!isSelecting || !selectionStart) return;
    
    const startCellId = getCellId(selectionStart.row, selectionStart.col);
    const endCellId = getCellId(row, col);
    setSelectedRange({ start: startCellId, end: endCellId });
  };

  // Handle mouse up to end selection
  useEffect(() => {
    const handleMouseUp = () => {
      setIsSelecting(false);
      setSelectionStart(null);
    };

    if (isSelecting) {
      document.addEventListener('mouseup', handleMouseUp);
      return () => document.removeEventListener('mouseup', handleMouseUp);
    }
  }, [isSelecting]);

  const handleCellBlur = () => {
    if (selectedCell && editingCell === selectedCell && cellValue !== undefined) {
      setSheets(prevSheets => {
        const updated = prevSheets.map(sheet => {
          if (sheet.id !== activeSheetId) return sheet;
          
          const newData = { ...sheet.data };
          const trimmedValue = cellValue.trim();
          
          if (isFormula(trimmedValue)) {
            const result = evaluateFormula(trimmedValue, { ...sheet.data, [selectedCell]: trimmedValue }, selectedCell);
            newData[selectedCell] = { formula: trimmedValue, value: result };
          } else {
            // Remove formula if it was a formula before
            newData[selectedCell] = trimmedValue;
          }
          
          return { ...sheet, data: newData };
        });
        saveToHistory(updated);
        return updated;
      });
    }
    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, row: number, col: number) => {
    // Copy (Ctrl+C)
    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      if (selectedCell) {
        const value = getCellValue(row, col);
        navigator.clipboard.writeText(String(value));
      }
      return;
    }
    
    // Paste (Ctrl+V)
    if (e.ctrlKey && e.key === 'v') {
      e.preventDefault();
      navigator.clipboard.readText().then(text => {
        if (selectedCell) {
          setCellValue(text);
          setSheets(prevSheets => {
            const updated = prevSheets.map(sheet => {
              if (sheet.id !== activeSheetId) return sheet;
              const newData = { ...sheet.data };
              newData[selectedCell] = text;
              return { ...sheet, data: newData };
            });
            saveToHistory(updated);
            return updated;
          });
          handleCellBlur();
        }
      });
      return;
    }
    
    // Undo (Ctrl+Z)
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (historyIndex > 0) {
        setHistoryIndex(prev => prev - 1);
        setSheets(JSON.parse(JSON.stringify(history[historyIndex - 1])));
      }
      return;
    }
    
    // Redo (Ctrl+Shift+Z or Ctrl+Y)
    if ((e.ctrlKey && e.shiftKey && e.key === 'z') || (e.ctrlKey && e.key === 'y')) {
      e.preventDefault();
      if (historyIndex < history.length - 1) {
        setHistoryIndex(prev => prev + 1);
        setSheets(JSON.parse(JSON.stringify(history[historyIndex + 1])));
      }
      return;
    }
    
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCellBlur();
      if (row < ROWS - 1) {
        handleCellClick(row + 1, col);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      handleCellBlur();
      if (col < COLUMNS.length - 1) {
        handleCellClick(row, col + 1);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (editingCell !== selectedCell) {
      handleCellBlur();
      if (row < ROWS - 1) {
        handleCellClick(row + 1, col);
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (editingCell !== selectedCell) {
      handleCellBlur();
      if (row > 0) {
        handleCellClick(row - 1, col);
        }
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (editingCell !== selectedCell) {
      handleCellBlur();
      if (col < COLUMNS.length - 1) {
        handleCellClick(row, col + 1);
        }
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (editingCell !== selectedCell) {
      handleCellBlur();
      if (col > 0) {
        handleCellClick(row, col - 1);
        }
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedCell && editingCell !== selectedCell) {
        e.preventDefault();
        setSheets(prevSheets => {
          const updated = prevSheets.map(sheet => {
            if (sheet.id !== activeSheetId) return sheet;
            const newData = { ...sheet.data };
            delete newData[selectedCell];
            return { ...sheet, data: newData };
          });
          saveToHistory(updated);
          return updated;
        });
      }
    }
  };

  const addNewSheet = () => {
    const newSheetNumber = sheets.length + 1;
    const newSheet: Sheet = {
      id: Date.now().toString(),
      name: `Sheet${newSheetNumber}`,
      data: {},
      columnWidths: {},
      rowHeights: {}
    };
    setSheets([...sheets, newSheet]);
    setActiveSheetId(newSheet.id);
  };

  const deleteSheet = (sheetId: string) => {
    if (sheets.length === 1) return; // Don't delete the last sheet
    const newSheets = sheets.filter(s => s.id !== sheetId);
    setSheets(newSheets);
    if (activeSheetId === sheetId) {
      setActiveSheetId(newSheets[0].id);
    }
  };

  const renameSheet = (sheetId: string, newName: string) => {
    setSheets(prevSheets =>
      prevSheets.map(sheet =>
        sheet.id === sheetId ? { ...sheet, name: newName } : sheet
      )
    );
  };

  // Formatting functions
  const applyFormat = (format: Partial<CellFormat>) => {
    if (!selectedCell) return;
    setSheets(prevSheets => {
      const updated = prevSheets.map(sheet => {
        if (sheet.id !== activeSheetId) return sheet;
        const newFormats = { ...sheet.formats };
        newFormats[selectedCell] = { ...newFormats[selectedCell], ...format };
        return { ...sheet, formats: newFormats };
      });
      saveToHistory(updated);
      return updated;
    });
  };

  const toggleBold = () => {
    if (!selectedCell) return;
    const currentFormat = getCellFormat(
      parseInt(selectedCell.slice(1)) - 1,
      COLUMNS.indexOf(selectedCell[0])
    );
    applyFormat({ bold: !currentFormat.bold });
  };

  const toggleItalic = () => {
    if (!selectedCell) return;
    const currentFormat = getCellFormat(
      parseInt(selectedCell.slice(1)) - 1,
      COLUMNS.indexOf(selectedCell[0])
    );
    applyFormat({ italic: !currentFormat.italic });
  };

  const setNumberFormat = (format: string) => {
    applyFormat({ numberFormat: format });
  };

  const setTextAlign = (align: 'left' | 'center' | 'right') => {
    applyFormat({ textAlign: align });
  };

  const setBackgroundColor = (color: string) => {
    applyFormat({ backgroundColor: color });
  };

  const setFontColor = (color: string) => {
    applyFormat({ fontColor: color });
  };

  // Merge cells
  const mergeCells = () => {
    if (!selectedRange) {
      // Merge single cell (no-op, but could merge with adjacent)
      return;
    }
    
    const startRef = parseCellReference(selectedRange.start);
    const endRef = parseCellReference(selectedRange.end);
    if (!startRef || !endRef) return;

    setSheets(prevSheets => {
      const updated = prevSheets.map(sheet => {
        if (sheet.id !== activeSheetId) return sheet;
        const mergedCells = [...(sheet.mergedCells || [])];
        
        // Remove any existing merges that overlap
        const newMergedCells = mergedCells.filter(merged => {
          const mStart = parseCellReference(merged.startCell);
          const mEnd = parseCellReference(merged.endCell);
          if (!mStart || !mEnd) return false;
          
          // Check if overlap
          return !(
            (startRef.row > mEnd.row || endRef.row < mStart.row) ||
            (columnToNumber(startRef.column) > columnToNumber(mEnd.column) || 
             columnToNumber(endRef.column) < columnToNumber(mStart.column))
          );
        });
        
        newMergedCells.push({
          startCell: selectedRange.start,
          endCell: selectedRange.end,
          rowSpan: Math.abs(endRef.row - startRef.row) + 1,
          colSpan: Math.abs(columnToNumber(endRef.column) - columnToNumber(startRef.column)) + 1,
        });
        
        return { ...sheet, mergedCells: newMergedCells };
      });
      saveToHistory(updated);
      return updated;
    });
  };

  // Unmerge cells
  const unmergeCells = () => {
    if (!selectedCell) return;
    
    setSheets(prevSheets => {
      const updated = prevSheets.map(sheet => {
        if (sheet.id !== activeSheetId) return sheet;
        const mergedCells = (sheet.mergedCells || []).filter(merged => {
          const startRef = parseCellReference(merged.startCell);
          const endRef = parseCellReference(merged.endCell);
          if (!startRef || !endRef) return true;
          
          const cellRef = parseCellReference(selectedCell);
          if (!cellRef) return true;
          
          const startRow = startRef.row - 1;
          const startCol = columnToNumber(startRef.column) - 1;
          const endRow = endRef.row - 1;
          const endCol = columnToNumber(endRef.column) - 1;
          const cellRow = cellRef.row - 1;
          const cellCol = columnToNumber(cellRef.column) - 1;
          
          return !(cellRow >= startRow && cellRow <= endRow && cellCol >= startCol && cellCol <= endCol);
        });
        
        return { ...sheet, mergedCells };
      });
      saveToHistory(updated);
      return updated;
    });
  };

  // Auto-fill functionality
  const handleAutoFill = (startCell: string, endCell: string) => {
    const startRef = parseCellReference(startCell);
    const endRef = parseCellReference(endCell);
    if (!startRef || !endRef) return;

    const startRow = startRef.row - 1;
    const startCol = columnToNumber(startRef.column) - 1;
    const endRow = endRef.row - 1;
    const endCol = columnToNumber(endRef.column) - 1;

    // Get the source values
    const sourceValues: any[] = [];
    for (let row = startRow; row <= Math.min(startRow + 2, endRow); row++) {
      for (let col = startCol; col <= Math.min(startCol + 2, endCol); col++) {
        sourceValues.push(getCellValue(row, col));
      }
    }

    // Detect pattern
    const isNumeric = sourceValues.every(v => typeof v === 'number' || !isNaN(parseFloat(String(v))));
    let increment = 0;
    if (isNumeric && sourceValues.length >= 2) {
      increment = parseFloat(String(sourceValues[1])) - parseFloat(String(sourceValues[0]));
    }

    // Fill the range
    setSheets(prevSheets => {
      const updated = prevSheets.map(sheet => {
        if (sheet.id !== activeSheetId) return sheet;
        const newData = { ...sheet.data };
        
        let valueIndex = 0;
        for (let row = startRow; row <= endRow; row++) {
          for (let col = startCol; col <= endCol; col++) {
            const cellId = getCellId(row, col);
            if (row === startRow && col === startCol) continue; // Skip first cell
            
            if (isNumeric && increment !== 0) {
              const baseValue = parseFloat(String(sourceValues[0]));
              const newValue = baseValue + (increment * valueIndex);
              newData[cellId] = String(newValue);
            } else if (sourceValues[valueIndex % sourceValues.length]) {
              newData[cellId] = String(sourceValues[valueIndex % sourceValues.length]);
            }
            valueIndex++;
          }
        }
        
        return { ...sheet, data: newData };
      });
      saveToHistory(updated);
      return updated;
    });
  };

  return (
    <div className="flex flex-col h-screen bg-[#f2f2f2]">
      {/* Excel-like Title Bar */}
      <div className="bg-[#217346] text-white px-3 py-1 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <div className="font-semibold">Excel Pro</div>
        </div>
        <div className="flex items-center gap-4">
          {onNavigateToAdmin && (
            <button
              onClick={onNavigateToAdmin}
              className="px-2 py-1 hover:bg-[#1a5a36] rounded text-xs"
            >
              Admin
            </button>
          )}
          {userEmail && (
            <span className="text-xs hidden sm:inline opacity-90">
              {userEmail}
            </span>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="px-2 py-1 hover:bg-[#1a5a36] rounded text-xs"
            >
              Logout
            </button>
          )}
        </div>
      </div>

      {/* Excel-like Ribbon */}
      <div className="bg-white border-b border-gray-300">
        {/* Ribbon Tabs */}
        <div className="flex border-b border-gray-300 bg-[#f2f2f2]">
          <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white border-b-2 border-transparent hover:border-[#217346]">
            File
          </button>
          <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white border-b-2 border-[#217346] bg-white">
            Home
          </button>
          <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white border-b-2 border-transparent hover:border-[#217346]">
            Insert
          </button>
          <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white border-b-2 border-transparent hover:border-[#217346]">
            Formulas
          </button>
          <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white border-b-2 border-transparent hover:border-[#217346]">
            Data
          </button>
          <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white border-b-2 border-transparent hover:border-[#217346]">
            Review
          </button>
          <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-white border-b-2 border-transparent hover:border-[#217346]">
            View
          </button>
        </div>
        
        {/* Find & Replace Button */}
        <div className="absolute right-4 top-3">
          <button
            onClick={() => setShowFindReplace(!showFindReplace)}
            className="px-3 py-1.5 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1"
            title="Find & Replace (Ctrl+H)"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            Find
          </button>
        </div>

        {/* Ribbon Content - Home Tab */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-6">
            {/* Clipboard Group */}
            <div className="flex items-center gap-2 border-r border-gray-300 pr-4">
              <button
                onClick={() => {
                  if (historyIndex > 0) {
                    setHistoryIndex(prev => prev - 1);
                    setSheets(JSON.parse(JSON.stringify(history[historyIndex - 1])));
                  }
                }}
                className="px-3 py-1.5 hover:bg-gray-100 rounded text-xs flex items-center gap-1"
                title="Undo (Ctrl+Z)"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
                Undo
              </button>
              <button
                onClick={() => {
                  if (historyIndex < history.length - 1) {
                    setHistoryIndex(prev => prev + 1);
                    setSheets(JSON.parse(JSON.stringify(history[historyIndex + 1])));
                  }
                }}
                className="px-3 py-1.5 hover:bg-gray-100 rounded text-xs flex items-center gap-1"
                title="Redo (Ctrl+Y)"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Redo
              </button>
            </div>

            {/* Font Group */}
            <div className="flex items-center gap-2 border-r border-gray-300 pr-4">
              <select className="px-2 py-1 border border-gray-300 rounded text-xs" defaultValue="11">
                <option>8</option>
                <option>9</option>
                <option>10</option>
                <option>11</option>
                <option>12</option>
                <option>14</option>
                <option>16</option>
                <option>18</option>
                <option>20</option>
                <option>24</option>
              </select>
              <button
                onClick={toggleBold}
                className={`px-2 py-1 border border-gray-300 rounded text-xs font-bold ${getCellFormat(
                  selectedCell ? parseInt(selectedCell.slice(1)) - 1 : 0,
                  selectedCell ? COLUMNS.indexOf(selectedCell[0]) : 0
                ).bold ? 'bg-gray-200' : 'bg-white hover:bg-gray-50'}`}
                title="Bold (Ctrl+B)"
              >
                B
              </button>
              <button
                onClick={toggleItalic}
                className={`px-2 py-1 border border-gray-300 rounded text-xs italic ${getCellFormat(
                  selectedCell ? parseInt(selectedCell.slice(1)) - 1 : 0,
                  selectedCell ? COLUMNS.indexOf(selectedCell[0]) : 0
                ).italic ? 'bg-gray-200' : 'bg-white hover:bg-gray-50'}`}
                title="Italic (Ctrl+I)"
              >
                I
              </button>
              <button className="px-2 py-1 border border-gray-300 rounded text-xs bg-white hover:bg-gray-50" title="Underline (Ctrl+U)">
                <span className="underline">U</span>
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setFontColor('#000000')}
                  className="w-6 h-6 border border-gray-300 rounded bg-black"
                  title="Font Color"
                />
                <button
                  onClick={() => setBackgroundColor('#ffff00')}
                  className="w-6 h-6 border border-gray-300 rounded bg-yellow-300"
                  title="Fill Color"
                />
              </div>
            </div>

            {/* Alignment Group */}
            <div className="flex items-center gap-2 border-r border-gray-300 pr-4">
              <button
                onClick={() => setTextAlign('left')}
                className="px-2 py-1 border border-gray-300 rounded text-xs bg-white hover:bg-gray-50"
                title="Align Left"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
              <button
                onClick={() => setTextAlign('center')}
                className="px-2 py-1 border border-gray-300 rounded text-xs bg-white hover:bg-gray-50"
                title="Center"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </button>
              <button
                onClick={() => setTextAlign('right')}
                className="px-2 py-1 border border-gray-300 rounded text-xs bg-white hover:bg-gray-50"
                title="Align Right"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM7 10a1 1 0 011-1h6a1 1 0 110 2H8a1 1 0 01-1-1zM9 15a1 1 0 011-1h6a1 1 0 110 2h-6a1 1 0 01-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Number Format Group */}
            <div className="flex items-center gap-2 border-r border-gray-300 pr-4">
              <select
                onChange={(e) => setNumberFormat(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-xs bg-white"
                title="Number Format"
              >
                <option value="">General</option>
                <option value="0">Number</option>
                <option value="0.00">Number (2 decimals)</option>
                <option value="#,##0">Number (comma)</option>
                <option value="$#,##0.00">Currency</option>
                <option value="0%">Percentage</option>
                <option value="mm/dd/yyyy">Date</option>
              </select>
            </div>

            {/* View Options */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoomLevel(prev => Math.max(10, prev - 10))}
                className="px-2 py-1 border border-gray-300 rounded text-xs bg-white hover:bg-gray-50"
                title="Zoom Out"
              >
                −
              </button>
              <span className="px-2 text-xs min-w-[50px] text-center">{zoomLevel}%</span>
              <button
                onClick={() => setZoomLevel(prev => Math.min(400, prev + 10))}
                className="px-2 py-1 border border-gray-300 rounded text-xs bg-white hover:bg-gray-50"
                title="Zoom In"
              >
                +
              </button>
              <button
                onClick={() => setShowGridLines(!showGridLines)}
                className={`px-3 py-1 border border-gray-300 rounded text-xs ${
                  showGridLines ? 'bg-gray-200' : 'bg-white hover:bg-gray-50'
                }`}
                title="Toggle Grid Lines"
              >
                Grid
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Formula Bar - Excel Style */}
      <div className="bg-white border-b border-gray-300 flex items-center">
        <div className="bg-[#f2f2f2] border-r border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 min-w-[60px] text-center">
          {selectedCell || 'A1'}
        </div>
        <div className="flex items-center gap-2 flex-1 px-2">
          <div className="text-xs text-gray-500">fx</div>
          <input
            ref={formulaBarRef}
            type="text"
            value={editingCell === selectedCell ? cellValue : (selectedCell ? (() => {
              const cellData = activeSheet.data[selectedCell];
              if (typeof cellData === 'object' && 'formula' in cellData) {
                return cellData.formula;
              }
              return String(cellData || '');
            })() : '')}
            onChange={(e) => {
              setCellValue(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCellBlur();
              }
            }}
            className="flex-1 outline-none text-sm py-1"
            placeholder="Enter formula or value"
          />
        </div>
      </div>

      {/* Spreadsheet Grid - Excel Style */}
      <div 
        ref={gridRef}
        className="flex-1 overflow-auto bg-white"
        style={{ zoom: `${zoomLevel}%` }}
        onScroll={(e) => {
          setScrollPosition({ x: e.currentTarget.scrollLeft, y: e.currentTarget.scrollTop });
        }}
      >
        <div className="inline-block min-w-full">
          <table className="border-collapse" style={{ fontFamily: 'Calibri, Arial, sans-serif' }}>
            <thead>
              <tr>
                <th className="w-12 h-6 bg-[#f2f2f2] border border-gray-300 text-xs font-semibold text-gray-600 sticky top-0 left-0 z-20 border-r-2 border-gray-400"></th>
                {COLUMNS.slice(0, VISIBLE_COLS).map((col, idx) => (
                  <th
                    key={col}
                    style={{ width: `${getColumnWidth(col)}px`, minWidth: `${getColumnWidth(col)}px` }}
                    className="h-6 bg-[#f2f2f2] border border-gray-300 text-xs font-semibold text-gray-600 text-center sticky top-0 z-10 relative"
                  >
                    {col}
                    <div
                      className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-[#217346] z-20 transition-colors"
                      style={{ right: '-2px' }}
                      onMouseDown={(e) => handleResizeStart('column', col, e)}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: VISIBLE_ROWS }).map((_, rowIdx) => (
                <tr key={rowIdx} style={{ height: `${getRowHeight(rowIdx)}px` }}>
                  <td 
                    className="w-12 bg-[#f2f2f2] border border-gray-300 text-xs font-semibold text-gray-600 text-center sticky left-0 z-10 relative border-r-2 border-gray-400"
                    style={{ height: `${getRowHeight(rowIdx)}px` }}
                  >
                    {rowIdx + 1}
                    <div
                      className="absolute bottom-0 left-0 w-full h-1 cursor-row-resize hover:bg-[#217346] z-20 transition-colors"
                      style={{ bottom: '-2px' }}
                      onMouseDown={(e) => handleResizeStart('row', rowIdx, e)}
                    />
                  </td>
                  {COLUMNS.slice(0, VISIBLE_COLS).map((col, colIdx) => {
                    const cellId = getCellId(rowIdx, colIdx);
                    const merged = isCellMerged(rowIdx, colIdx);
                    
                    // Skip rendering if this cell is part of a merge (not the start cell)
                    if (merged && merged.startCell !== cellId) {
                      return null;
                    }
                    
                    const isSelected = selectedCell === cellId || (merged && selectedCell === merged.startCell);
                    const isInRange = selectedRange && (
                      (cellId >= selectedRange.start && cellId <= selectedRange.end) ||
                      (cellId <= selectedRange.start && cellId >= selectedRange.end)
                    );
                    const isEditing = editingCell === cellId || (merged && editingCell === merged.startCell);
                    const displayValue = merged 
                      ? getCellDisplayValue(
                          parseCellReference(merged.startCell)!.row - 1,
                          columnToNumber(parseCellReference(merged.startCell)!.column) - 1
                        )
                      : getCellDisplayValue(rowIdx, colIdx);
                    const format = merged
                      ? getCellFormat(
                          parseCellReference(merged.startCell)!.row - 1,
                          columnToNumber(parseCellReference(merged.startCell)!.column) - 1
                        )
                      : getCellFormat(rowIdx, colIdx);
                    
                    // Calculate merged cell dimensions
                    const colSpan = merged ? merged.colSpan : 1;
                    const rowSpan = merged ? merged.rowSpan : 1;

                    // Calculate total width for merged cells
                    let totalWidth = getColumnWidth(col);
                    if (merged && colSpan > 1) {
                      for (let i = 1; i < colSpan; i++) {
                        const nextCol = COLUMNS[colIdx + i];
                        if (nextCol) totalWidth += getColumnWidth(nextCol);
                      }
                    }
                    
                    // Calculate total height for merged cells
                    let totalHeight = getRowHeight(rowIdx);
                    if (merged && rowSpan > 1) {
                      for (let i = 1; i < rowSpan; i++) {
                        totalHeight += getRowHeight(rowIdx + i);
                      }
                    }

                    return (
                      <td
                        key={cellId}
                        colSpan={colSpan > 1 ? colSpan : undefined}
                        rowSpan={rowSpan > 1 ? rowSpan : undefined}
                        style={{ 
                          width: merged ? `${totalWidth}px` : `${getColumnWidth(col)}px`, 
                          minWidth: merged ? `${totalWidth}px` : `${getColumnWidth(col)}px`,
                          height: merged ? `${totalHeight}px` : `${getRowHeight(rowIdx)}px`,
                          backgroundColor: format.backgroundColor || (isSelected ? '#d0e7f2' : isInRange ? '#e7f0f7' : 'white'),
                          color: format.fontColor || '#000000',
                          fontWeight: format.bold ? 'bold' : 'normal',
                          fontStyle: format.italic ? 'italic' : 'normal',
                          textAlign: format.textAlign || (merged ? 'center' : 'left'),
                          fontSize: format.fontSize ? `${format.fontSize}px` : '11px',
                          borderTop: showGridLines ? (format.border?.top ? `1px solid ${format.border.color || '#000'}` : '1px solid #d0d0d0') : 'none',
                          borderBottom: showGridLines ? (format.border?.bottom ? `1px solid ${format.border.color || '#000'}` : '1px solid #d0d0d0') : 'none',
                          borderLeft: showGridLines ? (format.border?.left ? `1px solid ${format.border.color || '#000'}` : '1px solid #d0d0d0') : 'none',
                          borderRight: showGridLines ? (format.border?.right ? `1px solid ${format.border.color || '#000'}` : '1px solid #d0d0d0') : 'none',
                          verticalAlign: 'middle',
                        }}
                        className={`text-xs relative cursor-cell ${
                          isSelected ? 'ring-1 ring-[#217346]' : isInRange ? '' : 'hover:bg-gray-50'
                        }`}
                        onMouseDown={(e) => handleCellMouseDown(rowIdx, colIdx, e)}
                        onMouseMove={(e) => handleCellMouseMove(rowIdx, colIdx, e)}
                        onClick={(e) => handleCellClick(rowIdx, colIdx, e)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({ x: e.clientX, y: e.clientY });
                        }}
                        onDoubleClick={() => {
                          const actualCellId = merged ? merged.startCell : cellId;
                          setEditingCell(actualCellId);
                          const actualCellData = activeSheet.data[actualCellId] || activeSheet.data[cellId];
                          const rawValue = typeof actualCellData === 'object' && 'formula' in actualCellData 
                            ? actualCellData.formula 
                            : (actualCellData || '');
                          setCellValue(String(rawValue));
                          setTimeout(() => {
                            inputRef.current?.focus();
                            formulaBarRef.current?.focus();
                          }, 0);
                        }}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            type="text"
                            value={cellValue}
                            onChange={(e) => handleCellChange(e.target.value)}
                            onBlur={handleCellBlur}
                            onKeyDown={(e) => handleKeyDown(e, rowIdx, colIdx)}
                            className="w-full h-full px-1 outline-none bg-transparent"
                            style={{
                              color: format.fontColor || '#000000',
                              fontWeight: format.bold ? 'bold' : 'normal',
                              fontStyle: format.italic ? 'italic' : 'normal',
                              fontSize: format.fontSize ? `${format.fontSize}px` : '11px',
                            }}
                            autoFocus
                          />
                        ) : (
                          <div className="px-1 py-0.5 truncate" style={{ 
                            textDecoration: format.underline ? 'underline' : 'none' 
                          }}>
                            {displayValue}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-300 shadow-lg z-50 py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <button
            onClick={() => {
              if (selectedCell) {
                const value = getCellValue(
                  parseInt(selectedCell.slice(1)) - 1,
                  COLUMNS.indexOf(selectedCell[0])
                );
                navigator.clipboard.writeText(String(value));
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
              <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
            </svg>
            Copy
          </button>
          <button
            onClick={() => {
              navigator.clipboard.readText().then(text => {
                if (selectedCell) {
                  setCellValue(text);
                  setSheets(prevSheets => {
                    const updated = prevSheets.map(sheet => {
                      if (sheet.id !== activeSheetId) return sheet;
                      const newData = { ...sheet.data };
                      newData[selectedCell] = text;
                      return { ...sheet, data: newData };
                    });
                    saveToHistory(updated);
                    return updated;
                  });
                }
              });
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M8 2a1 1 0 011 1v1h2V3a1 1 0 112 0v1h2a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2h2V3a1 1 0 011-1z" />
            </svg>
            Paste
          </button>
          <div className="border-t border-gray-200 my-1"></div>
          <button
            onClick={() => {
              if (selectedCell) {
                setSheets(prevSheets => {
                  const updated = prevSheets.map(sheet => {
                    if (sheet.id !== activeSheetId) return sheet;
                    const newData = { ...sheet.data };
                    delete newData[selectedCell];
                    return { ...sheet, data: newData };
                  });
                  saveToHistory(updated);
                  return updated;
                });
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Delete
          </button>
          <div className="border-t border-gray-200 my-1"></div>
          <button
            onClick={() => {
              toggleBold();
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50"
          >
            <span className="font-bold">Bold</span>
          </button>
          <button
            onClick={() => {
              toggleItalic();
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50"
          >
            <span className="italic">Italic</span>
          </button>
          <div className="border-t border-gray-200 my-1"></div>
          <button
            onClick={() => {
              setNumberFormat('$#,##0.00');
              setContextMenu(null);
            }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50"
          >
            Format Cells...
          </button>
        </div>
      )}

      {/* Find & Replace Dialog */}
      {showFindReplace && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Find & Replace</h3>
              <button
                onClick={() => setShowFindReplace(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Find:</label>
                <input
                  type="text"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  placeholder="Enter text to find"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Replace:</label>
                <input
                  type="text"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  placeholder="Enter replacement text"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    // Find functionality
                    if (findText) {
                      for (let row = 0; row < VISIBLE_ROWS; row++) {
                        for (let col = 0; col < VISIBLE_COLS; col++) {
                          const cellId = getCellId(row, col);
                          const value = String(getCellValue(row, col));
                          if (value.includes(findText)) {
                            handleCellClick(row, col);
                            return;
                          }
                        }
                      }
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                >
                  Find Next
                </button>
                <button
                  onClick={() => {
                    // Replace functionality
                    if (findText && selectedCell) {
                      const cellData = activeSheet.data[selectedCell];
                      const currentValue = typeof cellData === 'object' && 'formula' in cellData
                        ? cellData.formula
                        : String(cellData || '');
                      const newValue = currentValue.replace(new RegExp(findText, 'g'), replaceText);
                      setCellValue(newValue);
                      setSheets(prevSheets => {
                        const updated = prevSheets.map(sheet => {
                          if (sheet.id !== activeSheetId) return sheet;
                          const newData = { ...sheet.data };
                          if (isFormula(newValue)) {
                            const result = evaluateFormula(newValue, { ...sheet.data, [selectedCell]: newValue }, selectedCell);
                            newData[selectedCell] = { formula: newValue, value: result };
                          } else {
                            newData[selectedCell] = newValue;
                          }
                          return { ...sheet, data: newData };
                        });
                        saveToHistory(updated);
                        return updated;
                      });
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                >
                  Replace
                </button>
                <button
                  onClick={() => setShowFindReplace(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Bar - Excel Style */}
      <div className="bg-[#f2f2f2] border-t border-gray-300 px-3 py-1 flex items-center justify-between text-xs text-gray-600">
        <div className="flex items-center gap-4">
          <span>Ready</span>
          {selectedCell && (
            <span className="text-gray-500">
              Cell: {selectedCell}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-0.5 hover:bg-gray-300 rounded">SUM</button>
          <button className="px-2 py-0.5 hover:bg-gray-300 rounded">AVERAGE</button>
          <button className="px-2 py-0.5 hover:bg-gray-300 rounded">COUNT</button>
        </div>
      </div>

      {/* Find & Replace Dialog */}
      {showFindReplace && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50" onClick={() => setShowFindReplace(false)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-96" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Find & Replace</h3>
              <button
                onClick={() => setShowFindReplace(false)}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Find:</label>
                <input
                  type="text"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  placeholder="Enter text to find"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Replace:</label>
                <input
                  type="text"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  placeholder="Enter replacement text"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    if (findText) {
                      for (let row = 0; row < VISIBLE_ROWS; row++) {
                        for (let col = 0; col < VISIBLE_COLS; col++) {
                          const cellId = getCellId(row, col);
                          const value = String(getCellValue(row, col));
                          if (value.includes(findText)) {
                            handleCellClick(row, col);
                            return;
                          }
                        }
                      }
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                >
                  Find Next
                </button>
                <button
                  onClick={() => {
                    if (findText && selectedCell) {
                      const cellData = activeSheet.data[selectedCell];
                      const currentValue = typeof cellData === 'object' && 'formula' in cellData
                        ? cellData.formula
                        : String(cellData || '');
                      const newValue = currentValue.replace(new RegExp(findText, 'g'), replaceText);
                      setCellValue(newValue);
                      setSheets(prevSheets => {
                        const updated = prevSheets.map(sheet => {
                          if (sheet.id !== activeSheetId) return sheet;
                          const newData = { ...sheet.data };
                          if (isFormula(newValue)) {
                            const result = evaluateFormula(newValue, { ...sheet.data, [selectedCell]: newValue }, selectedCell);
                            newData[selectedCell] = { formula: newValue, value: result };
                          } else {
                            newData[selectedCell] = newValue;
                          }
                          return { ...sheet, data: newData };
                        });
                        saveToHistory(updated);
                        return updated;
                      });
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                >
                  Replace
                </button>
                <button
                  onClick={() => setShowFindReplace(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Bar - Excel Style */}
      <div className="bg-[#f2f2f2] border-t border-gray-300 px-3 py-1 flex items-center justify-between text-xs text-gray-600">
        <div className="flex items-center gap-4">
          <span>Ready</span>
          {selectedCell && (
            <span className="text-gray-500">
              Cell: {selectedCell}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="px-2 py-0.5 hover:bg-gray-300 rounded">SUM</button>
          <button className="px-2 py-0.5 hover:bg-gray-300 rounded">AVERAGE</button>
          <button className="px-2 py-0.5 hover:bg-gray-300 rounded">COUNT</button>
        </div>
      </div>

      {/* Sheet Tabs - Excel Style */}
      <div className="bg-[#f2f2f2] border-t border-gray-300 px-2 py-1 flex items-center gap-1 overflow-x-auto">
        {sheets.map((sheet) => (
          <div
            key={sheet.id}
            className={`flex items-center gap-1 px-3 py-1 rounded-t cursor-pointer min-w-[100px] ${
              activeSheetId === sheet.id
                ? 'bg-white border-t-2 border-t-[#217346] border-l border-r border-gray-300 shadow-sm'
                : 'bg-[#e0e0e0] hover:bg-[#d0d0d0] border-t border-l border-r border-gray-300'
            }`}
            onClick={() => {
              // Save any pending edits before switching
              if (selectedCell && editingCell === selectedCell && cellValue !== undefined) {
                setSheets(prevSheets =>
                  prevSheets.map(s =>
                    s.id === activeSheetId
                      ? { ...s, data: { ...s.data, [selectedCell]: cellValue } }
                      : s
                  )
                );
              }
              setActiveSheetId(sheet.id);
            }}
          >
            <input
              type="text"
              value={sheet.name}
              onChange={(e) => renameSheet(sheet.id, e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className={`flex-1 outline-none text-xs bg-transparent ${
                activeSheetId === sheet.id ? 'text-gray-800' : 'text-gray-600'
              }`}
            />
            {sheets.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSheet(sheet.id);
                }}
                className="text-gray-500 hover:text-red-600 text-xs ml-1"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addNewSheet}
          className="px-2 py-1 text-gray-600 hover:bg-gray-400 rounded text-lg font-light"
          title="Add new sheet"
        >
          +
        </button>
      </div>
    </div>
  );
}

