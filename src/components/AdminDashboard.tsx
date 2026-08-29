import React, { useState, useEffect } from 'react';
import { 
  auth, googleProvider, db 
} from '../lib/firebase';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User
} from 'firebase/auth';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs
} from 'firebase/firestore';
import { 
  Activity, ArrowLeft, BarChart3, Eye, Globe, Laptop, 
  LogOut, RefreshCw, ShieldAlert, Smartphone, Tablet, 
  TrendingUp, Users, Zap, Lock, ShieldCheck
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, 
  Tooltip, PieChart, Pie, Cell, CartesianGrid
} from 'recharts';

interface AdminDashboardProps {
  onBack: () => void;
}

interface RawEvent {
  id: string;
  eventType: string;
  deviceType: string;
  referrer: string;
  createdAt: string;
  screenResolution: string;
  language: string;
  sessionId: string;
}

interface DayStat {
  date: string;
  pageViews: number;
  totalEvents: number;
  mobile: number;
  desktop: number;
  tablet: number;
  conversions: number;
}

const AUTHORIZED_ADMIN_EMAIL = 'odebunmiwasiu124@gmail.com';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Analytics state
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [dayStats, setDayStats] = useState<DayStat[]>([]);
  const [statsSummary, setStatsSummary] = useState({
    totalPageViews: 0,
    totalConversions: 0,
    uniqueSessions: 0,
    activeDevices: { desktop: 0, mobile: 0, tablet: 0 },
    topReferrers: [] as { name: string; count: number }[],
    eventDistribution: [] as { name: string; value: number }[]
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Strict whitelist check
        const userEmail = (currentUser.email || '').toLowerCase().trim();
        if (userEmail !== AUTHORIZED_ADMIN_EMAIL.toLowerCase().trim()) {
          await signOut(auth);
          setUser(null);
          setAuthError(`Access Denied: Account (${currentUser.email}) is not authorized. Only ${AUTHORIZED_ADMIN_EMAIL} can access this portal.`);
          setAuthLoading(false);
          return;
        }
        setUser(currentUser);
        setAuthError(null);
        fetchAnalyticsData();
      } else {
        setUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setAuthError(null);
      const result = await signInWithPopup(auth, googleProvider);
      const email = (result.user.email || '').toLowerCase().trim();
      if (email !== AUTHORIZED_ADMIN_EMAIL.toLowerCase().trim()) {
        await signOut(auth);
        setUser(null);
        setAuthError(`Access Denied: Account (${result.user.email}) is not authorized. Only ${AUTHORIZED_ADMIN_EMAIL} can access this portal.`);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Failed to sign in with Google');
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setUser(null);
  };

  const fetchAnalyticsData = async () => {
    setDataLoading(true);
    try {
      // 1. Fetch recent events
      const eventsRef = collection(db, 'traffic_events');
      const q = query(eventsRef, orderBy('createdAt', 'desc'), limit(100));
      const querySnapshot = await getDocs(q);
      
      const loadedEvents: RawEvent[] = [];
      const sessions = new Set<string>();
      const deviceCount = { desktop: 0, mobile: 0, tablet: 0 };
      const refCount: Record<string, number> = {};
      const eventTypeCount: Record<string, number> = {};
      let conversions = 0;
      let pageViews = 0;

      querySnapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const ev: RawEvent = {
          id: docSnap.id,
          eventType: d.eventType || 'unknown',
          deviceType: d.deviceType || 'desktop',
          referrer: d.referrer || 'direct',
          createdAt: d.createdAt || new Date().toISOString(),
          screenResolution: d.screenResolution || 'N/A',
          language: d.language || 'en',
          sessionId: d.sessionId || 'anonymous'
        };
        loadedEvents.push(ev);

        if (ev.sessionId) sessions.add(ev.sessionId);
        
        if (ev.deviceType === 'mobile') deviceCount.mobile++;
        else if (ev.deviceType === 'tablet') deviceCount.tablet++;
        else deviceCount.desktop++;

        refCount[ev.referrer] = (refCount[ev.referrer] || 0) + 1;
        eventTypeCount[ev.eventType] = (eventTypeCount[ev.eventType] || 0) + 1;

        if (ev.eventType === 'page_view') pageViews++;
        if (ev.eventType === 'convert_markdown' || ev.eventType === 'copy_text' || ev.eventType === 'export_file') {
          conversions++;
        }
      });

      setEvents(loadedEvents);

      // 2. Fetch daily aggregate stats
      const dailyStatsRef = collection(db, 'daily_stats');
      const statsSnap = await getDocs(query(dailyStatsRef, orderBy('date', 'desc'), limit(30)));
      const days: DayStat[] = [];

      statsSnap.forEach((docSnap) => {
        const d = docSnap.data();
        days.push({
          date: d.date || docSnap.id,
          pageViews: d.pageViews || 0,
          totalEvents: d.totalEvents || 0,
          mobile: d.device_mobile || 0,
          desktop: d.device_desktop || 0,
          tablet: d.device_tablet || 0,
          conversions: (d.events_convert_markdown || 0) + (d.events_copy_text || 0) + (d.events_export_file || 0)
        });
      });

      // Reverse so chronological for charts
      days.reverse();
      setDayStats(days);

      // Format referrers
      const topRefs = Object.entries(refCount)
        .map(([name, count]) => ({ name: name === 'direct' ? 'Direct / Bookmark' : name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Format event distribution
      const eventDist = Object.entries(eventTypeCount).map(([name, value]) => ({
        name: name.replace('_', ' ').toUpperCase(),
        value
      }));

      setStatsSummary({
        totalPageViews: pageViews || loadedEvents.length,
        totalConversions: conversions,
        uniqueSessions: sessions.size,
        activeDevices: deviceCount,
        topReferrers: topRefs,
        eventDistribution: eventDist
      });

    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setDataLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
          <p className="text-sm font-medium text-zinc-400">Verifying administrator credentials...</p>
        </div>
      </div>
    );
  }

  // Not authenticated or unauthorized: Show Restricted Single Sign-On Gate
  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-center items-center px-4 py-12">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center mx-auto mb-3">
              <Lock className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Admin Traffic Portal</h1>
            <p className="text-xs text-zinc-400">
              Restricted dashboard. Access is restricted exclusively to authorized administrators.
            </p>
          </div>

          {authError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3.5 text-red-400 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{authError}</span>
            </div>
          )}

          <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-2xl p-4 text-xs space-y-2">
            <div className="flex items-center gap-2 text-zinc-300 font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Authorized Admin Sign-In</span>
            </div>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              Sign in with your verified Google account (<code className="text-indigo-300 font-mono">{AUTHORIZED_ADMIN_EMAIL}</code>) to view visitor traffic, device analytics, and conversion velocity.
            </p>
          </div>

          {/* Google Sign In Only */}
          <button
            onClick={handleGoogleSignIn}
            className="w-full py-3.5 px-4 bg-white hover:bg-zinc-100 text-zinc-900 font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-3 shadow-md active:scale-98 min-h-[48px]"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>Sign In with Google</span>
          </button>

          <div className="pt-2 text-center border-t border-zinc-800">
            <button
              onClick={onBack}
              className="text-zinc-400 hover:text-white flex items-center justify-center gap-1.5 text-xs mx-auto py-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Markdown Converter
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Admin Dashboard
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-zinc-800 bg-zinc-900/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors flex items-center gap-1.5 text-xs font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Back to Converter</span>
            </button>
            <div className="h-5 w-px bg-zinc-800" />
            <div className="flex items-center gap-2">
              <div className="bg-indigo-600 p-1.5 rounded-lg text-white">
                <BarChart3 className="w-4 h-4" />
              </div>
              <h1 className="text-sm sm:text-base font-bold text-white tracking-tight">Traffic Analytics & Insights</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchAnalyticsData}
              disabled={dataLoading}
              className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${dataLoading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>

            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-zinc-200">{user.email}</span>
              <span className="text-[10px] text-emerald-400 font-mono flex items-center justify-end gap-1">
                <ShieldCheck className="w-3 h-3" /> Master Admin
              </span>
            </div>

            <button
              onClick={handleSignOut}
              className="p-2 rounded-xl text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8 flex-1">
        
        {/* KPI Headline Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Page Views</span>
              <Eye className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {statsSummary.totalPageViews}
            </div>
            <p className="text-[11px] text-zinc-500">Live incoming traffic hits</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Active Sessions</span>
              <Users className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {statsSummary.uniqueSessions}
            </div>
            <p className="text-[11px] text-zinc-500">Unique visitors recorded</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Conversions</span>
              <Zap className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {statsSummary.totalConversions}
            </div>
            <p className="text-[11px] text-zinc-500">Copies, exports & AI polish</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-2">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Conversion Rate</span>
              <TrendingUp className="w-4 h-4 text-violet-400" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {statsSummary.totalPageViews > 0 
                ? `${Math.min(100, Math.round((statsSummary.totalConversions / statsSummary.totalPageViews) * 100))}%`
                : '0%'}
            </div>
            <p className="text-[11px] text-zinc-500">Traffic engagement ratio</p>
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Traffic Trend Over Time */}
          <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-base">Traffic & Conversion Velocity</h3>
                <p className="text-xs text-zinc-400">Daily breakdown of page visits and user actions</p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-indigo-400">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Page Views
                </span>
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Conversions
                </span>
              </div>
            </div>

            <div className="h-64 w-full pt-4">
              {dayStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dayStats}>
                    <defs>
                      <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="date" stroke="#71717a" fontSize={11} />
                    <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '0.75rem', color: '#fff' }} 
                    />
                    <Area type="monotone" dataKey="pageViews" stroke="#4f46e5" fillOpacity={1} fill="url(#colorViews)" name="Page Views" />
                    <Area type="monotone" dataKey="conversions" stroke="#10b981" fillOpacity={1} fill="url(#colorConv)" name="Conversions" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                  Waiting for more multi-day event data...
                </div>
              )}
            </div>
          </div>

          {/* Device Breakdown Pie */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 flex flex-col justify-between">
            <div>
              <h3 className="font-bold text-white text-base">Device Breakdown</h3>
              <p className="text-xs text-zinc-400">Visitor distribution across hardware</p>
            </div>

            <div className="h-44 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Desktop', value: statsSummary.activeDevices.desktop || 1 },
                      { name: 'Mobile', value: statsSummary.activeDevices.mobile || 0 },
                      { name: 'Tablet', value: statsSummary.activeDevices.tablet || 0 }
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    <Cell fill="#4f46e5" />
                    <Cell fill="#10b981" />
                    <Cell fill="#f59e0b" />
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '0.75rem' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-800 text-center text-xs">
              <div>
                <div className="flex items-center justify-center gap-1 text-indigo-400 font-semibold">
                  <Laptop className="w-3.5 h-3.5" /> Desktop
                </div>
                <div className="text-base font-bold text-white mt-0.5">{statsSummary.activeDevices.desktop}</div>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1 text-emerald-400 font-semibold">
                  <Smartphone className="w-3.5 h-3.5" /> Mobile
                </div>
                <div className="text-base font-bold text-white mt-0.5">{statsSummary.activeDevices.mobile}</div>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1 text-amber-400 font-semibold">
                  <Tablet className="w-3.5 h-3.5" /> Tablet
                </div>
                <div className="text-base font-bold text-white mt-0.5">{statsSummary.activeDevices.tablet}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Referrers and Real-Time Event Log */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Top Referrers */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-400" />
              Top Referral Sources
            </h3>
            <p className="text-xs text-zinc-400">Where your visitors are finding you</p>

            <div className="space-y-3 pt-2">
              {statsSummary.topReferrers.length > 0 ? (
                statsSummary.topReferrers.map((ref, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-zinc-800/50 border border-zinc-800 text-xs">
                    <span className="font-medium text-zinc-200 truncate pr-2">{ref.name}</span>
                    <span className="px-2 py-0.5 rounded-full bg-zinc-700 text-indigo-300 font-mono font-bold">
                      {ref.count} hits
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-zinc-500 text-xs py-8 text-center">No external referrers logged yet.</p>
              )}
            </div>
          </div>

          {/* Live Event Stream */}
          <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  Live Event Stream
                </h3>
                <p className="text-xs text-zinc-400">Real-time user engagement telemetry</p>
              </div>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full font-mono flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Logging
              </span>
            </div>

            <div className="overflow-x-auto max-h-80 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
              <table className="w-full text-left text-xs text-zinc-400">
                <thead className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider bg-zinc-800/60 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Event</th>
                    <th className="py-2.5 px-3">Device</th>
                    <th className="py-2.5 px-3">Referrer</th>
                    <th className="py-2.5 px-3">Language</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
                  {events.length > 0 ? (
                    events.map((ev) => (
                      <tr key={ev.id} className="hover:bg-zinc-800/40 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-zinc-200">
                          <span className={`px-2 py-0.5 rounded text-[10px] ${
                            ev.eventType === 'page_view' ? 'bg-indigo-500/20 text-indigo-300' :
                            ev.eventType === 'copy_text' ? 'bg-emerald-500/20 text-emerald-300' :
                            ev.eventType === 'ai_grammar_fix' ? 'bg-violet-500/20 text-violet-300' :
                            'bg-zinc-700 text-zinc-300'
                          }`}>
                            {ev.eventType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-zinc-300 capitalize">{ev.deviceType}</td>
                        <td className="py-2.5 px-3 text-zinc-400 truncate max-w-[120px]">{ev.referrer}</td>
                        <td className="py-2.5 px-3 text-zinc-400 uppercase">{ev.language}</td>
                        <td className="py-2.5 px-3 text-zinc-500 text-[10px]">
                          {new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-zinc-600">
                        No traffic events registered yet. Open the app to generate real traffic!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

      </main>
    </div>
  );
};
