import { useEffect } from 'react';

interface UseKeyboardShortcutsProps {
  onCopy?: () => void;
  onPaste?: () => void;
  onCut?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSelectAll?: () => void;
  onSave?: () => void;
  onFind?: () => void;
  onNewSheet?: () => void;
  onBold?: () => void;
  onItalic?: () => void;
  onUnderline?: () => void;
  onDelete?: () => void;
  onEnter?: () => void;
  onEscape?: () => void;
  onArrowKeys?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onTab?: (shift: boolean) => void;
  onF2?: () => void;
  isEditing?: boolean;
  disabled?: boolean;
}

export function useKeyboardShortcuts({
  onCopy,
  onPaste,
  onCut,
  onUndo,
  onRedo,
  onSelectAll,
  onSave,
  onFind,
  onNewSheet,
  onBold,
  onItalic,
  onUnderline,
  onDelete,
  onEnter,
  onEscape,
  onArrowKeys,
  onTab,
  onF2,
  isEditing = false,
  disabled = false,
}: UseKeyboardShortcutsProps = {}) {
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const isAlt = e.altKey;

      // Prevent default for most shortcuts
      if (!isEditing) {
        // Navigation shortcuts (only when not editing)
        switch (e.key) {
          case 'ArrowUp':
            e.preventDefault();
            onArrowKeys?.('up');
            break;
          case 'ArrowDown':
            e.preventDefault();
            onArrowKeys?.('down');
            break;
          case 'ArrowLeft':
            e.preventDefault();
            onArrowKeys?.('left');
            break;
          case 'ArrowRight':
            e.preventDefault();
            onArrowKeys?.('right');
            break;
          case 'Tab':
            e.preventDefault();
            onTab?.(isShift);
            break;
          case 'Enter':
            e.preventDefault();
            onEnter?.();
            break;
          case 'F2':
            e.preventDefault();
            onF2?.();
            break;
          case 'Delete':
          case 'Backspace':
            if (!isCtrlOrCmd) {
              e.preventDefault();
              onDelete?.();
            }
            break;
        }

        // Ctrl/Cmd shortcuts (work in both modes but different behaviors)
        if (isCtrlOrCmd) {
          switch (e.key) {
            case 'c':
              e.preventDefault();
              onCopy?.();
              break;
            case 'v':
              e.preventDefault();
              onPaste?.();
              break;
            case 'x':
              e.preventDefault();
              onCut?.();
              break;
            case 'z':
              e.preventDefault();
              if (isShift) {
                onRedo?.();
              } else {
                onUndo?.();
              }
              break;
            case 'y':
              e.preventDefault();
              onRedo?.();
              break;
            case 'a':
              e.preventDefault();
              onSelectAll?.();
              break;
            case 's':
              e.preventDefault();
              onSave?.();
              break;
            case 'f':
              e.preventDefault();
              onFind?.();
              break;
            case 'b':
              e.preventDefault();
              onBold?.();
              break;
            case 'i':
              e.preventDefault();
              onItalic?.();
              break;
            case 'u':
              e.preventDefault();
              onUnderline?.();
              break;
          }
        }

        // Alt shortcuts
        if (isAlt) {
          switch (e.key) {
            case 'n':
              e.preventDefault();
              onNewSheet?.();
              break;
          }
        }
      } else {
        // Editing mode - only handle specific keys
        switch (e.key) {
          case 'Enter':
            if (!isShift) {
              e.preventDefault();
              onEnter?.();
            }
            break;
          case 'Escape':
            e.preventDefault();
            onEscape?.();
            break;
          case 'Tab':
            e.preventDefault();
            onTab?.(isShift);
            break;
        }

        // Allow some Ctrl shortcuts in editing mode
        if (isCtrlOrCmd) {
          switch (e.key) {
            case 's':
              e.preventDefault();
              onSave?.();
              break;
            case 'z':
              if (isShift) {
                onRedo?.();
              } else {
                onUndo?.();
              }
              break;
            case 'y':
              onRedo?.();
              break;
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [
    onCopy,
    onPaste,
    onCut,
    onUndo,
    onRedo,
    onSelectAll,
    onSave,
    onFind,
    onNewSheet,
    onBold,
    onItalic,
    onUnderline,
    onDelete,
    onEnter,
    onEscape,
    onArrowKeys,
    onTab,
    onF2,
    isEditing,
    disabled,
  ]);
}

// Google Sheets specific shortcuts
export const GOOGLE_SHEETS_SHORTCUTS = {
  // Navigation
  'Arrow Keys': 'Move between cells',
  'Tab / Shift+Tab': 'Move right/left between cells',
  'Enter / Shift+Enter': 'Move down/up between cells',
  'Ctrl+Home': 'Go to cell A1',
  'Ctrl+End': 'Go to last cell with data',
  'Page Up/Down': 'Move one screen up/down',
  
  // Selection
  'Shift+Arrow': 'Extend selection',
  'Ctrl+A': 'Select all',
  'Ctrl+Space': 'Select entire column',
  'Shift+Space': 'Select entire row',
  
  // Editing
  'F2': 'Edit cell',
  'Delete/Backspace': 'Clear cell content',
  'Escape': 'Cancel edit',
  'Ctrl+Enter': 'Enter and stay in same cell',
  
  // Clipboard
  'Ctrl+C': 'Copy',
  'Ctrl+V': 'Paste',
  'Ctrl+X': 'Cut',
  'Ctrl+Shift+V': 'Paste special',
  
  // Formatting
  'Ctrl+B': 'Bold',
  'Ctrl+I': 'Italic',
  'Ctrl+U': 'Underline',
  'Ctrl+Shift+5': 'Strikethrough',
  
  // Functions
  'Ctrl+S': 'Save',
  'Ctrl+Z': 'Undo',
  'Ctrl+Y / Ctrl+Shift+Z': 'Redo',
  'Ctrl+F': 'Find',
  'Ctrl+H': 'Find and replace',
  
  // Sheets
  'Alt+N': 'New sheet',
  'Ctrl+Page Up/Down': 'Switch between sheets',
};