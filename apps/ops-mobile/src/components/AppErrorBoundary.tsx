import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing, typography } from '../theme/tokens';

type Props = {
  children: React.ReactNode;
};

type State = {
  error: Error | null;
  componentStack: string | null;
};

/** Surfaces JS crashes instead of Expo Go’s generic “problem loading” screen. */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, componentStack: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error.message, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  private retry = () => {
    this.setState({ error: null, componentStack: null });
  };

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.root}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>{error.message}</Text>
        {componentStack ? (
          <Text style={styles.stack} numberOfLines={16}>
            {componentStack}
          </Text>
        ) : typeof error.stack === 'string' && error.stack.length > 0 ? (
          <Text style={styles.stack} numberOfLines={12}>
            {error.stack}
          </Text>
        ) : null}
        <Pressable onPress={this.retry} style={styles.button}>
          <Text style={styles.buttonLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xxl,
    backgroundColor: colors.background,
    gap: spacing.md,
  },
  title: {
    fontFamily: fonts.bodyBold,
    fontSize: 22,
    color: colors.foreground,
  },
  message: {
    ...typography.body,
    color: colors.destructive,
  },
  stack: {
    ...typography.tiny,
    color: colors.mutedForeground,
    fontFamily: fonts.body,
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 10,
  },
  buttonLabel: {
    fontFamily: fonts.bodyMedium,
    color: colors.primaryForeground,
  },
});
