import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

const CATEGORY_LABELS: Record<string, string> = {
  new_users: 'New Users',
  inactive: 'Inactive',
  core_gamers: 'Core Gamers',
  starters: 'Starters',
  regulars: 'Regulars',
  casuals: 'Casuals',
  previously_active_last_3m: 'Previously Active (last 3 months)',
  previously_active_before_3m: 'Previously Active (before 3 months)',
}

const CATEGORY_COLORS: Record<string, string> = {
  new_users: '#00bcd4',
  inactive: '#9e9e9e',
  core_gamers: '#ff7043',
  starters: '#ab47bc',
  regulars: '#42a5f5',
  casuals: '#66bb6a',
  previously_active_last_3m: '#ffb74d',
  previously_active_before_3m: '#ff9800',
}

const SEGMENT_COLOR_POOL = ['#22d3ee', '#a855f7', '#f97316', '#10b981', '#f43f5e', '#facc15', '#60a5fa', '#fb7185']

const USER_FIELD_KEYS = {
  id: ['User ID', 'user_id'],
  name: ['Name', 'name'],
  email: ['Email', 'email'],
  phone: ['Phone', 'phone'],
  segment: ['Segment', 'segment'],
} as const

type UserFieldKey = keyof typeof USER_FIELD_KEYS

const getUserField = (user: UserRecord | null | undefined, key: UserFieldKey) => {
  if (!user) return undefined
  for (const alias of USER_FIELD_KEYS[key]) {
    const value = user[alias]
    if (value !== undefined && value !== null && value !== '') {
      return value
    }
  }
  return undefined
}

type SegmentCounts = {
  segment: string
  counts: Record<string, number>
}

type SegmentStatsResponse = {
  categories: string[]
  segments: SegmentCounts[]
  totals: Record<string, number>
  total_users: number
}

type TimelinePoint = {
  label: string
  start_date: string
  end_date: string
  contests: number
}

type UserTimelineResponse = {
  user_id: number
  name?: string | null
  segment?: string | null
  points: TimelinePoint[]
}

type UserRecord = Record<string, string | number | null>

type UserSearchResponse = {
  count: number
  results: UserRecord[]
}

type SegmentTooltipData = {
  active?: boolean
  label?: string | number
  payload?: ReadonlyArray<{
    color?: string
    fill?: string
    dataKey?: string | number
    value?: number
  }>
}

type SegmentInsightMetrics = {
  user_count: number
  avg_cash_balance: number
  avg_total_contests: number
  avg_ipl_contests: number
  avg_highest_ipl_score: number
  avg_days_since_registration: number
  recent_active_share: number
}

type SegmentInsightsResponse = {
  segment: string
  metrics: SegmentInsightMetrics
  recent_activity: TimelinePoint[]
}

type SegmentTrendPoint = {
  label: string
  start_date: string
  end_date: string
  totals: Record<string, number>
}

type SegmentTrendResponse = {
  segments: string[]
  points: SegmentTrendPoint[]
}

type TrendChartDatum = Record<string, number | string | null>

