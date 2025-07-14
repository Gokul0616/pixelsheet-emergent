import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { JsonFileStorage } from "./json-storage";
import { authenticateToken, generalLimiter, requireRole } from "./auth";
import { registerAuthRoutes } from "./auth-routes";
import helmet from "helmet";
import cors from "cors";
import { FormulaEngine } from "./formula-engine";
import { 
  insertSpreadsheetSchema, 
  insertSheetSchema, 
  insertCellSchema, 
  insertCommentSchema,
  insertCollaboratorSchema,
  insertActivitySchema,
  insertColumnMetadataSchema,
  insertRowMetadataSchema,
  insertPivotTableSchema,
  insertNamedRangeSchema,
} from "@shared/schema";

// Initialize JSON file storage
const jsonStorage = new JsonFileStorage();

export async function registerRoutes(app: Express): Promise<Server> {
  // Trust proxy for Replit environment
  app.set('trust proxy', true);
  
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://replit.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:", "ws://localhost:*", "wss://localhost:*"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
      },
    },
  }));

  app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://yourapp.com'] // Add your production domains
      : ['http://localhost:3000', 'http://localhost:5000', 'http://localhost:24678'],
    credentials: true,
  }));

  // Rate limiting
  app.use("/api", generalLimiter);

  // Register authentication routes (public)
  registerAuthRoutes(app, jsonStorage);

  // Middleware to authenticate API routes only (not static assets)
  app.use("/api", (req, res, next) => {
    // Skip authentication for auth routes
    if (req.path.startsWith('/api/auth/')) {
      return next();
    }
    // Apply authentication for other API routes
    return authenticateToken(jsonStorage)(req, res, next);
  });

  // Spreadsheet routes (protected)
  app.get("/api/spreadsheets", async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const spreadsheets = await jsonStorage.getSpreadsheetsByUser(userId);
      res.json(spreadsheets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch spreadsheets" });
    }
  });

  app.get("/api/spreadsheets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req as any).user.id;
      const spreadsheet = await jsonStorage.getSpreadsheet(id);
      
      if (!spreadsheet) {
        return res.status(404).json({ error: "Spreadsheet not found" });
      }
      
      // Check if user has access to this spreadsheet
      if (spreadsheet.ownerId !== userId) {
        // Check if user is a collaborator (implement this check)
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(spreadsheet);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch spreadsheet" });
    }
  });

  app.post("/api/spreadsheets", async (req, res) => {
    try {
      const userId = (req as any).user.id;
      const data = insertSpreadsheetSchema.parse({ 
        ...req.body, 
        ownerId: userId,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Create spreadsheet
      const spreadsheet = await jsonStorage.createSpreadsheet(data);
      
      // Create default sheet for the spreadsheet
      const defaultSheet = await jsonStorage.createSheet({
        spreadsheetId: spreadsheet.id,
        name: 'Sheet1',
        position: 0,
        isVisible: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      res.json({ ...spreadsheet, defaultSheetId: defaultSheet.id });
    } catch (error) {
      res.status(400).json({ error: "Invalid spreadsheet data" });
    }
  });

  // Duplicate spreadsheet
  app.post("/api/spreadsheets/:id/duplicate", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req as any).user.id;
      
      const originalSpreadsheet = await jsonStorage.getSpreadsheet(id);
      if (!originalSpreadsheet) {
        return res.status(404).json({ error: "Spreadsheet not found" });
      }
      
      // Check if user has access to the original spreadsheet
      if (originalSpreadsheet.ownerId !== userId && !originalSpreadsheet.isPublic) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Create duplicate spreadsheet
      const duplicateData = {
        name: `Copy of ${originalSpreadsheet.name}`,
        description: originalSpreadsheet.description,
        ownerId: userId,
        isPublic: false,
        shareSettings: originalSpreadsheet.shareSettings,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const duplicateSpreadsheet = await jsonStorage.createSpreadsheet(duplicateData);
      
      // Get original sheets and duplicate them
      const originalSheets = await jsonStorage.getSheetsBySpreadsheet(id);
      for (const sheet of originalSheets) {
        const duplicateSheet = await jsonStorage.createSheet({
          spreadsheetId: duplicateSpreadsheet.id,
          name: sheet.name,
          position: sheet.position,
          isVisible: sheet.isVisible,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        // Get original cells and duplicate them
        const originalCells = await jsonStorage.getCellsBySheet(sheet.id);
        for (const cell of originalCells) {
          await jsonStorage.createCell({
            sheetId: duplicateSheet.id,
            row: cell.row,
            column: cell.column,
            value: cell.value,
            formula: cell.formula,
            dataType: cell.dataType,
            formatting: cell.formatting,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
      
      res.json(duplicateSpreadsheet);
    } catch (error) {
      res.status(500).json({ error: "Failed to duplicate spreadsheet" });
    }
  });

  // Delete spreadsheet
  app.delete("/api/spreadsheets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req as any).user.id;
      
      const spreadsheet = await jsonStorage.getSpreadsheet(id);
      if (!spreadsheet) {
        return res.status(404).json({ error: "Spreadsheet not found" });
      }
      
      // Only owner can delete
      if (spreadsheet.ownerId !== userId) {
        return res.status(403).json({ error: "Only the owner can delete this spreadsheet" });
      }
      
      // Delete all associated data (sheets, cells, etc.)
      const sheets = await jsonStorage.getSheetsBySpreadsheet(id);
      for (const sheet of sheets) {
        // Delete cells first
        const cells = await jsonStorage.getCellsBySheet(sheet.id);
        for (const cell of cells) {
          await jsonStorage.deleteCell(cell.id);
        }
        // Delete sheet
        await jsonStorage.deleteSheet(sheet.id);
      }
      
      // Delete spreadsheet
      await jsonStorage.deleteSpreadsheet(id);
      
      res.json({ message: "Spreadsheet deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete spreadsheet" });
    }
  });

  app.put("/api/spreadsheets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = (req as any).user.id;
      const spreadsheet = await jsonStorage.getSpreadsheet(id);
      
      if (!spreadsheet || spreadsheet.ownerId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const updates = req.body;
      const updatedSpreadsheet = await jsonStorage.updateSpreadsheet(id, updates);
      res.json(updatedSpreadsheet);
    } catch (error) {
      res.status(400).json({ error: "Failed to update spreadsheet" });
    }
  });

  // Sheet routes
  app.get("/api/spreadsheets/:id/sheets", async (req, res) => {
    try {
      const spreadsheetId = parseInt(req.params.id);
      const sheets = await jsonStorage.getSheetsBySpreadsheet(spreadsheetId);
      res.json(sheets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch sheets" });
    }
  });

  app.post("/api/spreadsheets/:id/sheets", async (req, res) => {
    try {
      const spreadsheetId = parseInt(req.params.id);
      const data = insertSheetSchema.parse({ ...req.body, spreadsheetId });
      const sheet = await jsonStorage.createSheet(data);
      res.json(sheet);
    } catch (error) {
      res.status(400).json({ error: "Invalid sheet data" });
    }
  });

  app.put("/api/sheets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const sheet = await jsonStorage.updateSheet(id, updates);
      res.json(sheet);
    } catch (error) {
      res.status(400).json({ error: "Failed to update sheet" });
    }
  });

  app.delete("/api/sheets/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await jsonStorage.deleteSheet(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: "Failed to delete sheet" });
    }
  });

  // Cell routes
  app.get("/api/sheets/:id/cells", async (req, res) => {
    try {
      const sheetId = parseInt(req.params.id);
      const cells = await jsonStorage.getCellsBySheet(sheetId);
      res.json(cells);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cells", details: error.message });
    }
  });

  app.put("/api/sheets/:sheetId/cells/:row/:column", authenticateToken(jsonStorage), async (req, res) => {
    try {
      const sheetId = parseInt(req.params.sheetId);
      const row = parseInt(req.params.row);
      const column = parseInt(req.params.column);
      const updates = req.body;
      const userId = (req as any).user.id;
      
      // Check if user has access to this sheet
      const sheet = await jsonStorage.getSheet(sheetId);
      if (!sheet) {
        return res.status(404).json({ error: "Sheet not found" });
      }
      
      const spreadsheet = await jsonStorage.getSpreadsheet(sheet.spreadsheetId);
      if (!spreadsheet) {
        return res.status(404).json({ error: "Spreadsheet not found" });
      }
      
      // Check access - owner or if public and allows editing
      if (spreadsheet.ownerId !== userId && (!spreadsheet.isPublic || !spreadsheet.shareSettings?.allowEdit)) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const cell = await jsonStorage.updateCellByPosition(sheetId, row, column, {
        ...updates,
        updatedAt: new Date()
      });
      
      // Log activity
      await jsonStorage.createActivity({
        spreadsheetId: sheet.spreadsheetId,
        userId: userId,
        action: "cell_updated",
        details: { sheetId, row, column, value: updates.value },
      });
      
      res.json(cell);
    } catch (error) {
      console.error('Cell update error:', error);
      res.status(500).json({ error: "Failed to update cell" });
    }
  });

  // Comment routes
  app.get("/api/cells/:id/comments", async (req, res) => {
    try {
      const cellId = parseInt(req.params.id);
      const comments = await jsonStorage.getCommentsByCell(cellId);
      res.json(comments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch comments" });
    }
  });

  app.post("/api/cells/:id/comments", async (req, res) => {
    try {
      const cellId = parseInt(req.params.id);
      const userId = (req as any).user.id;
      const data = insertCommentSchema.parse({ ...req.body, cellId, userId });
      const comment = await jsonStorage.createComment(data);
      res.json(comment);
    } catch (error) {
      res.status(400).json({ error: "Invalid comment data" });
    }
  });

  // Activity routes
  app.get("/api/spreadsheets/:id/activities", async (req, res) => {
    try {
      const spreadsheetId = parseInt(req.params.id);
      const activities = await jsonStorage.getActivitiesBySpreadsheet(spreadsheetId);
      res.json(activities);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });

  // Collaborator routes
  app.get("/api/spreadsheets/:id/collaborators", async (req, res) => {
    try {
      const spreadsheetId = parseInt(req.params.id);
      const collaborators = await jsonStorage.getCollaboratorsBySpreadsheet(spreadsheetId);
      res.json(collaborators);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch collaborators" });
    }
  });

  // Export routes
  app.get("/api/spreadsheets/:id/export/csv", async (req, res) => {
    try {
      const spreadsheetId = parseInt(req.params.id);
      const sheets = await jsonStorage.getSheetsBySpreadsheet(spreadsheetId);
      
      if (sheets.length === 0) {
        return res.status(404).json({ error: "No sheets found" });
      }
      
      const firstSheet = sheets[0];
      const cells = await jsonStorage.getCellsBySheet(firstSheet.id);
      
      // Convert cells to CSV format
      const maxRow = Math.max(...cells.map(c => c.row), 0);
      const maxCol = Math.max(...cells.map(c => c.column), 0);
      
      const csvRows = [];
      for (let row = 1; row <= maxRow; row++) {
        const csvRow = [];
        for (let col = 1; col <= maxCol; col++) {
          const cell = cells.find(c => c.row === row && c.column === col);
          csvRow.push(cell?.value || "");
        }
        csvRows.push(csvRow.join(","));
      }
      
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${firstSheet.name}.csv"`);
      res.send(csvRows.join("\n"));
    } catch (error) {
      res.status(500).json({ error: "Failed to export spreadsheet" });
    }
  });

  // Column metadata routes
  app.get("/api/sheets/:id/columns", async (req, res) => {
    try {
      const sheetId = parseInt(req.params.id);
      const columns = await jsonStorage.getColumnMetadataBySheet(sheetId);
      res.json(columns);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch column metadata" });
    }
  });

  app.put("/api/sheets/:sheetId/columns/:columnIndex", async (req, res) => {
    try {
      const sheetId = parseInt(req.params.sheetId);
      const columnIndex = parseInt(req.params.columnIndex);
      const updates = req.body;
      
      const column = await jsonStorage.updateColumnMetadataByPosition(sheetId, columnIndex, updates);
      res.json(column);
    } catch (error) {
      res.status(400).json({ error: "Failed to update column metadata" });
    }
  });

  // Row metadata routes
  app.get("/api/sheets/:id/rows", async (req, res) => {
    try {
      const sheetId = parseInt(req.params.id);
      const rows = await jsonStorage.getRowMetadataBySheet(sheetId);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch row metadata" });
    }
  });

  app.put("/api/sheets/:sheetId/rows/:rowIndex", async (req, res) => {
    try {
      const sheetId = parseInt(req.params.sheetId);
      const rowIndex = parseInt(req.params.rowIndex);
      const updates = req.body;
      
      const row = await jsonStorage.updateRowMetadataByPosition(sheetId, rowIndex, updates);
      res.json(row);
    } catch (error) {
      res.status(400).json({ error: "Failed to update row metadata" });
    }
  });

  // Pivot table routes
  app.get("/api/sheets/:id/pivots", async (req, res) => {
    try {
      const sheetId = parseInt(req.params.id);
      const pivots = await jsonStorage.getPivotTablesBySheet(sheetId);
      res.json(pivots);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pivot tables" });
    }
  });

  app.post("/api/sheets/:id/pivots", async (req, res) => {
    try {
      const sheetId = parseInt(req.params.id);
      const data = insertPivotTableSchema.parse({ ...req.body, sheetId });
      const pivot = await jsonStorage.createPivotTable(data);
      res.json(pivot);
    } catch (error) {
      res.status(400).json({ error: "Invalid pivot table data" });
    }
  });

  app.put("/api/pivots/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const pivot = await jsonStorage.updatePivotTable(id, updates);
      res.json(pivot);
    } catch (error) {
      res.status(400).json({ error: "Failed to update pivot table" });
    }
  });

  app.delete("/api/pivots/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await jsonStorage.deletePivotTable(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: "Failed to delete pivot table" });
    }
  });

  // Named ranges routes
  app.get("/api/spreadsheets/:id/named-ranges", async (req, res) => {
    try {
      const spreadsheetId = parseInt(req.params.id);
      const namedRanges = await jsonStorage.getNamedRangesBySpreadsheet(spreadsheetId);
      res.json(namedRanges);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch named ranges" });
    }
  });

  app.post("/api/spreadsheets/:id/named-ranges", async (req, res) => {
    try {
      const spreadsheetId = parseInt(req.params.id);
      const data = insertNamedRangeSchema.parse({ ...req.body, spreadsheetId });
      const namedRange = await jsonStorage.createNamedRange(data);
      res.json(namedRange);
    } catch (error) {
      res.status(400).json({ error: "Invalid named range data" });
    }
  });

  app.put("/api/named-ranges/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const namedRange = await jsonStorage.updateNamedRange(id, updates);
      res.json(namedRange);
    } catch (error) {
      res.status(400).json({ error: "Failed to update named range" });
    }
  });

  app.delete("/api/named-ranges/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await jsonStorage.deleteNamedRange(id);
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: "Failed to delete named range" });
    }
  });

  // Data validation endpoint
  app.post("/api/sheets/:sheetId/cells/:row/:column/validate", async (req, res) => {
    try {
      const sheetId = parseInt(req.params.sheetId);
      const row = parseInt(req.params.row);
      const column = parseInt(req.params.column);
      const { value, validation } = req.body;
      
      // Perform validation logic here
      let isValid = true;
      let message = "";
      
      if (validation) {
        switch (validation.type) {
          case 'list':
            if (validation.listItems && !validation.listItems.includes(value)) {
              isValid = false;
              message = validation.customMessage || "Value must be from the allowed list";
            }
            break;
          case 'number':
            const numValue = parseFloat(value);
            if (isNaN(numValue)) {
              isValid = false;
              message = "Value must be a number";
            } else if (validation.numberMin !== undefined && numValue < validation.numberMin) {
              isValid = false;
              message = `Value must be at least ${validation.numberMin}`;
            } else if (validation.numberMax !== undefined && numValue > validation.numberMax) {
              isValid = false;
              message = `Value must be at most ${validation.numberMax}`;
            }
            break;
          case 'text':
            if (validation.textLength) {
              if (validation.textLength.min && value.length < validation.textLength.min) {
                isValid = false;
                message = `Text must be at least ${validation.textLength.min} characters`;
              } else if (validation.textLength.max && value.length > validation.textLength.max) {
                isValid = false;
                message = `Text must be at most ${validation.textLength.max} characters`;
              }
            }
            break;
          case 'date':
            const dateValue = new Date(value);
            if (isNaN(dateValue.getTime())) {
              isValid = false;
              message = "Value must be a valid date";
            }
            break;
        }
      }
      
      res.json({ isValid, message });
    } catch (error) {
      res.status(400).json({ error: "Validation failed" });
    }
  });

  const httpServer = createServer(app);
  
  // WebSocket server for real-time collaboration
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Store active connections by spreadsheet ID
  const connections = new Map<number, Set<WebSocket>>();
  const userSessions = new Map<WebSocket, { userId: number; username: string; spreadsheetId: number }>();
  
  wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection');
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        switch (data.type) {
          case 'join':
            handleJoin(ws, data);
            break;
          case 'cell_update':
            handleCellUpdate(ws, data);
            break;
          case 'cursor_move':
            handleCursorMove(ws, data);
            break;
          case 'selection_change':
            handleSelectionChange(ws, data);
            break;
          case 'comment_add':
            handleCommentAdd(ws, data);
            break;
          case 'typing_start':
            handleTypingStart(ws, data);
            break;
          case 'typing_stop':
            handleTypingStop(ws, data);
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
    
    ws.on('close', () => {
      handleDisconnect(ws);
    });
  });
  
  function handleJoin(ws: WebSocket, data: any) {
    const { spreadsheetId, userId, username } = data;
    
    // Store user session
    userSessions.set(ws, { userId, username, spreadsheetId });
    
    // Add to spreadsheet connections
    if (!connections.has(spreadsheetId)) {
      connections.set(spreadsheetId, new Set());
    }
    connections.get(spreadsheetId)!.add(ws);
    
    // Broadcast user joined
    broadcast(spreadsheetId, {
      type: 'user_joined',
      user: { id: userId, username },
      timestamp: Date.now()
    }, ws);
    
    // Send current online users
    const onlineUsers = Array.from(connections.get(spreadsheetId) || [])
      .map(socket => userSessions.get(socket))
      .filter(session => session !== undefined);
    
    ws.send(JSON.stringify({
      type: 'online_users',
      users: onlineUsers
    }));
  }
  
  function handleCellUpdate(ws: WebSocket, data: any) {
    const session = userSessions.get(ws);
    if (!session) return;
    
    // Broadcast cell update to other users
    broadcast(session.spreadsheetId, {
      type: 'cell_updated',
      user: { id: session.userId, username: session.username },
      cell: data.cell,
      value: data.value,
      formula: data.formula,
      timestamp: Date.now()
    }, ws);
  }
  
  function handleCursorMove(ws: WebSocket, data: any) {
    const session = userSessions.get(ws);
    if (!session) return;
    
    broadcast(session.spreadsheetId, {
      type: 'cursor_moved',
      user: { id: session.userId, username: session.username },
      position: data.position,
      timestamp: Date.now()
    }, ws);
  }
  
  function handleSelectionChange(ws: WebSocket, data: any) {
    const session = userSessions.get(ws);
    if (!session) return;
    
    broadcast(session.spreadsheetId, {
      type: 'selection_changed',
      user: { id: session.userId, username: session.username },
      selection: data.selection,
      timestamp: Date.now()
    }, ws);
  }
  
  function handleCommentAdd(ws: WebSocket, data: any) {
    const session = userSessions.get(ws);
    if (!session) return;
    
    broadcast(session.spreadsheetId, {
      type: 'comment_added',
      user: { id: session.userId, username: session.username },
      comment: data.comment,
      timestamp: Date.now()
    }, ws);
  }
  
  function handleTypingStart(ws: WebSocket, data: any) {
    const session = userSessions.get(ws);
    if (!session) return;
    
    broadcast(session.spreadsheetId, {
      type: 'typing_started',
      user: { id: session.userId, username: session.username },
      cell: data.cell,
      timestamp: Date.now()
    }, ws);
  }
  
  function handleTypingStop(ws: WebSocket, data: any) {
    const session = userSessions.get(ws);
    if (!session) return;
    
    broadcast(session.spreadsheetId, {
      type: 'typing_stopped',
      user: { id: session.userId, username: session.username },
      cell: data.cell,
      timestamp: Date.now()
    }, ws);
  }
  
  function handleDisconnect(ws: WebSocket) {
    const session = userSessions.get(ws);
    if (session) {
      // Remove from connections
      const spreadsheetConnections = connections.get(session.spreadsheetId);
      if (spreadsheetConnections) {
        spreadsheetConnections.delete(ws);
        if (spreadsheetConnections.size === 0) {
          connections.delete(session.spreadsheetId);
        }
      }
      
      // Broadcast user left
      broadcast(session.spreadsheetId, {
        type: 'user_left',
        user: { id: session.userId, username: session.username },
        timestamp: Date.now()
      });
      
      userSessions.delete(ws);
    }
  }
  
  function broadcast(spreadsheetId: number, message: any, exclude?: WebSocket) {
    const spreadsheetConnections = connections.get(spreadsheetId);
    if (spreadsheetConnections) {
      spreadsheetConnections.forEach(ws => {
        if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(message));
        }
      });
    }
  }
  
  return httpServer;
}
