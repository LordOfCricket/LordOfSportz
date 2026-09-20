import { useCallback, useEffect, useState } from 'react'
import { fetchMatchSummary } from '../services/matchSummaryApi.js'
import { fetchMatchUmpireSlots } from '../services/umpireSelfApi.js'
import { fetchMatchChecklist, updateMatchChecklistItem, checkInForMatch, reportMatchIncident, fetchMatchIncidents } from '../services/matchApi.js'
import { useAuth } from './useAuth.js'

// Workstream B — composes three existing/small endpoints
// (match summary, umpire slots, checklist, incidents) into one briefing
// view rather than a new match-detail endpoint, per the plan's own "do not
// build a second match-detail model" constraint. Always hits the server —
// no localStorage, matching useMatchSummary.js's own convention.
export function useMatchBriefing(matchId) {
  const { user } = useAuth()
  const [summary, setSummary] = useState(null)
  const [slots, setSlots] = useState([])
  const [checklist, setChecklist] = useState([])
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [togglingKey, setTogglingKey] = useState(null)
  const [checkingIn, setCheckingIn] = useState(false)
  const [reportingIncident, setReportingIncident] = useState(false)

  const load = useCallback(() => {
    return Promise.all([fetchMatchSummary(matchId), fetchMatchUmpireSlots(matchId), fetchMatchChecklist(matchId), fetchMatchIncidents(matchId)])
      .then(([summaryData, slotsData, checklistData, incidentsData]) => {
        setSummary(summaryData)
        setSlots(slotsData)
        setChecklist(checklistData)
        setIncidents(incidentsData)
        setError(null)
      })
      .catch((err) => setError(err.response?.data?.error || err.response?.data?.message || "Couldn't load this match briefing."))
      .finally(() => setLoading(false))
  }, [matchId])

  useEffect(() => {
    load()
  }, [load])

  const mySlot = slots.find((s) => s.umpire_user_id === user?.id) || null

  const toggleChecklistItem = useCallback(
    async (itemKey, isChecked) => {
      setTogglingKey(itemKey)
      try {
        const item = await updateMatchChecklistItem(matchId, itemKey, isChecked)
        setChecklist((prev) => prev.map((i) => (i.itemKey === itemKey ? item : i)))
      } finally {
        setTogglingKey(null)
      }
    },
    [matchId],
  )

  const checkIn = useCallback(
    async (coords) => {
      setCheckingIn(true)
      try {
        const slot = await checkInForMatch(matchId, coords || {})
        setSlots((prev) => prev.map((s) => (s.id === slot.id ? slot : s)))
        return slot
      } finally {
        setCheckingIn(false)
      }
    },
    [matchId],
  )

  const submitIncident = useCallback(
    async (payload) => {
      setReportingIncident(true)
      try {
        const incident = await reportMatchIncident(matchId, payload)
        setIncidents((prev) => [incident, ...prev])
        return incident
      } finally {
        setReportingIncident(false)
      }
    },
    [matchId],
  )

  return {
    summary,
    slots,
    mySlot,
    checklist,
    incidents,
    loading,
    error,
    togglingKey,
    checkingIn,
    reportingIncident,
    toggleChecklistItem,
    checkIn,
    submitIncident,
    retry: load,
  }
}
