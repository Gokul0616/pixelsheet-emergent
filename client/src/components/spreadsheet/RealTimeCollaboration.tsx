import React, { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from '@/hooks/use-websocket';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Wifi, WifiOff, Users, Edit3, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

interface User {
  id: number;
  username: string;
  email: string;
  avatar?: string;
}

interface CollaboratorCursor {
  userId: number;
  user: User;
  row: number;
  column: number;
  isEditing: boolean;
  color: string;
}

interface CellUpdate {
  userId: number;
  sheetId: number;
  row: number;
  column: number;
  value: string;
  timestamp: number;
}

interface RealTimeCollaborationProps {
  spreadsheetId: number;
  sheetId: number;
  currentCell?: { row: number; column: number } | null;
  isEditing?: boolean;
  onCellUpdate?: (update: CellUpdate) => void;
  onCollaboratorJoin?: (user: User) => void;
  onCollaboratorLeave?: (userId: number) => void;
}

const CURSOR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA'
];

export function RealTimeCollaboration({
  spreadsheetId,
  sheetId,
  currentCell,
  isEditing = false,
  onCellUpdate,
  onCollaboratorJoin,
  onCollaboratorLeave,
}: RealTimeCollaborationProps) {
  const { user } = useAuth();
  const [collaborators, setCollaborators] = useState<Map<number, CollaboratorCursor>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  const { socket, isConnected: wsConnected } = useWebSocket();

  // Assign colors to users
  const getUserColor = useCallback((userId: number): string => {
    return CURSOR_COLORS[userId % CURSOR_COLORS.length];
  }, []);

  // Handle WebSocket messages
  useEffect(() => {
    if (!socket || !user) return;

    const handleCollaboratorJoin = (data: { user: User }) => {
      const color = getUserColor(data.user.id);
      setCollaborators(prev => new Map(prev.set(data.user.id, {
        userId: data.user.id,
        user: data.user,
        row: 1,
        column: 1,
        isEditing: false,
        color,
      })));
      onCollaboratorJoin?.(data.user);
    };

    const handleCollaboratorLeave = (data: { userId: number }) => {
      setCollaborators(prev => {
        const newMap = new Map(prev);
        newMap.delete(data.userId);
        return newMap;
      });
      onCollaboratorLeave?.(data.userId);
    };

    const handleCursorMove = (data: { userId: number; row: number; column: number; isEditing: boolean }) => {
      if (data.userId === user.id) return; // Ignore own cursor

      setCollaborators(prev => {
        const collaborator = prev.get(data.userId);
        if (!collaborator) return prev;

        return new Map(prev.set(data.userId, {
          ...collaborator,
          row: data.row,
          column: data.column,
          isEditing: data.isEditing,
        }));
      });
    };

    const handleCellUpdate = (data: CellUpdate) => {
      if (data.userId === user.id) return; // Ignore own updates
      onCellUpdate?.(data);
    };

    const handleConnectionStatus = (data: { status: 'connected' | 'disconnected' }) => {
      setConnectionStatus(data.status);
      setIsConnected(data.status === 'connected');
    };

    // Register event listeners
    socket.on('collaborator:join', handleCollaboratorJoin);
    socket.on('collaborator:leave', handleCollaboratorLeave);
    socket.on('cursor:move', handleCursorMove);
    socket.on('cell:update', handleCellUpdate);
    socket.on('connection:status', handleConnectionStatus);

    // Join spreadsheet room
    socket.emit('join:spreadsheet', { spreadsheetId, sheetId });

    return () => {
      socket.off('collaborator:join', handleCollaboratorJoin);
      socket.off('collaborator:leave', handleCollaboratorLeave);
      socket.off('cursor:move', handleCursorMove);
      socket.off('cell:update', handleCellUpdate);
      socket.off('connection:status', handleConnectionStatus);
    };
  }, [socket, user, spreadsheetId, sheetId, getUserColor, onCellUpdate, onCollaboratorJoin, onCollaboratorLeave]);

  // Broadcast cursor position
  useEffect(() => {
    if (!socket || !currentCell || !user) return;

    const throttledEmit = debounce(() => {
      socket.emit('cursor:move', {
        spreadsheetId,
        sheetId,
        row: currentCell.row,
        column: currentCell.column,
        isEditing,
      });
    }, 100);

    throttledEmit();
  }, [socket, currentCell, isEditing, spreadsheetId, sheetId, user]);

  // Broadcast cell updates
  const broadcastCellUpdate = useCallback((row: number, column: number, value: string) => {
    if (!socket || !user) return;

    socket.emit('cell:update', {
      spreadsheetId,
      sheetId,
      row,
      column,
      value,
      userId: user.id,
      timestamp: Date.now(),
    });
  }, [socket, user, spreadsheetId, sheetId]);

  // Render collaborator cursors
  const renderCollaboratorCursors = () => {
    return Array.from(collaborators.values()).map(collaborator => (
      <CollaboratorCursor
        key={collaborator.userId}
        collaborator={collaborator}
        currentCell={currentCell}
      />
    ));
  };

  // Connection status indicator
  const renderConnectionStatus = () => {
    const statusConfig = {
      connecting: { icon: WifiOff, color: 'yellow', text: 'Connecting...' },
      connected: { icon: Wifi, color: 'green', text: 'Connected' },
      disconnected: { icon: WifiOff, color: 'red', text: 'Disconnected' },
    };

    const config = statusConfig[connectionStatus];
    const Icon = config.icon;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={cn(
            'flex items-center gap-1',
            config.color === 'green' && 'border-green-500 text-green-700',
            config.color === 'yellow' && 'border-yellow-500 text-yellow-700',
            config.color === 'red' && 'border-red-500 text-red-700'
          )}>
            <Icon className="w-3 h-3" />
            <span className="text-xs">{config.text}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Real-time collaboration status</p>
        </TooltipContent>
      </Tooltip>
    );
  };

  // Render active collaborators list
  const renderCollaboratorsList = () => {
    const activeCollaborators = Array.from(collaborators.values());

    return (
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-gray-500" />
        <div className="flex -space-x-2">
          {activeCollaborators.map(collaborator => (
            <Tooltip key={collaborator.userId}>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Avatar className="w-6 h-6 border-2 border-white">
                    <AvatarImage src={collaborator.user.avatar} />
                    <AvatarFallback className="text-xs">
                      {collaborator.user.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {collaborator.isEditing && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-white">
                      <Edit3 className="w-2 h-2 text-white" />
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{collaborator.user.username}</p>
                <p className="text-xs text-gray-500">
                  {collaborator.isEditing ? 'Editing' : 'Viewing'} • 
                  Cell {String.fromCharCode(64 + collaborator.column)}{collaborator.row}
                </p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        {activeCollaborators.length > 0 && (
          <span className="text-xs text-gray-500">
            {activeCollaborators.length} active
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="flex items-center gap-4">
      {renderConnectionStatus()}
      {renderCollaboratorsList()}
      {renderCollaboratorCursors()}
    </div>
  );
}

// Collaborator cursor component
function CollaboratorCursor({ 
  collaborator, 
  currentCell 
}: { 
  collaborator: CollaboratorCursor;
  currentCell?: { row: number; column: number } | null;
}) {
  if (!currentCell) return null;

  const isVisible = collaborator.row === currentCell.row && collaborator.column === currentCell.column;
  
  if (!isVisible) return null;

  return (
    <div 
      className="absolute pointer-events-none z-50"
      style={{
        top: `${(collaborator.row - 1) * 32}px`,
        left: `${(collaborator.column - 1) * 100}px`,
      }}
    >
      {/* Cursor indicator */}
      <div 
        className="absolute -top-2 -left-1 w-0.5 h-8 animate-pulse"
        style={{ backgroundColor: collaborator.color }}
      />
      
      {/* User name badge */}
      <div 
        className="absolute -top-6 left-0 px-2 py-1 rounded text-xs text-white whitespace-nowrap"
        style={{ backgroundColor: collaborator.color }}
      >
        {collaborator.user.username}
        {collaborator.isEditing && (
          <Edit3 className="w-3 h-3 inline ml-1" />
        )}
      </div>
      
      {/* Cell border */}
      <div 
        className="absolute top-0 left-0 w-24 h-8 border-2 pointer-events-none"
        style={{ borderColor: collaborator.color }}
      />
    </div>
  );
}

// Utility function for debouncing
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export { CURSOR_COLORS };