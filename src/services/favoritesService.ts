import AsyncStorage from '@react-native-async-storage/async-storage';
import { FavoriteItem } from '../types/gtfs';

const FAVORITES_STORAGE_KEY = '@artistrack_favorites';

export async function getFavorites(): Promise<FavoriteItem[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as FavoriteItem[];
  } catch (err) {
    console.error('Erreur lors du chargement des favoris:', err);
    return [];
  }
}

export async function isFavorite(id: string, type: 'stop' | 'route'): Promise<boolean> {
  const current = await getFavorites();
  return current.some((f) => f.id === id && f.type === type);
}

export async function addFavorite(item: FavoriteItem): Promise<FavoriteItem[]> {
  try {
    const current = await getFavorites();
    if (current.some((f) => f.id === item.id && f.type === item.type)) {
      return current;
    }
    const updated = [item, ...current];
    await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Erreur lors de l\'ajout aux favoris:', err);
    return [];
  }
}

export async function removeFavorite(id: string, type: 'stop' | 'route'): Promise<FavoriteItem[]> {
  try {
    const current = await getFavorites();
    const updated = current.filter((f) => !(f.id === id && f.type === type));
    await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('Erreur lors de la suppression des favoris:', err);
    return [];
  }
}

export async function toggleFavorite(item: FavoriteItem): Promise<{ isFav: boolean; list: FavoriteItem[] }> {
  const favs = await getFavorites();
  const exists = favs.some((f) => f.id === item.id && f.type === item.type);
  if (exists) {
    const list = await removeFavorite(item.id, item.type);
    return { isFav: false, list };
  } else {
    const list = await addFavorite(item);
    return { isFav: true, list };
  }
}
