"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { 
  Users, 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Target,
  Award,
  BarChart3,
  LineChart,
  PieChart,
  Calendar,
  User,
  UserCheck,
  UserX,
  Zap,
  Filter,
  Search,
  RefreshCw,
  Download,
  Eye,
  Star,
  ThumbsUp,
  MessageSquare,
  FileText,
  Settings,
  Loader2,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react';

interface TeamMember {
  userId: string;
  userName: string;
  userEmail: string;
  userAvatar?: string;
  role: string;
  department: string;
  status: 'ACTIVE' | 'INACTIVE' | 'BUSY' | 'AWAY';
  lastActivity: Date;
  metrics: {
    tasksCompleted: number;
    tasksInProgress: number;
    tasksOverdue: number;
    averageCompletionTime: number; // hours
    productivityScore: number; // 0-100
    qualityScore: number; // 0-100
    collaborationScore: number; // 0-100
  };
  performance: {
    weeklyTasks: number;
    weeklyHours: number;
    efficiency: number; // percentage
    onTimeDelivery: number; // percentage
  };
  activities: Array<{
    id: string;
    type: 'TASK_CREATED' | 'TASK_COMPLETED' | 'COMMENT_ADDED' | 'FILE_UPLOADED' | 'MEETING_ATTENDED';
    description: string;
    timestamp: Date;
    taskId?: string;
    taskTitle?: string;
  }>;
  trends: {
    productivityTrend: number; // percentage change
    qualityTrend: number; // percentage change
    activityTrend: number; // percentage change
  };
}

interface TeamSummary {
  totalMembers: number;
  activeMembers: number;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  averageProductivity: number;
  averageQuality: number;
  teamEfficiency: number;
  totalHoursWorked: number;
  trends: {
    productivityTrend: number;
    qualityTrend: number;
    efficiencyTrend: number;
    activityTrend: number;
  };
  topPerformers: Array<{
    userId: string;
    userName: string;
    score: number;
    category: 'PRODUCTIVITY' | 'QUALITY' | 'COLLABORATION';
  }>;
  departmentBreakdown: Array<{
    department: string;
    memberCount: number;
    averageProductivity: number;
    completedTasks: number;
  }>;
  activityDistribution: Array<{
    hour: number;
    activityCount: number;
  }>;
  recentActivities: Array<{
    userId: string;
    userName: string;
    type: string;
    description: string;
    timestamp: Date;
  }>;
}

