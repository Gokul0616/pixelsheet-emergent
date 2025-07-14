import { promises as fs } from "fs";
import { join } from "path";
import { v4 as uuidv4 } from "uuid";
import {
  type User,
  type InsertUser,
  type Spreadsheet,
  type Sheet,
  type Cell,
  type Comment,
  type Collaborator,
  type Activity,
  type ColumnMetadata,
  type RowMetadata,
  type PivotTable,
  type NamedRange,
  type InsertSpreadsheet,
  type InsertSheet,
  type InsertCell,
  type InsertComment,
  type InsertCollaborator,
  type InsertActivity,
  type InsertColumnMetadata,
  type InsertRowMetadata,
  type InsertPivotTable,
  type InsertNamedRange,
} from "@shared/schema";
import { IStorage } from "./storage";

// Extended User type for authentication
export interface AuthUser extends User {
  id: number;
  username: string;
  email: string;
  password: string;
  role: 'admin' | 'editor' | 'viewer';
  mfaEnabled: boolean;
  mfaSecret?: string;
  mfaBackupCodes?: string[];
  emailVerified: boolean;
  lastLogin?: Date;
  loginAttempts: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSession {
  id: string;
  userId: number;
  token: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
  userAgent?: string;
  ipAddress?: string;
  isRememberMe: boolean;
}

interface JsonData {
  users: AuthUser[];
  sessions: AuthSession[];
  spreadsheets: Spreadsheet[];
  sheets: Sheet[];
  cells: Cell[];
  comments: Comment[];
  collaborators: Collaborator[];
  activities: Activity[];
  columnMetadata: ColumnMetadata[];
  rowMetadata: RowMetadata[];
  pivotTables: PivotTable[];
  namedRanges: NamedRange[];
}

export class JsonFileStorage implements IStorage {
  private dataDir: string;
  private data: JsonData = {
    users: [],
    sessions: [],
    spreadsheets: [],
    sheets: [],
    cells: [],
    comments: [],
    collaborators: [],
    activities: [],
    columnMetadata: [],
    rowMetadata: [],
    pivotTables: [],
    namedRanges: [],
  };

  private counters = {
    users: 1,
    spreadsheets: 1,
    sheets: 1,
    cells: 1,
    comments: 1,
    collaborators: 1,
    activities: 1,
    columnMetadata: 1,
    rowMetadata: 1,
    pivotTables: 1,
    namedRanges: 1,
  };

  constructor(dataDir: string = join(process.cwd(), 'data')) {
    this.dataDir = dataDir;
    this.initializeStorage();
  }

  private async initializeStorage() {
    try {
      // Create data directory if it doesn't exist
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Load existing data or create initial data
      await this.loadData();
      
      console.log('✅ JSON File Storage initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize JSON storage:', error);
      throw error;
    }
  }

  private async loadData() {
    try {
      const files = await fs.readdir(this.dataDir);
      
      for (const collection of Object.keys(this.data) as (keyof JsonData)[]) {
        const filename = `${collection}.json`;
        
        if (files.includes(filename)) {
          const fileContent = await fs.readFile(join(this.dataDir, filename), 'utf-8');
          this.data[collection] = JSON.parse(fileContent) || [];
        }
      }
      
      // Load counters
      const countersFile = join(this.dataDir, 'counters.json');
      try {
        const countersContent = await fs.readFile(countersFile, 'utf-8');
        this.counters = { ...this.counters, ...JSON.parse(countersContent) };
      } catch {
        // Counters file doesn't exist, will be created on first save
      }
      
      // Initialize with sample data if no users exist
      if (this.data.users.length === 0) {
        await this.initializeSampleData();
      }
      
    } catch (error) {
      console.log('No existing data found, initializing with sample data');
      await this.initializeSampleData();
    }
  }

  private async saveData(collection: keyof JsonData) {
    try {
      const filename = `${collection}.json`;
      const filepath = join(this.dataDir, filename);
      
      // Create backup first
      const backupDir = join(this.dataDir, 'backups');
      await fs.mkdir(backupDir, { recursive: true });
      
      try {
        await fs.copyFile(filepath, join(backupDir, `${collection}-${Date.now()}.json`));
      } catch {
        // Backup failed, but continue with save
      }
      
      // Save data atomically
      const tempFile = `${filepath}.tmp`;
      await fs.writeFile(tempFile, JSON.stringify(this.data[collection], null, 2));
      await fs.rename(tempFile, filepath);
      
      // Save counters
      await fs.writeFile(
        join(this.dataDir, 'counters.json'),
        JSON.stringify(this.counters, null, 2)
      );
      
    } catch (error) {
      console.error(`Failed to save ${collection}:`, error);
      throw error;
    }
  }

