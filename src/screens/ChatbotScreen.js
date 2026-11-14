/**
 * ChatbotScreen.js
 * ─────────────────────────────────────────────────────────────────────────────
 * VetBook — AI Chatbot Screen
 *
 * Sections (top → bottom):
 *  1. Top bar          — back | leaf badge + "VetBook AI" + Online/24/7
 *  2. Context banner   — "Ask about your pet's health or book appointments"
 *  3. Message list     — AI bubbles (left, avatar) / user bubbles (right, green)
 *                        + optional quick-action card inside an AI bubble
 *  4. Quick prompts    — horizontal chips (Emergency chip is red-tinted)
 *  5. Disclaimer       — "AI can make mistakes. Call the clinic for emergencies."
 *  6. Input bar        — camera | text input | send
 *
 * API:
 *  - api.sendChatMessage({ message, history }) → POST /chatbot/message
 *    Expected reply shape (flexible):
 *      { reply: { content, quick_action? } }  |  { reply: 'text' }  |  { message: 'text' }
 *    On any error the AI answers with a friendly fallback message.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors, fonts, fontSizes, spacing, radii, shadows } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

// ─── Constants ───────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  { label: 'Book an appointment', icon: 'calendar-outline' },
  { label: 'Vaccine schedule', icon: null },
  { label: 'Clinic hours', icon: null },
  { label: 'Emergency help', icon: 'alert-circle-outline', danger: true },
];

const FALLBACK_REPLY =
  "Sorry, I'm having trouble connecting right now. Please try again in a moment, or call the clinic at 0956-663-1534.";

const HISTORY_LIMIT = 5;

const BOOK_ACTION = {
  type: 'book',
  info: 'I can help you schedule a clinic visit.',
  label: 'Book Now',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatTime = (date) =>
  new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

let idCounter = 0;
const nextId = (prefix) => `${prefix}-${Date.now()}-${idCounter++}`;

/** Normalises whatever the backend returns into { content, quickAction }. */
const parseReply = (data) => {
  const reply = data?.reply ?? data?.message ?? data;
  const content =
    typeof reply === 'string' ? reply : reply?.content ?? reply?.message ?? '';
  const rawAction = (typeof reply === 'object' && (reply?.quick_action ?? reply?.quickAction)) || null;

  let quickAction = null;
  if (rawAction) {
    quickAction = rawAction.type === 'book' || rawAction === 'book' ? BOOK_ACTION : {
      type: rawAction.type ?? 'book',
      info: rawAction.info ?? BOOK_ACTION.info,
      label: rawAction.label ?? BOOK_ACTION.label,
    };
  } else if (/\b(book|schedule)\b.*\b(appointment|visit)\b|\bappointment\b.*\bbook\b/i.test(content)) {
    // The AI suggested booking in plain text — offer a one-tap shortcut.
    quickAction = BOOK_ACTION;
  }
  return { content: content || FALLBACK_REPLY, quickAction };
};

const TypingDots = () => {
  const anim1 = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;
  const anim3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createBounce = (anim, delay) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: -4,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(600 - delay),
        ])
      );
    };

    const a1 = createBounce(anim1, 0);
    const a2 = createBounce(anim2, 150);
    const a3 = createBounce(anim3, 300);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [anim1, anim2, anim3]);

  return (
    <View style={styles.dotsRow}>
      <Animated.View style={[styles.dot, { transform: [{ translateY: anim1 }] }]} />
      <Animated.View style={[styles.dot, { transform: [{ translateY: anim2 }] }]} />
      <Animated.View style={[styles.dot, { transform: [{ translateY: anim3 }] }]} />
    </View>
  );
};

// ─── Screen ──────────────────────────────────────────────────────────────────

