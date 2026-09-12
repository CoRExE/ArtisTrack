import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Phone, Globe, MapPin, ShieldCheck, Database, Info } from 'lucide-react-native';
import { colors } from '../theme/colors';

export const NetworkInfoScreen: React.FC = () => {
  const handleCall = () => {
    Linking.openURL('tel:0800730488');
  };

  const handleOpenWebsite = () => {
    Linking.openURL('https://www.bus-artis.fr');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Carte d'accueil Artis */}
      <View style={styles.bannerCard}>
        <Text style={styles.bannerTitle}>Artis • Grand Arras</Text>
        <Text style={styles.bannerSubtitle}>
          Réseau de transport en commun de la Communauté Urbaine d'Arras, exploité par Keolis Arras.
        </Text>
      </View>

      {/* Mode Hybride / Open Data */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <ShieldCheck size={20} color={colors.success} style={{ marginRight: 8 }} />
          <Text style={styles.sectionTitle}>Mode Hybride : Direct & Hors-ligne</Text>
        </View>
        <Text style={styles.sectionDesc}>
          ArtisTrack interroge l'API temps réel des QR codes du réseau Artis pour vous fournir la position
          GPS des bus en direct, les décomptes à la seconde et les perturbations.
          En cas d'absence de réseau ou de fin de service, l'application bascule automatiquement et de manière transparente sur la base locale GTFS stockée sur votre téléphone.
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>53</Text>
            <Text style={styles.statLabel}>Lignes</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>1 170</Text>
            <Text style={styles.statLabel}>Arrêts</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>54 740</Text>
            <Text style={styles.statLabel}>Passages</Text>
          </View>
        </View>
      </View>

      {/* Contacts officiels */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Info size={20} color={colors.secondary} style={{ marginRight: 8 }} />
          <Text style={styles.sectionTitle}>Services & Contacts Artis</Text>
        </View>

        <TouchableOpacity style={styles.actionRow} onPress={handleCall}>
          <View style={[styles.actionIconCircle, { backgroundColor: '#E8F5E9' }]}>
            <Phone size={18} color={colors.success} />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>0 800 730 488</Text>
            <Text style={styles.actionSubtitle}>Numéro Vert (Appel gratuit depuis un poste fixe)</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionRow} onPress={handleOpenWebsite}>
          <View style={[styles.actionIconCircle, { backgroundColor: colors.secondaryLight }]}>
            <Globe size={18} color={colors.secondary} />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>www.bus-artis.fr</Text>
            <Text style={styles.actionSubtitle}>Site web officiel et infos trafic en direct</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.actionRow}>
          <View style={[styles.actionIconCircle, { backgroundColor: colors.primaryLight }]}>
            <MapPin size={18} color={colors.primary} />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Agence Commerciale Artis</Text>
            <Text style={styles.actionSubtitle}>Place Foch (Gare urbaine d'Arras)</Text>
          </View>
        </View>
      </View>

      {/* Source des données */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Database size={20} color={colors.textSecondary} style={{ marginRight: 8 }} />
          <Text style={styles.sectionTitle}>Source des Données</Text>
        </View>
        <Text style={styles.sectionDesc}>
          Données publiées sous Licence Ouverte (Etalab) par la Communauté Urbaine d'Arras via
          le Point d'Accès National transport.data.gouv.fr.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  bannerCard: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  bannerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  sectionDesc: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.badgeBg,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  actionIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  actionSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
