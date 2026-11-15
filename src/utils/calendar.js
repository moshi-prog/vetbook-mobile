/**
 * calendar.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Cross-platform helper to open the device's native Calendar app (Android APK,
 * iOS native, Android PWA, iOS PWA, and Desktop .ics download).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Linking, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';

const formatIcsUtcDate = (date) =>
  date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const escapeIcsText = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');

export const parseCalendarLocalDate = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

/**
 * Compute startDate and endDate for a booking event from date/time inputs.
 */
export const buildCalendarEventDates = (dateValue, timeValue, durationMinutes = 30) => {
  const effectiveDate =
    (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())
      ? dateValue
      : parseCalendarLocalDate(dateValue)) || new Date();

  let hours = 9;
  let minutes = 0;

  if (timeValue) {
    const timeMatch = /(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i.exec(String(timeValue));
    if (timeMatch) {
      const parsedH = Number(timeMatch[1]);
      const parsedM = Number(timeMatch[2]);
      const meridiem = timeMatch[3]?.toUpperCase();
      if (!Number.isNaN(parsedH) && !Number.isNaN(parsedM)) {
        let h = parsedH;
        if (meridiem === 'PM' && h < 12) h += 12;
        if (meridiem === 'AM' && h === 12) h = 0;
        hours = h;
        minutes = parsedM;
      }
    }
  }

  const startDate = new Date(
    effectiveDate.getFullYear(),
    effectiveDate.getMonth(),
    effectiveDate.getDate(),
    hours,
    minutes,
    0
  );
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);
  return { startDate, endDate };
};

export const buildIcsContent = ({ title, description, location, startDate, endDate }) => {
  const uid = `vetbook-${startDate.getTime()}@vetbook.app`;
  const dtStamp = formatIcsUtcDate(new Date());
  const dtStart = formatIcsUtcDate(startDate);
  const dtEnd = formatIcsUtcDate(endDate);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VetBook//Appointment//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `LOCATION:${escapeIcsText(location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
};

/**
 * Open the device's native Calendar app directly across native builds and PWAs.
 */
export async function openPhoneCalendar({ title, description, location, startDate, endDate }) {
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const end = endDate instanceof Date ? endDate : new Date(endDate ?? start.getTime() + 30 * 60 * 1000);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid date provided for calendar event.');
  }

  const safeTitle = String(title ?? 'VetBook Appointment');
  const safeDescription = String(description ?? '');
  const safeLocation = String(location ?? '');

  if (Platform.OS === 'android') {
    await IntentLauncher.startActivityAsync('android.intent.action.INSERT', {
      data: 'content://com.android.calendar/events',
      type: 'vnd.android.cursor.item/event',
      extra: {
        title: safeTitle,
        description: safeDescription,
        eventLocation: safeLocation,
        beginTime: start.getTime(),
        endTime: end.getTime(),
        allDay: false,
      },
    });
    return;
  }

  if (Platform.OS === 'ios') {
    const iosCalUrl = `calshow:${Math.floor(start.getTime() / 1000)}`;
    await Linking.openURL(iosCalUrl);
    return;
  }

  if (Platform.OS === 'web') {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';

    // 1. Android PWA: Launch native Android Calendar directly via intent:// URI
    if (/Android/i.test(ua) && typeof window !== 'undefined') {
      const intentUrl =
        `intent://com.android.calendar/events#Intent;` +
        `scheme=content;` +
        `action=android.intent.action.INSERT;` +
        `type=vnd.android.cursor.item/event;` +
        `S.title=${encodeURIComponent(safeTitle)};` +
        `S.description=${encodeURIComponent(safeDescription)};` +
        `S.eventLocation=${encodeURIComponent(safeLocation)};` +
        `l.beginTime=${start.getTime()};` +
        `l.endTime=${end.getTime()};` +
        `B.allDay=false;` +
        `end`;
      window.location.href = intentUrl;
      return;
    }

    const icsContent = buildIcsContent({
      title: safeTitle,
      description: safeDescription,
      location: safeLocation,
      startDate: start,
      endDate: end,
    });

    // 2. iOS PWA: Open .ics payload directly in the built-in iPhone/iPad Calendar app
    const isIosUa =
      /iPhone|iPad|iPod/i.test(ua) ||
      (/Macintosh/i.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
    if (isIosUa && typeof window !== 'undefined') {
      window.location.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent)}`;
      return;
    }

    // 3. Desktop / Fallback: Trigger .ics download so local system Calendar opens
    if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = 'vetbook-appointment.ics';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      return;
    }
  }

  throw new Error('Calendar launch is not supported on this platform.');
}

export default openPhoneCalendar;