function App() {
  const [stats, setStats] = useState<SegmentStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<UserRecord[]>([])
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchInfo, setSearchInfo] = useState<string | null>(null)
  const [selectedExportSegment, setSelectedExportSegment] = useState<string>('all')
  const [timeline, setTimeline] = useState<UserTimelineResponse | null>(null)
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const [timelineInputs, setTimelineInputs] = useState({ start: '', end: '' })
  const [timelineFilters, setTimelineFilters] = useState({ start: '', end: '' })
  const [insightSegment, setInsightSegment] = useState<string | null>(null)
  const [segmentInsights, setSegmentInsights] = useState<SegmentInsightsResponse | null>(null)
  const [segmentInsightsLoading, setSegmentInsightsLoading] = useState(false)
  const [segmentInsightsError, setSegmentInsightsError] = useState<string | null>(null)
  const [trendSegments, setTrendSegments] = useState<string[]>([])
  const [trendWeeks, setTrendWeeks] = useState('8')
  const [segmentTrends, setSegmentTrends] = useState<SegmentTrendResponse | null>(null)
  const [segmentTrendsLoading, setSegmentTrendsLoading] = useState(false)
  const [segmentTrendsError, setSegmentTrendsError] = useState<string | null>(null)
  const [sizeSegment, setSizeSegment] = useState<string | null>(null)
  const [sizeWeeks, setSizeWeeks] = useState('8')
  const [sizeSegmentTrends, setSizeSegmentTrends] = useState<SegmentTrendResponse | null>(null)
  const [sizeSegmentLoading, setSizeSegmentLoading] = useState(false)
  const [sizeSegmentError, setSizeSegmentError] = useState<string | null>(null)
  const resolvedSelectedUserId = useMemo(() => {
    const value = getUserField(selectedUser, 'id')
    if (value === undefined || value === null || value === '') {
      return null
    }
    return String(value)
  }, [selectedUser])

  useEffect(() => {
    const controller = new AbortController()
    const fetchStats = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${API_BASE_URL}/stats/segments`, {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }
        const json = (await response.json()) as SegmentStatsResponse
        setStats(json)
        setError(null)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }
        const message = err instanceof Error ? err.message : 'Unexpected error'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()

    return () => controller.abort()
  }, [])

  const chartData = useMemo(() => {
    if (!stats) return []
    return stats.segments.map((segment) => ({
      segment: segment.segment,
      ...segment.counts,
    }))
  }, [stats])

  const displayLabel = useCallback((key: string) => CATEGORY_LABELS[key] ?? key, [])

  const segmentOptions = useMemo(() => stats?.segments.map((segment) => segment.segment) ?? [], [stats])

  useEffect(() => {
    if (!stats) return
    if (!insightSegment && stats.segments.length) {
      setInsightSegment(stats.segments[0].segment)
    }
    if (!trendSegments.length && stats.segments.length) {
      setTrendSegments(
        stats.segments.slice(0, Math.min(2, stats.segments.length)).map((segment) => segment.segment),
      )
    }
    if (!sizeSegment && stats.segments.length) {
      setSizeSegment(stats.segments[0].segment)
    }
  }, [stats, insightSegment, trendSegments.length])

  const renderSegmentTooltip = useCallback(
    ({ active, label, payload }: SegmentTooltipData) => {
      if (!active || !payload?.length) return null
      const entries = payload.filter(
        (entry) => typeof entry.value === 'number' && (entry.value as number) > 0,
      )
      if (!entries.length) return null
      return (
        <div className="segment-tooltip">
          <p className="segment-tooltip__label">{label ?? ''}</p>
          <ul className="segment-tooltip__list">
            {entries.map((entry) => (
              <li key={String(entry.dataKey)}>
                <span style={{ color: entry.color ?? entry.fill ?? '#e2e8f0' }}>
                  {displayLabel(String(entry.dataKey))}
                </span>
                <strong>{(entry.value as number).toLocaleString('en-US')}</strong>
              </li>
            ))}
          </ul>
        </div>
      )
    },
    [displayLabel],
  )

  useEffect(() => {
    if (!insightSegment) {
      setSegmentInsights(null)
      return
    }

    const controller = new AbortController()
    const fetchInsights = async () => {
      try {
        setSegmentInsightsLoading(true)
        setSegmentInsightsError(null)
        const url = `${API_BASE_URL}/segments/${encodeURIComponent(insightSegment)}/insights?weeks=8`
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Insight request failed with status ${response.status}`)
        }
        const json = (await response.json()) as SegmentInsightsResponse
        setSegmentInsights(json)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }
        const message = err instanceof Error ? err.message : 'Unexpected insights error'
        setSegmentInsightsError(message)
        setSegmentInsights(null)
      } finally {
        setSegmentInsightsLoading(false)
      }
    }

    fetchInsights()
    return () => controller.abort()
  }, [insightSegment])

  useEffect(() => {
    if (!trendSegments.length) {
      setSegmentTrends(null)
      return
    }

    const controller = new AbortController()
    const fetchTrends = async () => {
      try {
        setSegmentTrendsLoading(true)
        setSegmentTrendsError(null)
        const params = new URLSearchParams({ weeks: trendWeeks })
        trendSegments.forEach((segment) => params.append('segments', segment))
        const url = `${API_BASE_URL}/segments/trends?${params.toString()}`
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Trend request failed with status ${response.status}`)
        }
        const json = (await response.json()) as SegmentTrendResponse
        setSegmentTrends(json)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }
        const message = err instanceof Error ? err.message : 'Unexpected trend error'
        setSegmentTrendsError(message)
        setSegmentTrends(null)
      } finally {
        setSegmentTrendsLoading(false)
      }
    }

    fetchTrends()
    return () => controller.abort()
  }, [trendSegments, trendWeeks])

  useEffect(() => {
    if (!sizeSegment) {
      setSizeSegmentTrends(null)
      return
    }

    const controller = new AbortController()
    const fetchSizeTrend = async () => {
      try {
        setSizeSegmentLoading(true)
        setSizeSegmentError(null)
        const params = new URLSearchParams({ weeks: sizeWeeks })
        params.append('segments', sizeSegment)
        const url = `${API_BASE_URL}/segments/trends?${params.toString()}`
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Size trend request failed with status ${response.status}`)
        }
        const json = (await response.json()) as SegmentTrendResponse
        setSizeSegmentTrends(json)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }
        const message = err instanceof Error ? err.message : 'Unexpected size trend error'
        setSizeSegmentError(message)
        setSizeSegmentTrends(null)
      } finally {
        setSizeSegmentLoading(false)
      }
    }

    fetchSizeTrend()
    return () => controller.abort()
  }, [sizeSegment, sizeWeeks])

  useEffect(() => {
    // Reset timeline filters when a new user is selected
    setTimelineInputs({ start: '', end: '' })
    setTimelineFilters({ start: '', end: '' })
    setTimeline(null)
    setTimelineError(null)
  }, [resolvedSelectedUserId])

  useEffect(() => {
    if (!resolvedSelectedUserId) {
      return
    }

    const controller = new AbortController()
    const fetchTimeline = async () => {
      try {
        setTimelineLoading(true)
        setTimelineError(null)
        const params = new URLSearchParams()
        if (timelineFilters.start) params.set('start', timelineFilters.start)
        if (timelineFilters.end) params.set('end', timelineFilters.end)
        const queryString = params.toString()
        const url = `${API_BASE_URL}/users/${encodeURIComponent(resolvedSelectedUserId)}/timeline${
          queryString ? `?${queryString}` : ''
        }`
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Timeline request failed with status ${response.status}`)
        }
        const json = (await response.json()) as UserTimelineResponse
        setTimeline(json)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }
        const message = err instanceof Error ? err.message : 'Unexpected timeline error'
        setTimelineError(message)
        setTimeline(null)
      } finally {
        setTimelineLoading(false)
      }
    }

    fetchTimeline()
    return () => controller.abort()
  }, [resolvedSelectedUserId, timelineFilters.start, timelineFilters.end])

  const handleSearch = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    const term = searchTerm.trim()
    if (term.length < 1) {
      setSearchError('Enter at least 1 character to search')
      setSearchInfo(null)
      return
    }

    setSearchLoading(true)
    setSearchError(null)

    try {
      const response = await fetch(
        `${API_BASE_URL}/users/search?q=${encodeURIComponent(term)}&limit=5`,
      )
      if (!response.ok) {
        throw new Error(`Search failed with status ${response.status}`)
      }
      const json = (await response.json()) as UserSearchResponse
      setSearchResults(json.results)
      setSelectedUser(json.results[0] ?? null)
      setSearchInfo(
        json.results.length
          ? `Showing ${json.results.length} entr${json.results.length === 1 ? 'y' : 'ies'}`
          : 'No users found',
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected search error'
      setSearchError(message)
      setSearchInfo(null)
    } finally {
      setSearchLoading(false)
    }
  }

  const handleExport = () => {
    const url = new URL(`${API_BASE_URL}/export/users`)
    if (selectedExportSegment !== 'all') {
      url.searchParams.append('segments', selectedExportSegment)
    }
    window.open(url.toString(), '_blank', 'noopener')
  }

  const formatValue = (value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') {
      return '—'
    }
    if (typeof value === 'number') {
      return value.toLocaleString('en-US')
    }
    return value
  }

  const formatRangeLabel = (isoDate: string) => {
    const parsed = new Date(isoDate)
    if (Number.isNaN(parsed.getTime())) return isoDate
    return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const timelineChartData = useMemo(() => {
    if (!timeline) return []
    return timeline.points.map((point) => ({
      label: point.label,
      start_date: point.start_date,
      end_date: point.end_date,
      contests: point.contests,
      axisLabel: `${formatRangeLabel(point.start_date)}-${formatRangeLabel(point.end_date)}`,
    }))
  }, [timeline])

  const segmentInsightChartData = useMemo(() => {
    if (!segmentInsights) return []
    return segmentInsights.recent_activity.map((point) => ({
      label: point.label,
      start_date: point.start_date,
      end_date: point.end_date,
      contests: point.contests,
      axisLabel: `${formatRangeLabel(point.start_date)}-${formatRangeLabel(point.end_date)}`,
    }))
  }, [segmentInsights])

  const trendColorMap = useMemo(() => {
    if (!segmentTrends) return {}
    const mapping: Record<string, string> = {}
    segmentTrends.segments.forEach((segment, index) => {
      mapping[segment] = SEGMENT_COLOR_POOL[index % SEGMENT_COLOR_POOL.length]
    })
    return mapping
  }, [segmentTrends])

  const trendChartData: TrendChartDatum[] = useMemo(() => {
    if (!segmentTrends) return []
    return segmentTrends.points.map((point) => {
      const entry: TrendChartDatum = {
        label: point.label,
        start_date: point.start_date,
        end_date: point.end_date,
        axisLabel: `${formatRangeLabel(point.start_date)}-${formatRangeLabel(point.end_date)}`,
      }
      segmentTrends.segments.forEach((segment) => {
        entry[segment] = point.totals[segment] ?? 0
      })
      return entry
    })
  }, [segmentTrends])

  const sizeChartData = useMemo(() => {
    if (!sizeSegmentTrends || !sizeSegment) return []
    const segment = sizeSegment
    const points = sizeSegmentTrends.points
    const data: Array<TrendChartDatum & { total: number; delta: number | null }> = []
    for (let i = 0; i < points.length; i++) {
      const point = points[i]
      const total = point.totals[segment] ?? 0
      const prev = i > 0 ? points[i - 1].totals[segment] ?? 0 : null
      const delta = prev === null ? null : total - prev
      data.push({
        label: point.label,
        start_date: point.start_date,
        end_date: point.end_date,
        axisLabel: `${formatRangeLabel(point.start_date)}-${formatRangeLabel(point.end_date)}`,
        total,
        delta,
      })
    }
    return data
  }, [sizeSegmentTrends, sizeSegment])

  const applyTimelineFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (timelineInputs.start && timelineInputs.end && timelineInputs.start > timelineInputs.end) {
      setTimelineError('Start date must be before end date.')
      return
    }
    setTimelineError(null)
    setTimelineFilters({ start: timelineInputs.start, end: timelineInputs.end })
  }

  const resetTimelineFilters = () => {
    setTimelineInputs({ start: '', end: '' })
    setTimelineFilters({ start: '', end: '' })
  }

  const handleSegmentBarClick = (data: { payload?: { segment?: string } }) => {
    const segmentName = data?.payload?.segment
    if (segmentName) {
      setInsightSegment(segmentName)
    }
  }

  const handleTrendSegmentChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const options = Array.from(event.target.options)
      .filter((option) => option.selected)
      .map((option) => option.value)
    setTrendSegments(options)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Neuball Dashboard</p>
          <h1>Player Cluster Overview</h1>
          <p className="subhead">
            Track how fantasy cricket users distribute across behavioral segments.
          </p>
        </div>
      </header>

      {error && <div className="error-card">Failed to load data: {error}</div>}

      {loading && !error && <div className="loading">Fetching latest clusters…</div>}

      {stats && !loading && !error && (
        <>
          <section className="cards-grid">
            <article className="stat-card" key="total-users">
              <span className="card-label">Total Users</span>
              <strong className="card-value">{stats.total_users.toLocaleString('en-US')}</strong>
            </article>
            {stats.categories.map((key) => (
              <article className="stat-card" key={key}>
                <span className="card-label">{displayLabel(key)}</span>
                <strong className="card-value">
                  {stats.totals[key]?.toLocaleString('en-US') ?? 0}
                </strong>
              </article>
            ))}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                  <h2>Segment size over time (Users)</h2>
                  <p>Weekly counts of users in a segment with week-over-week delta.</p>
              </div>
                // Request user-count metric when available on the API
                params.append('metric', 'users')
              <div className="insight-controls">
                <label htmlFor="size-segment-select">Segment</label>
                <select
                  id="size-segment-select"
                  value={sizeSegment ?? ''}
                  onChange={(e) => setSizeSegment(e.target.value)}
                  disabled={!segmentOptions.length}
                >
                  {!sizeSegment && <option value="">Select a segment</option>}
                  {segmentOptions.map((segment) => (
                    <option key={segment} value={segment}>
                      {segment}
                    </option>
                  ))}
                </select>

                <label htmlFor="size-weeks">Weeks</label>
                <select id="size-weeks" value={sizeWeeks} onChange={(e) => setSizeWeeks(e.target.value)}>
                  <option value="4">4 weeks</option>
                  <option value="8">8 weeks</option>
                  <option value="12">12 weeks</option>
                  <option value="16">16 weeks</option>
                </select>
              </div>
            </div>

            {sizeSegmentError && <p className="error-text">{sizeSegmentError}</p>}
            {sizeSegmentLoading && <p className="hint-text">Loading segment size…</p>}

            {!sizeSegmentLoading && (!sizeChartData || sizeChartData.length === 0) && (
              <p className="hint-text">Select a segment with available weekly data to render the chart.</p>
            )}

            {!sizeSegmentLoading && sizeChartData && sizeChartData.length > 0 && (
              <div className="chart-wrapper" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sizeChartData} margin={{ left: 16, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="axisLabel" tickLine={false} axisLine={false} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      allowDecimals={true}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#94a3b8' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(15,23,42,0.95)',
                        border: '1px solid rgba(148,163,184,0.4)',
                        borderRadius: '0.75rem',
                        color: '#e2e8f0',
                      }}
                      labelFormatter={(_, payload) => {
                        if (!payload?.length) return ''
                        const point = payload[0].payload as (typeof sizeChartData)[number]
                        return `${point.start_date} → ${point.end_date}`
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === 'total') return [`${value.toLocaleString('en-US')}`, 'Users']
                        return [`${value >= 0 ? '+' : ''}${value}`, 'WoW Δ']
                      }}
                    />
                    <Legend wrapperStyle={{ paddingTop: 8 }} />
                    <Bar dataKey="total" name="Users" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="delta"
                      yAxisId="right"
                      name="WoW Δ"
                      stroke="#f97316"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="utility-grid">
            <article className="panel form-panel">
              <div className="panel-header">
                <div>
                  <h2>User lookup</h2>
                  <p>Search by user ID, name, email, or phone to inspect a single player.</p>
                </div>
              </div>
              <form className="search-form" onSubmit={handleSearch}>
                <input
                  type="search"
                  placeholder="Search by ID, name, email, or phone"
                  value={searchTerm}
                  onChange={(event) => {
                    const value = event.target.value
                    setSearchTerm(value)
                    if (!value.trim()) {
                      setSearchResults([])
                      setSelectedUser(null)
                      setSearchInfo(null)
                      setSearchError(null)
                      setTimeline(null)
                    }
                  }}
                />
                <button type="submit" disabled={searchLoading}>
                  {searchLoading ? 'Searching…' : 'Search'}
                </button>
              </form>
              {searchError && <p className="error-text">{searchError}</p>}
              {searchInfo && !searchError && <p className="hint-text">{searchInfo}</p>}

              {searchResults.length > 0 && (
                <ul className="search-results">
                  {searchResults.map((user, index) => {
                    const displayName = (getUserField(user, 'name') as string) ?? 'Unknown user'
                    const displaySegment = getUserField(user, 'segment')
                    const displayContact =
                      (getUserField(user, 'email') ?? getUserField(user, 'phone')) ?? 'No contact'
                    const identifier =
                      getUserField(user, 'id') ??
                      getUserField(user, 'email') ??
                      getUserField(user, 'phone') ??
                      `${displayName}-${index}`
                    return (
                      <li key={String(identifier)}>
                        <button type="button" onClick={() => setSelectedUser(user)}>
                          <span>
                            {displayName}
                            {displaySegment ? <small>Segment: {displaySegment}</small> : null}
                          </span>
                          <span className="muted">{String(displayContact)}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              {selectedUser && (
                <div className="user-detail">
                  <div className="detail-header">
                    <div>
                      <h3>{(getUserField(selectedUser, 'name') as string) ?? 'User details'}</h3>
                      {getUserField(selectedUser, 'segment') && (
                        <p>Segment: {getUserField(selectedUser, 'segment')}</p>
                      )}
                    </div>
                    {getUserField(selectedUser, 'email') && (
                      <p className="muted">{getUserField(selectedUser, 'email')}</p>
                    )}
                  </div>
                  <div className="detail-grid">
                    {Object.entries(selectedUser).map(([key, value]) => (
                      <div key={key}>
                        <span>{key}</span>
                        <strong>{formatValue(value)}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="user-timeline">
                    <div>
                      <h4>Weekly contests</h4>
                      <p className="muted">Hover to inspect contest counts per week.</p>
                    </div>
                    <form className="timeline-form" onSubmit={applyTimelineFilters}>
                      <label>
                        Start date
                        <input
                          type="date"
                          value={timelineInputs.start}
                          onChange={(event) =>
                            setTimelineInputs((prev) => ({ ...prev, start: event.target.value }))
                          }
                        />
                      </label>
                      <label>
                        End date
                        <input
                          type="date"
                          value={timelineInputs.end}
                          onChange={(event) =>
                            setTimelineInputs((prev) => ({ ...prev, end: event.target.value }))
                          }
                        />
                      </label>
                      <button type="submit">Apply range</button>
                      <button
                        type="button"
                        onClick={resetTimelineFilters}
                        disabled={!timelineFilters.start && !timelineFilters.end && !timelineInputs.start && !timelineInputs.end}
                      >
                        Clear
                      </button>
                    </form>
                    {timelineError && <p className="error-text">{timelineError}</p>}
                    {timelineLoading && <p className="hint-text">Loading timeline…</p>}
                    {!timelineLoading && timeline && (
                      timeline.points.length ? (
                        <div className="timeline-chart">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={timelineChartData} margin={{ left: 16, right: 24 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis
                                dataKey="axisLabel"
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: '#94a3b8', fontSize: 12 }}
                                minTickGap={20}
                              />
                              <YAxis allowDecimals={false} tick={{ fill: '#94a3b8' }} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: 'rgba(15,23,42,0.95)',
                                  borderRadius: '0.75rem',
                                  border: '1px solid rgba(148,163,184,0.4)',
                                  color: '#e2e8f0',
                                }}
                                labelFormatter={(_, payload) => {
                                  if (!payload || !payload.length) return ''
                                  const point = payload[0].payload as (typeof timelineChartData)[number]
                                  return `${point.start_date} → ${point.end_date}`
                                }}
                                formatter={(value: number) => [`${value}`, 'Contests']}
                              />
                              <Legend wrapperStyle={{ paddingTop: 8 }} />
                              <Line
                                type="monotone"
                                dataKey="contests"
                                name="Contests"
                                stroke="#4ade80"
                                strokeWidth={2}
                                dot={{ r: 3 }}
                                activeDot={{ r: 5 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <p className="hint-text">No activity found for the selected date range.</p>
                      )
                    )}
                  </div>
                </div>
              )}
            </article>

            <article className="panel form-panel">
              <div className="panel-header">
                <div>
                  <h2>Exports</h2>
                  <p>Download CSV snapshots for all players or a specific segment.</p>
                </div>
              </div>
              <div className="export-controls">
                <label htmlFor="segment-select">Choose segment</label>
                <select
                  id="segment-select"
                  value={selectedExportSegment}
                  onChange={(event) => setSelectedExportSegment(event.target.value)}
                >
                  <option value="all">All segments</option>
                  {segmentOptions.map((segment) => (
                    <option key={segment} value={segment}>
                      {segment}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={handleExport}>
                  Export CSV
                </button>
              </div>
              <p className="hint-text">
                CSV files include every column returned by the MySQL dataset. Filtered exports honor the selected segment.
              </p>
            </article>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Segment composition</h2>
                <p>Stacked counts for each player cluster.</p>
              </div>
            </div>
            <div className="chart-wrapper">
              <ResponsiveContainer width="100%" height={380}>
                <BarChart data={chartData} margin={{ left: 16, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="segment" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={renderSegmentTooltip} />
                  <Legend wrapperStyle={{ paddingTop: 12 }} formatter={displayLabel} />
                  {stats.categories.map((key, index) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="clusters"
                      fill={CATEGORY_COLORS[key] ?? '#8884d8'}
                      onClick={handleSegmentBarClick}
                      radius={
                        index === stats.categories.length - 1
                          ? [4, 4, 0, 0]
                          : [0, 0, 0, 0]
                      }
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Segment deep dive</h2>
                <p>Click a cluster above or choose from the list to inspect richer stats.</p>
              </div>
              <div className="insight-controls">
                <label htmlFor="segment-insight-select">Inspect segment</label>
                <select
                  id="segment-insight-select"
                  value={insightSegment ?? ''}
                  onChange={(event) => setInsightSegment(event.target.value)}
                  disabled={!segmentOptions.length}
                >
                  {!insightSegment && <option value="">Select a segment</option>}
                  {segmentOptions.map((segment) => (
                    <option key={segment} value={segment}>
                      {segment}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {segmentInsightsError && <p className="error-text">{segmentInsightsError}</p>}
            {segmentInsightsLoading && <p className="hint-text">Loading segment insights…</p>}
            {!segmentInsightsLoading && !segmentInsights && (
              <p className="hint-text">Pick a segment to load insights.</p>
            )}
            {segmentInsights && !segmentInsightsLoading && (
              <>
                <div className="insight-grid">
                  <div>
                    <span>Users in segment</span>
                    <strong>{segmentInsights.metrics.user_count.toLocaleString('en-US')}</strong>
                  </div>
                  <div>
                    <span>Avg. total contests</span>
                    <strong>{segmentInsights.metrics.avg_total_contests.toFixed(1)}</strong>
                  </div>
                  <div>
                    <span>Avg. IPL contests</span>
                    <strong>{segmentInsights.metrics.avg_ipl_contests.toFixed(1)}</strong>
                  </div>
                  <div>
                    <span>Avg. cash balance</span>
                    <strong>$ {segmentInsights.metrics.avg_cash_balance.toFixed(2)}</strong>
                  </div>
                  <div>
                    <span>Avg. highest IPL score</span>
                    <strong>{segmentInsights.metrics.avg_highest_ipl_score.toFixed(1)}</strong>
                  </div>
                  <div>
                    <span>Avg. days since registration</span>
                    <strong>{segmentInsights.metrics.avg_days_since_registration.toFixed(0)}</strong>
                  </div>
                  <div>
                    <span>Active in last 4 weeks</span>
                    <strong>{(segmentInsights.metrics.recent_active_share * 100).toFixed(1)}%</strong>
                  </div>
                </div>
                {segmentInsightChartData.length ? (
                  <div className="insight-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={segmentInsightChartData} margin={{ left: 16, right: 24 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="axisLabel"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: '#94a3b8', fontSize: 12 }}
                        />
                        <YAxis allowDecimals={false} tick={{ fill: '#94a3b8' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'rgba(15,23,42,0.95)',
                            border: '1px solid rgba(148,163,184,0.4)',
                            borderRadius: '0.75rem',
                            color: '#e2e8f0',
                          }}
                          labelFormatter={(_, payload) => {
                            if (!payload?.length) return ''
                            const point = payload[0].payload as (typeof segmentInsightChartData)[number]
                            return `${point.start_date} → ${point.end_date}`
                          }}
                          formatter={(value: number) => [`${value}`, 'Contests']}
                        />
                        <Line
                          type="monotone"
                          dataKey="contests"
                          name="Contests"
                          stroke="#22d3ee"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="hint-text">No recent weekly contests recorded for this segment.</p>
                )}
              </>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Trend comparisons</h2>
                <p>Compare weekly contest totals for multiple segments.</p>
              </div>
              <div className="trend-controls">
                <label htmlFor="trend-window">Weeks window</label>
                <select
                  id="trend-window"
                  value={trendWeeks}
                  onChange={(event) => setTrendWeeks(event.target.value)}
                >
                  <option value="4">Last 4 weeks</option>
                  <option value="8">Last 8 weeks</option>
                  <option value="12">Last 12 weeks</option>
                  <option value="16">Last 16 weeks</option>
                </select>
              </div>
            </div>
            <div className="trend-select">
              <label htmlFor="trend-segments">Choose segments</label>
              <select
                id="trend-segments"
                multiple
                value={trendSegments}
                onChange={handleTrendSegmentChange}
              >
                {segmentOptions.map((segment) => (
                  <option key={segment} value={segment}>
                    {segment}
                  </option>
                ))}
              </select>
              <p className="hint-text">Hold Cmd/Ctrl to select multiple clusters.</p>
            </div>
            {segmentTrendsError && <p className="error-text">{segmentTrendsError}</p>}
            {segmentTrendsLoading && <p className="hint-text">Loading trend comparison…</p>}
            {!segmentTrendsLoading && trendSegments.length === 0 && (
              <p className="hint-text">Select at least one segment to render the comparison.</p>
            )}
            {!segmentTrendsLoading && trendSegments.length > 0 && trendChartData.length === 0 && !segmentTrendsError && (
              <p className="hint-text">No weekly data available for the selected filters.</p>
            )}
            {!segmentTrendsLoading && trendChartData.length > 0 && (
              <div className="trend-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendChartData} margin={{ left: 16, right: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="axisLabel"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                    />
                    <YAxis allowDecimals={false} tick={{ fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(15,23,42,0.95)',
                        border: '1px solid rgba(148,163,184,0.4)',
                        borderRadius: '0.75rem',
                        color: '#e2e8f0',
                      }}
                      labelFormatter={(_, payload) => {
                        if (!payload?.length) return ''
                        const point = payload[0].payload as TrendChartDatum
                        return `${point.start_date as string} → ${point.end_date as string}`
                      }}
                    />
                    {segmentTrends?.segments.map((segment) => (
                      <Line
                        key={segment}
                        type="monotone"
                        dataKey={segment}
                        stroke={trendColorMap[segment] ?? '#ffffff'}
                        strokeWidth={2}
                        dot={false}
                        name={segment}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Segment breakdown</h2>
                <p>Raw counts by category for every cluster.</p>
              </div>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Segment</th>
                    {stats.categories.map((key) => (
                      <th key={key}>{displayLabel(key)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.segments.map((row) => (
                    <tr key={row.segment}>
                      <td>{row.segment}</td>
                      {stats.categories.map((key) => (
                        <td key={key}>{row.counts[key]?.toLocaleString('en-US') ?? 0}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    {stats.categories.map((key) => (
                      <td key={key}>{stats.totals[key]?.toLocaleString('en-US') ?? 0}</td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

export default App