  private async initializeSampleData() {
    const bcrypt = await import('bcryptjs');
    
    // Create admin user
    const adminUser: AuthUser = {
      id: this.counters.users++,
      username: "admin",
      email: "admin@pixelsheets.com",
      password: await bcrypt.default.hash("admin123", 12),
      role: "admin",
      mfaEnabled: false,
      emailVerified: true,
      loginAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.data.users.push(adminUser);

    // Create demo user
    const demoUser: AuthUser = {
      id: this.counters.users++,
      username: "demo_user",
      email: "demo@pixelsheets.com", 
      password: await bcrypt.default.hash("demo123", 12),
      role: "editor",
      mfaEnabled: false,
      emailVerified: true,
      loginAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.data.users.push(demoUser);

    // Create sample spreadsheet
    const spreadsheet: Spreadsheet = {
      id: this.counters.spreadsheets++,
      name: "Demo Spreadsheet",
      ownerId: demoUser.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      isPublic: false,
      shareSettings: {
        allowEdit: true,
        allowComment: true,
        allowView: true,
      },
    };
    this.data.spreadsheets.push(spreadsheet);

    // Create sample sheet
    const sheet: Sheet = {
      id: this.counters.sheets++,
      spreadsheetId: spreadsheet.id,
      name: "Sheet1",
      index: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.data.sheets.push(sheet);

    // Create sample cells
    const sampleCells = [
      { row: 1, column: 1, value: "Revenue", dataType: "text" as const },
      { row: 1, column: 2, value: "50000", dataType: "number" as const },
      { row: 1, column: 3, value: "55000", dataType: "number" as const },
      { row: 2, column: 1, value: "Expenses", dataType: "text" as const },
      { row: 2, column: 2, value: "35000", dataType: "number" as const },
      { row: 2, column: 3, value: "38000", dataType: "number" as const },
      { row: 3, column: 1, value: "Profit", dataType: "text" as const },
      { row: 3, column: 2, value: "=B1-B2", dataType: "formula" as const, formula: "=B1-B2" },
      { row: 3, column: 3, value: "=C1-C2", dataType: "formula" as const, formula: "=C1-C2" },
    ];

    sampleCells.forEach(cellData => {
      const cell: Cell = {
        id: this.counters.cells++,
        sheetId: sheet.id,
        row: cellData.row,
        column: cellData.column,
        value: cellData.value,
        formula: cellData.formula,
        dataType: cellData.dataType,
        formatting: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.data.cells.push(cell);
    });

    // Save all initial data
    await Promise.all([
      this.saveData('users'),
      this.saveData('spreadsheets'),
      this.saveData('sheets'),
      this.saveData('cells'),
    ]);

    console.log('✅ Sample data initialized');
    console.log('👤 Admin user: admin / admin123');
    console.log('👤 Demo user: demo_user / demo123');
  }

  // Auth-specific methods
  async getUserByEmail(email: string): Promise<AuthUser | undefined> {
    return this.data.users.find(user => user.email === email);
  }

  async getUserByUsername(username: string): Promise<AuthUser | undefined> {
    return this.data.users.find(user => user.username === username);
  }

  async createAuthUser(userData: Partial<AuthUser>): Promise<AuthUser> {
    const user: AuthUser = {
      id: this.counters.users++,
      username: userData.username!,
      email: userData.email!,
      password: userData.password!,
      role: userData.role || 'editor',
      mfaEnabled: false,
      emailVerified: false,
      loginAttempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...userData,
    };
    
    this.data.users.push(user);
    await this.saveData('users');
    return user;
  }

  async updateAuthUser(id: number, updates: Partial<AuthUser>): Promise<AuthUser> {
    const index = this.data.users.findIndex(user => user.id === id);
    if (index === -1) throw new Error("User not found");
    
    this.data.users[index] = { 
      ...this.data.users[index], 
      ...updates, 
      updatedAt: new Date() 
    };
    
    await this.saveData('users');
    return this.data.users[index];
  }

  // Session management
  async createSession(sessionData: Omit<AuthSession, 'id' | 'createdAt'>): Promise<AuthSession> {
    const session: AuthSession = {
      id: uuidv4(),
      createdAt: new Date(),
      ...sessionData,
    };
    
    this.data.sessions.push(session);
    await this.saveData('sessions');
    return session;
  }

  async getSession(token: string): Promise<AuthSession | undefined> {
    return this.data.sessions.find(session => session.token === token);
  }

  async deleteSession(token: string): Promise<void> {
    this.data.sessions = this.data.sessions.filter(session => session.token !== token);
    await this.saveData('sessions');
  }

  async deleteUserSessions(userId: number): Promise<void> {
    this.data.sessions = this.data.sessions.filter(session => session.userId !== userId);
    await this.saveData('sessions');
  }

  // Implement IStorage interface methods
  async getUser(id: number): Promise<User | undefined> {
    return this.data.users.find(user => user.id === id);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // This creates a basic user - use createAuthUser for full auth user
    const user = await this.createAuthUser({
      username: insertUser.username,
      email: insertUser.username + "@example.com", // Default email
      password: insertUser.password,
      role: 'editor',
    });
    return user;
  }

  async getSpreadsheet(id: number): Promise<Spreadsheet | undefined> {
    return this.data.spreadsheets.find(s => s.id === id);
  }

  async getSpreadsheetsByUser(userId: number): Promise<Spreadsheet[]> {
    return this.data.spreadsheets.filter(s => s.ownerId === userId);
  }

  async createSpreadsheet(insertSpreadsheet: InsertSpreadsheet): Promise<Spreadsheet> {
    const spreadsheet: Spreadsheet = {
      id: this.counters.spreadsheets++,
      ...insertSpreadsheet,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.data.spreadsheets.push(spreadsheet);
    await this.saveData('spreadsheets');
    return spreadsheet;
  }

  async updateSpreadsheet(id: number, updates: Partial<Spreadsheet>): Promise<Spreadsheet> {
    const index = this.data.spreadsheets.findIndex(s => s.id === id);
    if (index === -1) throw new Error("Spreadsheet not found");
    
    this.data.spreadsheets[index] = { 
      ...this.data.spreadsheets[index], 
      ...updates, 
      updatedAt: new Date() 
    };
    
    await this.saveData('spreadsheets');
    return this.data.spreadsheets[index];
  }

  async deleteSpreadsheet(id: number): Promise<void> {
    this.data.spreadsheets = this.data.spreadsheets.filter(s => s.id !== id);
    await this.saveData('spreadsheets');
  }

  async duplicateSpreadsheet(id: number, ownerId: number): Promise<Spreadsheet> {
    const original = await this.getSpreadsheet(id);
    if (!original) throw new Error("Spreadsheet not found");
    
    const duplicate: Spreadsheet = {
      id: this.counters.spreadsheets++,
      name: `Copy of ${original.name}`,
      description: original.description,
      ownerId,
      isPublic: false,
      shareSettings: original.shareSettings,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.data.spreadsheets.push(duplicate);
    await this.saveData('spreadsheets');
    return duplicate;
  }

  async getSheetsBySpreadsheet(spreadsheetId: number): Promise<Sheet[]> {
    return this.data.sheets.filter(s => s.spreadsheetId === spreadsheetId);
  }

  async getSheet(id: number): Promise<Sheet | undefined> {
    return this.data.sheets.find(s => s.id === id);
  }

  async createSheet(insertSheet: InsertSheet): Promise<Sheet> {
    const sheet: Sheet = {
      id: this.counters.sheets++,
      ...insertSheet,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.data.sheets.push(sheet);
    await this.saveData('sheets');
    return sheet;
  }

  async updateSheet(id: number, updates: Partial<Sheet>): Promise<Sheet> {
    const index = this.data.sheets.findIndex(s => s.id === id);
    if (index === -1) throw new Error("Sheet not found");
    
    this.data.sheets[index] = { 
      ...this.data.sheets[index], 
      ...updates, 
      updatedAt: new Date() 
    };
    
    await this.saveData('sheets');
    return this.data.sheets[index];
  }

  async deleteSheet(id: number): Promise<void> {
    this.data.sheets = this.data.sheets.filter(s => s.id !== id);
    await this.saveData('sheets');
  }

  async getCellsBySheet(sheetId: number): Promise<Cell[]> {
    return this.data.cells.filter(c => c.sheetId === sheetId);
  }

  async getCell(sheetId: number, row: number, column: number): Promise<Cell | undefined> {
    return this.data.cells.find(c => 
      c.sheetId === sheetId && c.row === row && c.column === column
    );
  }

  async createCell(insertCell: InsertCell): Promise<Cell> {
    const cell: Cell = {
      id: this.counters.cells++,
      ...insertCell,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.data.cells.push(cell);
    await this.saveData('cells');
    return cell;
  }

  async updateCell(id: number, updates: Partial<Cell>): Promise<Cell> {
    const index = this.data.cells.findIndex(c => c.id === id);
    if (index === -1) throw new Error("Cell not found");
    
    this.data.cells[index] = { 
      ...this.data.cells[index], 
      ...updates, 
      updatedAt: new Date() 
    };
    
    await this.saveData('cells');
    return this.data.cells[index];
  }

  async deleteCell(id: number): Promise<void> {
    this.data.cells = this.data.cells.filter(c => c.id !== id);
    await this.saveData('cells');
  }

  async updateCellByPosition(sheetId: number, row: number, column: number, updates: Partial<Cell>): Promise<Cell> {
    const existingCell = await this.getCell(sheetId, row, column);
    
    if (existingCell) {
      return this.updateCell(existingCell.id, updates);
    } else {
      return this.createCell({
        sheetId,
        row,
        column,
        value: updates.value,
        formula: updates.formula,
        dataType: updates.dataType || "text",
        formatting: updates.formatting,
      });
    }
  }

  // Continue with other interface methods...
  async getCommentsByCell(cellId: number): Promise<Comment[]> {
    return this.data.comments.filter(c => c.cellId === cellId);
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const comment: Comment = {
      id: this.counters.comments++,
      ...insertComment,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.data.comments.push(comment);
    await this.saveData('comments');
    return comment;
  }

  async updateComment(id: number, updates: Partial<Comment>): Promise<Comment> {
    const index = this.data.comments.findIndex(c => c.id === id);
    if (index === -1) throw new Error("Comment not found");
    
    this.data.comments[index] = { 
      ...this.data.comments[index], 
      ...updates, 
      updatedAt: new Date() 
    };
    
    await this.saveData('comments');
    return this.data.comments[index];
  }

  async deleteComment(id: number): Promise<void> {
    this.data.comments = this.data.comments.filter(c => c.id !== id);
    await this.saveData('comments');
  }

  async getCollaboratorsBySpreadsheet(spreadsheetId: number): Promise<Collaborator[]> {
    return this.data.collaborators.filter(c => c.spreadsheetId === spreadsheetId);
  }

  async createCollaborator(insertCollaborator: InsertCollaborator): Promise<Collaborator> {
    const collaborator: Collaborator = {
      id: this.counters.collaborators++,
      ...insertCollaborator,
      addedAt: new Date(),
    };
    
    this.data.collaborators.push(collaborator);
    await this.saveData('collaborators');
    return collaborator;
  }

  async updateCollaborator(id: number, updates: Partial<Collaborator>): Promise<Collaborator> {
    const index = this.data.collaborators.findIndex(c => c.id === id);
    if (index === -1) throw new Error("Collaborator not found");
    
    this.data.collaborators[index] = { 
      ...this.data.collaborators[index], 
      ...updates 
    };
    
    await this.saveData('collaborators');
    return this.data.collaborators[index];
  }

  async deleteCollaborator(id: number): Promise<void> {
    this.data.collaborators = this.data.collaborators.filter(c => c.id !== id);
    await this.saveData('collaborators');
  }

  async getActivitiesBySpreadsheet(spreadsheetId: number): Promise<Activity[]> {
    return this.data.activities.filter(a => a.spreadsheetId === spreadsheetId);
  }

  async createActivity(insertActivity: InsertActivity): Promise<Activity> {
    const activity: Activity = {
      id: this.counters.activities++,
      ...insertActivity,
      createdAt: new Date(),
    };
    
    this.data.activities.push(activity);
    await this.saveData('activities');
    return activity;
  }

  // Column metadata methods
  async getColumnMetadataBySheet(sheetId: number): Promise<ColumnMetadata[]> {
    return this.data.columnMetadata.filter(c => c.sheetId === sheetId);
  }

  async createColumnMetadata(insertMetadata: InsertColumnMetadata): Promise<ColumnMetadata> {
    const metadata: ColumnMetadata = {
      id: this.counters.columnMetadata++,
      ...insertMetadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.data.columnMetadata.push(metadata);
    await this.saveData('columnMetadata');
    return metadata;
  }

  async updateColumnMetadata(id: number, updates: Partial<ColumnMetadata>): Promise<ColumnMetadata> {
    const index = this.data.columnMetadata.findIndex(c => c.id === id);
    if (index === -1) throw new Error("Column metadata not found");
    
    this.data.columnMetadata[index] = { 
      ...this.data.columnMetadata[index], 
      ...updates, 
      updatedAt: new Date() 
    };
    
    await this.saveData('columnMetadata');
    return this.data.columnMetadata[index];
  }

  async updateColumnMetadataByPosition(sheetId: number, columnIndex: number, updates: Partial<ColumnMetadata>): Promise<ColumnMetadata> {
    const existing = this.data.columnMetadata.find(
      c => c.sheetId === sheetId && c.columnIndex === columnIndex
    );
    
    if (existing) {
      return this.updateColumnMetadata(existing.id, updates);
    } else {
      return this.createColumnMetadata({
        sheetId,
        columnIndex,
        width: updates.width || 100,
        isHidden: updates.isHidden || false,
        autoFit: updates.autoFit || false,
      });
    }
  }

  // Row metadata methods
  async getRowMetadataBySheet(sheetId: number): Promise<RowMetadata[]> {
    return this.data.rowMetadata.filter(r => r.sheetId === sheetId);
  }

  async createRowMetadata(insertMetadata: InsertRowMetadata): Promise<RowMetadata> {
    const metadata: RowMetadata = {
      id: this.counters.rowMetadata++,
      ...insertMetadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.data.rowMetadata.push(metadata);
    await this.saveData('rowMetadata');
    return metadata;
  }

  async updateRowMetadata(id: number, updates: Partial<RowMetadata>): Promise<RowMetadata> {
    const index = this.data.rowMetadata.findIndex(r => r.id === id);
    if (index === -1) throw new Error("Row metadata not found");
    
    this.data.rowMetadata[index] = { 
      ...this.data.rowMetadata[index], 
      ...updates, 
      updatedAt: new Date() 
    };
    
    await this.saveData('rowMetadata');
    return this.data.rowMetadata[index];
  }

  async updateRowMetadataByPosition(sheetId: number, rowIndex: number, updates: Partial<RowMetadata>): Promise<RowMetadata> {
    const existing = this.data.rowMetadata.find(
      r => r.sheetId === sheetId && r.rowIndex === rowIndex
    );
    
    if (existing) {
      return this.updateRowMetadata(existing.id, updates);
    } else {
      return this.createRowMetadata({
        sheetId,
        rowIndex,
        height: updates.height || 21,
        isHidden: updates.isHidden || false,
        autoFit: updates.autoFit || false,
      });
    }
  }

  // Pivot table methods
  async getPivotTablesBySheet(sheetId: number): Promise<PivotTable[]> {
    return this.data.pivotTables.filter(p => p.sheetId === sheetId);
  }

  async createPivotTable(insertPivotTable: InsertPivotTable): Promise<PivotTable> {
    const pivotTable: PivotTable = {
      id: this.counters.pivotTables++,
      ...insertPivotTable,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.data.pivotTables.push(pivotTable);
    await this.saveData('pivotTables');
    return pivotTable;
  }

  async updatePivotTable(id: number, updates: Partial<PivotTable>): Promise<PivotTable> {
    const index = this.data.pivotTables.findIndex(p => p.id === id);
    if (index === -1) throw new Error("Pivot table not found");
    
    this.data.pivotTables[index] = { 
      ...this.data.pivotTables[index], 
      ...updates, 
      updatedAt: new Date() 
    };
    
    await this.saveData('pivotTables');
    return this.data.pivotTables[index];
  }

  async deletePivotTable(id: number): Promise<void> {
    this.data.pivotTables = this.data.pivotTables.filter(p => p.id !== id);
    await this.saveData('pivotTables');
  }

  // Named range methods
  async getNamedRangesBySpreadsheet(spreadsheetId: number): Promise<NamedRange[]> {
    return this.data.namedRanges.filter(n => n.spreadsheetId === spreadsheetId);
  }

  async createNamedRange(insertNamedRange: InsertNamedRange): Promise<NamedRange> {
    const namedRange: NamedRange = {
      id: this.counters.namedRanges++,
      ...insertNamedRange,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    this.data.namedRanges.push(namedRange);
    await this.saveData('namedRanges');
    return namedRange;
  }

  async updateNamedRange(id: number, updates: Partial<NamedRange>): Promise<NamedRange> {
    const index = this.data.namedRanges.findIndex(n => n.id === id);
    if (index === -1) throw new Error("Named range not found");
    
    this.data.namedRanges[index] = { 
      ...this.data.namedRanges[index], 
      ...updates, 
      updatedAt: new Date() 
    };
    
    await this.saveData('namedRanges');
    return this.data.namedRanges[index];
  }

  async deleteNamedRange(id: number): Promise<void> {
    this.data.namedRanges = this.data.namedRanges.filter(n => n.id !== id);
    await this.saveData('namedRanges');
  }
}