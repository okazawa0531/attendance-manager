import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../App';
import { attendanceApi, calcWorkMinutes, formatMinutes } from '../api/client';
import type { AttendanceRecord, AttendanceStatus } from '../types';
import { STATUS_LABELS } from '../types';

const NAV_ITEMS = [
  { label: '今日の勤怠', href: '/user' },
  { label: '勤怠履歴', href: '/user/history' },
];

export default function UserPage() {
  return (
    <Layout navItems={NAV_ITEMS}>
      <Routes>
        <Route index element={<TodayAttendance />} />
        <Route path="history" element={<AttendanceHistory />} />
        <Route path="*" element={<Navigate to="/user" replace />} />
      </Routes>
    </Layout>
  );
}

// ============================================================
// 今日の勤怠
// ============================================================
function TodayAttendance() {
  const auth = useAuth();
  const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // フォーム状態
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [breakMinutes, setBreakMinutes] = useState(60);
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<AttendanceStatus>('present');

  const loadToday = useCallback(async () => {
    setLoading(true);
    try {
      const year = String(new Date().getFullYear());
      const month = String(new Date().getMonth() + 1);
      const data = await attendanceApi.list({ userId: auth.userId, year, month });
      const todayRecord = data.records.find((r) => r.date === today) || null;
      setRecord(todayRecord);
      if (todayRecord) {
        setClockIn(todayRecord.clockIn || '');
        setClockOut(todayRecord.clockOut || '');
        setBreakMinutes(todayRecord.breakMinutes);
        setNotes(todayRecord.notes);
        setStatus(todayRecord.status);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [auth.userId, today]);

  useEffect(() => { loadToday(); }, [loadToday]);

  function handleClockIn() {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setClockIn(time);
  }

  function handleClockOut() {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setClockOut(time);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const payload = { clockIn: clockIn || undefined, clockOut: clockOut || undefined, breakMinutes, notes, status };
      if (record) {
        const res = await attendanceApi.update(today, payload);
        setRecord(res.record);
      } else {
        const res = await attendanceApi.create({ date: today, ...payload });
        setRecord(res.record);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  const workMinutes = calcWorkMinutes(clockIn || null, clockOut || null, breakMinutes);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">今日の勤怠</h1>
        <p className="text-gray-500 text-sm mt-1">
          {new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-600 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* 勤務状況カード */}
          {workMinutes !== null && (
            <div className="card bg-primary-50 border-primary-200">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm text-primary-700 font-medium">本日の勤務時間</p>
                  <p className="text-3xl font-bold text-primary-800">{formatMinutes(workMinutes)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-primary-600">出勤 {clockIn}</p>
                  <p className="text-xs text-primary-600">退勤 {clockOut}</p>
                  <p className="text-xs text-primary-600">休憩 {breakMinutes}分</p>
                </div>
              </div>
            </div>
          )}

          {/* フォーム */}
          <div className="card space-y-5">
            {/* 打刻ボタン */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={handleClockIn}
                className="btn-primary py-4 text-base flex flex-col items-center gap-1"
              >
                <span className="text-xl">🟢</span>
                <span>出勤打刻</span>
                {clockIn && <span className="text-xs opacity-80">{clockIn}</span>}
              </button>
              <button
                onClick={handleClockOut}
                className="btn-secondary py-4 text-base flex flex-col items-center gap-1 border-primary-200"
              >
                <span className="text-xl">🔴</span>
                <span>退勤打刻</span>
                {clockOut && <span className="text-xs text-gray-500">{clockOut}</span>}
              </button>
            </div>

            {/* 手動入力 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">出勤時間</label>
                <input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} className="input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">退勤時間</label>
                <input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} className="input" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">休憩時間（分）</label>
                <input
                  type="number"
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(Number(e.target.value))}
                  className="input"
                  min={0}
                  max={480}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as AttendanceStatus)} className="input">
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input resize-none"
                rows={2}
                placeholder="備考があれば入力してください"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
                {error}
              </div>
            )}

            <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
              {saving ? '保存中...' : record ? '更新する' : '登録する'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// 勤怠履歴
// ============================================================
function AttendanceHistory() {
  const auth = useAuth();
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await attendanceApi.list({ userId: auth.userId, year, month });
      // 日付昇順でソート
      setRecords([...data.records].sort((a, b) => a.date.localeCompare(b.date)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [auth.userId, year, month]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // サマリー計算
  const summary = records.reduce(
    (acc, r) => {
      const mins = calcWorkMinutes(r.clockIn, r.clockOut, r.breakMinutes);
      if (r.status === 'present') acc.presentDays++;
      if (r.status === 'paid_leave') acc.paidLeaveDays++;
      if (r.status === 'absent') acc.absentDays++;
      if (mins) acc.totalMinutes += mins;
      return acc;
    },
    { presentDays: 0, paidLeaveDays: 0, absentDays: 0, totalMinutes: 0 },
  );

  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">勤怠履歴</h1>
          <p className="text-gray-500 text-sm mt-1">月別の勤怠記録を確認できます</p>
        </div>
        <div className="flex gap-2">
          <select value={year} onChange={(e) => setYear(e.target.value)} className="input w-28">
            {years.map((y) => <option key={y} value={y}>{y}年</option>)}
          </select>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="input w-24">
            {months.map((m) => <option key={m} value={m}>{m}月</option>)}
          </select>
        </div>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: '出勤日数', value: `${summary.presentDays}日`, color: 'text-green-700' },
          { label: '有給休暇', value: `${summary.paidLeaveDays}日`, color: 'text-purple-700' },
          { label: '欠勤', value: `${summary.absentDays}日`, color: 'text-red-700' },
          { label: '総勤務時間', value: formatMinutes(summary.totalMinutes), color: 'text-primary-700' },
        ].map((item) => (
          <div key={item.label} className="card text-center p-4">
            <p className="text-xs text-gray-500 mb-1">{item.label}</p>
            <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg border border-red-200 text-sm">
          {error}
        </div>
      )}

      {/* テーブル */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-600 border-t-transparent" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-lg">記録がありません</p>
            <p className="text-sm mt-1">「今日の勤怠」ページから登録してください</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">日付</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">ステータス</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">出勤</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">退勤</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">休憩</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">勤務時間</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">備考</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {records.map((r) => {
                  const workMins = calcWorkMinutes(r.clockIn, r.clockOut, r.breakMinutes);
                  const dateObj = new Date(r.date + 'T00:00:00');
                  const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][dateObj.getDay()];
                  const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                  return (
                    <tr key={r.date} className={`hover:bg-gray-50 transition-colors ${isWeekend ? 'bg-gray-50/50' : ''}`}>
                      <td className={`px-4 py-3 font-medium ${isWeekend ? 'text-red-600' : 'text-gray-900'}`}>
                        {r.date} ({dayOfWeek})
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-600">{r.clockIn || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{r.clockOut || '-'}</td>
                      <td className="px-4 py-3 text-gray-500">{r.breakMinutes}分</td>
                      <td className="px-4 py-3 font-medium text-primary-700">{formatMinutes(workMins)}</td>
                      <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{r.notes || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AttendanceStatus }) {
  const classMap: Record<AttendanceStatus, string> = {
    present: 'badge-present',
    absent: 'badge-absent',
    holiday: 'badge-holiday',
    paid_leave: 'badge-paid-leave',
  };
  return <span className={classMap[status]}>{STATUS_LABELS[status]}</span>;
}
