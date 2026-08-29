import { collection, addDoc, serverTimestamp, doc, setDoc, increment } from 'firebase/firestore';
import { db } from './firebase';

export interface TrafficEvent {
  path: string;
  referrer: string;
  userAgent: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  screenResolution: string;
  language: string;
  timestamp: any;
  sessionId: string;
  eventType: 'page_view' | 'convert_markdown' | 'copy_text' | 'export_file' | 'ai_grammar_fix';
  metadata?: Record<string, any>;
}

// Generate or retrieve anonymous session ID (stored in sessionStorage)
function getSessionId(): string {
  let sid = sessionStorage.getItem('__md_sid');
  if (!sid) {
    sid = 's_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    sessionStorage.setItem('__md_sid', sid);
  }
  return sid;
}

function detectDevice(): 'mobile' | 'tablet' | 'desktop' {
  const ua = navigator.userAgent;
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/i.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

/**
 * Invisible background tracking function
 * Fails silently to ensure zero impact on user experience or performance
 */
export async function trackEvent(
  eventType: 'page_view' | 'convert_markdown' | 'copy_text' | 'export_file' | 'ai_grammar_fix',
  metadata: Record<string, any> = {}
) {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const device = detectDevice();
    const sessionId = getSessionId();

    const eventPayload = {
      path: window.location.pathname || '/',
      referrer: document.referrer ? new URL(document.referrer, window.location.href).hostname : 'direct',
      userAgent: navigator.userAgent,
      deviceType: device,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language || 'unknown',
      timestamp: serverTimestamp(),
      createdAt: new Date().toISOString(),
      sessionId,
      eventType,
      metadata
    };

    // 1. Log detailed event to `traffic_events` collection
    const eventsRef = collection(db, 'traffic_events');
    await addDoc(eventsRef, eventPayload);

    // 2. Increment aggregated daily stats for ultra-fast query and dashboard visualization
    const dailyStatsRef = doc(db, 'daily_stats', today);
    const updates: Record<string, any> = {
      date: today,
      totalEvents: increment(1),
      [`events_${eventType}`]: increment(1),
      [`device_${device}`]: increment(1),
      lastUpdated: serverTimestamp()
    };

    if (eventType === 'page_view') {
      updates.pageViews = increment(1);
    }

    await setDoc(dailyStatsRef, updates, { merge: true });
  } catch (err) {
    // Completely invisible & silent to users: do not console error or disrupt UI
  }
}
