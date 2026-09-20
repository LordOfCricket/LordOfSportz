import React from 'react'
import { Tabs, Redirect } from 'expo-router'
import { ColorValue } from 'react-native'
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'
import { FloatingTabBar } from '../../src/components/navigation/FloatingTabBar'
import { TabBarScrollProvider } from '../../src/components/navigation/TabBarScrollContext'
import { useAuthStore } from '../../src/store/authStore'

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name']

function tabIcon(activeName: IconName, inactiveName: IconName = activeName) {
  const TabIcon = ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => (
    <MaterialCommunityIcons name={focused ? activeName : inactiveName} color={color as string} size={size} />
  )
  TabIcon.displayName = `TabIcon(${activeName})`
  return TabIcon
}

export default function TabsLayout() {
  // An Umpire account must never mount the Player tab layout, even via a
  // deep link straight to /(tabs)/...
  const isUmpire = useAuthStore((s) => s.isUmpire)
  if (isUmpire) return <Redirect href="/(umpire)/home" />

  return (
    <TabBarScrollProvider>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <FloatingTabBar {...props} />}
      >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarLabel: 'Home',
          tabBarIcon: tabIcon('home', 'home-outline'),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarLabel: 'Search',
          tabBarIcon: tabIcon('magnify'),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Matches',
          tabBarLabel: 'Matches',
          tabBarIcon: tabIcon('cricket'),
        }}
      />
      <Tabs.Screen
        name="teams"
        options={{
          title: 'Teams',
          tabBarLabel: 'Teams',
          tabBarIcon: tabIcon('account-group', 'account-group-outline'),
        }}
      />
      <Tabs.Screen
        name="grounds"
        options={{
          title: 'Grounds',
          tabBarLabel: 'Grounds',
          tabBarIcon: tabIcon('stadium', 'stadium-outline'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: tabIcon('account-circle', 'account-circle-outline'),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          href: null,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          href: null,
        }}
      />
      <Tabs.Screen
        name="players"
        options={{
          title: 'Players',
          href: null,
        }}
      />
      <Tabs.Screen
        name="rankings"
        options={{
          title: 'Rankings',
          href: null,
        }}
      />
      <Tabs.Screen
        name="tournaments"
        options={{
          title: 'Tournaments',
          href: null,
        }}
      />
      </Tabs>
    </TabBarScrollProvider>
  )
}
