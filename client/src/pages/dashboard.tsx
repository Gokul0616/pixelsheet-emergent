import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileSpreadsheet, Calendar, Users, Search, Filter, MoreVertical, Trash2, Edit, Share, Copy } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface Spreadsheet {
  id: number;
  name: string;
  description?: string;
  ownerId: number;
  isPublic: boolean;
  shareSettings?: {
    allowEdit: boolean;
    allowComment: boolean;
    allowView: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'updated'>('updated');
  const [filterBy, setFilterBy] = useState<'all' | 'owned' | 'shared'>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newSpreadsheet, setNewSpreadsheet] = useState({
    name: '',
    description: '',
    isPublic: false,
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch user's spreadsheets
  const { data: spreadsheets = [], isLoading } = useQuery({
    queryKey: ['/api/spreadsheets'],
    enabled: !!user,
  });

  // Create spreadsheet mutation
  const createSpreadsheetMutation = useMutation({
    mutationFn: async (data: typeof newSpreadsheet) => {
      return apiRequest('POST', '/api/spreadsheets', data);
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/spreadsheets'] });
      setIsCreateDialogOpen(false);
      setNewSpreadsheet({ name: '', description: '', isPublic: false });
      toast({
        title: 'Spreadsheet created',
        description: `"${data.name}" has been created successfully.`,
      });
      setLocation(`/spreadsheet/${data.id}`);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to create spreadsheet',
        variant: 'destructive',
      });
    },
  });

  // Delete spreadsheet mutation
  const deleteSpreadsheetMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest('DELETE', `/api/spreadsheets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/spreadsheets'] });
      toast({
        title: 'Spreadsheet deleted',
        description: 'The spreadsheet has been permanently deleted.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to delete spreadsheet',
        variant: 'destructive',
      });
    },
  });

  // Filter and sort spreadsheets
  const filteredSpreadsheets = spreadsheets
    .filter((sheet: Spreadsheet) => {
      const matchesSearch = sheet.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           sheet.description?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesFilter = filterBy === 'all' || 
                           (filterBy === 'owned' && sheet.ownerId === user?.id) ||
                           (filterBy === 'shared' && sheet.ownerId !== user?.id);
      
      return matchesSearch && matchesFilter;
    })
    .sort((a: Spreadsheet, b: Spreadsheet) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'updated':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

  const handleCreateSpreadsheet = () => {
    if (!newSpreadsheet.name.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a spreadsheet name',
        variant: 'destructive',
      });
      return;
    }
    createSpreadsheetMutation.mutate(newSpreadsheet);
  };

  const handleOpenSpreadsheet = (id: number) => {
    setLocation(`/spreadsheet/${id}`);
  };

  const handleDeleteSpreadsheet = (id: number, name: string) => {
    if (confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      deleteSpreadsheetMutation.mutate(id);
    }
  };

  const handleDuplicateSpreadsheet = async (id: number, name: string) => {
    try {
      const response = await apiRequest('POST', `/api/spreadsheets/${id}/duplicate`);
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/spreadsheets'] });
      toast({
        title: 'Spreadsheet duplicated',
        description: `"${data.name}" has been created as a copy.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to duplicate spreadsheet',
        variant: 'destructive',
      });
    }
  };

  if (!user) {
    return <div>Please log in to access your spreadsheets.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Spreadsheets</h1>
              <p className="text-gray-600">Welcome back, {user.username}</p>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  New Spreadsheet
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Spreadsheet</DialogTitle>
                  <DialogDescription>
                    Create a new spreadsheet to start organizing your data.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      value={newSpreadsheet.name}
                      onChange={(e) => setNewSpreadsheet(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter spreadsheet name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="description">Description (optional)</Label>
                    <Textarea
                      id="description"
                      value={newSpreadsheet.description}
                      onChange={(e) => setNewSpreadsheet(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Enter a brief description"
                      rows={3}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="isPublic"
                      checked={newSpreadsheet.isPublic}
                      onChange={(e) => setNewSpreadsheet(prev => ({ ...prev, isPublic: e.target.checked }))}
                      className="rounded"
                    />
                    <Label htmlFor="isPublic">Make this spreadsheet public</Label>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateSpreadsheet}
                      disabled={createSpreadsheetMutation.isPending}
                    >
                      {createSpreadsheetMutation.isPending ? 'Creating...' : 'Create'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Search spreadsheets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Select value={filterBy} onValueChange={(value: any) => setFilterBy(value)}>
              <SelectTrigger className="w-32">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="owned">Owned by me</SelectItem>
                <SelectItem value="shared">Shared with me</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Last modified</SelectItem>
                <SelectItem value="created">Date created</SelectItem>
                <SelectItem value="name">Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Spreadsheets Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredSpreadsheets.length === 0 ? (
          <div className="text-center py-12">
            <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchQuery || filterBy !== 'all' ? 'No spreadsheets found' : 'No spreadsheets yet'}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchQuery || filterBy !== 'all' 
                ? 'Try adjusting your search or filters' 
                : 'Create your first spreadsheet to get started'}
            </p>
            {!searchQuery && filterBy === 'all' && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Spreadsheet
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSpreadsheets.map((spreadsheet: Spreadsheet) => (
              <Card 
                key={spreadsheet.id} 
                className="hover:shadow-lg transition-shadow cursor-pointer group"
                onClick={() => handleOpenSpreadsheet(spreadsheet.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{spreadsheet.name}</CardTitle>
                      <CardDescription className="mt-1">
                        {spreadsheet.description || 'No description'}
                      </CardDescription>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleOpenSpreadsheet(spreadsheet.id);
                        }}>
                          <Edit className="w-4 h-4 mr-2" />
                          Open
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateSpreadsheet(spreadsheet.id, spreadsheet.name);
                        }}>
                          <Copy className="w-4 h-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => e.stopPropagation()}>
                          <Share className="w-4 h-4 mr-2" />
                          Share
                        </DropdownMenuItem>
                        {spreadsheet.ownerId === user.id && (
                          <DropdownMenuItem 
                            className="text-red-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSpreadsheet(spreadsheet.id, spreadsheet.name);
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between text-sm text-gray-500">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDistanceToNow(new Date(spreadsheet.updatedAt), { addSuffix: true })}
                      </div>
                      {spreadsheet.ownerId !== user.id && (
                        <Badge variant="secondary" className="text-xs">
                          <Users className="w-3 h-3 mr-1" />
                          Shared
                        </Badge>
                      )}
                      {spreadsheet.isPublic && (
                        <Badge variant="outline" className="text-xs">
                          Public
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}