import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface RouteBadgeProps {
  shortName: string;
  color: string;
  textColor?: string;
  size?: 'small' | 'medium' | 'large';
}

export const RouteBadge: React.FC<RouteBadgeProps> = ({
  shortName,
  color,
  textColor = '#FFFFFF',
  size = 'medium',
}) => {
  const isSmall = size === 'small';
  const isLarge = size === 'large';

  const badgeStyles = [
    styles.badge,
    { backgroundColor: color },
    isSmall && styles.badgeSmall,
    isLarge && styles.badgeLarge,
  ];

  const textStyles = [
    styles.text,
    { color: textColor },
    isSmall && styles.textSmall,
    isLarge && styles.textLarge,
  ];

  return (
    <View style={badgeStyles}>
      <Text style={textStyles} numberOfLines={1}>
        {shortName}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 42,
  },
  badgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    minWidth: 32,
  },
  badgeLarge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    minWidth: 54,
  },
  text: {
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  textSmall: {
    fontSize: 11,
    fontWeight: '600',
  },
  textLarge: {
    fontSize: 17,
    fontWeight: '800',
  },
});