export function TeamActivityDashboard() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [summary, setSummary] = useState<TeamSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [timeRange, setTimeRange] = useState<string>('7d');
  const [sortBy, setSortBy] = useState<string>('productivity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Real-time updates
  const [isRealTime, setIsRealTime] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Fetch team activity data
  const fetchTeamActivity = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(departmentFilter !== 'all' && { department: departmentFilter }),
        ...(roleFilter !== 'all' && { role: roleFilter }),
        timeRange,
        sortBy,
        sortOrder
      });

      // Fetch team data and summary in parallel
      const [teamResponse, summaryResponse] = await Promise.all([
        fetch(`/api/dashboard/team-activity?${params}`),
        fetch(`/api/dashboard/team-activity/summary?${params}`)
      ]);

      if (!teamResponse.ok || !summaryResponse.ok) {
        throw new Error('Failed to fetch team activity data');
      }

      const [teamData, summaryData] = await Promise.all([
        teamResponse.json(),
        summaryResponse.json()
      ]);

      setTeamMembers(teamData.data || []);
      setSummary(summaryData.data || null);
      setLastUpdate(new Date());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load team activity data');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, departmentFilter, roleFilter, timeRange, sortBy, sortOrder]);

  useEffect(() => {
    fetchTeamActivity();
    
    if (isRealTime) {
      const interval = setInterval(fetchTeamActivity, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [fetchTeamActivity, isRealTime]);

  // Filter team members based on search term
  const filteredMembers = teamMembers.filter(member => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      member.userName.toLowerCase().includes(searchLower) ||
      member.userEmail.toLowerCase().includes(searchLower) ||
      member.role.toLowerCase().includes(searchLower) ||
      member.department.toLowerCase().includes(searchLower)
    );
  });

  // Get unique departments and roles for filters
  const departments = Array.from(new Set(teamMembers.map(member => member.department)));
  const roles = Array.from(new Set(teamMembers.map(member => member.role)));

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'BUSY':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'AWAY':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'INACTIVE':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <UserCheck className="h-4 w-4" />;
      case 'BUSY':
        return <Clock className="h-4 w-4" />;
      case 'AWAY':
        return <User className="h-4 w-4" />;
      case 'INACTIVE':
        return <UserX className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  // Format numbers
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Format duration
  const formatDuration = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours.toFixed(1)}h`;
  };

  // Format percentage
  const formatPercentage = (num: number) => `${num.toFixed(1)}%`;

  // Get trend icon
  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (trend < 0) return <TrendingDown className="h-4 w-4 text-red-600" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  // Format relative time
  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Handle export
  const handleExportData = async () => {
    try {
      const params = new URLSearchParams({
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(departmentFilter !== 'all' && { department: departmentFilter }),
        ...(roleFilter !== 'all' && { role: roleFilter }),
        timeRange,
        format: 'csv'
      });

      const response = await fetch(`/api/dashboard/team-activity/export?${params}`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `team-activity-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch {
      // Could not export data
    }
  };

  if (isLoading && teamMembers.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading team activity data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Team Activity Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor team performance, productivity, and collaboration metrics
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Last updated: {lastUpdate.toLocaleTimeString()} 
            {isRealTime && <span className="ml-2 text-green-600">● Live</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant={isRealTime ? "default" : "outline"}
            size="sm"
            onClick={() => setIsRealTime(!isRealTime)}
          >
            {isRealTime ? 'Live' : 'Paused'}
          </Button>
          <Button 
            variant="outline" 
            onClick={fetchTeamActivity}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExportData}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Team Members</p>
                  <p className="text-2xl font-bold">{summary.totalMembers}</p>
                  <p className="text-xs text-muted-foreground">
                    {summary.activeMembers} active
                  </p>
                </div>
                <Users className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Avg Productivity</p>
                  <p className="text-2xl font-bold">{summary.averageProductivity}/100</p>
                  <p className="text-xs text-muted-foreground">
                    {summary.trends.productivityTrend > 0 ? '+' : ''}{summary.trends.productivityTrend}% trend
                  </p>
                </div>
                <div className="flex items-center">
                  <Target className="h-8 w-8 text-green-600" />
                  {getTrendIcon(summary.trends.productivityTrend)}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tasks Completed</p>
                  <p className="text-2xl font-bold">{summary.completedTasks}</p>
                  <p className="text-xs text-muted-foreground">
                    {summary.overdueTasks} overdue
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Team Efficiency</p>
                  <p className="text-2xl font-bold">{formatPercentage(summary.teamEfficiency)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDuration(summary.totalHoursWorked)} worked
                  </p>
                </div>
                <div className="flex items-center">
                  <Zap className="h-8 w-8 text-orange-600" />
                  {getTrendIcon(summary.trends.efficiencyTrend)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Team Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="activities">Recent Activities</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Team Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filter Team Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search team members..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full lg:w-48">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="BUSY">Busy</SelectItem>
                    <SelectItem value="AWAY">Away</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger className="w-full lg:w-48">
                    <SelectValue placeholder="Filter by department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-full lg:w-48">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    {roles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={timeRange} onValueChange={setTimeRange}>
                  <SelectTrigger className="w-full lg:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1d">Last day</SelectItem>
                    <SelectItem value="7d">Last week</SelectItem>
                    <SelectItem value="30d">Last month</SelectItem>
                    <SelectItem value="90d">Last quarter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Team Members Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredMembers.map((member) => (
              <Card key={member.userId} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium">
                        {member.userName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{member.userName}</CardTitle>
                        <p className="text-sm text-muted-foreground">{member.role}</p>
                      </div>
                    </div>
                    <Badge className={getStatusColor(member.status)}>
                      <div className="flex items-center gap-1">
                        {getStatusIcon(member.status)}
                        <span>{member.status}</span>
                      </div>
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="text-center">
                      <p className="text-muted-foreground">Productivity</p>
                      <p className={`font-bold ${getScoreColor(member.metrics.productivityScore)}`}>
                        {member.metrics.productivityScore}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">Quality</p>
                      <p className={`font-bold ${getScoreColor(member.metrics.qualityScore)}`}>
                        {member.metrics.qualityScore}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">Collaboration</p>
                      <p className={`font-bold ${getScoreColor(member.metrics.collaborationScore)}`}>
                        {member.metrics.collaborationScore}
                      </p>
                    </div>
                  </div>

                  {/* Task Summary */}
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="text-center">
                      <p className="text-muted-foreground">Completed</p>
                      <p className="font-medium text-green-600">{member.metrics.tasksCompleted}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">In Progress</p>
                      <p className="font-medium text-blue-600">{member.metrics.tasksInProgress}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">Overdue</p>
                      <p className="font-medium text-red-600">{member.metrics.tasksOverdue}</p>
                    </div>
                  </div>

                  {/* Performance Indicators */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span>Weekly Efficiency</span>
                      <span>{formatPercentage(member.performance.efficiency)}</span>
                    </div>
                    <Progress value={member.performance.efficiency} className="h-1" />
                    
                    <div className="flex justify-between text-xs">
                      <span>On-Time Delivery</span>
                      <span>{formatPercentage(member.performance.onTimeDelivery)}</span>
                    </div>
                    <Progress value={member.performance.onTimeDelivery} className="h-1" />
                  </div>

                  {/* Last Activity */}
                  <div className="text-xs text-muted-foreground">
                    Last activity: {formatRelativeTime(new Date(member.lastActivity))}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setSelectedMember(member)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Details
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Team Member Details - {member.userName}</DialogTitle>
                        </DialogHeader>
                        {selectedMember && (
                          <div className="space-y-4">
                            {/* Member Info */}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="font-medium">Email</p>
                                <p className="text-muted-foreground">{selectedMember.userEmail}</p>
                              </div>
                              <div>
                                <p className="font-medium">Department</p>
                                <p className="text-muted-foreground">{selectedMember.department}</p>
                              </div>
                              <div>
                                <p className="font-medium">Role</p>
                                <p className="text-muted-foreground">{selectedMember.role}</p>
                              </div>
                              <div>
                                <p className="font-medium">Status</p>
                                <Badge className={getStatusColor(selectedMember.status)}>
                                  {selectedMember.status}
                                </Badge>
                              </div>
                            </div>

                            {/* Performance Metrics */}
                            <div>
                              <h4 className="font-medium mb-2">Performance Metrics</h4>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="text-muted-foreground">Weekly Tasks</p>
                                  <p className="font-medium">{selectedMember.performance.weeklyTasks}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Weekly Hours</p>
                                  <p className="font-medium">{formatDuration(selectedMember.performance.weeklyHours)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Avg Completion Time</p>
                                  <p className="font-medium">{formatDuration(selectedMember.metrics.averageCompletionTime)}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Efficiency</p>
                                  <p className="font-medium">{formatPercentage(selectedMember.performance.efficiency)}</p>
                                </div>
                              </div>
                            </div>

                            {/* Score Breakdown */}
                            <div>
                              <h4 className="font-medium mb-2">Score Breakdown</h4>
                              <div className="space-y-3">
                                <div>
                                  <div className="flex justify-between text-sm mb-1">
                                    <span>Productivity Score</span>
                                    <span className={getScoreColor(selectedMember.metrics.productivityScore)}>
                                      {selectedMember.metrics.productivityScore}/100
                                    </span>
                                  </div>
                                  <Progress value={selectedMember.metrics.productivityScore} className="h-2" />
                                </div>
                                <div>
                                  <div className="flex justify-between text-sm mb-1">
                                    <span>Quality Score</span>
                                    <span className={getScoreColor(selectedMember.metrics.qualityScore)}>
                                      {selectedMember.metrics.qualityScore}/100
                                    </span>
                                  </div>
                                  <Progress value={selectedMember.metrics.qualityScore} className="h-2" />
                                </div>
                                <div>
                                  <div className="flex justify-between text-sm mb-1">
                                    <span>Collaboration Score</span>
                                    <span className={getScoreColor(selectedMember.metrics.collaborationScore)}>
                                      {selectedMember.metrics.collaborationScore}/100
                                    </span>
                                  </div>
                                  <Progress value={selectedMember.metrics.collaborationScore} className="h-2" />
                                </div>
                              </div>
                            </div>

                            {/* Recent Activities */}
                            <div>
                              <h4 className="font-medium mb-2">Recent Activities</h4>
                              <div className="space-y-2 max-h-48 overflow-y-auto">
                                {selectedMember.activities.slice(0, 10).map((activity) => (
                                  <div key={activity.id} className="flex justify-between items-center p-2 border rounded">
                                    <div className="flex-1">
                                      <p className="text-sm">{activity.description}</p>
                                      {activity.taskTitle && (
                                        <p className="text-xs text-muted-foreground">Task: {activity.taskTitle}</p>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {formatRelativeTime(new Date(activity.timestamp))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Trends */}
                            <div>
                              <h4 className="font-medium mb-2">Performance Trends</h4>
                              <div className="grid grid-cols-3 gap-4 text-sm">
                                <div className="text-center">
                                  <p className="text-muted-foreground">Productivity</p>
                                  <div className="flex items-center justify-center gap-1">
                                    {getTrendIcon(selectedMember.trends.productivityTrend)}
                                    <span className={selectedMember.trends.productivityTrend > 0 ? 'text-green-600' : selectedMember.trends.productivityTrend < 0 ? 'text-red-600' : 'text-gray-400'}>
                                      {selectedMember.trends.productivityTrend > 0 ? '+' : ''}{selectedMember.trends.productivityTrend}%
                                    </span>
                                  </div>
                                </div>
                                <div className="text-center">
                                  <p className="text-muted-foreground">Quality</p>
                                  <div className="flex items-center justify-center gap-1">
                                    {getTrendIcon(selectedMember.trends.qualityTrend)}
                                    <span className={selectedMember.trends.qualityTrend > 0 ? 'text-green-600' : selectedMember.trends.qualityTrend < 0 ? 'text-red-600' : 'text-gray-400'}>
                                      {selectedMember.trends.qualityTrend > 0 ? '+' : ''}{selectedMember.trends.qualityTrend}%
                                    </span>
                                  </div>
                                </div>
                                <div className="text-center">
                                  <p className="text-muted-foreground">Activity</p>
                                  <div className="flex items-center justify-center gap-1">
                                    {getTrendIcon(selectedMember.trends.activityTrend)}
                                    <span className={selectedMember.trends.activityTrend > 0 ? 'text-green-600' : selectedMember.trends.activityTrend < 0 ? 'text-red-600' : 'text-gray-400'}>
                                      {selectedMember.trends.activityTrend > 0 ? '+' : ''}{selectedMember.trends.activityTrend}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Empty State */}
          {filteredMembers.length === 0 && !isLoading && (
            <Card>
              <CardContent className="text-center py-8">
                <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No team members found</h3>
                <p className="text-muted-foreground">
                  {searchTerm || statusFilter !== 'all' || departmentFilter !== 'all' || roleFilter !== 'all'
                    ? 'Try adjusting your filters to see more team members.'
                    : 'Team members will appear here once they are added to the system.'}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-4">
          {summary && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Performers */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Top Performers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {summary.topPerformers.map((performer, index) => (
                      <div key={performer.userId} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium">{performer.userName}</p>
                            <p className="text-sm text-muted-foreground">{performer.category}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">{performer.score}</p>
                          <p className="text-xs text-muted-foreground">Score</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Department Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Department Performance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {summary.departmentBreakdown.map((dept, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{dept.department}</span>
                          <span className="text-sm text-muted-foreground">
                            {dept.memberCount} members
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Avg Productivity</p>
                            <p className="font-medium">{dept.averageProductivity}/100</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Tasks Completed</p>
                            <p className="font-medium">{dept.completedTasks}</p>
                          </div>
                        </div>
                        <Progress value={dept.averageProductivity} className="h-2" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Recent Activities Tab */}
        <TabsContent value="activities" className="space-y-4">
          {summary && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Recent Team Activities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {summary.recentActivities.map((activity, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium text-sm">
                        {activity.userName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{activity.userName}</span>
                          <Badge variant="outline" className="text-xs">
                            {activity.type.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{activity.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatRelativeTime(new Date(activity.timestamp))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          {summary && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Activity Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Hourly Activity Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {summary.activityDistribution.map((hour, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <span className="text-sm font-mono w-12">
                          {hour.hour.toString().padStart(2, '0')}:00
                        </span>
                        <div className="flex-1">
                          <Progress 
                            value={(hour.activityCount / Math.max(...summary.activityDistribution.map(h => h.activityCount))) * 100} 
                            className="h-2" 
                          />
                        </div>
                        <span className="text-sm text-muted-foreground w-8">
                          {hour.activityCount}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Team Trends */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LineChart className="h-5 w-5" />
                    Team Performance Trends
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Productivity Trend</span>
                      <div className="flex items-center gap-1">
                        {getTrendIcon(summary.trends.productivityTrend)}
                        <span className="text-sm font-medium">
                          {summary.trends.productivityTrend > 0 ? '+' : ''}{summary.trends.productivityTrend}%
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Quality Trend</span>
                      <div className="flex items-center gap-1">
                        {getTrendIcon(summary.trends.qualityTrend)}
                        <span className="text-sm font-medium">
                          {summary.trends.qualityTrend > 0 ? '+' : ''}{summary.trends.qualityTrend}%
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Efficiency Trend</span>
                      <div className="flex items-center gap-1">
                        {getTrendIcon(summary.trends.efficiencyTrend)}
                        <span className="text-sm font-medium">
                          {summary.trends.efficiencyTrend > 0 ? '+' : ''}{summary.trends.efficiencyTrend}%
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Activity Trend</span>
                      <div className="flex items-center gap-1">
                        {getTrendIcon(summary.trends.activityTrend)}
                        <span className="text-sm font-medium">
                          {summary.trends.activityTrend > 0 ? '+' : ''}{summary.trends.activityTrend}%
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
