// Comprehensive Excel Formula Engine

export interface CellReference {
  sheet?: string;
  column: string;
  row: number;
}

export interface CellData {
  [key: string]: string | number | { formula: string; value: any };
}

// Parse cell reference (e.g., "A1", "Sheet1!A1", "A1:B5")
export function parseCellReference(ref: string): CellReference | null {
  const match = ref.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  return {
    column: match[1].toUpperCase(),
    row: parseInt(match[2], 10),
  };
}

// Parse range reference (e.g., "A1:B5")
export function parseRange(range: string): { start: CellReference; end: CellReference } | null {
  const parts = range.split(':');
  if (parts.length !== 2) return null;
  const start = parseCellReference(parts[0]);
  const end = parseCellReference(parts[1]);
  if (!start || !end) return null;
  return { start, end };
}

// Get cell value from data
export function getCellValue(
  cellRef: string,
  data: CellData,
  sheets?: { [key: string]: CellData },
  currentSheet?: string,
  currentCell?: string
): any {
  const ref = parseCellReference(cellRef);
  if (!ref) return 0;

  const cellId = `${ref.column}${ref.row}`;
  
  // Prevent circular reference
  if (currentCell && cellId === currentCell) {
    return '#REF!';
  }

  const cellData = data[cellId];

  if (!cellData) return 0;

  if (typeof cellData === 'object' && 'formula' in cellData) {
    // If it's a formula, evaluate it recursively
    if (cellData.formula && cellData.formula.startsWith('=')) {
      return evaluateFormula(cellData.formula, data, cellId, sheets, currentSheet);
    }
    return cellData.value ?? 0;
  }

  if (typeof cellData === 'number') return cellData;
  if (typeof cellData === 'string') {
    // If it's a formula string, evaluate it
    if (cellData.startsWith('=')) {
      return evaluateFormula(cellData, data, cellId, sheets, currentSheet);
    }
    const num = parseFloat(cellData);
    return isNaN(num) ? cellData : num;
  }

  return cellData;
}

// Convert column letter to number (A=1, B=2, ..., Z=26, AA=27, etc.)
export function columnToNumber(col: string): number {
  let result = 0;
  for (let i = 0; i < col.length; i++) {
    result = result * 26 + (col.charCodeAt(i) - 64);
  }
  return result;
}

// Convert number to column letter
export function numberToColumn(num: number): string {
  let result = '';
  while (num > 0) {
    num--;
    result = String.fromCharCode(65 + (num % 26)) + result;
    num = Math.floor(num / 26);
  }
  return result;
}

// Get all cells in a range
export function getRangeCells(range: string): string[] {
  const parsed = parseRange(range);
  if (!parsed) return [];

  const cells: string[] = [];
  const startCol = columnToNumber(parsed.start.column);
  const endCol = columnToNumber(parsed.end.column);
  const startRow = parsed.start.row;
  const endRow = parsed.end.row;

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      cells.push(`${numberToColumn(col)}${row}`);
    }
  }
  return cells;
}

// Evaluate formula
export function evaluateFormula(
  formula: string,
  data: CellData,
  currentCell?: string,
  sheets?: { [key: string]: CellData },
  currentSheet?: string
): any {
  if (!formula.startsWith('=')) {
    return formula;
  }

  const expression = formula.substring(1).trim();

  try {
    // Handle cell references
    let processedExpression = expression;
    const cellRefRegex = /([A-Z]+)(\d+)/gi;
    const matches: RegExpExecArray[] = [];
    let match: RegExpExecArray | null;
    while ((match = cellRefRegex.exec(expression)) !== null) {
      matches.push(match);
    }

    for (const match of matches) {
      const cellRef = match[0];
      if (cellRef === currentCell) {
        throw new Error('Circular reference');
      }
      const value = getCellValue(cellRef, data, sheets, currentSheet, currentCell);
      // Handle error values
      if (typeof value === 'string' && value.startsWith('#')) {
        throw new Error(value);
      }
      const numValue = typeof value === 'number' ? value : (parseFloat(String(value)) || 0);
      processedExpression = processedExpression.replace(cellRef, String(numValue));
    }

    // Handle functions
    processedExpression = processFunctions(processedExpression, data, currentCell, sheets, currentSheet);

    // Evaluate the expression
    // Use Function constructor for safe evaluation
    const result = new Function('return ' + processedExpression)();
    return typeof result === 'number' && isNaN(result) ? 0 : result;
  } catch (error) {
    return '#ERROR!';
  }
}

