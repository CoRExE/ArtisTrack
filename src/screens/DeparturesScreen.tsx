import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Keyboard,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import * as Location from 'expo-location';
import {
  Search,
  MapPin,
  Heart,
  RotateCw,
  X,
  Bus,
  Clock,
  ChevronRight,
  AlertTriangle,
  Radio,
  QrCode,
} from 'lucide-react-native';
import { colors } from '../theme/colors';
import { Departure, StopGroup } from '../types/gtfs';
import {
  getNextDepartures,
  searchStops,
  getNearbyStops,
} from '../services/artisService';
import {
  getHybridDepartures,
  parseQrUrlOrId,
  fetchApiStops,
} from '../services/realtimeArtisService';
import {
  isFavorite,
  toggleFavorite,
} from '../services/favoritesService';
import { DepartureCard } from '../components/DepartureCard';
import { QrScannerModal } from '../components/QrScannerModal';

interface DeparturesScreenProps {
  initialStopGroup?: StopGroup | null;
  onClearInitialStop?: () => void;
}

export const DeparturesScreen: React.FC<DeparturesScreenProps> = ({
  initialStopGroup,
  onClearInitialStop,
}) => {
  const db = useSQLiteContext();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StopGroup[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [selectedStop, setSelectedStop] = useState<StopGroup | null>(null);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loadingDepartures, setLoadingDepartures] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isFav, setIsFav] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [disruptions, setDisruptions] = useState<string[]>([]);

  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);

  // Traitement d'un QR code flashé avec la caméra
  const handleQrScanSuccess = async (data: string) => {
    const qrMatch = parseQrUrlOrId(data);
    if (!qrMatch) {
      Alert.alert(
        'QR Code non reconnu',
        'Ce code ne semble pas correspondre à un arrêt du réseau Artis.'
      );
      return;
    }

    try {
      const apiStops = await fetchApiStops();
      const found = apiStops.find((s) => s.id === qrMatch.stopId);
      if (found) {
        const lat = typeof found.latitude === 'string' ? parseFloat(found.latitude) : found.latitude;
        const lon = typeof found.longitude === 'string' ? parseFloat(found.longitude) : found.longitude;
        const qrStopGroup: StopGroup = {
          stop_name: found.name,
          stop_lat: isNaN(lat) ? 0 : lat,
          stop_lon: isNaN(lon) ? 0 : lon,
          child_stop_ids: [],
        };
        setSelectedStop(qrStopGroup);
        setSearchQuery('');
        setSearchResults([]);
      } else {
        Alert.alert(
          'Arrêt introuvable',
          `Impossible de trouver l'arrêt #${qrMatch.stopId} dans le réseau Artis.`
        );
      }
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de charger les données de cet arrêt.');
    }
  };

  // Initialisation : arrêt passé en prop (ex: depuis la recherche ou un favori)
  useEffect(() => {
    if (initialStopGroup) {
      setSelectedStop(initialStopGroup);
      onClearInitialStop?.();
    }
  }, [initialStopGroup]);

  // Charger les départs quand l'arrêt sélectionné change (Mode Hybride : API Direct + Fallback SQLite)
  const fetchDepartures = useCallback(async () => {
    if (!selectedStop) return;
    setLoadingDepartures(true);
    try {
      const result = await getHybridDepartures(db, selectedStop, new Date(), 25);
      setDepartures(result.departures);
      setIsLive(result.isLive);
      setDisruptions(result.disruptions);

      // Vérifier le statut favori
      const favStatus = await isFavorite(selectedStop.stop_name, 'stop');
      setIsFav(favStatus);
    } catch (err) {
      console.error('Erreur chargement départs hybrides:', err);
    } finally {
      setLoadingDepartures(false);
      setRefreshing(false);
    }
  }, [db, selectedStop]);

  useEffect(() => {
    fetchDepartures();
    // Rafraîchissement automatique des décomptes toutes les 30 secondes
    const interval = setInterval(() => {
      fetchDepartures();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchDepartures]);

  // Recherche d'arrêts avec debounce simple + détection QR code Artis
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    // Détection QR code Artis (URL portail-qrcode ou ID)
    const qrMatch = parseQrUrlOrId(trimmed);
    if (qrMatch) {
      setIsSearching(true);
      fetchApiStops()
        .then((apiStops) => {
          const found = apiStops.find((s) => s.id === qrMatch.stopId);
          if (found) {
            const lat = typeof found.latitude === 'string' ? parseFloat(found.latitude) : found.latitude;
            const lon = typeof found.longitude === 'string' ? parseFloat(found.longitude) : found.longitude;
            const qrStopGroup: StopGroup = {
              stop_name: found.name,
              stop_lat: isNaN(lat) ? 0 : lat,
              stop_lon: isNaN(lon) ? 0 : lon,
              child_stop_ids: [],
            };
            setSelectedStop(qrStopGroup);
            setSearchQuery('');
            setSearchResults([]);
          }
          setIsSearching(false);
        })
        .catch(() => setIsSearching(false));
      return;
    }

    setIsSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const results = await searchStops(db, searchQuery, userLocation, 15);
        setSearchResults(results);
      } catch (err) {
        console.error('Erreur recherche arrêts:', err);
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timeout);
  }, [searchQuery, db, userLocation]);

  // Détecter la localisation
  const handleLocateMe = async () => {
    Keyboard.dismiss();
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission refusée',
          'La géolocalisation permet de trouver les arrêts de bus les plus proches de vous.'
        );
        setLocationLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      setUserLocation(coords);

      const nearby = await getNearbyStops(db, coords.latitude, coords.longitude, 10);
      setSearchResults(nearby);
      if (nearby.length > 0 && !selectedStop) {
        setSelectedStop(nearby[0]);
      }
    } catch (err) {
      console.error('Erreur géolocalisation:', err);
      Alert.alert('Erreur', 'Impossible de récupérer votre position actuelle.');
    } finally {
      setLocationLoading(false);
    }
  };

  const handleSelectStop = (stop: StopGroup) => {
    Keyboard.dismiss();
    setSelectedStop(stop);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleToggleFavorite = async () => {
    if (!selectedStop) return;
    const res = await toggleFavorite({
      type: 'stop',
      id: selectedStop.stop_name,
      title: selectedStop.stop_name,
      subtitle: `${selectedStop.child_stop_ids.length} quai(s)`,
      childStopIds: selectedStop.child_stop_ids,
    });
    setIsFav(res.isFav);
  };

  return (
    <View style={styles.container}>
      {/* Barre de recherche et géolocalisation */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Search size={18} color={colors.textSecondary} style={styles.searchIcon} />
          <TextInput
            style={styles.input}
            placeholder="Rechercher un arrêt (ex: Gare)..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
              <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.qrBtn}
          onPress={() => setScannerVisible(true)}
          accessibilityLabel="Scanner un QR code d'arrêt"
        >
          <QrCode size={19} color={colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.locationBtn, locationLoading && styles.locationBtnActive]}
          onPress={handleLocateMe}
          disabled={locationLoading}
        >
          {locationLoading ? (
            <ActivityIndicator size="small" color={colors.secondary} />
          ) : (
            <MapPin size={18} color={colors.secondary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Résultats de recherche / Arrêts proches */}
      {searchResults.length > 0 && (
        <View style={styles.dropdownContainer}>
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.stop_name}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.dropdownItem}
                onPress={() => handleSelectStop(item)}
              >
                <View style={styles.dropdownItemLeft}>
                  <Bus size={18} color={colors.primary} style={{ marginRight: 10 }} />
                  <View>
                    <Text style={styles.dropdownItemTitle}>{item.stop_name}</Text>
                    {item.distance_meters !== undefined && (
                      <Text style={styles.dropdownItemDist}>
                        à {item.distance_meters < 1000
                          ? `${item.distance_meters} m`
                          : `${(item.distance_meters / 1000).toFixed(1)} km`}
                      </Text>
                    )}
                  </View>
                </View>
                <ChevronRight size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* En-tête de l'arrêt sélectionné */}
      {selectedStop && (
        <View style={styles.selectedStopBanner}>
          <View style={styles.stopInfo}>
            <View style={styles.stopTitleRow}>
              <Text style={styles.stopName} numberOfLines={1}>
                {selectedStop.stop_name}
              </Text>
            </View>
            <Text style={styles.stopSub}>
              {selectedStop.child_stop_ids.length > 1
                ? `${selectedStop.child_stop_ids.length} points d'arrêt / quais`
                : '1 point d\'arrêt'}
              {selectedStop.distance_meters !== undefined &&
                ` • à ${selectedStop.distance_meters < 1000
                  ? `${selectedStop.distance_meters} m`
                  : `${(selectedStop.distance_meters / 1000).toFixed(1)} km`}`}
            </Text>
          </View>

          <View style={styles.stopActions}>
            <TouchableOpacity
              style={[styles.iconButton, isFav && styles.iconButtonActive]}
              onPress={handleToggleFavorite}
            >
              <Heart
                size={20}
                color={isFav ? colors.primary : colors.textSecondary}
                fill={isFav ? colors.primary : 'transparent'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => {
                setRefreshing(true);
                fetchDepartures();
              }}
            >
              <RotateCw size={19} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Alertes de perturbations signalées sur l'arrêt */}
      {disruptions.length > 0 && (
        <View style={styles.disruptionCard}>
          <AlertTriangle size={18} color={colors.warning} style={styles.disruptionIcon} />
          <View style={styles.disruptionContent}>
            <Text style={styles.disruptionTitle}>Perturbation signalée</Text>
            {disruptions.map((msg, idx) => (
              <Text key={idx} style={styles.disruptionText}>
                {msg}
              </Text>
            ))}
          </View>
        </View>
      )}

      {/* Liste des départs en direct */}
      <View style={styles.listContainer}>
        {selectedStop && (
          <View style={styles.listHeader}>
            <View style={styles.listHeaderLeft}>
              <Clock size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
              <Text style={styles.listHeaderTitle}>Prochains passages</Text>
            </View>
            <View
              style={[
                styles.sourceBadge,
                isLive ? styles.sourceBadgeLive : styles.sourceBadgeOffline,
              ]}
            >
              <View
                style={[
                  styles.sourceDot,
                  isLive ? styles.sourceDotLive : styles.sourceDotOffline,
                ]}
              />
              <Text
                style={[
                  styles.sourceText,
                  isLive ? styles.sourceTextLive : styles.sourceTextOffline,
                ]}
              >
                {isLive ? 'En direct (GPS)' : 'Horaires théoriques'}
              </Text>
            </View>
          </View>
        )}

        {!selectedStop ? (
          <View style={styles.emptyState}>
            <MapPin size={48} color={colors.border} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyTitle}>Sélectionnez un arrêt</Text>
            <Text style={styles.emptySubtitle}>
              Recherchez un arrêt, scannez un QR code Artis ou utilisez la géolocalisation pour afficher les prochains passages.
            </Text>
          </View>
        ) : loadingDepartures && !refreshing ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Calcul des passages en cours...</Text>
          </View>
        ) : departures.length === 0 ? (
          <View style={styles.emptyState}>
            <Bus size={48} color={colors.border} />
            <Text style={styles.emptyTitle}>Aucun bus prévu</Text>
            <Text style={styles.emptySubtitle}>
              Plus aucun passage n'est planifié pour aujourd'hui à cet arrêt.
            </Text>
          </View>
        ) : (
          <FlatList
            data={departures}
            keyExtractor={(item, index) => `${item.trip_id}-${item.stop_id}-${index}`}
            renderItem={({ item }) => <DepartureCard departure={item} />}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  fetchDepartures();
                }}
                colors={[colors.primary]}
              />
            }
          />
        )}
      </View>

      <QrScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        onScanSuccess={handleQrScanSuccess}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  qrBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D9EC',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    height: '100%',
  },
  clearBtn: {
    padding: 4,
  },
  locationBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.secondaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationBtnActive: {
    opacity: 0.7,
  },
  dropdownContainer: {
    position: 'absolute',
    top: 64,
    left: 16,
    right: 16,
    backgroundColor: colors.card,
    borderRadius: 10,
    maxHeight: 280,
    zIndex: 99,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  dropdownItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dropdownItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  dropdownItemDist: {
    fontSize: 12,
    color: colors.secondary,
    fontWeight: '500',
    marginTop: 2,
  },
  selectedStopBanner: {
    backgroundColor: colors.card,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
  },
  stopInfo: {
    flex: 1,
    marginRight: 10,
  },
  stopTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stopName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  stopSub: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 3,
  },
  stopActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: {
    backgroundColor: colors.primaryLight,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  listHeaderTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listContent: {
    paddingBottom: 20,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginTop: 14,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
  },
  disruptionCard: {
    backgroundColor: '#FEF3C7',
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  disruptionIcon: {
    marginTop: 2,
    marginRight: 10,
  },
  disruptionContent: {
    flex: 1,
  },
  disruptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 2,
  },
  disruptionText: {
    fontSize: 12,
    color: '#B45309',
    lineHeight: 16,
  },
  listHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 'auto',
  },
  sourceBadgeLive: {
    backgroundColor: '#DCFCE7',
  },
  sourceBadgeOffline: {
    backgroundColor: colors.badgeBg,
  },
  sourceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  sourceDotLive: {
    backgroundColor: '#15803D',
  },
  sourceDotOffline: {
    backgroundColor: colors.textMuted,
  },
  sourceText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sourceTextLive: {
    color: '#15803D',
  },
  sourceTextOffline: {
    color: colors.textSecondary,
  },
});
