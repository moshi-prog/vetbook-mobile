import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, fontSizes, spacing, radii, shadows } from '../theme';

const HOURS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MINUTES = ['00', '15', '30', '45'];
const PERIODS = ['AM', 'PM'];

const parseFormattedTime = (value, fallback = { hour: '9', minute: '00', period: 'AM' }) => {
  const m = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i.exec(String(value ?? ''));
  if (!m) return fallback;
  return {
    hour: String(Number(m[1])),
    minute: MINUTES.includes(m[2]) ? m[2] : '00',
    period: m[3].toUpperCase(),
  };
};

/**
 * Reusable VetBook-themed FROM / TO time window selector with 3-column Hour / Minute / AM-PM picker.
 */
const TimeWindowPicker = ({
  title = 'When would you like your surgery?',
  fromTime = '9:00 AM',
  toTime = '4:00 PM',
  onChangeFrom,
  onChangeTo,
}) => {
  const [activeTarget, setActiveTarget] = useState(null); // 'from' | 'to' | null
  const [draftHour, setDraftHour] = useState('9');
  const [draftMinute, setDraftMinute] = useState('00');
  const [draftPeriod, setDraftPeriod] = useState('AM');

  useEffect(() => {
    if (!activeTarget) return;
    const seed = parseFormattedTime(
      activeTarget === 'from' ? fromTime : toTime,
      activeTarget === 'from'
        ? { hour: '9', minute: '00', period: 'AM' }
        : { hour: '4', minute: '00', period: 'PM' }
    );
    setDraftHour(seed.hour);
    setDraftMinute(seed.minute);
    setDraftPeriod(seed.period);
  }, [activeTarget, fromTime, toTime]);

  const toggleTarget = (target) => {
    setActiveTarget((prev) => (prev === target ? null : target));
  };

  const handleApplyTime = () => {
    const formatted = `${draftHour}:${draftMinute} ${draftPeriod}`;
    if (activeTarget === 'from') {
      onChangeFrom?.(formatted);
    } else if (activeTarget === 'to') {
      onChangeTo?.(formatted);
    }
    setActiveTarget(null);
  };

  return (
    <View style={styles.container}>
      {!!title && <Text style={styles.heading}>{title}</Text>}

      <View style={styles.cardsRow}>
        <TouchableOpacity
          style={[styles.windowCard, activeTarget === 'from' && styles.windowCardActive]}
          activeOpacity={0.85}
          onPress={() => toggleTarget('from')}
          accessibilityLabel="Select preferred start time"
        >
          <Text style={styles.windowLabel}>FROM</Text>
          <View style={styles.windowValRow}>
            <Ionicons
              name="time-outline"
              size={15}
              color={activeTarget === 'from' ? colors.primary : colors.textSecondary}
            />
            <Text style={[styles.windowVal, activeTarget === 'from' && styles.windowValActive]}>
              {fromTime}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.windowCard, activeTarget === 'to' && styles.windowCardActive]}
          activeOpacity={0.85}
          onPress={() => toggleTarget('to')}
          accessibilityLabel="Select preferred end time"
        >
          <Text style={styles.windowLabel}>TO</Text>
          <View style={styles.windowValRow}>
            <Ionicons
              name="time-outline"
              size={15}
              color={activeTarget === 'to' ? colors.primary : colors.textSecondary}
            />
            <Text style={[styles.windowVal, activeTarget === 'to' && styles.windowValActive]}>
              {toTime}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {activeTarget && (
        <View style={styles.pickerCard}>
          <View style={styles.pickerHeaderRow}>
            <Text style={styles.pickerTitle}>
              Set {activeTarget === 'from' ? 'FROM (Start)' : 'TO (End)'} Time
            </Text>
            <Text style={styles.pickerPreview}>
              {draftHour}:{draftMinute} {draftPeriod}
            </Text>
          </View>

          <View style={styles.columnsRow}>
            <View style={styles.colWrap}>
              <Text style={styles.colLabel}>Hour</Text>
              <ScrollView style={styles.colScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {HOURS.map((h) => {
                  const selected = draftHour === h;
                  return (
                    <TouchableOpacity
                      key={h}
                      style={[styles.cellBtn, selected && styles.cellBtnActive]}
                      onPress={() => setDraftHour(h)}
                    >
                      <Text style={[styles.cellText, selected && styles.cellTextActive]}>{h}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.colWrap}>
              <Text style={styles.colLabel}>Minute</Text>
              <ScrollView style={styles.colScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {MINUTES.map((m) => {
                  const selected = draftMinute === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.cellBtn, selected && styles.cellBtnActive]}
                      onPress={() => setDraftMinute(m)}
                    >
                      <Text style={[styles.cellText, selected && styles.cellTextActive]}>{m}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.colWrap}>
              <Text style={styles.colLabel}>AM / PM</Text>
              <View style={styles.periodCol}>
                {PERIODS.map((p) => {
                  const selected = draftPeriod === p;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[styles.cellBtn, selected && styles.cellBtnActive]}
                      onPress={() => setDraftPeriod(p)}
                    >
                      <Text style={[styles.cellText, selected && styles.cellTextActive]}>{p}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.doneBtn}
            activeOpacity={0.88}
            onPress={handleApplyTime}
          >
            <Ionicons name="checkmark" size={16} color={colors.white} />
            <Text style={styles.doneBtnText}>Done / Set Time</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FAF6F0',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.base,
    gap: spacing.md,
  },
  heading: {
    fontFamily: fonts.headingBold,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  windowCard: {
    flex: 1,
    backgroundColor: '#F5F1EA',
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: 4,
  },
  windowCardActive: {
    backgroundColor: colors.white,
    borderColor: '#4A7C59',
  },
  windowLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.xs,
    letterSpacing: 0.6,
    color: colors.textSecondary,
  },
  windowValRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  windowVal: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  windowValActive: {
    color: '#4A7C59',
  },
  pickerCard: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: '#4A7C59',
    padding: spacing.md,
    gap: spacing.md,
    ...shadows.soft,
  },
  pickerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pickerTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  pickerPreview: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: '#4A7C59',
  },
  columnsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  colWrap: {
    flex: 1,
    gap: 6,
  },
  colLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  colScroll: {
    maxHeight: 148,
    backgroundColor: '#FAF6F0',
    borderRadius: radii.md,
    padding: 4,
  },
  periodCol: {
    backgroundColor: '#FAF6F0',
    borderRadius: radii.md,
    padding: 4,
    gap: 4,
  },
  cellBtn: {
    paddingVertical: 8,
    borderRadius: radii.sm,
    alignItems: 'center',
    marginBottom: 4,
  },
  cellBtnActive: {
    backgroundColor: '#4A7C59',
  },
  cellText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  cellTextActive: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
  },
  doneBtn: {
    height: 42,
    borderRadius: radii.lg,
    backgroundColor: '#4A7C59',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  doneBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: colors.white,
  },
});

export default TimeWindowPicker;
