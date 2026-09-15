import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSQLiteContext } from 'expo-sqlite';
import { ChevronRight, ArrowLeftRight, X, Clock, MapPin, Bus } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { Route, RouteCategory, RouteDirection, RouteStop, TimetableSlot } from '../types/gtfs';
import { getRoutes, getRouteDirections, getTimetableForStopAndRoute } from '../services/artisService';
import { RouteBadge } from '../components/RouteBadge';

interface CategoryFilter {
  id: RouteCategory | 'all';
  label: string;
}

const CATEGORIES: CategoryFilter[] = [
  { id: 'all', label: 'Toutes' },
  { id: 'urbaine', label: 'Urbaines (1-10)' },
  { id: 'navette', label: 'Navettes & Citadines' },
  { id: 'periurbaine', label: 'Périurbaines' },
  { id: 'scolaire', label: 'Scolaires' },
  { id: 'tad', label: 'TAD' },
];

export const RoutesScreen: React.FC = () => {
  const db = useSQLiteContext();

  const [selectedCategory, setSelectedCategory] = useState<RouteCategory | 'all'>('all');
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Détail de Ligne
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [directions, setDirections] = useState<RouteDirection[]>([]);
  const [activeDirectionIndex, setActiveDirectionIndex] = useState(0);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Modal Fiche Horaire d'un arrêt
  const [selectedStopForTimetable, setSelectedStopForTimetable] = useState<RouteStop | null>(null);
  const [timetable, setTimetable] = useState<TimetableSlot[]>([]);
  const [loadingTimetable, setLoadingTimetable] = useState(false);

  // Chargement des lignes directement depuis la base SQLite locale
  const loadRoutes = async () => {
    setLoading(true);
    try {
      const filter = selectedCategory === 'all' ? undefined : selectedCategory;
      const res = await getRoutes(db, filter);
      setRoutes(res);
    } catch (err) {
      console.error('Erreur chargement lignes SQLite:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoutes();
  }, [db, selectedCategory]);

  // Ouverture d'une ligne
  const handleOpenRoute = async (route: Route) => {
    setSelectedRoute(route);
    setLoadingDetails(true);
    setActiveDirectionIndex(0);
    try {
      const dirs = await getRouteDirections(db, route.route_id);
      setDirections(dirs);
    } catch (err) {
      console.error('Erreur chargement directions:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Consultation de la grille horaire à un arrêt
  const handleOpenTimetable = async (stop: RouteStop) => {
    if (!selectedRoute) return;
    setSelectedStopForTimetable(stop);
    setLoadingTimetable(true);
    try {
      const currentDir = directions[activeDirectionIndex]?.direction_id;
      const slots = await getTimetableForStopAndRoute(
        db,
        [stop.stop_id],
        selectedRoute.route_id,
        currentDir,
        new Date()
      );
      setTimetable(slots);
    } catch (err) {
      console.error('Erreur chargement grille horaire:', err);
    } finally {
      setLoadingTimetable(false);
    }
  };

  return (
    <View style={styles.container}>

      {/* Filtres par catégories (Chips) */}
      <View style={styles.chipsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsScroll}>
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => setSelectedCategory(cat.id)}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Liste des lignes */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={routes}
          keyExtractor={(item) => item.route_id}
          contentContainerStyle={styles.routesList}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.routeCard} onPress={() => handleOpenRoute(item)}>
              <View style={styles.routeCardLeft}>
                <RouteBadge
                  shortName={item.route_short_name}
                  color={item.route_color}
                  textColor={item.route_text_color}
                  size="large"
                />
                <View style={styles.routeInfo}>
                  <Text style={styles.routeLongName} numberOfLines={2}>
                    {item.route_long_name}
                  </Text>
                  {item.route_desc ? (
                    <Text style={styles.routeDesc} numberOfLines={1}>
                      {item.route_desc}
                    </Text>
                  ) : null}
                </View>
              </View>
              <ChevronRight size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}

      {/* MODAL : Détail d'une ligne (arrêts et sens de circulation) */}
      <Modal
        visible={!!selectedRoute}
        animationType="slide"
        onRequestClose={() => {
          setSelectedRoute(null);
          setDirections([]);
        }}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom', 'left', 'right']}>
          {selectedRoute && (
            <>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  <RouteBadge
                    shortName={selectedRoute.route_short_name}
                    color={selectedRoute.route_color}
                    textColor={selectedRoute.route_text_color}
                    size="large"
                  />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={styles.modalTitle} numberOfLines={1}>
                      {selectedRoute.route_long_name}
                    </Text>
                    <Text style={styles.modalSubtitle}>Plan de ligne et arrêts</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => {
                    setSelectedRoute(null);
                    setDirections([]);
                  }}
                >
                  <X size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              {loadingDetails ? (
                <View style={styles.centered}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              ) : directions.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptySubtitle}>Aucun arrêt disponible pour cette ligne.</Text>
                </View>
              ) : (
                <>
                  {/* Basculeur de direction si plusieurs directions */}
                  {directions.length > 1 && (
                    <View style={styles.directionToggleContainer}>
                      <TouchableOpacity
                        style={styles.directionToggleBtn}
                        onPress={() =>
                          setActiveDirectionIndex((prev) => (prev === 0 ? 1 : 0))
                        }
                      >
                        <ArrowLeftRight size={16} color={colors.primary} style={{ marginRight: 8 }} />
                        <Text style={styles.directionToggleText} numberOfLines={1}>
                          Vers : {directions[activeDirectionIndex]?.destination}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Liste des arrêts ordonnés sous forme de frise */}
                  <FlatList
                    data={directions[activeDirectionIndex]?.stops || []}
                    keyExtractor={(item) => `${item.stop_id}-${item.stop_sequence}`}
                    contentContainerStyle={styles.stopsTimeline}
                    renderItem={({ item, index }) => {
                      const totalStops = directions[activeDirectionIndex]?.stops.length || 0;
                      const isFirst = index === 0;
                      const isLast = index === totalStops - 1;

                      return (
                        <TouchableOpacity
                          style={styles.timelineItem}
                          onPress={() => handleOpenTimetable(item)}
                        >
                          <View style={styles.timelineLeft}>
                            <View
                              style={[
                                styles.timelineDot,
                                { borderColor: selectedRoute.route_color },
                                (isFirst || isLast) && { backgroundColor: selectedRoute.route_color },
                              ]}
                            />
                            {!isLast && (
                              <View
                                style={[
                                  styles.timelineLine,
                                  { backgroundColor: selectedRoute.route_color },
                                ]}
                              />
                            )}
                          </View>

                          <View style={styles.timelineContent}>
                            <Text style={styles.timelineStopName}>{item.stop_name}</Text>
                            <Text style={styles.timelineAction}>Toucher pour voir les horaires</Text>
                          </View>

                          <Clock size={16} color={colors.textMuted} />
                        </TouchableOpacity>
                      );
                    }}
                  />
                </>
              )}
            </>
          )}
        </SafeAreaView>

        {/* SOUS-MODAL : Fiche horaire complète pour un arrêt donné */}
        <Modal
          visible={!!selectedStopForTimetable}
          animationType="fade"
          transparent
          onRequestClose={() => setSelectedStopForTimetable(null)}
        >
          <View style={styles.subModalOverlay}>
            <View style={styles.subModalCard}>
              <View style={styles.subModalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subModalTitle}>{selectedStopForTimetable?.stop_name}</Text>
                  <Text style={styles.subModalSubtitle}>
                    {selectedRoute?.route_short_name} • {directions[activeDirectionIndex]?.destination}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setSelectedStopForTimetable(null)}
                >
                  <X size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              {loadingTimetable ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 30 }} />
              ) : timetable.length === 0 ? (
                <Text style={styles.emptySubtitle}>Aucun passage trouvé pour cet arrêt aujourd'hui.</Text>
              ) : (
                <FlatList
                  data={timetable}
                  keyExtractor={(item, idx) => `${item.trip_id}-${idx}`}
                  numColumns={4}
                  contentContainerStyle={styles.timetableGrid}
                  renderItem={({ item }) => (
                    <View style={styles.timetableTimeSlot}>
                      <Text style={styles.timeSlotText}>{item.departure_time}</Text>
                    </View>
                  )}
                />
              )}
            </View>
          </View>
        </Modal>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  chipsContainer: {
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.badgeBg,
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  routesList: {
    padding: 16,
  },
  routeCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  routeCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  routeInfo: {
    marginLeft: 14,
    flex: 1,
  },
  routeLongName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  routeDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  directionToggleContainer: {
    padding: 12,
    backgroundColor: colors.secondaryLight,
  },
  directionToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  directionToggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.secondary,
    flex: 1,
  },
  stopsTimeline: {
    padding: 20,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    paddingVertical: 6,
  },
  timelineLeft: {
    width: 24,
    alignItems: 'center',
    marginRight: 14,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
    backgroundColor: colors.card,
    zIndex: 2,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 38,
    marginTop: -2,
    marginBottom: -2,
  },
  timelineContent: {
    flex: 1,
  },
  timelineStopName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  timelineAction: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  subModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  subModalCard: {
    width: '100%',
    maxHeight: '70%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  subModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 10,
  },
  subModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  subModalSubtitle: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
    marginTop: 3,
  },
  timetableGrid: {
    paddingVertical: 10,
  },
  timetableTimeSlot: {
    flex: 1 / 4,
    backgroundColor: colors.badgeBg,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    margin: 4,
  },
  timeSlotText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
});

