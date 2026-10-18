import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

const DELETE_RED = '#d33';

/**
 * Swipe the row left to reveal a Delete button, as in iOS Mail. `onDelete` resolves to
 * true when the row should go away; on false the row slides back closed.
 */
export function SwipeToDelete({
  children,
  onDelete,
}: {
  children: ReactNode;
  onDelete: () => Promise<boolean>;
}) {
  const [deleting, setDeleting] = useState(false);

  const runDelete = async (close: () => void) => {
    setDeleting(true);
    const deleted = await onDelete();
    setDeleting(false);
    if (!deleted) close();
  };

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      containerStyle={styles.container}
      renderRightActions={(_progress, _translation, methods) => (
        <Pressable
          onPress={() => runDelete(methods.close)}
          disabled={deleting}
          accessibilityRole="button"
          accessibilityLabel="Delete report"
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
          {deleting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText type="smallBold" style={styles.actionText}>
              Delete
            </ThemedText>
          )}
        </Pressable>
      )}>
      {/* Screen readers can't swipe, so delete is also an accessibility action on the row. */}
      <View
        accessibilityActions={[{ name: 'delete', label: 'Delete report' }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'delete') runDelete(() => {});
        }}>
        {children}
      </View>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'visible',
  },
  action: {
    width: 88,
    marginLeft: Spacing.two,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DELETE_RED,
  },
  actionText: {
    color: '#fff',
  },
  pressed: {
    opacity: 0.7,
  },
});
