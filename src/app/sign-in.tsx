/**
 * Sign in / create account. Shown instead of the tabs while signed out, because every
 * API route requires a Cognito login. New accounts confirm their email with a code.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthError, confirmSignUp, resendConfirmationCode, signUp } from '@/api/auth';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';

type Mode = 'signIn' | 'signUp' | 'confirm';

export default function SignInScreen() {
  const theme = useTheme();
  const { signIn } = useSession();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const trimmedEmail = email.trim();
  const canSubmit =
    !busy &&
    trimmedEmail.length > 0 &&
    password.length > 0 &&
    (mode !== 'confirm' || code.trim().length > 0);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  // Runs one auth step with shared busy/error handling.
  const run = async (step: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await step();
    } catch (e) {
      if (e instanceof AuthError && e.code === 'UserNotConfirmedException') {
        // Signed up earlier but never entered the code: send a fresh one.
        await resendConfirmationCode(trimmedEmail).catch(() => {});
        setMode('confirm');
        setNotice(`We emailed a new code to ${trimmedEmail}.`);
      } else {
        setError(e instanceof Error ? e.message : 'Something went wrong.');
      }
    } finally {
      setBusy(false);
    }
  };

  // Signing in flips the session, and the root layout swaps this screen for the tabs.
  const submit = () =>
    run(async () => {
      if (mode === 'signIn') {
        await signIn(trimmedEmail, password);
      } else if (mode === 'signUp') {
        await signUp(trimmedEmail, password);
        setMode('confirm');
        setNotice(`We emailed a code to ${trimmedEmail}.`);
      } else {
        await confirmSignUp(trimmedEmail, code.trim());
        await signIn(trimmedEmail, password);
      }
    });

  const inputStyle = [styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.content}>
          <ThemedText type="title">Insight</ThemedText>
          <ThemedText themeColor="textSecondary">
            {mode === 'signIn' && 'Sign in to see and report incidents near you.'}
            {mode === 'signUp' && 'Create an account with your email.'}
            {mode === 'confirm' && 'Enter the code from your email to finish signing up.'}
          </ThemedText>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            editable={mode !== 'confirm'}
            style={inputStyle}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={theme.textSecondary}
            secureTextEntry
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            style={inputStyle}
          />
          {mode === 'signUp' && (
            <ThemedText type="small" themeColor="textSecondary">
              At least 8 characters, with a lowercase letter and a number.
            </ThemedText>
          )}
          {mode === 'confirm' && (
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="Verification code"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              style={inputStyle}
            />
          )}

          {notice && <ThemedText type="small">{notice}</ThemedText>}
          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}

          <Pressable
            onPress={submit}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.text },
              !canSubmit && styles.disabled,
              pressed && styles.pressed,
            ]}>
            {busy ? (
              <ActivityIndicator color={theme.background} />
            ) : (
              <ThemedText type="smallBold" style={{ color: theme.background }}>
                {mode === 'signIn' ? 'Sign in' : mode === 'signUp' ? 'Create account' : 'Confirm'}
              </ThemedText>
            )}
          </Pressable>

          {mode === 'confirm' ? (
            <ThemedView style={styles.links}>
              <Pressable
                disabled={busy}
                onPress={() =>
                  run(async () => {
                    await resendConfirmationCode(trimmedEmail);
                    setNotice(`We emailed a new code to ${trimmedEmail}.`);
                  })
                }>
                <ThemedText type="link">Resend code</ThemedText>
              </Pressable>
              <Pressable disabled={busy} onPress={() => switchMode('signIn')}>
                <ThemedText type="link">Back to sign in</ThemedText>
              </Pressable>
            </ThemedView>
          ) : (
            <Pressable
              disabled={busy}
              onPress={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
              <ThemedText type="link">
                {mode === 'signIn' ? 'New here? Create an account' : 'Have an account? Sign in'}
              </ThemedText>
            </Pressable>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  input: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    fontSize: 16,
  },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Spacing.five,
  },
  links: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
  error: {
    color: '#d33',
  },
});
