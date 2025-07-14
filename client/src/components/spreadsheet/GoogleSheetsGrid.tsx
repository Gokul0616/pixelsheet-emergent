import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface Cell {
  id?: number;
  row: number;
  column: number;
  value: string | null;
  formula?: string | null;
  dataType?: string;
  formatting?: any;
}

interface Selection {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

interface GoogleSheetsGridProps {
  sheetId: number;
  cells: Cell[];
  onCellSelect: (row: number, col: number) => void;
  onCellEdit: (row: number, col: number, value: string) => void;
  selectedCell: { row: number; column: number } | null;
  isEditing: boolean;
  onEditingChange: (editing: boolean) => void;
}

const ROWS = 1000;
const COLS = 26;

// Convert column number to letter (1 = A, 2 = B, etc.)
const columnToLetter = (col: number): string => {
  let result = '';
  while (col > 0) {
    col--;
    result = String.fromCharCode(65 + (col % 26)) + result;
    col = Math.floor(col / 26);
  }
  return result;
};

export function GoogleSheetsGrid({
  sheetId,
  cells,
  onCellSelect,
  onCellEdit,
  selectedCell,
  isEditing,
  onEditingChange,
}: GoogleSheetsGridProps) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ row: number; col: number } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [clipboard, setClipboard] = useState<Cell[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Create cell data map for quick lookups
  const cellMap = new Map<string, Cell>();
  cells.forEach(cell => {
    cellMap.set(`${cell.row}-${cell.column}`, cell);
  });

  // Save cell mutation
  const saveCellMutation = useMutation({
    mutationFn: async ({ row, column, value }: { row: number; column: number; value: string }) => {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`/api/sheets/${sheetId}/cells/${row}/${column}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          value,
          dataType: value.startsWith('=') ? 'formula' : isNaN(Number(value)) ? 'text' : 'number',
          formula: value.startsWith('=') ? value : null,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save cell');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sheets', sheetId, 'cells'] });
    },
    onError: (error) => {
      console.error('Cell save error:', error);
      toast({
        title: 'Error',
        description: 'Failed to save cell. Please check your permissions.',
        variant: 'destructive',
      });
    },
  });

  // Get cell value
  const getCellValue = (row: number, col: number): string => {
    const cell = cellMap.get(`${row}-${col}`);
    return cell?.value || '';
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedCell) return;

      const { row, column } = selectedCell;

      // Navigation keys
      if (!isEditing) {
        switch (e.key) {
          case 'ArrowUp':
            e.preventDefault();
            if (row > 1) onCellSelect(row - 1, column);
            break;
          case 'ArrowDown':
            e.preventDefault();
            if (row < ROWS) onCellSelect(row + 1, column);
            break;
          case 'ArrowLeft':
            e.preventDefault();
            if (column > 1) onCellSelect(row, column - 1);
            break;
          case 'ArrowRight':
            e.preventDefault();
            if (column < COLS) onCellSelect(row, column + 1);
            break;
          case 'Tab':
            e.preventDefault();
            if (e.shiftKey) {
              if (column > 1) onCellSelect(row, column - 1);
            } else {
              if (column < COLS) onCellSelect(row, column + 1);
            }
            break;
          case 'Enter':
            e.preventDefault();
            if (e.shiftKey) {
              if (row > 1) onCellSelect(row - 1, column);
            } else {
              if (row < ROWS) onCellSelect(row + 1, column);
            }
            break;
          case 'F2':
            e.preventDefault();
            startEditing();
            break;
          case 'Delete':
          case 'Backspace':
            e.preventDefault();
            if (selection) {
              clearSelection();
            } else {
              saveCellMutation.mutate({ row, column, value: '' });
            }
            break;
        }

        // Copy/Paste/Cut shortcuts
        if (e.ctrlKey || e.metaKey) {
          switch (e.key) {
            case 'c':
              e.preventDefault();
              copySelection();
              break;
            case 'v':
              e.preventDefault();
              pasteSelection();
              break;
            case 'x':
              e.preventDefault();
              cutSelection();
              break;
            case 'a':
              e.preventDefault();
              selectAll();
              break;
          }
        }
      } else {
        // Editing mode
        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            finishEditing();
            if (row < ROWS) onCellSelect(row + 1, column);
            break;
          case 'Escape':
            e.preventDefault();
            cancelEditing();
            break;
          case 'Tab':
            e.preventDefault();
            finishEditing();
            if (e.shiftKey) {
              if (column > 1) onCellSelect(row, column - 1);
            } else {
              if (column < COLS) onCellSelect(row, column + 1);
            }
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedCell, isEditing, selection]);

  const startEditing = () => {
    if (!selectedCell) return;
    const currentValue = getCellValue(selectedCell.row, selectedCell.column);
    setEditingValue(currentValue);
    onEditingChange(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const finishEditing = () => {
    if (!selectedCell) return;
    saveCellMutation.mutate({
      row: selectedCell.row,
      column: selectedCell.column,
      value: editingValue,
    });
    onEditingChange(false);
    setEditingValue('');
  };

  const cancelEditing = () => {
    onEditingChange(false);
    setEditingValue('');
  };

  // Selection operations
  const copySelection = () => {
    if (!selection && !selectedCell) return;
    
    const cells: Cell[] = [];
    if (selection) {
      for (let row = selection.startRow; row <= selection.endRow; row++) {
        for (let col = selection.startCol; col <= selection.endCol; col++) {
          const cell = cellMap.get(`${row}-${col}`);
          cells.push({
            row,
            column: col,
            value: cell?.value || '',
            formula: cell?.formula,
            dataType: cell?.dataType,
          });
        }
      }
    } else if (selectedCell) {
      const cell = cellMap.get(`${selectedCell.row}-${selectedCell.column}`);
      cells.push({
        row: selectedCell.row,
        column: selectedCell.column,
        value: cell?.value || '',
        formula: cell?.formula,
        dataType: cell?.dataType,
      });
    }
    setClipboard(cells);
    toast({ title: 'Copied', description: `${cells.length} cell(s) copied` });
  };

  const pasteSelection = () => {
    if (!selectedCell || clipboard.length === 0) return;
    
    const startRow = selectedCell.row;
    const startCol = selectedCell.column;
    
    clipboard.forEach(cell => {
      const targetRow = startRow + (cell.row - clipboard[0].row);
      const targetCol = startCol + (cell.column - clipboard[0].column);
      
      if (targetRow <= ROWS && targetCol <= COLS) {
        saveCellMutation.mutate({
          row: targetRow,
          column: targetCol,
          value: cell.value || '',
        });
      }
    });
    
    toast({ title: 'Pasted', description: `${clipboard.length} cell(s) pasted` });
  };

  const cutSelection = () => {
    copySelection();
    clearSelection();
  };

  const clearSelection = () => {
    if (!selection && !selectedCell) return;
    
    if (selection) {
      for (let row = selection.startRow; row <= selection.endRow; row++) {
        for (let col = selection.startCol; col <= selection.endCol; col++) {
          saveCellMutation.mutate({ row, column: col, value: '' });
        }
      }
    } else if (selectedCell) {
      saveCellMutation.mutate({
        row: selectedCell.row,
        column: selectedCell.column,
        value: '',
      });
    }
  };

  const selectAll = () => {
    setSelection({ startRow: 1, startCol: 1, endRow: ROWS, endCol: COLS });
  };

  // Mouse handlers for selection and dragging
  const handleMouseDown = (row: number, col: number, e: React.MouseEvent) => {
    if (isEditing) finishEditing();
    
    onCellSelect(row, col);
    
    if (e.shiftKey && selectedCell) {
      // Extend selection
      setSelection({
        startRow: Math.min(selectedCell.row, row),
        startCol: Math.min(selectedCell.column, col),
        endRow: Math.max(selectedCell.row, row),
        endCol: Math.max(selectedCell.column, col),
      });
    } else {
      setSelection(null);
      setIsSelecting(true);
      setDragStart({ row, col });
    }
  };

  const handleMouseEnter = (row: number, col: number) => {
    if (isSelecting && dragStart) {
      setSelection({
        startRow: Math.min(dragStart.row, row),
        startCol: Math.min(dragStart.col, col),
        endRow: Math.max(dragStart.row, row),
        endCol: Math.max(dragStart.col, col),
      });
    }
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
    setDragStart(null);
  };

  // Fill handle for dragging to copy
  const handleFillHandleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDragging(true);
  };

  // Double click to edit
  const handleDoubleClick = (row: number, col: number) => {
    onCellSelect(row, col);
    setTimeout(startEditing, 0);
  };

  // Render cell
  const renderCell = (row: number, col: number) => {
    const cellKey = `${row}-${col}`;
    const cell = cellMap.get(cellKey);
    const value = cell?.value || '';
    
    const isSelected = selectedCell?.row === row && selectedCell?.column === col;
    const isInSelection = selection && 
      row >= selection.startRow && row <= selection.endRow &&
      col >= selection.startCol && col <= selection.endCol;

    return (
      <div
        key={cellKey}
        className={cn(
          'relative border-r border-b border-gray-200 h-8 min-w-[100px] max-w-[200px] overflow-hidden',
          'hover:bg-blue-50 cursor-cell select-none',
          isSelected && 'ring-2 ring-blue-500 bg-blue-50',
          isInSelection && 'bg-blue-100',
          cell?.formatting?.backgroundColor && `bg-${cell.formatting.backgroundColor}`,
          cell?.formatting?.bold && 'font-bold',
          cell?.formatting?.italic && 'italic',
          cell?.formatting?.textAlign && `text-${cell.formatting.textAlign}`
        )}
        onMouseDown={(e) => handleMouseDown(row, col, e)}
        onMouseEnter={() => handleMouseEnter(row, col)}
        onMouseUp={handleMouseUp}
        onDoubleClick={() => handleDoubleClick(row, col)}
      >
        {isEditing && isSelected ? (
          <input
            ref={inputRef}
            value={editingValue}
            onChange={(e) => setEditingValue(e.target.value)}
            className="w-full h-full px-1 border-none outline-none bg-white"
            autoFocus
          />
        ) : (
          <div className="px-1 py-1 text-sm truncate">
            {value}
          </div>
        )}
        
        {/* Fill handle */}
        {isSelected && !isEditing && (
          <div
            className="absolute bottom-0 right-0 w-2 h-2 bg-blue-500 cursor-crosshair"
            onMouseDown={handleFillHandleMouseDown}
          />
        )}
      </div>
    );
  };

  return (
    <div className="relative w-full h-full overflow-auto" ref={gridRef}>
      <div className="sticky top-0 left-0 z-20 bg-gray-100 border-b border-gray-300">
        {/* Corner cell */}
        <div className="absolute top-0 left-0 w-12 h-8 bg-gray-200 border-r border-b border-gray-300" />
        
        {/* Column headers */}
        <div className="flex ml-12">
          {Array.from({ length: COLS }, (_, i) => (
            <div
              key={i}
              className="min-w-[100px] max-w-[200px] h-8 border-r border-gray-300 bg-gray-100 flex items-center justify-center text-sm font-medium"
            >
              {columnToLetter(i + 1)}
            </div>
          ))}
        </div>
      </div>

      <div className="flex">
        {/* Row headers */}
        <div className="sticky left-0 z-10 bg-gray-100 border-r border-gray-300">
          {Array.from({ length: ROWS }, (_, i) => (
            <div
              key={i}
              className="w-12 h-8 border-b border-gray-300 bg-gray-100 flex items-center justify-center text-sm font-medium"
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Grid cells */}
        <div className="flex-1">
          {Array.from({ length: ROWS }, (_, rowIndex) => (
            <div key={rowIndex} className="flex">
              {Array.from({ length: COLS }, (_, colIndex) =>
                renderCell(rowIndex + 1, colIndex + 1)
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}