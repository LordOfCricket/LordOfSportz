import { useCallback, useEffect, useState } from 'react'
import { fetchGroundTimeline, fetchGroundDashboard, fetchGroundReport, fetchGroundUtilization, fetchBookingHistory, fetchGroundAuditLog } from '../services/groundOpsApi.js'
import { todayDateInputValue } from '../models/booking.model.js'

// Small, focused hooks for the new staff Ground Operations
// surfaces. Same "load in a deferred effect, never setState synchronously in
// the effect body" pattern every other hook in this codebase already uses
// (react-hooks/set-state-in-effect).

export function useGroundTimeline(initialDate = todayDateInputValue()) {
  const [date, setDate] = useState(initialDate)
  const [timeline, setTimeline] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    return fetchGroundTimeline(date)
      .then(setTimeline)
      .catch((err) => setError(err.response?.data?.message || 'Unable to load the ground timeline.'))
      .finally(() => setLoading(false))
  }, [date])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return { date, setDate, timeline, loading, error, reload: load }
}

export function useGroundDashboard() {
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    return fetchGroundDashboard()
      .then(setDashboard)
      .catch((err) => setError(err.response?.data?.message || 'Unable to load the dashboard.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return { dashboard, loading, error, reload: load }
}

function defaultRange() {
  const to = todayDateInputValue()
  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - 29)
  const from = `${fromDate.getFullYear()}-${String(fromDate.getMonth() + 1).padStart(2, '0')}-${String(fromDate.getDate()).padStart(2, '0')}`
  return { from, to }
}

export function useGroundReports() {
  const [range, setRange] = useState(defaultRange())
  const [report, setReport] = useState(null)
  const [utilization, setUtilization] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    return Promise.all([fetchGroundReport({ from: range.from, to: range.to }), fetchGroundUtilization({ from: range.from, to: range.to })])
      .then(([r, u]) => {
        setReport(r)
        setUtilization(u)
      })
      .catch((err) => setError(err.response?.data?.message || 'Unable to load reports.'))
      .finally(() => setLoading(false))
  }, [range])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  return { range, setRange, report, utilization, loading, error, reload: load }
}

const PAGE_SIZE = 15

export function useBookingHistory() {
  const [filters, setFilters] = useState({ q: '', status: '', bookingType: '', from: '', to: '' })
  const [offset, setOffset] = useState(0)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    return fetchBookingHistory({ ...filters, limit: PAGE_SIZE, offset })
      .then(setResult)
      .catch((err) => setError(err.response?.data?.message || 'Unable to load booking history.'))
      .finally(() => setLoading(false))
  }, [filters, offset])

  useEffect(() => {
    const timer = window.setTimeout(load, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const changeFilters = (next) => {
    setOffset(0)
    setFilters((prev) => ({ ...prev, ...next }))
  }

  return { filters, changeFilters, offset, setOffset, pageSize: PAGE_SIZE, result, loading, error }
}

export function useAuditLog() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true)
      fetchGroundAuditLog({ limit: 30 })
        .then((data) => setEntries(data.entries))
        .catch((err) => setError(err.response?.data?.message || 'Unable to load the audit log.'))
        .finally(() => setLoading(false))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  return { entries, loading, error }
}
