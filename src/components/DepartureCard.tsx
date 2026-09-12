import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Departure } from '../types/gtfs';
import { RouteBadge } from './RouteBadge';
import { colors } from '../theme/colors';

interface DepartureCardProps {
  departure: Departure;
}

export const DepartureCard: React.FC<DepartureCardProps> = ({ departure }) => {
  const isImminent = departure.minutes_remaining <= 2;
  const isClose = departure.minutes_remaining <= 10;
  const isRealtime = !!departure.is_realtime;

  let countdownText: string;
  if (departure.countdown_seconds !== undefined && departure.countdown_seconds < 60 && departure.countdown_seconds >= 0) {
    countdownText = departure.countdown_seconds <= 15 ? "À l'arrêt" : "< 1 min";
  } else if (departure.minutes_remaining === 0) {
    countdownText = "À l'arrêt";
  } else if (departure.minutes_remaining === 1) {
    countdownText = '1 min';
  } else {
    countdownText = `${departure.minutes_remaining} min`;
  }

  const hasDelay =
    isRealtime &&
    departure.theoretical_time &&
    departure.theoretical_time !== departure.departure_time;

  return (
    <View style={styles.card}>
      <View style={styles.leftSection}>
        <RouteBadge
          shortName={departure.route_short_name}
          color={departure.route_color}
          textColor={departure.route_text_color}
        />
        <View style={styles.infoSection}>
          <Text style={styles.destination} numberOfLines={1}>
            {departure.trip_headsign}
          </Text>
          <View style={styles.stopDetailRow}>
            <Text style={styles.stopDetail} numberOfLines={1}>
              Arrêt : {departure.stop_name}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.rightSection}>
        <View style={styles.badgeRow}>
          {isRealtime && (
            <View style={styles.liveTag}>
              <View style={styles.liveDot} />
              <Text style={styles.liveTagText}>GPS</Text>
            </View>
          )}
          <View
            style={[
              styles.countdownBadge,
              isImminent
                ? styles.countdownImminent
                : isClose
                ? styles.countdownClose
                : styles.countdownNormal,
            ]}
          >
            <Text
              style={[
                styles.countdownText,
                isImminent
                  ? styles.countdownTextImminent
                  : isClose
                  ? styles.countdownTextClose
                  : styles.countdownTextNormal,
              ]}
            >
              {countdownText}
            </Text>
          </View>
        </View>

        <View style={styles.timeRow}>
          {hasDelay && (
            <Text style={styles.theoreticalTimeText}>
              {departure.theoretical_time}
            </Text>
          )}
          <Text style={[styles.timeText, isRealtime && styles.timeTextLive]}>
            {departure.departure_time}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
    elevation: 2,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  infoSection: {
    marginLeft: 12,
    flex: 1,
  },
  destination: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  stopDetail: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  rightSection: {
    alignItems: 'flex-end',
  },
  countdownBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 3,
  },
  countdownImminent: {
    backgroundColor: '#FFEBEE',
  },
  countdownClose: {
    backgroundColor: '#FFF8E1',
  },
  countdownNormal: {
    backgroundColor: colors.badgeBg,
  },
  countdownText: {
    fontSize: 12,
    fontWeight: '700',
  },
  countdownTextImminent: {
    color: colors.primary,
  },
  countdownTextClose: {
    color: colors.warning,
  },
  countdownTextNormal: {
    color: colors.textSecondary,
  },
  stopDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#15803D',
    marginRight: 3,
  },
  liveTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.2,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  theoreticalTimeText: {
    fontSize: 11,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  timeText: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '500',
  },
  timeTextLive: {
    color: colors.text,
    fontWeight: '700',
  },
});
