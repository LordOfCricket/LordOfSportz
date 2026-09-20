import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as Location from 'expo-location'
import { useNearbyGrounds, useFeaturedGrounds } from '../../../src/hooks/useGrounds'
import { Colors, Spacing, Typography } from '../../../src/constants/colors'
import { LoadingScreen } from '../../../src/components/LoadingScreen'
import { ErrorScreen } from '../../../src/components/ErrorScreen'
import { EmptyState } from '../../../src/components/EmptyState'

export default function GroundsScreen() {
  const router = useRouter()
  const [location, setLocation] = useState<Location.LocationObject | null>(null)
  const [locationLoading, setLocationLoading] = useState(true)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const locationAvailable = !!location && !locationError
  const locationUnavailable = !locationLoading && (!!locationError || !location)

  const nearbyQuery = useNearbyGrounds(
    location?.coords.latitude || 0,
    location?.coords.longitude || 0,
    10
  )
  const allGroundsQuery = useFeaturedGrounds(50, locationUnavailable)

  const { data, isLoading, isError, refetch } = locationAvailable
    ? nearbyQuery
    : {
        data: allGroundsQuery.data ? { grounds: allGroundsQuery.data.grounds } : undefined,
        isLoading: allGroundsQuery.isLoading,
        isError: allGroundsQuery.isError,
        refetch: allGroundsQuery.refetch,
      }

  const requestLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setLocationError('Location permission denied')
        setLocationLoading(false)
        return
      }

      const currentLocation = await Location.getCurrentPositionAsync({})
      setLocation(currentLocation)
      setLocationError(null)
    } catch {
      setLocationError('Could not get location')
    } finally {
      setLocationLoading(false)
    }
  }

  useEffect(() => {
    requestLocation()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await Promise.all([requestLocation(), refetch()])
    setRefreshing(false)
  }

  const handleGroundPress = (groundId: string) => {
    router.push(`/(tabs)/grounds/${groundId}`)
  }

  if (locationLoading) {
    return <LoadingScreen />
  }

  if (isLoading) {
    return <LoadingScreen />
  }

  if (isError) {
    return (
      <ErrorScreen
        title="Failed to Load"
        message={locationAvailable ? 'Could not load nearby grounds. Please try again.' : 'Could not load grounds. Please try again.'}
        onRetry={() => refetch()}
      />
    )
  }

  const grounds = (data?.grounds || []).map((item: any) => ({
    id: item.public_ground_id || item.publicGroundId,
    name: item.name,
    city: item.city,
    secondaryLine: item.address_line || item.state,
  }))

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Grounds</Text>
        <Text style={styles.subtitle}>
          {locationAvailable ? 'Find cricket grounds nearby' : 'Browse registered grounds'}
        </Text>
      </View>

      {grounds.length > 0 ? (
        <FlatList
          data={grounds}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.groundCard}
              onPress={() => handleGroundPress(item.id)}
            >
              <View style={styles.groundContent}>
                <Text style={styles.groundName}>{item.name}</Text>
                {item.city && <Text style={styles.groundLocation}>📍 {item.city}</Text>}
                {item.secondaryLine && <Text style={styles.groundAddress}>{item.secondaryLine}</Text>}
              </View>
              <Text style={styles.arrow}>›</Text>
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        />
      ) : (
        <FlatList
          data={[]}
          renderItem={() => null}
          ListEmptyComponent={
            <EmptyState
              title="No grounds found"
              message="No cricket grounds found in your area"
            />
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    padding: Spacing.lg,
    paddingTop: Spacing['3xl'],
    backgroundColor: Colors.primary,
  },
  title: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.fontSize.base,
    color: Colors.white,
    opacity: 0.9,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  groundCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
    backgroundColor: Colors.backgroundAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  groundContent: {
    flex: 1,
  },
  groundName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  groundLocation: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  groundAddress: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  arrow: {
    fontSize: Typography.fontSize.lg,
    color: Colors.textTertiary,
  },
})
