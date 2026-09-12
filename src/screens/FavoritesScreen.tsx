import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Heart, Trash2, Bus, MapPin, ChevronRight } from 'lucide-react-native';
import { colors } from '../theme/colors';
import { FavoriteItem, StopGroup } from '../types/gtfs';
import { getFavorites, removeFavorite } from '../services/favoritesService';
import { RouteBadge } from '../components/RouteBadge';

interface FavoritesScreenProps {
  onSelectFavoriteStop: (stop: StopGroup) => void;
}

export const FavoritesScreen: React.FC<FavoritesScreenProps> = ({
  onSelectFavoriteStop,
}) => {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFavs = async () => {
    const list = await getFavorites();
    setFavorites(list);
    setLoading(false);
  };

  useEffect(() => {
    loadFavs();
  }, []);

  const handleRemove = async (item: FavoriteItem) => {
    Alert.alert(
      'Retirer des favoris',
      `Voulez-vous retirer "${item.title}" de vos favoris ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const updated = await removeFavorite(item.id, item.type);
            setFavorites(updated);
          },
        },
      ]
    );
  };

  const handlePressItem = (item: FavoriteItem) => {
    if (item.type === 'stop') {
      onSelectFavoriteStop({
        stop_name: item.title,
        stop_lat: 0,
        stop_lon: 0,
        child_stop_ids: item.childStopIds || [item.id],
      });
    }
  };

  return (
    <View style={styles.container}>
      {favorites.length === 0 && !loading ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Heart size={36} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Aucun favori pour l'instant</Text>
          <Text style={styles.emptySubtitle}>
            Enregistrez vos arrêts et lignes du quotidien en touchant l'icône cœur pour y accéder
            en un clin d'œil.
          </Text>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => handlePressItem(item)}
            >
              <View style={styles.cardLeft}>
                {item.type === 'route' ? (
                  <RouteBadge
                    shortName={item.title}
                    color={item.color || colors.primary}
                    textColor={item.textColor || '#FFFFFF'}
                  />
                ) : (
                  <View style={styles.stopIconCircle}>
                    <MapPin size={20} color={colors.primary} />
                  </View>
                )}

                <View style={styles.cardInfo}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  {item.subtitle ? (
                    <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                  ) : (
                    <Text style={styles.cardSubtitle}>
                      {item.type === 'stop' ? 'Arrêt de bus' : 'Ligne Artis'}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.cardRight}>
                <TouchableOpacity
                  style={styles.trashBtn}
                  onPress={() => handleRemove(item)}
                >
                  <Trash2 size={18} color={colors.textMuted} />
                </TouchableOpacity>
                <ChevronRight size={18} color={colors.border} style={{ marginLeft: 6 }} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: 16,
  },
  card: {
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
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stopIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    marginLeft: 14,
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  cardRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trashBtn: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
