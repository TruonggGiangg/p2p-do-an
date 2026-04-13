import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
  Platform,
  FlatList,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../contexts/ThemeContext';

interface SortOption {
  key: string;
  label: string;
}

interface SortBottomSheetProps {
  readonly visible: boolean;
  readonly options: SortOption[];
  readonly currentSort: string;
  readonly onSelect: (key: any) => void;
  readonly onClose: () => void;
  readonly title?: string;
}

const { height: SCREEN_H } = Dimensions.get('window');

export default function SortBottomSheet({
  visible,
  options,
  currentSort,
  onSelect,
  onClose,
  title = 'Sắp xếp theo',
}: SortBottomSheetProps) {
  const { theme } = useTheme();
  const c = theme.colors;

  const renderItem = ({ item }: { item: SortOption }) => {
    const isActive = currentSort === item.key;
    return (
      <TouchableOpacity
        style={[
          styles.item,
          isActive && { backgroundColor: c.primary + '12' },
        ]}
        onPress={() => {
          onSelect(item.key);
          onClose();
        }}
        activeOpacity={0.7}
      >
        <View style={styles.itemContent}>
          <Text
            style={[
              styles.itemText,
              { color: isActive ? c.primary : c.textPrimary },
              isActive && styles.activeText,
            ]}
          >
            {item.label}
          </Text>
          {isActive && (
            <View style={[styles.checkCircle, { backgroundColor: c.primary }]}>
              <Ionicons name="checkmark" size={14} color="#FFF" />
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.sheetContainer}>
        {/* Backdrop - we simulate transparency with background of container */}
        <Pressable 
          style={[styles.dismissArea, { backgroundColor: 'rgba(0,0,0,0.4)' }]} 
          onPress={onClose} 
        />
        
        <View
          style={[
            styles.sheet,
            { backgroundColor: c.backgroundSecondary || c.background },
          ]}
        >
          <View style={styles.handleWrap}>
            <View
              style={[
                styles.handle,
                { backgroundColor: (c.textMuted || '#999') + '40' },
              ]}
            />
          </View>

          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: c.textPrimary }]}>
              {title}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={[styles.closeBtn, { backgroundColor: c.border + '30' }]}
            >
              <Ionicons name="close" size={20} color={c.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={styles.listWrapper}>
            <FlatList
              data={options}
              renderItem={renderItem}
              keyExtractor={(item) => item.key}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
            />
          </View>
          
          <View style={[styles.footer, { paddingBottom: Platform.OS === 'ios' ? 34 : 20 }]} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    maxHeight: SCREEN_H * 0.7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 25,
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listWrapper: {
    paddingHorizontal: 16,
  },
  listContent: {
    paddingBottom: 20,
  },
  item: {
    borderRadius: 16,
    marginBottom: 4,
    overflow: 'hidden',
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  itemText: {
    fontSize: 15,
    fontWeight: '500',
  },
  activeText: {
    fontWeight: '700',
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    height: 0,
  },
});
