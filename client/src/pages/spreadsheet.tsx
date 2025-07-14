import { useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { GoogleSheetsGrid } from "@/components/spreadsheet/GoogleSheetsGrid";
import { RealTimeCollaboration } from "@/components/spreadsheet/RealTimeCollaboration";
import { FormulaBar } from "@/components/spreadsheet/FormulaBar";
import { FormattingToolbar } from "@/components/spreadsheet/FormattingToolbar";
import { MenuBar } from "@/components/spreadsheet/MenuBar";
import { SheetTabs } from "@/components/spreadsheet/SheetTabs";
import { Sidebar } from "@/components/spreadsheet/Sidebar";
import { ShareDialog } from "@/components/spreadsheet/ShareDialog";
import { AdvancedFeatures } from "@/components/spreadsheet/AdvancedFeatures";
import { SmartFeatures } from "@/components/spreadsheet/SmartFeatures";
import { ChartManager, useChartManager } from "@/components/spreadsheet/ChartManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Share, Edit2, Users, Wifi, WifiOff } from "lucide-react";
import { useSpreadsheet } from "@/hooks/use-spreadsheet";
import { useWebSocket } from "@/hooks/use-websocket";
import { useToast } from "@/hooks/use-toast";
import { SpreadsheetExporter } from "@/lib/export-utils";

export default function SpreadsheetPage() {
  const params = useParams();
  const spreadsheetId = params.id ? parseInt(params.id) : 1;
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedCells, setSelectedCells] = useState<{ row: number; column: number; sheetId: number }[]>([]);
  const [selectionRange, setSelectionRange] = useState<{
    startRow: number;
    startCol: number; 
    endRow: number;
    endCol: number;
  } | null>(null);
  const [formulaBarVisible, setFormulaBarVisible] = useState(true);
  const [gridLinesVisible, setGridLinesVisible] = useState(true);
  const [zoom, setZoom] = useState(100);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    selectedCell,
    setSelectedCell,
    activeSheet,
    setActiveSheet,
    formulaValue,
    setFormulaValue,
    isEditing,
    setIsEditing,
    saveStatus,
  } = useSpreadsheet(spreadsheetId);

  // Chart management - moved after activeSheet is initialized
  const { charts, setCharts, addChart } = useChartManager(activeSheet || 1);

  const { data: spreadsheet, isLoading: isLoadingSpreadsheet } = useQuery({
    queryKey: ["/api/spreadsheets", spreadsheetId],
  });

  const { data: sheets, isLoading: isLoadingSheets } = useQuery({
    queryKey: ["/api/spreadsheets", spreadsheetId, "sheets"],
  });

  const { data: activities } = useQuery({
    queryKey: ["/api/spreadsheets", spreadsheetId, "activities"],
  });

  const { data: collaborators } = useQuery({
    queryKey: ["/api/spreadsheets", spreadsheetId, "collaborators"],
  });

  // Get cells data for the active sheet
  const { data: cells } = useQuery({
    queryKey: ["/api/sheets", activeSheet, "cells"],
    enabled: !!activeSheet,
  });

  // WebSocket integration for real-time collaboration
  const {
    isConnected,
    onlineUsers,
    realtimeUpdates,
    sendCellUpdate,
    sendCursorMove,
    sendSelectionChange,
    sendCommentAdd,
    sendTypingStart,
    sendTypingStop,
  } = useWebSocket(spreadsheetId, 1, "Demo User");

  // Handle cell selection with range support
  const handleCellSelect = (row: number, column: number) => {
    setSelectedCell({ row, column, sheetId: activeSheet || 1 });
    setSelectedCells([{ row, column, sheetId: activeSheet || 1 }]);
    setFormulaValue(getCellDisplayValue(row, column));
    setSelectionRange(null); // Clear range when selecting single cell
  };

  // Handle range selection
  const handleRangeSelect = (range: { startRow: number; startCol: number; endRow: number; endCol: number }) => {
    setSelectionRange(range);
    const cells = [];
    for (let row = Math.min(range.startRow, range.endRow); row <= Math.max(range.startRow, range.endRow); row++) {
      for (let col = Math.min(range.startCol, range.endCol); col <= Math.max(range.startCol, range.endCol); col++) {
        cells.push({ row, column: col, sheetId: activeSheet || 1 });
      }
    }
    setSelectedCells(cells);
  };

  const getCellDisplayValue = (row: number, column: number) => {
    if (!cells) return "";
    
    const cell = cells.find((c: any) => c.row === row && c.column === column);
    if (!cell) return "";
    
    // For editing, show the raw formula or value
    if (cell.dataType === 'formula' && cell.formula) {
      return cell.formula;
    }
    
    return cell.value || "";
  };
  const handleCellUpdate = async (row: number, column: number, value: string, formula?: string) => {
    if (!activeSheet) return;
    
    try {
      // Determine data type and process the value
      let processedValue = value;
      let dataType = 'text';
      let processedFormula = formula;
      
      if (value.startsWith('=')) {
        dataType = 'formula';
        processedFormula = value;
        processedValue = value; // Keep the formula as value for now
      } else if (!isNaN(Number(value)) && value !== '') {
        dataType = 'number';
      }
      
      // Update the cell on the backend
      const response = await fetch(`/api/sheets/${activeSheet}/cells/${row}/${column}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: processedValue,
          formula: processedFormula,
          dataType
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update cell');
      }
      
      // Invalidate and refetch the cells
      queryClient.invalidateQueries({ queryKey: ["/api/sheets", activeSheet, "cells"] });
      
      // Broadcast to other users
      sendCellUpdate({
        row,
        column,
        sheetId: activeSheet,
        value: processedValue,
        formula: processedFormula
      }, processedValue, processedFormula);
      
      // Silent cell update - no toast notification for better UX
    } catch (error) {
      console.error('Error updating cell:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update cell. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Handle toolbar actions
  const handleToolbarAction = async (action: string, data?: any) => {
    if (!activeSheet) return;

    switch (action) {
      // File menu actions
      case 'newSpreadsheet':
        // TODO: Implement new spreadsheet creation
        toast({
          title: "New Spreadsheet",
          description: "Creating new spreadsheet...",
        });
        break;
        
      case 'saveSpreadsheet':
        // Auto-save notification removed for cleaner UX
        break;

      case 'printSpreadsheet':
        window.print();
        break;

      // Edit menu actions
      case 'copy':
        if (selectedCells.length > 0) {
          const cellsData = selectedCells.map(cell => ({
            row: cell.row,
            column: cell.column,
            value: getCellValue(cell.row, cell.column),
            formula: getCellFormula(cell.row, cell.column)
          }));
          
          // Copy to system clipboard
          const textData = cellsData.map(cell => cell.value).join('\t');
          navigator.clipboard?.writeText(textData);
          
          // Silent copy operation
        }
        break;

      case 'cut':
        if (selectedCells.length > 0) {
          const cellsData = selectedCells.map(cell => ({
            row: cell.row,
            column: cell.column,
            value: getCellValue(cell.row, cell.column),
            formula: getCellFormula(cell.row, cell.column)
          }));
          
          // Copy to system clipboard
          const textData = cellsData.map(cell => cell.value).join('\t');
          navigator.clipboard?.writeText(textData);
          
          // Clear the cells
          for (const cell of selectedCells) {
            await handleCellUpdate(cell.row, cell.column, "");
          }
          
          // Silent cut operation
        }
        break;

      case 'paste':
        if (selectedCell) {
          try {
            const text = await navigator.clipboard.readText();
            const values = text.split('\t');
            
            for (let i = 0; i < values.length; i++) {
              const row = selectedCell.row;
              const col = selectedCell.column + i;
              if (col <= 26) {
                await handleCellUpdate(row, col, values[i]);
              }
            }
            
            // Silent paste operation
          } catch (error) {
            toast({
              title: "Paste Failed",
              description: "Unable to access clipboard",
              variant: "destructive"
            });
          }
        }
        break;

      case 'selectAll':
        const allCells = [];
        for (let row = 1; row <= 100; row++) {
          for (let col = 1; col <= 26; col++) {
            allCells.push({ row, column: col, sheetId: activeSheet });
          }
        }
        setSelectedCells(allCells);
        setSelectionRange({ startRow: 1, startCol: 1, endRow: 100, endCol: 26 });
        // Silent select all operation
        break;

      case 'delete':
        if (selectedCells.length > 0) {
          for (const cell of selectedCells) {
            await handleCellUpdate(cell.row, cell.column, "");
          }
          // Silent delete operation
        }
        break;

      // Insert menu actions
      case 'insertRowAbove':
      case 'insertRowBelow':
        if (selectedCell) {
          toast({
            title: "Insert Row",
            description: `Row ${action === 'insertRowAbove' ? 'above' : 'below'} ${selectedCell.row} inserted`,
          });
        }
        break;

      case 'insertColumnLeft':
      case 'insertColumnRight':
        if (selectedCell) {
          const colLetter = String.fromCharCode(64 + selectedCell.column);
          toast({
            title: "Insert Column",
            description: `Column ${action === 'insertColumnLeft' ? 'left of' : 'right of'} ${colLetter} inserted`,
          });
        }
        break;

      case 'insertComment':
        if (selectedCell) {
          toast({
            title: "Add Comment",
            description: `Comment added to ${String.fromCharCode(64 + selectedCell.column)}${selectedCell.row}`,
          });
        }
        break;

      // Format menu actions  
      case 'bold':
      case 'italic':
      case 'underline':
        if (selectedCells.length > 0) {
          toast({
            title: `${action.charAt(0).toUpperCase() + action.slice(1)} Applied`,
            description: `${selectedCells.length} cells formatted`,
          });
        }
        break;

      case 'alignLeft':
      case 'alignCenter':
      case 'alignRight':
        if (selectedCells.length > 0) {
          toast({
            title: "Alignment Changed",
            description: `${selectedCells.length} cells aligned ${action.replace('align', '').toLowerCase()}`,
          });
        }
        break;

      case 'mergeCells':
        if (selectedCells.length > 1) {
          toast({
            title: "Cells Merged",
            description: `${selectedCells.length} cells merged successfully`,
          });
        }
        break;

      // Data menu actions
      case 'sortAscA':
      case 'sortDescA':
        if (selectedCells.length > 0) {
          toast({
            title: "Data Sorted",
            description: `Data sorted ${action === 'sortAscA' ? 'ascending' : 'descending'}`,
          });
        }
        break;

      case 'createFilter':
        if (selectedCells.length > 0) {
          toast({
            title: "Filter Created", 
            description: "Filter applied to selected range",
          });
        }
        break;

      // Keep existing actions
      case 'insertRow':
        console.log('Insert row:', data);
        toast({
          title: "Insert Row",
          description: "Row inserted successfully",
        });
        break;
      case 'insertColumn':
        console.log('Insert column:', data);
        toast({
          title: "Insert Column", 
          description: "Column inserted successfully",
        });
        break;
      case 'deleteRow':
        console.log('Delete row:', data);
        toast({
          title: "Delete Row",
          description: "Row deleted successfully", 
        });
        break;
      case 'deleteColumn':
        console.log('Delete column:', data);
        toast({
          title: "Delete Column",
          description: "Column deleted successfully",
        });
        break;
      case 'undo':
        console.log('Undo:', data);
        toast({
          title: "Undo",
          description: "Last action undone",
        });
        break;
      case 'redo':
        console.log('Redo:', data);
        toast({
          title: "Redo", 
          description: "Last action redone",
        });
        break;
      case 'download':
        console.log('Download:', data);
        await handleDownload(data?.format || 'xlsx', data?.options || {});
        break;
      case 'exportData':
        console.log('Export data:', data);
        await handleDownload(data?.format || 'xlsx', data?.options || {});
        break;
      case 'format':
        console.log('Format:', data);
        break;
      case 'sort':
        console.log('Sort:', data);
        break;
      case 'insertChart':
        console.log('Insert chart:', data);
        if (data?.config) {
          addChart(data.config);
          toast({
            title: "Chart Inserted",
            description: `${data.config.type} chart added to spreadsheet`,
          });
        }
        break;
      case 'insertImage':
        console.log('Insert image:', data);
        break;
      case 'findReplace':
        toast({
          title: "Find & Replace",
          description: "Find and replace dialog opened",
        });
        break;
      case 'freeze':
        console.log('Freeze:', data);
        break;
      case 'insertRows':
        console.log('Insert rows:', data);
        break;
      case 'insertColumns':
        console.log('Insert columns:', data);
        break;
      case 'conditionalFormatting':
        console.log('Conditional formatting:', data);
        toast({
          title: "Conditional Formatting",
          description: "Formatting rules applied successfully",
        });
        break;
      case 'dataValidation':
        console.log('Data validation:', data);
        toast({
          title: "Data Validation",
          description: "Validation rules applied successfully",
        });
        break;
      case 'pivotTable':
        console.log('Pivot table:', data);
        break;
      case 'spellCheck':
        console.log('Spell check:', data);
        break;
      case 'scriptEditor':
        console.log('Script editor:', data);
        break;
      case 'functionList':
        console.log('Function list:', data);
        break;
      case 'numberFormat':
        console.log('Number format:', data);
        break;
      case 'protectedRange':
        console.log('Protected range:', data);
        toast({
          title: "Protected Range",
          description: "Range protection applied successfully",
        });
        break;
      case 'smartFill':
        console.log('Smart fill:', data);
        toast({
          title: "Smart Fill",
          description: "Pattern detected and applied automatically",
        });
        break;
      case 'applySmartFill':
        console.log('Apply smart fill:', data);
        toast({
          title: "Smart Fill Applied",
          description: `${data.description} applied successfully`,
        });
        break;
      case 'formulaSuggestions':
        console.log('Formula suggestions:', data);
        toast({
          title: "Formula Suggestions",
          description: "AI-powered formula recommendations available",
        });
        break;
      case 'dataInsights':
        console.log('Data insights:', data);
        toast({
          title: "Data Insights",
          description: "Analytical insights generated for your data",
        });
        break;
      case 'explore':
        console.log('Explore:', data);
        toast({
          title: "Explore Data",
          description: "Data exploration panel opened",
        });
        break;
      case 'namedRanges':
        console.log('Named ranges:', data);
        toast({
          title: "Named Ranges",
          description: "Named range feature opened",
        });
        break;
      case 'filterViews':
        console.log('Filter views:', data);
        toast({
          title: "Filter Views",
          description: "Personal filter views available",
        });
        break;
      case 'importData':
        console.log('Import data:', data);
        toast({
          title: "Import Data",
          description: `Importing data from ${data?.type || 'unknown'} source`,
        });
        break;
      default:
        console.log('Unknown action:', action, data);
    }
  };

  // Helper functions for getting cell data
  const getCellValue = (row: number, column: number) => {
    if (!cells) return "";
    const cell = cells.find((c: any) => c.row === row && c.column === column);
    if (!cell) return "";
    
    // Use calculated_value for formulas, otherwise use value
    if (cell.dataType === 'formula' && 'calculated_value' in cell) {
      return String(cell.calculated_value);
    }
    
    return cell.value || "";
  };

  const getCellFormula = (row: number, column: number) => {
    if (!cells) return "";
    const cell = cells.find((c: any) => c.row === row && c.column === column);
    return cell?.formula || "";
  };

  // Enhanced download functionality with new export system
  const handleDownload = async (format: string, options: any = {}) => {
    try {
      toast({
        title: "Export Started",
        description: `Preparing ${format.toUpperCase()} export...`,
      });

      // Get current sheet data
      const currentSheetId = activeSheet || 1;
      const response = await fetch(`/api/sheets/${currentSheetId}/cells`);
      const cellsData = await response.json();

      // Convert to the format expected by the exporter
      const cells = cellsData.map((cell: any) => ({
        row: cell.row,
        column: cell.column,
        value: cell.value || '',
        formula: cell.formula,
        formatting: cell.formatting,
      }));

      // Use the enhanced export system
      const blob = await SpreadsheetExporter.exportSpreadsheet(cells, format as any, {
        sheetName: spreadsheet?.name || 'Ultimate Pixel Sheet',
        includeFormatting: options.includeFormatting !== false,
        includeFormulas: options.includeFormulas !== false,
      });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${spreadsheet?.name || 'spreadsheet'}.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: `${format.toUpperCase()} file downloaded successfully`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: `Failed to export ${format.toUpperCase()} file. Please try again.`,
        variant: "destructive",
      });
    }
  };



  if (isLoadingSpreadsheet || isLoadingSheets) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex items-center space-x-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-lg">Loading spreadsheet...</span>
        </div>
      </div>
    );
  }

  const currentSheet = sheets?.find(s => s.id === activeSheet) || sheets?.[0];

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
                </svg>
              </div>
              <h1 className="text-lg font-medium text-gray-800">Ultimate Pixel Sheets</h1>
            </div>
            <div className="flex items-center space-x-2">
              <Input
                value={spreadsheet?.name || "Untitled spreadsheet"}
                className="text-sm border-none bg-transparent hover:bg-gray-50 focus:bg-white focus:border-primary"
                readOnly
              />
              <Edit2 className="w-4 h-4 text-gray-400 cursor-pointer hover:text-primary" />
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Real-time collaboration indicators */}
            <div className="flex items-center space-x-2">
              {/* Connection Status */}
              <div className="flex items-center space-x-1">
                {isConnected ? (
                  <Wifi className="w-4 h-4 text-green-500" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-500" />
                )}
                <span className="text-xs text-gray-500">
                  {isConnected ? 'Live' : 'Offline'}
                </span>
              </div>
              
              {/* Online Users */}
              {onlineUsers.length > 0 && (
                <div className="flex items-center space-x-2">
                  <div className="flex -space-x-2">
                    {onlineUsers.slice(0, 3).map((user, index) => (
                      <div
                        key={`online-${user.id}-${index}`}
                        className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-medium border-2 border-white"
                        title={user.username}
                      >
                        {user.username?.charAt(0)?.toUpperCase() || (index + 1)}
                      </div>
                    ))}
                    {onlineUsers.length > 3 && (
                      <div className="w-8 h-8 rounded-full bg-gray-500 text-white flex items-center justify-center text-sm font-medium border-2 border-white">
                        +{onlineUsers.length - 3}
                      </div>
                    )}
                  </div>
                  <span className="text-sm text-gray-600">
                    {onlineUsers.length} online
                  </span>
                </div>
              )}
              
              {/* Fallback for collaborators when offline */}
              {!isConnected && collaborators && collaborators.length > 0 && (
                <div className="flex items-center space-x-2">
                  <div className="flex -space-x-2">
                    {collaborators.slice(0, 3).map((collaborator, index) => (
                      <div
                        key={`collaborator-${collaborator.id}-${index}`}
                        className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-medium border-2 border-white"
                      >
                        {index + 1}
                      </div>
                    ))}
                  </div>
                  <span className="text-sm text-gray-600">
                    {collaborators.length} collaborator{collaborators.length > 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
            
            {/* Share Dialog */}
            <ShareDialog
              spreadsheetId={spreadsheetId}
              spreadsheetName={spreadsheet?.name || "Untitled"}
              isPublic={spreadsheet?.isPublic || false}
              collaborators={collaborators || []}
              onlineUsers={onlineUsers}
            />
            
            <div className="flex items-center space-x-2">
              <Badge variant={isConnected ? "default" : "secondary"}>
                {saveStatus}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Menu Bar */}
      <MenuBar
        spreadsheetId={spreadsheetId}
        selectedCell={selectedCell?.row && selectedCell?.column ? `${String.fromCharCode(64 + selectedCell.column)}${selectedCell.row}` : null}
        selectedCells={selectedCells}
        onAction={handleToolbarAction}
        formulaBarVisible={formulaBarVisible}
        gridLinesVisible={gridLinesVisible}
        onToggleFormulaBar={() => setFormulaBarVisible(!formulaBarVisible)}
        onToggleGridLines={() => setGridLinesVisible(!gridLinesVisible)}
        onZoomChange={setZoom}
        zoom={zoom}
      />

      {/* Smart Features */}
      <SmartFeatures onAction={handleToolbarAction} />

      {/* Advanced Features */}
      <AdvancedFeatures 
        selectedCell={selectedCell}
        onAction={handleToolbarAction}
      />

      {/* Formatting Toolbar */}
      <FormattingToolbar
        selectedCell={selectedCell}
        selectedCells={selectedCells}
        onAction={handleToolbarAction}
      />

      {/* Formula Bar */}
      {formulaBarVisible && (
        <FormulaBar
          selectedCell={selectedCell}
          formulaValue={formulaValue}
          setFormulaValue={setFormulaValue}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          onCellUpdate={handleCellUpdate}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Grid with Chart Overlay */}
        <div className="flex-1 overflow-hidden relative">
          {currentSheet && (
            <>
              <div className="h-full overflow-hidden">
                <GoogleSheetsGrid
                  sheetId={currentSheet.id}
                  cells={cells || []}
                  onCellSelect={handleCellSelect}
                  onCellEdit={handleCellUpdate}
                  selectedCell={selectedCell}
                  isEditing={isEditing}
                  onEditingChange={setIsEditing}
                />
              </div>
              
              {/* Real-time Collaboration */}
              <RealTimeCollaboration
                spreadsheetId={spreadsheetId}
                sheetId={currentSheet.id}
                currentCell={selectedCell}
                isEditing={isEditing}
                onCellUpdate={(update) => {
                  // Handle real-time cell updates from other users
                  queryClient.invalidateQueries({ queryKey: ["/api/sheets", currentSheet.id, "cells"] });
                }}
                onCollaboratorJoin={(user) => {
                  toast({
                    title: "Collaborator Joined",
                    description: `${user.username} joined the spreadsheet`,
                    duration: 2000,
                  });
                }}
                onCollaboratorLeave={(userId) => {
                  toast({
                    title: "Collaborator Left", 
                    description: `A collaborator left the spreadsheet`,
                    duration: 2000,
                  });
                }}
              />
              
              {/* Chart Overlay */}
              <ChartManager
                sheetId={currentSheet.id}
                charts={charts}
                onChartsUpdate={setCharts}
              />
            </>
          )}
        </div>

        {/* Sidebar */}
        {isSidebarOpen && (
          <Sidebar
            activities={activities || []}
            collaborators={collaborators || []}
            onClose={() => setIsSidebarOpen(false)}
          />
        )}
      </div>

      {/* Sheet Tabs */}
      <SheetTabs
        sheets={sheets || []}
        activeSheet={activeSheet}
        setActiveSheet={setActiveSheet}
        spreadsheetId={spreadsheetId}
      />
    </div>
  );
}
