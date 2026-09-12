import React, { useState, Suspense } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SQLiteProvider } from 'expo-sqlite';
import { Bus, Route as RouteIcon, Heart, Info, CreditCard } from 'lucide-react-native';
import { colors } from './src/theme/colors';
import { StopGroup } from './src/types/gtfs';
import { DeparturesScreen } from './src/screens/DeparturesScreen';
import { RoutesScreen } from './src/screens/RoutesScreen';
import { FavoritesScreen } from './src/screens/FavoritesScreen';
import { NetworkInfoScreen } from './src/screens/NetworkInfoScreen';
import { PassPassScreen } from './src/screens/PassPassScreen';

type Tab = 'departures' | 'routes' | 'passpass' | 'favorites' | 'info';

function LoadingScreen() {
  return (
    <View style={styles.loadingContainer}>
      <View style={styles.loadingIconCircle}>
        <Bus size={36} color={colors.primary} />
      </View>
      <Text style={styles.loadingTitle}>ArtisTrack</Text>
      <Text style={styles.loadingSubtitle}>Chargement des horaires du Grand Arras...</Text>
      <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
    </View>
  );
}

function MainApp() {
  const [activeTab, setActiveTab] = useState<Tab>('departures');
  const [selectedFavoriteStop, setSelectedFavoriteStop] = useState<StopGroup | null>(null);

  const handleSelectFavoriteStop = (stop: StopGroup) => {
    setSelectedFavoriteStop(stop);
    setActiveTab('departures');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />

      {/* Barre d'en-tête de marque Artis */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Bus size={18} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.brandTitle}>ArtisTrack</Text>
            <Text style={styles.brandSubtitle}>Réseau Artis • Grand Arras</Text>
          </View>
        </View>
        <View style={styles.offlinePill}>
          <View style={styles.offlineDot} />
          <Text style={styles.offlinePillText}>Hybride</Text>
        </View>
      </View>

      {/* Contenu de l'écran actif */}
      <View style={styles.screenContent}>
        {activeTab === 'departures' && (
          <DeparturesScreen
            initialStopGroup={selectedFavoriteStop}
            onClearInitialStop={() => setSelectedFavoriteStop(null)}
          />
        )}
        {activeTab === 'routes' && <RoutesScreen />}
        {activeTab === 'passpass' && <PassPassScreen />}
        {activeTab === 'favorites' && (
          <FavoritesScreen onSelectFavoriteStop={handleSelectFavoriteStop} />
        )}
        {activeTab === 'info' && <NetworkInfoScreen />}
      </View>

      {/* Barre de navigation inférieure (Tabs) */}
      <SafeAreaView style={styles.bottomBarContainer} edges={['bottom']}>
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setActiveTab('departures')}
          >
            <Bus
              size={22}
              color={activeTab === 'departures' ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'departures' && styles.tabLabelActive,
              ]}
            >
              Départs
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setActiveTab('routes')}
          >
            <RouteIcon
              size={22}
              color={activeTab === 'routes' ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'routes' && styles.tabLabelActive,
              ]}
            >
              Lignes
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setActiveTab('passpass')}
          >
            <CreditCard
              size={22}
              color={activeTab === 'passpass' ? '#00D1B2' : colors.textMuted}
            />
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'passpass' && { color: '#00A896', fontWeight: '700' },
              ]}
            >
              Pass Pass
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setActiveTab('favorites')}
          >
            <Heart
              size={22}
              color={activeTab === 'favorites' ? colors.primary : colors.textMuted}
              fill={activeTab === 'favorites' ? colors.primary : 'transparent'}
            />
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'favorites' && styles.tabLabelActive,
              ]}
            >
              Favoris
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setActiveTab('info')}
          >
            <Info
              size={22}
              color={activeTab === 'info' ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'info' && styles.tabLabelActive,
              ]}
            >
              Infos
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Suspense fallback={<LoadingScreen />}>
        <SQLiteProvider
          databaseName="artis.db"
          assetSource={{ assetId: require('./assets/data/artis.db') }}
          useSuspense={true}
        >
          <MainApp />
        </SQLiteProvider>
      </Suspense>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  brandSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  offlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
    marginRight: 5,
  },
  offlinePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
  },
  screenContent: {
    flex: 1,
    backgroundColor: colors.background,
  },
  bottomBarContainer: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tabBar: {
    flexDirection: 'row',
    height: 54,
    backgroundColor: colors.card,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 3,
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  loadingSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
});
