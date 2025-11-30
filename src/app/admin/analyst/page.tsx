"use client"; 

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, 
  School, 
  Utensils, 
  AlertTriangle, 
  CheckCircle, 
  Search, 
  Star, 
  LayoutDashboard,
  FileText,
  Users,
  MapPin,
  RefreshCw,
  Server,
  Filter,
  X,        // Added for Modal Close button
  Maximize2, // Added for "View Details" icon
  Code      // Added for JSON view
} from 'lucide-react';

// --- Configuration ---
const API_BASE_URL = "https://milestone-api-production.up.railway.app"; 

// --- Helper Components ---
const Card = ({ children, className = "" }: any) => (
  <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
    {children}
  </div>
);

// ... (findGpsRecursively function remains exactly the same as your original code) ...
function findGpsRecursively(obj: any): { lat: number, lon: number } | null {
  if (!obj) return null;
  if (typeof obj === 'string') {
    if (obj.trim().startsWith('{') || obj.trim().startsWith('[')) {
      try { return findGpsRecursively(JSON.parse(obj)); } catch { return null; }
    }
    return null;
  }
  if (typeof obj !== 'object') return null;
  const lat = obj.lat ?? obj.latitude ?? obj.gps_lat ?? obj.Latitude ?? obj.Lat ?? obj.gpsLat;
  const lon = obj.lon ?? obj.lng ?? obj.longitude ?? obj.gps_lon ?? obj.Longitude ?? obj.Lon ?? obj.Lng ?? obj.gpsLon;
  if (lat != null && lon != null) {
    const nLat = Number(lat);
    const nLon = Number(lon);
    if (!isNaN(nLat) && !isNaN(nLon) && (nLat !== 0 || nLon !== 0)) {
      return { lat: nLat, lon: nLon };
    }
  }
  for (const key of ['coordinates', 'gps', 'location', 'point', 'geo']) {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length >= 2) {
      const n1 = Number(arr[0]);
      const n2 = Number(arr[1]);
      if (!isNaN(n1) && !isNaN(n2)) {
        if (Math.abs(n2) <= 90 && Math.abs(n1) > 90) return { lat: n2, lon: n1 };
        return { lat: n1, lon: n2 };
      }
    }
  }
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'object' || typeof obj[key] === 'string') {
      const found = findGpsRecursively(obj[key]);
      if (found) return found;
    }
  }
  return null;
}