// Process Excel functions
function processFunctions(
  expr: string,
  data: CellData,
  currentCell?: string,
  sheets?: { [key: string]: CellData },
  currentSheet?: string
): string {
  // SUM function
  expr = expr.replace(/SUM\(([^)]+)\)/gi, (match, range) => {
    const cells = getRangeCells(range.trim());
    const sum = cells.reduce((acc, cell) => {
      const val = getCellValue(cell, data, sheets, currentSheet, currentCell);
      if (typeof val === 'string' && val.startsWith('#')) return acc;
      return acc + (typeof val === 'number' ? val : parseFloat(String(val)) || 0);
    }, 0);
    return String(sum);
  });

  // AVERAGE function
  expr = expr.replace(/AVERAGE\(([^)]+)\)/gi, (match, range) => {
    const cells = getRangeCells(range.trim());
    if (cells.length === 0) return '0';
    const sum = cells.reduce((acc, cell) => {
      const val = getCellValue(cell, data, sheets, currentSheet, currentCell);
      if (typeof val === 'string' && val.startsWith('#')) return acc;
      return acc + (typeof val === 'number' ? val : parseFloat(String(val)) || 0);
    }, 0);
    return String(sum / cells.length);
  });

  // COUNT function
  expr = expr.replace(/COUNT\(([^)]+)\)/gi, (match, range) => {
    const cells = getRangeCells(range.trim());
    return String(cells.length);
  });

  // MAX function
  expr = expr.replace(/MAX\(([^)]+)\)/gi, (match, range) => {
    const cells = getRangeCells(range.trim());
    if (cells.length === 0) return '0';
    const values = cells.map(cell => {
      const val = getCellValue(cell, data, sheets, currentSheet, currentCell);
      if (typeof val === 'string' && val.startsWith('#')) return -Infinity;
      return typeof val === 'number' ? val : parseFloat(String(val)) || 0;
    }).filter(v => v !== -Infinity);
    if (values.length === 0) return '0';
    return String(Math.max(...values));
  });

  // MIN function
  expr = expr.replace(/MIN\(([^)]+)\)/gi, (match, range) => {
    const cells = getRangeCells(range.trim());
    if (cells.length === 0) return '0';
    const values = cells.map(cell => {
      const val = getCellValue(cell, data, sheets, currentSheet, currentCell);
      if (typeof val === 'string' && val.startsWith('#')) return Infinity;
      return typeof val === 'number' ? val : parseFloat(String(val)) || 0;
    }).filter(v => v !== Infinity);
    if (values.length === 0) return '0';
    return String(Math.min(...values));
  });

  // IF function
  expr = expr.replace(/IF\(([^,]+),([^,]+),([^)]+)\)/gi, (match, condition, trueVal, falseVal) => {
    try {
      const cond = new Function('return ' + condition)();
      return cond ? trueVal.trim() : falseVal.trim();
    } catch {
      return falseVal.trim();
    }
  });

  // VLOOKUP function (simplified)
  expr = expr.replace(/VLOOKUP\(([^,]+),([^,]+),([^,]+),([^)]+)\)/gi, (match, lookup, range, colIndex, exactMatch) => {
    try {
      const lookupVal = new Function('return ' + lookup)();
      const cells = getRangeCells(range.trim());
      const colIdx = parseInt(colIndex.trim()) - 1;
      
      // Simple implementation - find first match
      for (let i = 0; i < cells.length; i += 2) {
        const cellVal = getCellValue(cells[i], data, sheets, currentSheet, currentCell);
        if (String(cellVal) === String(lookupVal)) {
          return String(getCellValue(cells[i + colIdx] || cells[i], data, sheets, currentSheet, currentCell));
        }
      }
      return '#N/A';
    } catch {
      return '#N/A';
    }
  });

  // CONCATENATE function
  expr = expr.replace(/CONCATENATE\(([^)]+)\)/gi, (match, args) => {
    const parts = args.split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, ''));
    return '"' + parts.join('') + '"';
  });

  // UPPER function
  expr = expr.replace(/UPPER\(([^)]+)\)/gi, (match, arg) => {
    const val = arg.trim().replace(/^["']|["']$/g, '');
    return '"' + val.toUpperCase() + '"';
  });

  // LOWER function
  expr = expr.replace(/LOWER\(([^)]+)\)/gi, (match, arg) => {
    const val = arg.trim().replace(/^["']|["']$/g, '');
    return '"' + val.toLowerCase() + '"';
  });

  // LEN function
  expr = expr.replace(/LEN\(([^)]+)\)/gi, (match, arg) => {
    const val = arg.trim().replace(/^["']|["']$/g, '');
    return String(val.length);
  });

  // ROUND function
  expr = expr.replace(/ROUND\(([^,]+),([^)]+)\)/gi, (match, num, decimals) => {
    const n = parseFloat(num) || 0;
    const d = parseInt(decimals) || 0;
    return String(Math.round(n * Math.pow(10, d)) / Math.pow(10, d));
  });

  // ABS function
  expr = expr.replace(/ABS\(([^)]+)\)/gi, (match, arg) => {
    const val = parseFloat(arg) || 0;
    return String(Math.abs(val));
  });

  // SQRT function
  expr = expr.replace(/SQRT\(([^)]+)\)/gi, (match, arg) => {
    const val = parseFloat(arg) || 0;
    return String(Math.sqrt(val));
  });

  // POWER function
  expr = expr.replace(/POWER\(([^,]+),([^)]+)\)/gi, (match, base, exp) => {
    const b = parseFloat(base) || 0;
    const e = parseFloat(exp) || 0;
    return String(Math.pow(b, e));
  });

  // TODAY function
  expr = expr.replace(/TODAY\(\)/gi, () => {
    const today = new Date();
    return String(Math.floor(today.getTime() / (1000 * 60 * 60 * 24)) + 25569); // Excel date serial number
  });

  // NOW function
  expr = expr.replace(/NOW\(\)/gi, () => {
    const now = new Date();
    return String(now.getTime() / (1000 * 60 * 60 * 24) + 25569);
  });

  // COUNTIF function
  expr = expr.replace(/COUNTIF\(([^,]+),([^)]+)\)/gi, (match, range, criteria) => {
    try {
      const cells = getRangeCells(range.trim());
      const crit = criteria.trim().replace(/^["']|["']$/g, '');
      let count = 0;
      cells.forEach(cell => {
        const val = String(getCellValue(cell, data, sheets, currentSheet, currentCell));
        if (crit.startsWith('>')) {
          if (parseFloat(val) > parseFloat(crit.slice(1))) count++;
        } else if (crit.startsWith('<')) {
          if (parseFloat(val) < parseFloat(crit.slice(1))) count++;
        } else if (crit.startsWith('>=')) {
          if (parseFloat(val) >= parseFloat(crit.slice(2))) count++;
        } else if (crit.startsWith('<=')) {
          if (parseFloat(val) <= parseFloat(crit.slice(2))) count++;
        } else if (crit.startsWith('<>')) {
          if (val !== crit.slice(2)) count++;
        } else if (val === crit || val.includes(crit)) {
          count++;
        }
      });
      return String(count);
    } catch {
      return '0';
    }
  });

  // SUMIF function
  expr = expr.replace(/SUMIF\(([^,]+),([^,]+),([^)]+)\)/gi, (match, range, criteria, sumRange) => {
    try {
      const cells = getRangeCells(range.trim());
      const sumCells = getRangeCells(sumRange.trim());
      const crit = criteria.trim().replace(/^["']|["']$/g, '');
      let sum = 0;
      cells.forEach((cell, idx) => {
        const val = String(getCellValue(cell, data, sheets, currentSheet));
        let matches = false;
        if (crit.startsWith('>')) {
          matches = parseFloat(val) > parseFloat(crit.slice(1));
        } else if (crit.startsWith('<')) {
          matches = parseFloat(val) < parseFloat(crit.slice(1));
        } else if (crit.startsWith('>=')) {
          matches = parseFloat(val) >= parseFloat(crit.slice(2));
        } else if (crit.startsWith('<=')) {
          matches = parseFloat(val) <= parseFloat(crit.slice(2));
        } else if (crit.startsWith('<>')) {
          matches = val !== crit.slice(2);
        } else {
          matches = val === crit || val.includes(crit);
        }
        if (matches && sumCells[idx]) {
          const sumVal = getCellValue(sumCells[idx], data, sheets, currentSheet, currentCell);
          sum += typeof sumVal === 'number' ? sumVal : parseFloat(String(sumVal)) || 0;
        }
      });
      return String(sum);
    } catch {
      return '0';
    }
  });

  // IFERROR function
  expr = expr.replace(/IFERROR\(([^,]+),([^)]+)\)/gi, (match, value, errorValue) => {
    try {
      const val = new Function('return ' + value)();
      return String(val === '#ERROR!' || val === '#N/A' || isNaN(val) ? errorValue.trim() : val);
    } catch {
      return errorValue.trim();
    }
  });

  // CONCAT function (alias for CONCATENATE)
  expr = expr.replace(/CONCAT\(([^)]+)\)/gi, (match, args) => {
    const parts = args.split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, ''));
    return '"' + parts.join('') + '"';
  });

  // TRIM function
  expr = expr.replace(/TRIM\(([^)]+)\)/gi, (match, arg) => {
    const val = arg.trim().replace(/^["']|["']$/g, '');
    return '"' + val.trim() + '"';
  });

  // LEFT function
  expr = expr.replace(/LEFT\(([^,]+),([^)]+)\)/gi, (match, text, numChars) => {
    const txt = text.trim().replace(/^["']|["']$/g, '');
    const num = parseInt(numChars) || 1;
    return '"' + txt.substring(0, num) + '"';
  });

  // RIGHT function
  expr = expr.replace(/RIGHT\(([^,]+),([^)]+)\)/gi, (match, text, numChars) => {
    const txt = text.trim().replace(/^["']|["']$/g, '');
    const num = parseInt(numChars) || 1;
    return '"' + txt.substring(txt.length - num) + '"';
  });

  // MID function
  expr = expr.replace(/MID\(([^,]+),([^,]+),([^)]+)\)/gi, (match, text, start, numChars) => {
    const txt = text.trim().replace(/^["']|["']$/g, '');
    const startPos = parseInt(start) - 1;
    const num = parseInt(numChars) || 1;
    return '"' + txt.substring(startPos, startPos + num) + '"';
  });

  // ROUNDUP function
  expr = expr.replace(/ROUNDUP\(([^,]+),([^)]+)\)/gi, (match, num, decimals) => {
    const n = parseFloat(num) || 0;
    const d = parseInt(decimals) || 0;
    return String(Math.ceil(n * Math.pow(10, d)) / Math.pow(10, d));
  });

  // ROUNDDOWN function
  expr = expr.replace(/ROUNDDOWN\(([^,]+),([^)]+)\)/gi, (match, num, decimals) => {
    const n = parseFloat(num) || 0;
    const d = parseInt(decimals) || 0;
    return String(Math.floor(n * Math.pow(10, d)) / Math.pow(10, d));
  });

  // PRODUCT function
  expr = expr.replace(/PRODUCT\(([^)]+)\)/gi, (match, range) => {
    const cells = getRangeCells(range.trim());
    const product = cells.reduce((acc, cell) => {
      const val = getCellValue(cell, data, sheets, currentSheet, currentCell);
      if (typeof val === 'string' && val.startsWith('#')) return acc;
      return acc * (typeof val === 'number' ? val : parseFloat(String(val)) || 1);
    }, 1);
    return String(product);
  });

  // MOD function
  expr = expr.replace(/MOD\(([^,]+),([^)]+)\)/gi, (match, num, divisor) => {
    const n = parseFloat(num) || 0;
    const d = parseFloat(divisor) || 1;
    return String(n % d);
  });

  // INT function
  expr = expr.replace(/INT\(([^)]+)\)/gi, (match, num) => {
    const n = parseFloat(num) || 0;
    return String(Math.floor(n));
  });

  return expr;
}

// Check if a string is a formula
export function isFormula(value: string): boolean {
  return typeof value === 'string' && value.startsWith('=');
}

// Format number based on format string
export function formatCell(value: any, format?: string): string {
  if (value === null || value === undefined) return '';
  
  if (!format) {
    if (typeof value === 'number') {
      return value.toString();
    }
    return String(value);
  }

  if (typeof value === 'number') {
    // Number formats
    if (format === '0' || format === 'General') {
      return value.toString();
    }
    if (format.includes('0.00')) {
      return value.toFixed(2);
    }
    if (format.includes('0.0')) {
      return value.toFixed(1);
    }
    if (format.includes('#,##0')) {
      return value.toLocaleString();
    }
    if (format.includes('$')) {
      return '$' + value.toFixed(2);
    }
    if (format.includes('%')) {
      return (value * 100).toFixed(2) + '%';
    }
    if (format.includes('mm/dd/yyyy') || format.includes('m/d/yyyy')) {
      const date = new Date((value - 25569) * 86400000);
      return date.toLocaleDateString();
    }
  }

  return String(value);
}


