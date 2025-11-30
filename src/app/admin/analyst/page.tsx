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
  X,
  Maximize2,
  Code,
  ShieldAlert,
  ArrowUpDown,
  DollarSign,
  ChevronDown, 
  ChevronRight 
} from 'lucide-react';

// --- Configuration ---
const API_BASE_URL = "https://milestone-api-production.up.railway.app"; 
const PAY_RATE = 0.05; // Fixed rate per report

// --- Helper Components ---
const Card = ({ children, className = "" }: any) => (
  <div className={`bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, color = "blue" }: any) => {
  const colors: any = {
    blue: "bg-blue-100 text-blue-700",
    green: "bg-emerald-100 text-emerald-700",
    yellow: "bg-amber-100 text-amber-700",
    red: "bg-rose-100 text-rose-700",
    purple: "bg-violet-100 text-violet-700",
    gray: "bg-slate-100 text-slate-700",
    black: "bg-slate-800 text-white"
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

// --- UTILS: Formatting & Calculations ---

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(amount);
};

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

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  return R * c; 
}

function getSuspiciousReason(report: any): string | null {
  const vendor = report.ai_analysis?.vendor;
  if (!vendor || vendor === "Unknown" || vendor === "Unknown Vendor") {
    return "AI Failed to Identify Vendor (No Match)";
  }

  const deviceGps = report.location;
  const imageGps = findGpsRecursively(report.ai_analysis);

  if (deviceGps && imageGps) {
    const dist = calculateDistance(Number(deviceGps.lat), Number(deviceGps.lon), imageGps.lat, imageGps.lon);
    if (dist > 0.1) { // 0.1km threshold
      return `GPS Mismatch Detected (${dist.toFixed(1)}km discrepancy)`;
    }
  }

  return null;
}

// --- MODAL COMPONENT ---
const ReportModal = ({ report, onClose }: { report: any, onClose: () => void }) => {
  if (!report) return null;

  const aiData = report.ai_analysis || {};
  const imageUrl = report.image_cid ? `https://ipfs.io/ipfs/${report.image_cid}` : null;
  const suspiciousReason = getSuspiciousReason(report);
  
  const cost = PAY_RATE;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className={`flex justify-between items-center p-6 border-b ${suspiciousReason ? 'bg-rose-50 border-rose-200' : 'border-slate-100'}`}>
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <School size={20} className={suspiciousReason ? "text-rose-600" : "text-emerald-600"} />
              {report.school_name}
            </h2>
            <div className="flex items-center gap-2 mt-1">
                 <p className="text-sm text-slate-500">Report ID: {report.report_id} • {new Date(report.created_at).toLocaleString()}</p>
                 {suspiciousReason ? <Badge color="red">ANOMALY DETECTED</Badge> : 
                  (report.status?.toLowerCase() === 'paid' || report.status?.toLowerCase() === 'completed') ? 
                  <Badge color="green">PAID: {formatCurrency(cost)}</Badge> : null
                 }
            </div>
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
               {suspiciousReason && (
                   <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-start gap-3">
                       <ShieldAlert className="text-rose-600 shrink-0" size={20} />
                       <div>
                           <h4 className="text-rose-800 font-bold text-sm">Security Flag Raised</h4>
                           <p className="text-rose-600 text-sm">{suspiciousReason}</p>
                       </div>
                   </div>
               )}

              <h3 className="font-bold text-slate-700 flex items-center gap-2">
                <MapPin size={18} /> Photographic Evidence
              </h3>
              <div className="bg-slate-100 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center min-h-[400px]">
                {imageUrl ? (
                  <img src={imageUrl} alt="Report Evidence" className="w-full h-auto object-contain max-h-[600px]" />
                ) : (
                  <div className="text-slate-400 flex flex-col items-center">
                    <AlertTriangle size={48} className="mb-2 opacity-50" />
                    <p>No Image Available</p>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm">
                      <strong className="text-blue-800 block mb-1">Device Location</strong>
                      {report.location ? `${Number(report.location.lat).toFixed(5)}, ${Number(report.location.lon).toFixed(5)}` : "N/A"}
                  </div>
                  <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 text-sm">
                      <strong className="text-purple-800 block mb-1">Image Metadata</strong>
                      {(() => {
                          const gps = findGpsRecursively(aiData);
                          return gps ? `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}` : "Not extracted";
                      })()}
                  </div>
              </div>
            </div>

            {/* Right Column: AI Analysis */}
            <div className="space-y-6">
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
        
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-right">
            <button onClick={onClose} className="px-6 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-100 transition-colors">
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
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all'); 
  const [sortSchoolsBy, setSortSchoolsBy] = useState<'count' | 'rating' | 'money'>('count');

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
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) throw new Error(`Server returned ${response.status}`);

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

  const totalMoneyPaid = useMemo(() => {
    return reports.reduce((acc, r) => {
        const status = r.status?.toLowerCase() || '';
        if (status === 'paid' || status === 'completed') {
            return acc + PAY_RATE;
        }
        return acc;
    }, 0);
  }, [reports]);

  const vendorStats = useMemo(() => {
    const stats: any = {};
    reports.forEach(r => {
      const vendorName = r.ai_analysis?.vendor || r.vendor_name || "Unknown Vendor";
      if (!stats[vendorName]) {
        stats[vendorName] = { name: vendorName, totalReports: 0, totalScore: 0, average: 0, sentiment: 'neutral', schools: new Set() };
      }
      stats[vendorName].totalReports += 1;
      stats[vendorName].totalScore += (Number(r.rating) || 0);
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

  const schoolStats = useMemo(() => {
    const stats: any = {};
    reports.forEach(r => {
        if (!r.school_name) return;
        
        // Normalize name for stats aggregation too
        const normalizedName = (r.school_name || "Unknown").trim().replace(/\w\S*/g, (w:string) => (w.replace(/^\w/, (c) => c.toUpperCase())));

        if (!stats[normalizedName]) {
            stats[normalizedName] = { 
                name: normalizedName, 
                reports: 0, 
                scoreSum: 0, 
                totalPaid: 0,
                lastActive: r.created_at 
            };
        }
        stats[normalizedName].reports += 1;
        stats[normalizedName].scoreSum += (Number(r.rating) || 0);
        
        const status = r.status?.toLowerCase() || '';
        if (status === 'paid' || status === 'completed') {
             stats[normalizedName].totalPaid += PAY_RATE;
        }

        if (new Date(r.created_at) > new Date(stats[normalizedName].lastActive)) {
            stats[normalizedName].lastActive = r.created_at;
        }
    });
    
    const arr = Object.values(stats).map((s: any) => ({
        ...s,
        average: s.reports > 0 ? (s.scoreSum / s.reports).toFixed(1) : 0
    }));

    if (sortSchoolsBy === 'count') {
        return arr.sort((a: any, b: any) => b.reports - a.reports);
    } else if (sortSchoolsBy === 'money') {
        return arr.sort((a: any, b: any) => b.totalPaid - a.totalPaid);
    } else {
        return arr.sort((a: any, b: any) => a.average - b.average);
    }
  }, [reports, sortSchoolsBy]);

  const suspiciousReports = useMemo(() => {
    return reports.filter(r => getSuspiciousReason(r) !== null);
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
          <button onClick={() => setActiveTab('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
            <LayoutDashboard size={18} /> Overview
          </button>
          <button onClick={() => setActiveTab('reports')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'reports' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
            <FileText size={18} /> Reports Feed
          </button>
          <button onClick={() => setActiveTab('schools')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'schools' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
            <School size={18} /> School Stats
          </button>
          <button onClick={() => setActiveTab('vendors')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'vendors' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}>
            <Users size={18} /> Vendor Ratings
          </button>
          
          <div className="pt-4 mt-4 border-t border-slate-800">
            <p className="px-4 text-xs text-slate-500 font-semibold uppercase mb-2">Security</p>
            <button onClick={() => setActiveTab('anomalies')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'anomalies' ? 'bg-rose-900/50 text-rose-200 border border-rose-800' : 'text-slate-400 hover:bg-slate-800'}`}>
                <ShieldAlert size={18} /> 
                Fake/Anomalies
                {suspiciousReports.length > 0 && (
                    <span className="ml-auto bg-rose-600 text-white text-[10px] px-1.5 rounded-full">{suspiciousReports.length}</span>
                )}
            </button>
          </div>
        </nav>
      </div>
      <div className="mt-auto p-6 border-t border-slate-800">
        <div className="flex items-center gap-2 mb-2">
            <Server size={14} className={error ? "text-rose-500" : "text-emerald-500"} />
            <span className="text-xs font-mono text-slate-400">{error ? "Connection Error" : "Live Server"}</span>
        </div>
        <p className="text-[10px] text-slate-600">v3.2 Name Normalized</p>
      </div>
    </div>
  );

  const DashboardView = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-full"><DollarSign className="text-emerald-600" size={24} /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Paid</p>
              <p className="text-2xl font-bold text-slate-800">{formatCurrency(totalMoneyPaid)}</p>
              <p className="text-xs text-slate-400">Funds Disbursed</p>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-50 rounded-full"><FileText className="text-blue-600" size={24} /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Reports</p>
              <p className="text-2xl font-bold text-slate-800">{reports.length}</p>
              <p className="text-xs text-slate-400">All submissions</p>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-50 rounded-full"><AlertTriangle className="text-rose-600" size={24} /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Anomalies</p>
              <p className="text-2xl font-bold text-slate-800">{suspiciousReports.length}</p>
              <p className="text-xs text-slate-400">Needs review</p>
            </div>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-50 rounded-full"><Star className="text-amber-500" size={24} /></div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Top Vendor</p>
              <p className="text-lg font-bold text-slate-800 truncate max-w-[120px]">{vendorStats[0]?.name || 'N/A'}</p>
              <p className="text-xs text-slate-400">Highest rated</p>
            </div>
          </div>
        </Card>
      </div>
      {/* Short Live Feed & Vendor Table omitted for brevity but logic exists */}
    </div>
  );

  const ReportsView = () => {
    // 1. Group Data with Normalization
    const groupedReports = useMemo(() => {
        const groups: Record<string, any[]> = {};
        reports.forEach(r => {
            const rawName = r.school_name || "Unknown School";
            // Normalization: Title Case to merge "potosi" and "Potosi"
            const name = rawName.trim().toLowerCase().split(' ').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            
            if (!groups[name]) groups[name] = [];
            groups[name].push(r);
        });
        return Object.keys(groups).sort().reduce((obj, key) => {
            obj[key] = groups[key];
            return obj;
        }, {} as Record<string, any[]>);
    }, [reports]);

    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const toggle = (name: string) => {
        setExpanded(prev => ({...prev, [name]: !prev[name]}));
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Analyzed Reports</h2>
                    <p className="text-slate-500">Incoming field reports grouped by school.</p>
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
                    <button onClick={fetchReports} className="flex items-center gap-2 text-sm text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-md transition-colors">
                        <RefreshCw size={16} /> Refresh
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                {Object.keys(groupedReports).length === 0 && !error && (
                    <div className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                        No reports found matching criteria.
                    </div>
                )}

                {Object.entries(groupedReports).map(([schoolName, schoolReports]) => (
                    <div key={schoolName} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        <button 
                            onClick={() => toggle(schoolName)}
                            className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors border-b border-slate-200"
                        >
                            <div className="flex items-center gap-3">
                                {expanded[schoolName] ? <ChevronDown size={20} className="text-slate-400" /> : <ChevronRight size={20} className="text-slate-400" />}
                                <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                                    <School size={18} className="text-emerald-600" />
                                    {schoolName}
                                </h3>
                                <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full font-bold">
                                    {schoolReports.length}
                                </span>
                            </div>
                        </button>

                        {expanded[schoolName] && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-white text-slate-500 font-medium border-b border-slate-100">
                                        <tr>
                                            <th className="p-4">Date & Status</th>
                                            <th className="p-4">Location / GPS</th>
                                            <th className="p-4">Value</th>
                                            <th className="p-4">Vendor</th>
                                            <th className="p-4">Rating</th>
                                            <th className="p-4 w-1/3">Analysis</th>
                                            <th className="p-4">Evidence</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {schoolReports.map((report, i) => {
                                            const status = report.status?.toLowerCase() || 'pending';
                                            const cost = PAY_RATE;

                                            return (
                                            <tr key={report.report_id || i} className="hover:bg-slate-50 group">
                                                <td className="p-4 whitespace-nowrap">
                                                    <div className="text-slate-700 font-medium">{new Date(report.created_at).toLocaleDateString()}</div>
                                                    <Badge color={
                                                        status === 'paid' || status === 'completed' ? 'green' : 
                                                        status === 'rejected' ? 'red' : 'blue'
                                    }>
                                        {report.status || 'Pending'}
                                    </Badge>
                                </td>
                                <td className="p-4">
                                  <div className="text-xs ml-0 mt-1 space-y-1">
                                    {(() => {
                                      // --- GPS Verification Logic ---
                                      let deviceGps = null;
                                      let imageGps = null;
                                      let isMatch = false;
                                      let hasDevice = false;

                                      if (report.location?.lat != null && report.location?.lon != null) {
                                        deviceGps = { lat: Number(report.location.lat), lon: Number(report.location.lon) };
                                        hasDevice = true;
                                      }
                                      imageGps = findGpsRecursively(report.ai_analysis);

                                      if (deviceGps && imageGps) {
                                          const dist = calculateDistance(deviceGps.lat, deviceGps.lon, imageGps.lat, imageGps.lon);
                                          if (dist <= 0.1) isMatch = true;
                                      }

                                      return (
                                        <>
                                            {hasDevice ? (
                                                <div className="text-slate-500 flex items-center" title="Device GPS">
                                                    <MapPin size={12} className="mr-1" />
                                                    {deviceGps?.lat.toFixed(4)}, {deviceGps?.lon.toFixed(4)}
                                                </div>
                                            ) : <span className="text-slate-300 italic block">No Device GPS</span>}

                                            {/* --- THE GREEN MARK / WARNING --- */}
                                            {isMatch ? (
                                                <div className="flex items-center text-emerald-600 font-bold gap-1 bg-emerald-50 px-1.5 py-0.5 rounded w-fit">
                                                    <CheckCircle size={10} />
                                                    <span>Match</span>
                                                </div>
                                            ) : (deviceGps && imageGps) ? (
                                                <div className="flex items-center text-rose-600 font-bold gap-1 bg-rose-50 px-1.5 py-0.5 rounded w-fit">
                                                    <AlertTriangle size={10} />
                                                    <span>Mismatch</span>
                                                </div>
                                            ) : null}
                                        </>
                                      );
                                    })()}
                                  </div>
                                </td>
                                <td className="p-4">
                                    { (status === 'paid' || status === 'completed') ? (
                                        <span className="font-mono font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
                                            {formatCurrency(cost)}
                                        </span>
                                    ) : (
                                        <span className="text-slate-300 text-xs">-</span>
                                    )}
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
                                    <p className="text-slate-800 mb-1 line-clamp-2">{report.description}</p>
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
                        )})}
                    </tbody>
                </table>
             </div>
           )}
          </div>
        ))}
        </div>
    </div>
  );
  };

  const SchoolsView = () => (
    <div className="space-y-6">
        <div className="flex justify-between items-end">
            <div>
                <h2 className="text-2xl font-bold text-slate-800">School Activity & Financials</h2>
                <p className="text-slate-500">Sorted by submission volume and performance metrics.</p>
            </div>
            <div className="flex bg-white rounded-lg border border-slate-200 p-1">
                <button onClick={() => setSortSchoolsBy('count')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${sortSchoolsBy === 'count' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    Sort by Activity
                </button>
                <button onClick={() => setSortSchoolsBy('money')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${sortSchoolsBy === 'money' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    Sort by Funding
                </button>
                <button onClick={() => setSortSchoolsBy('rating')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${sortSchoolsBy === 'rating' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    Sort by Rating
                </button>
            </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                        <th className="p-4">Rank</th>
                        <th className="p-4">School Name</th>
                        <th className="p-4 text-center">Proposals/Reports</th>
                        <th className="p-4">Total Funds</th>
                        <th className="p-4">Average Rating</th>
                        <th className="p-4">Status</th>
                        <th className="p-4">Last Activity</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {schoolStats.map((school: any, idx) => (
                        <tr key={school.name} className="hover:bg-slate-50">
                            <td className="p-4 text-slate-400 w-16">#{idx + 1}</td>
                            <td className="p-4 font-semibold text-slate-700">{school.name}</td>
                            <td className="p-4 text-center">
                                <span className="inline-block bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-bold">
                                    {school.reports}
                                </span>
                            </td>
                            <td className="p-4">
                                <span className="font-mono text-emerald-700 font-bold">
                                    {formatCurrency(school.totalPaid)}
                                </span>
                            </td>
                            <td className="p-4">
                                <div className="flex items-center gap-2">
                                    <StarRating rating={Number(school.average)} />
                                    <span className="font-bold text-slate-600">{school.average}</span>
                                </div>
                            </td>
                            <td className="p-4">
                                {Number(school.average) >= 4 ? <Badge color="green">Excellent</Badge> : 
                                 Number(school.average) < 2.5 ? <Badge color="red">Needs Attention</Badge> : 
                                 <Badge color="yellow">Average</Badge>}
                            </td>
                            <td className="p-4 text-slate-500">{new Date(school.lastActive).toLocaleDateString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );

  const AnomaliesView = () => (
    <div className="space-y-6">
        <div className="bg-rose-50 border border-rose-200 p-6 rounded-xl flex items-start gap-4">
            <div className="bg-rose-100 p-3 rounded-full">
                <ShieldAlert className="text-rose-600" size={32} />
            </div>
            <div>
                <h2 className="text-xl font-bold text-rose-800">Suspicious Activity Detected</h2>
                <p className="text-rose-600 mt-1">
                    Showing <strong>{suspiciousReports.length}</strong> reports that failed validation. 
                </p>
            </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
            {suspiciousReports.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
                    <CheckCircle className="mx-auto text-emerald-400 mb-2" size={48} />
                    <p className="text-slate-500">No anomalies detected. System is clean.</p>
                </div>
            ) : (
                suspiciousReports.map((report) => (
                    <div key={report.report_id} className="bg-white border-l-4 border-rose-500 rounded-lg shadow-sm p-4 flex flex-col md:flex-row gap-4 items-start">
                        <div className="w-full md:w-48 shrink-0">
                            {report.image_cid ? (
                                <img src={`https://ipfs.io/ipfs/${report.image_cid}`} className="w-full h-32 object-cover rounded-md border border-slate-200"/>
                            ) : (
                                <div className="w-full h-32 bg-slate-100 flex items-center justify-center rounded-md text-slate-400">No Image</div>
                            )}
                        </div>
                        <div className="flex-1">
                            <div className="flex justify-between items-start">
                                <h3 className="font-bold text-slate-800">{report.school_name}</h3>
                                <span className="text-xs text-slate-400">{new Date(report.created_at).toLocaleString()}</span>
                            </div>
                            <div className="mt-2 bg-rose-50 inline-block px-3 py-1 rounded border border-rose-100 text-rose-700 text-sm font-bold">
                                ⚠️ {getSuspiciousReason(report)}
                            </div>
                            <p className="text-slate-600 text-sm mt-2">{report.description}</p>
                            <div className="mt-4">
                                <button onClick={() => setSelectedReport(report)} className="text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded transition-colors">
                                    Inspect Details
                                </button>
                            </div>
                        </div>
                    </div>
                ))
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
                        <div className={`h-full ${vendor.average >= 4 ? 'bg-emerald-500' : vendor.average < 3 ? 'bg-rose-500' : 'bg-amber-500'}`} style={{ width: `${(vendor.average / 5) * 100}%` }}/>
                    </div>
                    <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="font-bold text-lg text-slate-800">{vendor.name}</h3>
                                <p className="text-xs text-slate-500">ID: {vendor.name.substring(0,3).toUpperCase()}</p>
                            </div>
                            <div className="bg-slate-100 px-2 py-1 rounded text-sm font-bold text-slate-700 flex items-center gap-1">
                                {vendor.average} <Star size={12} className="fill-slate-700" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="text-center p-3 bg-slate-50 rounded-lg">
                                <p className="text-xs text-slate-400 uppercase font-bold">Total Reports</p>
                                <p className="text-xl font-bold text-slate-700">{vendor.totalReports}</p>
                            </div>
                             <div className="text-center p-3 bg-slate-50 rounded-lg">
                                <p className="text-xs text-slate-400 uppercase font-bold">Schools Served</p>
                                <p className="text-xl font-bold text-slate-700">{vendor.schoolCount}</p>
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
            <h1 className="text-2xl font-bold text-slate-800 capitalize">
                {activeTab === 'anomalies' ? 'Security & Anomalies' : activeTab + ' Overview'}
            </h1>
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold border-2 border-white shadow-sm">SA</div>
        </header>

        {loading ? (
            <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div></div>
        ) : (
            <>
                {activeTab === 'dashboard' && <DashboardView />}
                {activeTab === 'reports' && <ReportsView />}
                {activeTab === 'schools' && <SchoolsView />}
                {activeTab === 'vendors' && <VendorsView />}
                {activeTab === 'anomalies' && <AnomaliesView />}
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