/**
 * BackgroundJobsPage — P2P Background Jobs Management Dashboard
 * Design: replicated from HD-AMC p2p_vite BackgroundJobs.tsx
 * Stack: Ant Design + theme tokens + dark mode support
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Row, Col, Button, Select, Modal, Tag, Tooltip, Empty,
  InputNumber, TimePicker, message,
} from 'antd';
import {
  SyncOutlined, PlayCircleOutlined, PauseCircleOutlined,
  ThunderboltOutlined, ClockCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, HistoryOutlined, SettingOutlined,
  ReloadOutlined, SaveOutlined, ExclamationCircleOutlined,
  DashboardOutlined, FieldTimeOutlined,
  ExpandOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import {
  backgroundJobsApi,
  type JobStatus, type JobManagerStatus, type RunHistoryEntry,
} from '../api/backgroundJobs';
import PageHeader from '../components/PageHeader';
import { useTheme } from '../App';
import dayjs from 'dayjs';

// ── Helpers ──

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return 'vừa xong';
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s trước`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} phút trước`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} giờ trước`;
  return `${Math.floor(diff / 86_400_000)} ngày trước`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    day: '2-digit', month: '2-digit',
  });
}

function formatFullTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function formatInterval(ms: number): string {
  if (ms < 60000) return `${ms / 1000} giây`;
  if (ms < 3600000) return `${ms / 60000} phút`;
  return `${ms / 3600000} giờ`;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

const INTERVAL_OPTIONS = [
  { label: '30 giây', value: 30000 },
  { label: '1 phút', value: 60000 },
  { label: '2 phút', value: 120000 },
  { label: '5 phút', value: 300000 },
  { label: '10 phút', value: 600000 },
  { label: '15 phút', value: 900000 },
  { label: '30 phút', value: 1800000 },
  { label: '1 giờ', value: 3600000 },
  { label: '2 giờ', value: 7200000 },
  { label: '6 giờ', value: 21600000 },
  { label: '12 giờ', value: 43200000 },
  { label: '24 giờ', value: 86400000 },
];

const RESULT_LABELS: Record<string, string> = {
  totalFromFineract: 'Tổng từ Fineract',
  synced: 'Đã đồng bộ',
  errors: 'Lỗi',
  skipped: 'Bỏ qua',
  totalLoans: 'Tổng khoản vay',
  checked: 'Đã kiểm tra',
  updated: 'Đã cập nhật',
  found: 'Tìm thấy',
  disbursed: 'Đã giải ngân',
  failed: 'Thất bại',
  total: 'Tổng',
  unchanged: 'Không đổi',
  added: 'Thêm mới',
  removed: 'Đã xóa',
  modified: 'Sửa đổi',
};

// ── Theme helpers ──

interface ThemeColors {
  isDarkMode: boolean;
  cardBg: string;
  cardBorder: string;
  subtleBg: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  borderColor: string;
  errorBg: string;
  errorBorder: string;
}

function useThemeColors(): ThemeColors {
  const { isDarkMode } = useTheme();
  return {
    isDarkMode,
    cardBg: isDarkMode ? '#1e293b' : '#fff',
    cardBorder: isDarkMode ? '#334155' : '#e2e8f0',
    subtleBg: isDarkMode ? '#0f172a' : '#f8fafc',
    textPrimary: isDarkMode ? '#f1f5f9' : '#1e293b',
    textSecondary: isDarkMode ? '#94a3b8' : '#64748b',
    textTertiary: isDarkMode ? '#64748b' : '#94a3b8',
    borderColor: isDarkMode ? '#334155' : '#e2e8f0',
    errorBg: isDarkMode ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.06)',
    errorBorder: isDarkMode ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.2)',
  };
}

// ── Status Badge ──

function StatusBadge({ job, isDarkMode }: { job: JobStatus; isDarkMode: boolean }) {
  if (job.isRunning) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500,
        background: isDarkMode ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.12)',
        color: isDarkMode ? '#60a5fa' : '#3b82f6',
        border: `1px solid ${isDarkMode ? 'rgba(59,130,246,0.35)' : 'rgba(59,130,246,0.2)'}`,
      }}>
        <span style={{ position: 'relative', display: 'flex', width: 8, height: 8 }}>
          <span style={{
            position: 'absolute', width: '100%', height: '100%', borderRadius: '50%',
            background: '#60a5fa', opacity: 0.75,
            animation: 'ping 1s cubic-bezier(0,0,0.2,1) infinite',
          }} />
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} />
        </span>
        Đang chạy
      </span>
    );
  }
  if (!job.enabled) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500,
        background: isDarkMode ? 'rgba(113,113,122,0.15)' : 'rgba(113,113,122,0.08)',
        color: isDarkMode ? '#a1a1aa' : '#71717a',
        border: `1px solid ${isDarkMode ? 'rgba(113,113,122,0.3)' : 'rgba(113,113,122,0.2)'}`,
      }}>
        <CloseCircleOutlined style={{ fontSize: 12 }} /> Tắt
      </span>
    );
  }
  if (job.isStarted) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500,
        background: isDarkMode ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.12)',
        color: isDarkMode ? '#34d399' : '#10b981',
        border: `1px solid ${isDarkMode ? 'rgba(16,185,129,0.35)' : 'rgba(16,185,129,0.2)'}`,
      }}>
        <CheckCircleOutlined style={{ fontSize: 12 }} /> Hoạt động
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500,
      background: isDarkMode ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.12)',
      color: isDarkMode ? '#fbbf24' : '#f59e0b',
      border: `1px solid ${isDarkMode ? 'rgba(245,158,11,0.35)' : 'rgba(245,158,11,0.2)'}`,
    }}>
      <ClockCircleOutlined style={{ fontSize: 12 }} /> Chờ
    </span>
  );
}

// ── Run Status Tag (professional) ──

function RunStatusTag({ status }: { status: string }) {
  if (status === 'success') return <Tag color="success" style={{ margin: 0, fontSize: 12 }}>Thành công</Tag>;
  if (status === 'error') return <Tag color="error" style={{ margin: 0, fontSize: 12 }}>Lỗi</Tag>;
  return <Tag color="processing" style={{ margin: 0, fontSize: 12 }}>Đang chạy</Tag>;
}

// ══════════════════════════════════════════════════
//  HISTORY MODAL (professional)
// ══════════════════════════════════════════════════

function HistoryModal({ jobName, history, open, onClose, colors }: {
  jobName: string;
  history: RunHistoryEntry[];
  open: boolean;
  onClose: () => void;
  colors: ThemeColors;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const successCount = history.filter(h => h.status === 'success').length;
  const errorCount = history.filter(h => h.status === 'error').length;
  const avgDuration = history.filter(h => h.durationMs != null).reduce((s, h) => s + (h.durationMs || 0), 0) / (history.filter(h => h.durationMs != null).length || 1);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      width={720}
      centered
      styles={{
        body: {
          padding: 0,
          background: colors.cardBg,
          borderRadius: 16,
        },
      }}
    >
      {/* Modal Header */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: `1px solid ${colors.borderColor}`,
        background: colors.subtleBg,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <HistoryOutlined style={{ fontSize: 18, color: '#fff' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>
              Lịch sử chạy — {jobName}
            </h3>
            <span style={{ fontSize: 12, color: colors.textSecondary }}>
              {history.length} lần chạy gần nhất
            </span>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { label: 'Thành công', value: successCount, color: '#10b981' },
            { label: 'Lỗi', value: errorCount, color: '#ef4444' },
            { label: 'Tổng', value: history.length, color: colors.isDarkMode ? '#60a5fa' : '#3b82f6' },
            { label: 'TB/lần', value: formatDuration(Math.round(avgDuration)), color: colors.textSecondary },
          ].map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{s.value}</span>
              <span style={{ fontSize: 11, color: colors.textTertiary }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Table header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '110px 1fr 90px 80px 40px',
        gap: 8, padding: '10px 24px',
        background: colors.subtleBg,
        borderBottom: `1px solid ${colors.borderColor}`,
      }}>
        {['Thời gian', 'Trạng thái', 'Thời lượng', 'Kết quả', ''].map((h, i) => (
          <span key={i} style={{ fontSize: 11, fontWeight: 600, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
        {history.length === 0 ? (
          <div style={{ padding: 40 }}>
            <Empty description="Chưa có lịch sử chạy" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : history.map((h, i) => {
          const id = h._id || String(i);
          const isExpanded = expandedId === id;
          const simpleFields: [string, any][] = [];
          const SKIP = ['details', 'cancelledLoans', 'changes', 'byRange', 'notifications', 'errorDetails'];
          if (h.result) {
            Object.entries(h.result).forEach(([k, v]) => {
              if (SKIP.includes(k)) return;
              if (typeof v !== 'object' || v === null) simpleFields.push([k, v]);
            });
          }
          const hasExpandable = simpleFields.length > 0 || h.error || h.result?.details?.length > 0 || h.result?.errorDetails?.length > 0;

          return (
            <div key={id}>
              {/* Row */}
              <div
                onClick={() => hasExpandable && setExpandedId(isExpanded ? null : id)}
                style={{
                  display: 'grid', gridTemplateColumns: '110px 1fr 90px 80px 40px',
                  gap: 8, padding: '12px 24px',
                  cursor: hasExpandable ? 'pointer' : 'default',
                  background: isExpanded ? (colors.isDarkMode ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.03)') : 'transparent',
                  borderBottom: `1px solid ${colors.borderColor}`,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = colors.isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'; }}
                onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {/* Time */}
                <Tooltip title={formatFullTime(h.runAt)}>
                  <span style={{ fontSize: 12, color: colors.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
                    {formatTime(h.runAt)}
                  </span>
                </Tooltip>

                {/* Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RunStatusTag status={h.status} />
                  {h.error && (
                    <Tooltip title={h.error}>
                      <span style={{
                        fontSize: 11, color: '#ef4444', maxWidth: 200,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{h.error}</span>
                    </Tooltip>
                  )}
                </div>

                {/* Duration */}
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                  {formatDuration(h.durationMs)}
                </span>

                {/* Result summary */}
                <span style={{ fontSize: 12, color: colors.textTertiary }}>
                  {simpleFields.length > 0 ? `${simpleFields.length} mục` : '—'}
                </span>

                {/* Expand icon */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {hasExpandable && (
                    <ExpandOutlined style={{
                      fontSize: 12, color: colors.textTertiary,
                      transform: isExpanded ? 'rotate(45deg)' : 'none',
                      transition: 'transform 0.2s',
                    }} />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div style={{
                  padding: '12px 24px 16px 134px',
                  background: colors.isDarkMode ? 'rgba(59,130,246,0.04)' : 'rgba(59,130,246,0.02)',
                  borderBottom: `1px solid ${colors.borderColor}`,
                }}>
                  {/* Error message */}
                  {h.error && (
                    <div style={{
                      padding: '8px 12px', borderRadius: 8, marginBottom: 12,
                      background: colors.errorBg, border: `1px solid ${colors.errorBorder}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <ExclamationCircleOutlined style={{ color: '#ef4444', fontSize: 13, marginTop: 1 }} />
                        <span style={{ fontSize: 12, color: '#ef4444', wordBreak: 'break-all' }}>{h.error}</span>
                      </div>
                    </div>
                  )}

                  {/* Result fields */}
                  {simpleFields.length > 0 && (
                    <div style={{
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                      gap: 8, marginBottom: h.result?.details?.length > 0 || h.result?.errorDetails?.length > 0 ? 12 : 0,
                    }}>
                      {simpleFields.map(([k, v]) => (
                        <div key={k} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '6px 10px', borderRadius: 6,
                          background: colors.subtleBg, border: `1px solid ${colors.borderColor}`,
                        }}>
                          <span style={{ fontSize: 11, color: colors.textTertiary }}>{RESULT_LABELS[k] || k}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: colors.textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                            {typeof v === 'number' ? v.toLocaleString() : String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Detailed array (if any) */}
                  {(h.result?.details?.length > 0 || h.result?.errorDetails?.length > 0) && (
                    <details>
                      <summary style={{
                        fontSize: 12, color: colors.isDarkMode ? '#60a5fa' : '#3b82f6',
                        cursor: 'pointer', marginBottom: 6, userSelect: 'none',
                      }}>
                        <InfoCircleOutlined style={{ marginRight: 4 }} />
                        Chi tiết ({(h.result?.details || h.result?.errorDetails || []).length} mục)
                      </summary>
                      <pre style={{
                        fontSize: 11, maxHeight: 200, overflow: 'auto',
                        padding: 10, borderRadius: 8,
                        background: colors.isDarkMode ? '#0f172a' : '#f1f5f9',
                        border: `1px solid ${colors.borderColor}`,
                        color: colors.textSecondary, margin: 0,
                      }}>
                        {JSON.stringify(h.result?.details || h.result?.errorDetails, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ── Params Editor ──

function ParamsEditor({ job, colors }: { job: JobStatus; colors: ThemeColors }) {
  const [editing, setEditing] = useState(false);
  const allParams = {
    ...(job.intervalMs != null ? { intervalMs: job.intervalMs } : {}),
    ...(job.scheduleTime != null ? { scheduleTime: job.scheduleTime } : {}),
    ...job.params,
  };
  const [draft, setDraft] = useState<Record<string, any>>(allParams);
  const [saving, setSaving] = useState(false);

  const schema = job.paramsSchema || [];
  if (schema.length === 0) return null;

  const save = async () => {
    setSaving(true);
    try {
      await backgroundJobsApi.updateParams(job.name, draft);
      message.success('Đã lưu cấu hình');
      setEditing(false);
    } catch (e: any) {
      message.error(`Lỗi: ${e?.response?.data?.message || e.message}`);
    }
    setSaving(false);
  };

  const getValue = (s: any): string => {
    const v = draft[s.key];
    if (v == null || v === '') return '—';
    if (s.type === 'interval') return formatInterval(v);
    if (s.unit) return `${v} ${s.unit}`;
    return String(v);
  };

  return (
    <div style={{
      borderRadius: 8, overflow: 'hidden',
      border: `1px solid ${colors.borderColor}`,
      background: colors.subtleBg,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px',
        borderBottom: `1px solid ${colors.borderColor}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <SettingOutlined style={{ fontSize: 12, color: colors.textTertiary }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: colors.textSecondary }}>Cấu hình</span>
        </div>
        {editing ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={save} disabled={saving} style={{
              padding: '2px 6px', borderRadius: 4, color: '#10b981', background: 'none',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}><SaveOutlined style={{ fontSize: 14 }} /></button>
            <button onClick={() => setEditing(false)} style={{
              padding: '2px 6px', borderRadius: 4, color: colors.textTertiary, background: 'none',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
            }}><CloseCircleOutlined style={{ fontSize: 14 }} /></button>
          </div>
        ) : (
          <button onClick={() => { setDraft(allParams); setEditing(true); }} style={{
            padding: '2px 8px', borderRadius: 4, color: '#3b82f6', background: 'none',
            border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
          }}>Chỉnh sửa</button>
        )}
      </div>
      <div style={{ padding: '8px 12px' }}>
        {schema.map(s => (
          <div key={s.key} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 8, marginBottom: 8,
          }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 500, color: colors.textPrimary }}>{s.label}</span>
              {editing && s.description && (
                <p style={{ fontSize: 12, color: colors.textTertiary, margin: '2px 0 0 0' }}>{s.description}</p>
              )}
            </div>
            {editing ? (
              s.type === 'interval' ? (
                <Select
                  size="small"
                  value={draft[s.key]}
                  onChange={v => setDraft(d => ({ ...d, [s.key]: v }))}
                  options={INTERVAL_OPTIONS}
                  style={{ width: 120 }}
                />
              ) : s.type === 'time' ? (
                <TimePicker
                  size="small"
                  format="HH:mm"
                  value={draft[s.key] ? dayjs(draft[s.key], 'HH:mm') : null}
                  onChange={(_, timeStr) => setDraft(d => ({ ...d, [s.key]: timeStr }))}
                  allowClear
                />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <InputNumber
                    size="small"
                    value={draft[s.key]}
                    onChange={v => setDraft(d => ({ ...d, [s.key]: v }))}
                    style={{ width: 80, textAlign: 'right' }}
                  />
                  {s.unit && <span style={{ fontSize: 12, color: colors.textTertiary }}>{s.unit}</span>}
                </div>
              )
            ) : (
              <span style={{ fontSize: 12, fontWeight: 700, color: colors.textPrimary }}>{getValue(s)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Job Card ──

function JobCard({ job, isLoading, onStart, onStop, onRun, onShowHistory, colors }: {
  job: JobStatus;
  isLoading: boolean;
  onStart: () => void;
  onStop: () => void;
  onRun: () => void;
  onShowHistory: () => void;
  colors: ThemeColors;
}) {
  const hasError = !!job.lastRunError;

  return (
    <div style={{
      position: 'relative', borderRadius: 12, padding: 20,
      transition: 'all 0.2s',
      border: `1px solid ${hasError ? colors.errorBorder : colors.cardBorder}`,
      background: hasError
        ? (colors.isDarkMode ? 'rgba(239,68,68,0.06)' : 'rgba(239,68,68,0.02)')
        : colors.cardBg,
      boxShadow: colors.isDarkMode ? '0 1px 3px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: colors.textPrimary }}>{job.name}</h3>
            <StatusBadge job={job} isDarkMode={colors.isDarkMode} />
          </div>
          <p style={{ fontSize: 12, color: colors.textSecondary, margin: 0, lineHeight: 1.5 }}>{job.description}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {[
          {
            label: 'Tần suất',
            value: job.scheduleTime ? `Hàng ngày ${job.scheduleTime}` : (job.intervalMs ? formatInterval(job.intervalMs) : '—'),
            icon: <FieldTimeOutlined style={{ fontSize: 12, color: colors.textTertiary }} />,
          },
          {
            label: 'Lần cuối',
            value: timeAgo(job.lastRunAt),
            icon: <ClockCircleOutlined style={{ fontSize: 12, color: colors.textTertiary }} />,
          },
          {
            label: 'Chạy / Lỗi',
            value: <>{job.runCount} <span style={{ color: colors.textTertiary }}>/</span> <span style={{ color: job.errorCount > 0 ? '#ef4444' : undefined }}>{job.errorCount}</span></>,
            icon: <DashboardOutlined style={{ fontSize: 12, color: colors.textTertiary }} />,
          },
          {
            label: 'Thời gian chạy',
            value: job.lastRunDuration || '—',
            icon: <ThunderboltOutlined style={{ fontSize: 12, color: colors.textTertiary }} />,
          },
        ].map((stat, i) => (
          <div key={i} style={{
            borderRadius: 8, padding: 10,
            background: colors.subtleBg,
            border: `1px solid ${colors.borderColor}`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: colors.textTertiary, marginBottom: 2 }}>{stat.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, color: colors.textPrimary }}>
              {stat.icon} {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      {job.progress && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.isDarkMode ? '#60a5fa' : '#3b82f6' }}>
              {job.progress.percent}%
            </span>
            <span style={{ fontSize: 11, color: colors.textTertiary }}>
              {job.progress.current} / {job.progress.total}
            </span>
          </div>
          <div style={{
            height: 6, borderRadius: 3,
            background: colors.isDarkMode ? '#334155' : '#e2e8f0',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', borderRadius: 3,
              width: `${job.progress.percent}%`,
              background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
              transition: 'width 0.5s ease',
            }} />
          </div>
          {job.progress.message && (
            <p style={{ fontSize: 11, color: colors.textSecondary, margin: '4px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {job.progress.message}
            </p>
          )}
        </div>
      )}

      {/* Error Banner */}
      {hasError && (
        <div style={{
          borderRadius: 8, padding: 10, marginBottom: 16,
          background: colors.errorBg,
          border: `1px solid ${colors.errorBorder}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <ExclamationCircleOutlined style={{ color: '#ef4444', fontSize: 14, marginTop: 1, flexShrink: 0 }} />
            <p style={{
              fontSize: 12, color: '#dc2626', margin: 0,
              wordBreak: 'break-all',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>{job.lastRunError}</p>
          </div>
        </div>
      )}

      {/* Params Editor */}
      <ParamsEditor job={job} colors={colors} />

      {/* Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16 }}>
        {job.isStarted || job.enabled ? (
          <Button
            size="small"
            onClick={onStop}
            disabled={isLoading}
            style={{
              height: 32, fontSize: 12, gap: 6,
              color: '#dc2626', borderColor: 'rgba(220,38,38,0.3)',
              display: 'flex', alignItems: 'center',
            }}
            icon={<PauseCircleOutlined style={{ fontSize: 12 }} />}
          >Dừng</Button>
        ) : (
          <Button
            size="small"
            onClick={onStart}
            disabled={isLoading}
            style={{
              height: 32, fontSize: 12, gap: 6,
              color: '#10b981', borderColor: 'rgba(16,185,129,0.3)',
              display: 'flex', alignItems: 'center',
            }}
            icon={<PlayCircleOutlined style={{ fontSize: 12 }} />}
          >Bật</Button>
        )}

        <Button
          size="small"
          onClick={onRun}
          disabled={isLoading || job.isRunning}
          style={{ height: 32, fontSize: 12, display: 'flex', alignItems: 'center' }}
          icon={<SyncOutlined spin={job.isRunning} style={{ fontSize: 12 }} />}
        >Chạy ngay</Button>

        {(job.recentHistory?.length || 0) > 0 && (
          <Tooltip title="Xem lịch sử chạy chi tiết">
            <Button
              type="text"
              size="small"
              onClick={onShowHistory}
              style={{ marginLeft: 'auto', height: 32, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <HistoryOutlined style={{ fontSize: 12 }} />
              {job.recentHistory?.length || 0} lần chạy
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════

export default function BackgroundJobsPage() {
  const colors = useThemeColors();
  const [data, setData] = useState<JobManagerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // History modal state
  const [historyModal, setHistoryModal] = useState<{ jobName: string; history: RunHistoryEntry[] } | null>(null);

  const fetchJobs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefetching(true);
    try {
      const result = await backgroundJobsApi.getJobs();
      setData(result);
    } catch (err: any) {
      if (!silent) message.error(`Lỗi tải jobs: ${err?.response?.data?.message || err.message}`);
    }
    setLoading(false);
    setIsRefetching(false);
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => fetchJobs(true), 5000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchJobs]);

  const handleStart = async (name: string) => {
    setActionLoading(true);
    try {
      await backgroundJobsApi.startJob(name);
      message.success(`Job "${name}" đã bật`);
      await fetchJobs(true);
    } catch (err: any) { message.error(`Lỗi bật "${name}": ${err?.response?.data?.message || err.message}`); }
    setActionLoading(false);
  };

  const handleStop = async (name: string) => {
    setActionLoading(true);
    try {
      await backgroundJobsApi.stopJob(name);
      message.success(`Job "${name}" đã dừng`);
      await fetchJobs(true);
    } catch (err: any) { message.error(`Lỗi dừng "${name}": ${err?.response?.data?.message || err.message}`); }
    setActionLoading(false);
  };

  const handleRun = async (name: string) => {
    setActionLoading(true);
    try {
      await backgroundJobsApi.runJobNow(name);
      message.success(`Job "${name}" đã trigger`);
      await fetchJobs(true);
    } catch (err: any) { message.error(`Lỗi trigger "${name}": ${err?.response?.data?.message || err.message}`); }
    setActionLoading(false);
  };

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Tác vụ chạy ngầm"
          description="Quản lý, cấu hình và theo dõi lịch sử các tác vụ nền trên P2P Server"
          breadcrumb={[{ label: 'Tác vụ chạy ngầm' }]}
        />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 12 }}>
          <SyncOutlined spin style={{ fontSize: 24, color: colors.textTertiary }} />
          <span style={{ fontSize: 14, color: colors.textTertiary }}>Đang tải...</span>
        </div>
      </div>
    );
  }

  const jobs = data?.jobs || [];

  return (
    <div>
      {/* Page Header */}
      <PageHeader
        title="Tác vụ chạy ngầm"
        description="Quản lý, cấu hình và theo dõi lịch sử các tác vụ nền trên P2P Server"
        breadcrumb={[{ label: 'Tác vụ chạy ngầm' }]}
        extra={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 500,
                border: 'none', cursor: 'pointer',
                background: autoRefresh
                  ? (colors.isDarkMode ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.12)')
                  : (colors.isDarkMode ? '#1e293b' : '#f1f5f9'),
                color: autoRefresh
                  ? (colors.isDarkMode ? '#34d399' : '#10b981')
                  : colors.textTertiary,
                transition: 'all 0.2s',
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: autoRefresh
                  ? (colors.isDarkMode ? '#34d399' : '#10b981')
                  : colors.textTertiary,
                animation: autoRefresh ? 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' : undefined,
              }} />
              Tự động {autoRefresh ? 'BẬT' : 'TẮT'}
            </button>

            <Button
              size="small"
              icon={<ReloadOutlined spin={isRefetching} />}
              onClick={() => fetchJobs()}
              disabled={isRefetching}
              style={{ height: 32, fontSize: 12 }}
            >Làm mới</Button>
          </div>
        }
      />

      {/* Summary Cards */}
      {data && (
        <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
          {[
            { label: 'Tổng tác vụ', value: data.totalJobs, color: colors.textPrimary },
            { label: 'Đang bật', value: data.enabledJobs, color: colors.isDarkMode ? '#34d399' : '#10b981' },
            { label: 'Đang chạy', value: data.runningJobs, color: colors.isDarkMode ? '#60a5fa' : '#3b82f6' },
            { label: 'Server hoạt động', value: data.startedAt ? timeAgo(data.startedAt) : '—', color: colors.textTertiary },
          ].map((s, i) => (
            <Col key={i} xs={12} sm={6}>
              <div style={{
                borderRadius: 12, padding: 16,
                border: `1px solid ${colors.borderColor}`,
                background: colors.cardBg,
              }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: colors.textTertiary, marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            </Col>
          ))}
        </Row>
      )}

      {/* Job Cards Grid */}
      {jobs.length === 0 ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', height: 256,
          borderRadius: 12, border: `2px dashed ${colors.borderColor}`,
          background: colors.cardBg,
        }}>
          <div style={{ textAlign: 'center' }}>
            <FieldTimeOutlined style={{ fontSize: 32, color: colors.textTertiary, marginBottom: 8 }} />
            <p style={{ fontSize: 14, color: colors.textTertiary, margin: 0 }}>Không có tác vụ nào</p>
          </div>
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          {jobs.map(job => (
            <Col key={job.name} xs={24} lg={12}>
              <JobCard
                job={job}
                isLoading={actionLoading}
                onStart={() => handleStart(job.name)}
                onStop={() => handleStop(job.name)}
                onRun={() => handleRun(job.name)}
                onShowHistory={() => setHistoryModal({ jobName: job.name, history: job.recentHistory || [] })}
                colors={colors}
              />
            </Col>
          ))}
        </Row>
      )}

      {/* History Modal */}
      {historyModal && (
        <HistoryModal
          jobName={historyModal.jobName}
          history={historyModal.history}
          open={!!historyModal}
          onClose={() => setHistoryModal(null)}
          colors={colors}
        />
      )}

      {/* CSS Keyframes */}
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
