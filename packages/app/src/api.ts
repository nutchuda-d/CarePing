import { useCallback, useEffect, useRef, useState } from 'react';
import Constants from 'expo-constants';
import type {
  CaseDto,
  ComparePreset,
  DiaryDayDto,
  DiaryMonthDto,
  EventDto,
  EventType,
  MedsTodayDto,
  ReportCompareDto,
  ReportTodayDto,
  ReportWeekDto,
  ServerEvent,
  StateDto,
  StatsDto,
  TagDto,
} from '@careping/shared';

/** ตอนพัฒนา: ใช้ IP เดียวกับเครื่องที่รัน Expo (backend รันเครื่องเดียวกัน พอร์ต 3000) */
export function defaultServerUrl() {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return host ? `http://${host}:3000` : 'http://localhost:3000';
}

export class Api {
  constructor(
    public baseUrl: string,
    public userId: string,
  ) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      ...init,
      headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    return body as T;
  }

  static users(baseUrl: string) {
    return new Api(baseUrl, '').req<{ id: string; name: string; role: string }[]>('/api/users');
  }
  state() {
    return this.req<StateDto>(`/api/state?userId=${this.userId}`);
  }
  history(days = 30) {
    return this.req<CaseDto[]>(`/api/cases?userId=${this.userId}&days=${days}`);
  }
  stats(days = 14) {
    return this.req<StatsDto>(`/api/stats?userId=${this.userId}&days=${days}`);
  }
  ack(caseId: string) {
    return this.req<CaseDto>(`/api/cases/${caseId}/ack`, { method: 'POST', body: JSON.stringify({ userId: this.userId }) });
  }
  resolve(caseId: string, note?: string) {
    return this.req<CaseDto>(`/api/cases/${caseId}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ userId: this.userId, note }),
    });
  }
  setAway(away: boolean) {
    return this.req(`/api/presence`, { method: 'POST', body: JSON.stringify({ userId: this.userId, away }) });
  }
  // ---------- ยา ----------
  medsToday() {
    return this.req<MedsTodayDto>(`/api/meds/today?userId=${this.userId}`);
  }
  setDose(medicationId: string, time: string, given: boolean) {
    return this.req<MedsTodayDto>('/api/meds/dose', { method: 'POST', body: JSON.stringify({ userId: this.userId, medicationId, time, given }) });
  }
  // ---------- บันทึกประจำวัน ----------
  diaryMonth(month?: string) {
    return this.req<DiaryMonthDto>(`/api/diary/month?userId=${this.userId}${month ? `&month=${month}` : ''}`);
  }
  diaryDay(date: string) {
    return this.req<DiaryDayDto>(`/api/diary/day?userId=${this.userId}&date=${date}`);
  }
  saveDay(date: string, input: { mood?: number | null; tagIds?: string[]; note?: string | null }) {
    return this.req<DiaryDayDto>('/api/diary/day', { method: 'PUT', body: JSON.stringify({ userId: this.userId, date, ...input }) });
  }
  createTag(label: string, color: string) {
    return this.req<TagDto>('/api/tags', { method: 'POST', body: JSON.stringify({ userId: this.userId, label, color }) });
  }
  createEvent(input: { date: string; time: string | null; title: string; type: EventType; detail: string | null }) {
    return this.req<EventDto>('/api/events', { method: 'POST', body: JSON.stringify({ userId: this.userId, ...input }) });
  }
  deleteEvent(id: string) {
    return this.req(`/api/events/${id}?userId=${this.userId}`, { method: 'DELETE' });
  }
  // ---------- รายงาน ----------
  reportToday() {
    return this.req<ReportTodayDto>(`/api/report/today?userId=${this.userId}`);
  }
  reportWeek() {
    return this.req<ReportWeekDto>(`/api/report/week?userId=${this.userId}`);
  }
  reportCompare(preset: ComparePreset, custom?: { aFrom: string; aTo: string; bFrom: string; bTo: string }) {
    const q = custom ? `&aFrom=${custom.aFrom}&aTo=${custom.aTo}&bFrom=${custom.bFrom}&bTo=${custom.bTo}` : '';
    return this.req<ReportCompareDto>(`/api/report/compare?userId=${this.userId}&preset=${preset}${q}`);
  }
  wsUrl() {
    return this.baseUrl.replace(/^http/, 'ws') + `/ws?userId=${this.userId}`;
  }
}

/** เชื่อม WebSocket ค้างไว้ หลุดแล้วต่อใหม่เอง และโหลด state ใหม่ทุกครั้งที่มีเหตุการณ์ */
export function useLiveState(api: Api, onEvent: (e: ServerEvent) => void) {
  const [state, setState] = useState<StateDto | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const open = () => {
      ws = new WebSocket(api.wsUrl());
      ws.onopen = () => {
        setConnected(true);
        refresh();
      };
      ws.onmessage = (m) => {
        try {
          const e = JSON.parse(String(m.data)) as ServerEvent;
          onEventRef.current(e);
        } catch {
          return;
        }
        refresh();
      };
      ws.onclose = () => {
        setConnected(false);
        if (!stopped) retry = setTimeout(open, 3000);
      };
      ws.onerror = () => ws?.close();
    };
    open();
    const poll = setInterval(refresh, 30_000);
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      clearInterval(poll);
      ws?.close();
    };
  }, [api, refresh]);

  return { state, connected, error, refresh };
}