const ChatbotScreen = ({ navigation }) => {
  const { user } = useAuth();
  const scrollRef = useRef(null);

  const firstName = user?.name?.split(' ')[0] || 'there';

  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: `Hi ${firstName}! I'm your VetBook AI companion. How can I help you and your pet today?`,
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  // Auto-scroll whenever a message is added or the typing indicator toggles
  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [messages, sending]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleRetry = (msg) => {
    if (!msg || sending) return;
    const retryText = msg.originalUserMessage;
    // Remove the error message from state
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    // Resend the original message through handleSend
    if (retryText) {
      handleSend(retryText);
    }
  };

  const handleSend = async (rawText) => {
    const text = (typeof rawText === 'string' ? rawText : inputText).trim();
    if (!text || sending) return;

    // 1. Add the user's message to the messages state immediately
    const userMsg = { id: nextId('u'), role: 'user', content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);

    // 2. Set sending = true
    setSending(true);

    // 8. Clear inputText
    setInputText('');

    // 3. Build a history array from the last few messages in Gemini format
    const history = messages
      .filter((m) => !m.isError && m.id !== 'welcome')
      .slice(-6)
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

    try {
      // 4. Call api.sendChatMessage({ message: inputText, history })
      const res = await api.sendChatMessage({ message: text, history });

      if (res?.data?.error) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId('err'),
            role: 'assistant',
            content: res.data.reply || FALLBACK_REPLY,
            timestamp: new Date(),
            isError: true,
            originalUserMessage: text,
          },
        ]);
        return;
      }

      const { content, quickAction } = parseReply(res?.data);

      // 5. On success: add the AI reply as a new message
      setMessages((prev) => [
        ...prev,
        { id: nextId('a'), role: 'assistant', content, timestamp: new Date(), quickAction },
      ]);
    } catch (err) {
      console.warn('Chat error:', err?.response?.status ?? err?.message);
      // 6. On error: add a friendly fallback message
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: FALLBACK_REPLY,
          timestamp: new Date(),
          isError: true,
          originalUserMessage: text,
        },
      ]);
    } finally {
      // 7. Set sending = false
      setSending(false);
      // 9. Scroll to bottom
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleQuickPrompt = (text) => handleSend(text);
  const handleBookAction = () => navigation.navigate('BookAppointment');

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderAvatar = () => (
    <View style={styles.avatar}>
      <Ionicons name="leaf" size={14} color={colors.white} />
    </View>
  );

  const renderMessage = (msg) => {
    const isUser = msg.role === 'user';

    if (isUser) {
      return (
        <View key={msg.id} style={[styles.row, styles.rowUser]}>
          <View style={styles.userCol}>
            <View style={[styles.bubble, styles.userBubble]}>
              <Text style={styles.userText}>{msg.content}</Text>
            </View>
            <Text style={[styles.timestamp, styles.timestampUser]}>{formatTime(msg.timestamp)}</Text>
          </View>
        </View>
      );
    }

    return (
      <View key={msg.id} style={[styles.row, styles.rowAi]}>
        {renderAvatar()}
        <View style={styles.aiCol}>
          <View style={[styles.bubble, styles.aiBubble]}>
            <Text style={styles.aiText}>{msg.content}</Text>

            {!!msg.quickAction && (
              <View style={styles.actionCard}>
                <Text style={styles.actionInfo}>{msg.quickAction.info}</Text>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={handleBookAction}
                  activeOpacity={0.85}
                  accessibilityLabel={msg.quickAction.label}
                >
                  <Ionicons name="calendar-outline" size={14} color={colors.white} />
                  <Text style={styles.actionBtnText}>{msg.quickAction.label}</Text>
                </TouchableOpacity>
              </View>
            )}

            {!!msg.isError && (
              <TouchableOpacity
                style={[styles.retryBtn, sending && styles.retryBtnDisabled]}
                onPress={() => handleRetry(msg)}
                disabled={sending}
                activeOpacity={0.85}
                accessibilityLabel="Retry"
              >
                <Ionicons name="refresh-outline" size={13} color={colors.white} />
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.timestamp}>{formatTime(msg.timestamp)}</Text>
        </View>
      </View>
    );
  };

  const canSend = inputText.trim().length > 0 && !sending;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── 1. Top bar ─────────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.iconBtn}
            accessibilityLabel="Go back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.titleWrap}>
            <View style={styles.badge}>
              <Ionicons name="leaf" size={18} color={colors.white} />
            </View>
            <View>
              <Text style={styles.title}>VetBook AI</Text>
              <View style={styles.statusRow}>
                <View style={styles.onlineDot} />
                <Text style={styles.statusText}>Online</Text>
                <Text style={styles.statusDivider}>•</Text>
                <Text style={styles.statusMuted}>24/7</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 2. Context banner ──────────────────────────────────────────── */}
        <View style={styles.banner}>
          <View style={styles.bannerIcon}>
            <Ionicons name="sparkles-outline" size={16} color={colors.amber} />
          </View>
          <View style={styles.bannerTextWrap}>
            <Text style={styles.bannerText}>
              Ask about your pet's health or book appointments
            </Text>
            <Text style={styles.bannerSub}>VetBook Assistant</Text>
          </View>
        </View>

        {/* ── 3. Messages ────────────────────────────────────────────────── */}
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.messages}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map(renderMessage)}

          {sending && (
            <View style={[styles.row, styles.rowAi]}>
              {renderAvatar()}
              <View style={[styles.bubble, styles.aiBubble, styles.typingBubble]}>
                <TypingDots />
                <Text style={styles.typingText}>Typing…</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* ── 4. Quick prompt chips ──────────────────────────────────────── */}
        <View style={styles.chipsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            keyboardShouldPersistTaps="handled"
          >
            {QUICK_PROMPTS.map((chip) => (
              <TouchableOpacity
                key={chip.label}
                style={[styles.chip, chip.danger && styles.chipDanger, sending && styles.chipDisabled]}
                onPress={() => handleQuickPrompt(chip.label)}
                disabled={sending}
                activeOpacity={0.8}
                accessibilityLabel={chip.label}
              >
                {!!chip.icon && (
                  <Ionicons
                    name={chip.icon}
                    size={14}
                    color={chip.danger ? colors.alertRed : colors.primary}
                  />
                )}
                <Text style={[styles.chipText, chip.danger && styles.chipTextDanger]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── 5. Disclaimer ──────────────────────────────────────────────── */}
        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
          <Text style={styles.disclaimerText}>
            AI can make mistakes. Call the clinic for emergencies.
          </Text>
        </View>

        {/* ── 6. Input bar ───────────────────────────────────────────────── */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type your message..."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={1000}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={handleSend}
            editable={!sending}
          />

          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend}
            activeOpacity={0.85}
            accessibilityLabel="Send message"
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="paper-plane" size={18} color={colors.white} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const AVATAR = 30;
const BUBBLE_MAX = '78%';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.sm,
    gap: spacing.md,
  },
  badge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.xl,
    color: colors.textPrimary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primaryLight,
    marginRight: 5,
  },
  statusText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.sm,
    color: colors.primary,
  },
  statusDivider: {
    marginHorizontal: 5,
    fontSize: fontSizes.sm,
    color: colors.textMuted,
  },
  statusMuted: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
  },

  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardLightBeige,
    marginHorizontal: spacing.base,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
  },
  bannerIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.amberLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  bannerTextWrap: { flex: 1 },
  bannerText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  bannerSub: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    marginTop: 1,
  },

  // Messages
  messages: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    marginBottom: spacing.base,
  },
  rowAi: { justifyContent: 'flex-start', alignItems: 'flex-end' },
  rowUser: { justifyContent: 'flex-end' },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginBottom: 18,
  },
  aiCol: { maxWidth: BUBBLE_MAX, alignItems: 'flex-start' },
  userCol: { maxWidth: BUBBLE_MAX, alignItems: 'flex-end' },
  bubble: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  aiBubble: {
    backgroundColor: colors.cardWarm,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  aiText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  userText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    lineHeight: 20,
    color: colors.white,
  },
  timestamp: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.xs,
    color: colors.textMuted,
    marginTop: 4,
  },
  timestampUser: { textAlign: 'right' },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 18,
  },
  typingText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textMuted,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 16,
    paddingHorizontal: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  retryBtnDisabled: {
    opacity: 0.6,
  },
  retryBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.sm,
    color: colors.white,
  },

  // Quick-action card
  actionCard: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
    ...shadows.soft,
  },
  actionInfo: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.body,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
  },
  actionBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: fontSizes.body,
    color: colors.white,
  },

  // Chips
  chipsWrap: { paddingTop: spacing.sm },
  chips: {
    paddingHorizontal: spacing.base,
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  chipDanger: {
    backgroundColor: colors.alertRedLight,
    borderColor: 'rgba(184, 50, 48, 0.25)',
  },
  chipDisabled: { opacity: 0.5 },
  chipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  chipTextDanger: { color: colors.alertRedDark },

  // Disclaimer
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: colors.cardLightBeige,
    marginTop: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.base,
  },
  disclaimerText: {
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: colors.cardWarm,
    borderRadius: 20,
    paddingHorizontal: spacing.base,
    paddingTop: Platform.OS === 'ios' ? 11 : 9,
    paddingBottom: Platform.OS === 'ios' ? 11 : 9,
    fontFamily: fonts.bodyRegular,
    fontSize: fontSizes.md,
    color: colors.textPrimary,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.primaryLight, opacity: 0.6 },
});

export default ChatbotScreen;