const Badge = ({ children, color = "blue" }: any) => {
  const colors: any = {
    blue: "bg-blue-100 text-blue-700",
    green: "bg-emerald-100 text-emerald-700",
    yellow: "bg-amber-100 text-amber-700",
    red: "bg-rose-100 text-rose-700",
    purple: "bg-violet-100 text-violet-700",
    gray: "bg-slate-100 text-slate-700"
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors[color] || colors.gray}`}>
      {children}
    </span>
  );
};

const StarRating = ({ rating }: any) => {
  return (
    <div className="flex space-x-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={14}
          className={`${star <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "text-slate-300"}`}
        />
      ))}
    </div>
  );
};

// --- NEW COMPONENT: Analysis Modal ---
const ReportModal = ({ report, onClose }: { report: any, onClose: () => void }) => {
  if (!report) return null;

  const aiData = report.ai_analysis || {};
  const imageUrl = report.image_cid ? `https://ipfs.io/ipfs/${report.image_cid}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <School size={20} className="text-emerald-600" />
              {report.school_name}
            </h2>
            <p className="text-sm text-slate-500">Report ID: {report.report_id} • {new Date(report.created_at).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={24} className="text-slate-500" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Left Column: Image Evidence */}
            <div className="space-y-4">
              <h3 className="font-bold text-slate-700 flex items-center gap-2">
                <MapPin size={18} /> Photographic Evidence
              </h3>
              <div className="bg-slate-100 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center min-h-[400px]">
                {imageUrl ? (
                  <img 
                    src={imageUrl} 
                    alt="Report Evidence" 
                    className="w-full h-auto object-contain max-h-[600px]"
                  />
                ) : (
                  <div className="text-slate-400 flex flex-col items-center">
                    <AlertTriangle size={48} className="mb-2 opacity-50" />
                    <p>No Image Available</p>
                  </div>
                )}
              </div>
              {/* Image Metadata / GPS if available */}
              {report.location && (
                 <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm text-blue-800">
                    <strong>Device Coordinates:</strong> {report.location.lat}, {report.location.lon}
                 </div>
              )}
            </div>

            {/* Right Column: AI Analysis */}
            <div className="space-y-6">
              
              {/* Summary Card */}
              <div className="bg-slate-50 p-5 rounded-xl border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                  <Activity size={18} className="text-emerald-600" /> AI Assessment
                </h3>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <span className="text-xs text-slate-400 uppercase font-bold">Vendor</span>
                        <p className="font-semibold text-slate-800 text-lg">{aiData.vendor || "Unknown"}</p>
                    </div>
                    <div>
                        <span className="text-xs text-slate-400 uppercase font-bold">Calculated Rating</span>
                        <div className="flex items-center gap-2">
                            <StarRating rating={report.rating} />
                            <span className="font-bold text-slate-700">({report.rating}/5)</span>
                        </div>
                    </div>
                </div>
                
                <div className="mb-4">
                    <span className="text-xs text-slate-400 uppercase font-bold">Analysis Summary</span>
                    <p className="text-slate-700 mt-1 leading-relaxed">{report.description}</p>
                </div>

                <div className="space-y-3">
                    {aiData.issues?.length > 0 && (
                        <div>
                            <span className="text-xs text-rose-500 uppercase font-bold mb-1 block">Detected Issues</span>
                            <div className="flex flex-wrap gap-2">
                                {aiData.issues.map((issue: string, i: number) => (
                                    <span key={i} className="px-2 py-1 bg-rose-100 text-rose-700 text-xs font-medium rounded-md border border-rose-200">
                                        {issue}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                    {aiData.highlights?.length > 0 && (
                        <div>
                            <span className="text-xs text-emerald-500 uppercase font-bold mb-1 block">Positive Highlights</span>
                            <div className="flex flex-wrap gap-2">
                                {aiData.highlights.map((h: string, i: number) => (
                                    <span key={i} className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-md border border-emerald-200">
                                        {h}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
              </div>

              {/* Raw JSON View */}
              <div>
                <h3 className="font-bold text-slate-700 mb-2 flex items-center gap-2">
                    <Code size={16} /> Raw Analysis Data
                </h3>
                <div className="bg-slate-900 rounded-xl p-4 overflow-auto max-h-[300px] border border-slate-700">
                    <pre className="text-xs font-mono text-emerald-400 whitespace-pre-wrap">
                        {JSON.stringify(aiData, null, 2)}
                    </pre>
                </div>
              </div>

            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-right">
            <button 
                onClick={onClose}
                className="px-6 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-100 transition-colors"
            >
                Close
            </button>
        </div>
      </div>
    </div>
  );
};

// --- Main Application Component ---

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for the modal
  const [selectedReport, setSelectedReport] = useState<any>(null);
  
  const [filterStatus, setFilterStatus] = useState<string>('all'); 

  // --- Data Fetching ---

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`${API_BASE_URL}/api/reports`);
      if (filterStatus !== 'all') {
        url.searchParams.append('status', filterStatus);
      } else {
        url.searchParams.append('limit', '100'); 
        url.searchParams.append('include_archived', 'true');
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const items = Array.isArray(data) ? data : data.items || [];
      setReports(items);
    } catch (err: any) {
      console.error("Failed to fetch reports:", err);
      setError(err.message || "Failed to load data");
      setReports([]); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [filterStatus]);

  // --- Derived Metrics ---

  const vendorStats = useMemo(() => {
    const stats: any = {};
    
    reports.forEach(r => {
      const vendorName = r.ai_analysis?.vendor || r.vendor_name || "Unknown Vendor";
      
      if (!stats[vendorName]) {
        stats[vendorName] = { 
          name: vendorName, 
          totalReports: 0, 
          totalScore: 0, 
          average: 0, 
          sentiment: 'neutral',
          schools: new Set()
        };
      }
      
      stats[vendorName].totalReports += 1;
      const rating = Number(r.rating) || 0;
      stats[vendorName].totalScore += rating;
      if (r.school_name) stats[vendorName].schools.add(r.school_name);
    });

    Object.keys(stats).forEach(k => {
      const s = stats[k];
      if (s.totalReports > 0) {
        s.average = (s.totalScore / s.totalReports).toFixed(1);
        const avg = parseFloat(s.average);
        if (avg >= 4) s.sentiment = 'positive';
        else if (avg < 2.5) s.sentiment = 'negative';
      }
      s.schoolCount = s.schools.size;
    });

    return Object.values(stats).sort((a: any, b: any) => b.average - a.average);
  }, [reports]);

  // --- Views ---

  const Sidebar = () => (
    <div className="w-64 bg-slate-900 text-white flex flex-col h-full fixed left-0 top-0 z-10">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-8">
          <div className="bg-emerald-500 p-2 rounded-lg">
            <Utensils size={20} className="text-white" />
          </div>
          <div>
            <span className="font-bold text-lg block leading-tight">SchoolCater</span>
            <span className="text-[10px] text-emerald-200 uppercase tracking-wider">Admin</span>
          </div>
        </div>
        
        <nav className="space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <LayoutDashboard size={18} />
            Overview
          </button>
          <button 
            onClick={() => setActiveTab('reports')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'reports' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <FileText size={18} />
            School Reports
          </button>
          <button 
            onClick={() => setActiveTab('vendors')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'vendors' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
          >
            <Users size={18} />
            Vendor Ratings
          </button>
        </nav>
      </div>
      <div className="mt-auto p-6 border-t border-slate-800">
        <div className="flex items-center gap-2 mb-2">
            <Server size={14} className={error ? "text-rose-500" : "text-emerald-500"} />
            <span className="text-xs font-mono text-slate-400">
                {error ? "Connection Error" : "Live Server"}
            </span>
        </div>
        <p className="text-[10px] text-slate-600">v2.3 Connected to Postgres</p>
      </div>
    </div>
  );

  const DashboardView = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-full">
              <FileText className="text-blue-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Reports</p>
              <p className="text-2xl font-bold text-slate-800">{reports.length}</p>
              <p className="text-xs text-slate-400">Showing {filterStatus === 'all' ? 'All History' : filterStatus}</p>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-50 rounded-full">
              <AlertTriangle className="text-rose-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Critical Issues</p>
              <p className="text-2xl font-bold text-slate-800">
                {reports.filter(r => r.rating <= 2).length}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-full">
              <CheckCircle className="text-emerald-600" size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Top Vendor</p>
              <p className="text-lg font-bold text-slate-800 truncate max-w-[150px]">
                {vendorStats[0]?.name || 'N/A'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Activity size={18} className="text-slate-400" />
                Live Feed
            </h3>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                {reports.length === 0 ? (
                    <p className="text-slate-400 text-sm text-center py-8">No reports received yet.</p>
                ) : (
                    reports.slice(0, 5).map((report, idx) => (
                        <div 
                            key={report.report_id || idx} 
                            onClick={() => setSelectedReport(report)}
                            className="border-b border-slate-100 pb-3 last:border-0 last:pb-0 cursor-pointer hover:bg-slate-50 p-2 rounded transition-colors"
                        >
                            <div className="flex justify-between items-start">
                                <span className="text-xs text-slate-400 font-mono">
                                    {report.school_name}
                                </span>
                                <Badge color={report.rating >= 4 ? "green" : report.rating <= 2 ? "red" : "yellow"}>
                                    Rating: {report.rating}
                                </Badge>
                            </div>
                            <p className="text-sm text-slate-700 mt-1 line-clamp-2">{report.description}</p>
                            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                                {report.ai_analysis?.vendor && (
                                    <span className="font-medium text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                                        {report.ai_analysis.vendor}
                                    </span>
                                )}
                                <span className="ml-auto">
                                    {new Date(report.created_at).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </Card>
        
        <Card className="p-6">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Star size={18} className="text-amber-400 fill-amber-400" />
                Vendor Performance Leaderboard
            </h3>
            <div className="space-y-3">
                {vendorStats.map((stat: any, idx: number) => (
                    <div key={stat.name} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${idx === 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                                {idx + 1}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-800">{stat.name}</p>
                                <p className="text-xs text-slate-500">{stat.totalReports} reports</p>
                            </div>
                        </div>
                        <div className="text-right">
                             <div className="flex items-center gap-1 justify-end">
                                <span className="font-bold text-slate-800">{stat.average}</span>
                                <Star size={12} className="text-amber-400 fill-amber-400" />
                            </div>
                        </div>
                    </div>
                ))}
                 {vendorStats.length === 0 && <p className="text-sm text-slate-400 text-center">No rating data available.</p>}
            </div>
        </Card>
      </div>
    </div>
  );

  const ReportsView = () => (
    <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
            <div>
                <h2 className="text-2xl font-bold text-slate-800">Analyzed Reports</h2>
                <p className="text-slate-500">Incoming field reports from schools, processed by AI.</p>
            </div>
            
            <div className="flex items-center gap-2">
                <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <select 
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                    >
                        <option value="all">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="completed">Completed / Paid</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </div>

                <button 
                    onClick={fetchReports}
                    className="flex items-center gap-2 text-sm text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-md transition-colors"
                >
                    <RefreshCw size={16} />
                    Refresh
                </button>
            </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                        <tr>
                            <th className="p-4">Date & Status</th>
                            <th className="p-4">School</th>
                            <th className="p-4">Vendor</th>
                            <th className="p-4">Rating</th>
                            <th className="p-4 w-1/3">Analysis</th>
                            <th className="p-4">Evidence</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {reports.map((report, i) => (
                            <tr key={report.report_id || i} className="hover:bg-slate-50 group">
                                <td className="p-4 whitespace-nowrap">
                                    <div className="text-slate-700 font-medium">{new Date(report.created_at).toLocaleDateString()}</div>
                                    <div className="text-xs text-slate-400 mb-1">
                                        {new Date(report.created_at).toLocaleTimeString()}
                                    </div>
                                    <Badge color={
                                        report.status === 'paid' || report.status === 'completed' ? 'green' : 
                                        report.status === 'rejected' ? 'red' : 'blue'
                                    }>
                                        {report.status || 'Pending'}
                                    </Badge>
                                </td>
                                <td className="p-4">
                                  <div className="flex items-center gap-2 font-medium text-slate-800">
                                    <School size={14} className="text-slate-400" />
                                    {report.school_name}
                                  </div>
                                  <div className="text-xs ml-6 mt-1">
                                    {(() => {
                                      // 1. Device GPS
                                      if (report.location?.lat != null && report.location?.lon != null) {
                                        const dLat = Number(report.location.lat);
                                        const dLon = Number(report.location.lon);
                                        if (dLat !== 0 || dLon !== 0) {
                                          return (
                                            <span className="text-slate-500 flex items-center" title="Device GPS">
                                              <MapPin size={12} className="mr-1" />
                                              {dLat.toFixed(4)}, {dLon.toFixed(4)}
                                            </span>
                                          );
                                        }
                                      }
                                      // 2. AI/Image GPS
                                      const aiGps = findGpsRecursively(report.ai_analysis);
                                      if (aiGps) {
                                        return (
                                          <span className="text-blue-600 font-medium flex items-center" title="Extracted from Image Metadata">
                                            <span className="inline-flex items-center justify-center mr-1 text-[9px] border border-blue-200 bg-blue-50 px-1 rounded h-4 leading-none uppercase tracking-wide">
                                              IMG
                                            </span>
                                            {aiGps.lat.toFixed(4)}, {aiGps.lon.toFixed(4)}
                                          </span>
                                        );
                                      }
                                      return <span className="text-slate-300 italic">No GPS</span>;
                                    })()}
                                  </div>
                                </td>
                                <td className="p-4">
                                    <span className="font-semibold text-slate-700">
                                        {report.ai_analysis?.vendor || "Unknown"}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <StarRating rating={report.rating} />
                                    <span className={`text-xs ml-2 font-bold ${report.rating <= 2 ? 'text-rose-600' : 'text-slate-500'}`}>
                                        ({report.rating}/5)
                                    </span>
                                </td>
                                <td className="p-4">
                                    <p className="text-slate-800 mb-1">{report.description}</p>
                                    {report.ai_analysis && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {report.ai_analysis.issues?.slice(0, 2).map((issue: string) => (
                                                <span key={issue} className="px-1.5 py-0.5 bg-rose-50 text-rose-600 text-xs rounded border border-rose-100">
                                                    {issue}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                <td className="p-4">
                                    <button 
                                        onClick={() => setSelectedReport(report)}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-md transition-colors"
                                    >
                                        <Maximize2 size={12} />
                                        View Analysis
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {reports.length === 0 && !error && (
                <div className="p-12 text-center text-slate-400">
                    No reports found matching criteria.
                </div>
            )}
        </div>
    </div>
  );

  const VendorsView = () => (
    <div className="space-y-6">
       <div>
            <h2 className="text-2xl font-bold text-slate-800">Vendor Analytics</h2>
            <p className="text-slate-500">Aggregated performance ratings based on school reports.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vendorStats.map((vendor: any) => (
                <Card key={vendor.name} className="overflow-hidden">
                    <div className="h-2 bg-slate-100">
                        <div 
                            className={`h-full ${vendor.average >= 4 ? 'bg-emerald-500' : vendor.average < 3 ? 'bg-rose-500' : 'bg-amber-500'}`} 
                            style={{ width: `${(vendor.average / 5) * 100}%` }}
                        />
                    </div>
                    <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="font-bold text-lg text-slate-800">{vendor.name}</h3>
                                <p className="text-xs text-slate-500">Vendor ID: {vendor.name.substring(0,3).toUpperCase()}</p>
                            </div>
                            <div className="bg-slate-100 px-2 py-1 rounded text-sm font-bold text-slate-700 flex items-center gap-1">
                                {vendor.average}
                                <Star size={12} className="fill-slate-700" />
                            </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="text-center p-3 bg-slate-50 rounded-lg">
                                <p className="text-xs text-slate-400 uppercase font-bold">Total Reports</p>
                                <p className="text-xl font-bold text-slate-700">{vendor.totalReports}</p>
                            </div>
                             <div className="text-center p-3 bg-slate-50 rounded-lg">
                                <p className="text-xs text-slate-400 uppercase font-bold">Schools Served</p>
                                <p className="text-xl font-bold text-slate-700">{vendor.schoolCount}</p>
                            </div>
                        </div>
                        
                        <div className="space-y-2">
                            <p className="text-xs font-semibold text-slate-500">Recent Sentiment</p>
                            <div className="flex gap-1 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div className="bg-emerald-400 h-full" style={{width: vendor.sentiment === 'positive' ? '80%' : '20%'}}></div>
                                <div className="bg-rose-400 h-full" style={{width: vendor.sentiment === 'negative' ? '60%' : '10%'}}></div>
                            </div>
                        </div>
                    </div>
                </Card>
            ))}
        </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar />
      <div className="flex-1 ml-64 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-8">
            <div className="relative w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                    type="text" 
                    placeholder="Search schools, vendors, or keywords..." 
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
            </div>
            <div className="flex items-center gap-4">
                <div className="text-right hidden md:block">
                    <p className="text-sm font-bold text-slate-800">System Admin</p>
                    <p className="text-xs text-slate-500">Postgres Connected</p>
                </div>
                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold border-2 border-white shadow-sm">
                    SA
                </div>
            </div>
        </header>

        {loading ? (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            </div>
        ) : (
            <>
                {activeTab === 'dashboard' && <DashboardView />}
                {activeTab === 'reports' && <ReportsView />}
                {activeTab === 'vendors' && <VendorsView />}
            </>
        )}

        {/* --- Render Modal Logic --- */}
        {selectedReport && (
            <ReportModal 
                report={selectedReport} 
                onClose={() => setSelectedReport(null)} 
            />
        )}

      </div>
    </div>
  );
}