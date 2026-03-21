import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet, StatusBar, Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import { BinanceHeader } from '../../../components';
import investService, { InvestmentOrderItem } from '../services/invest.service';

const PAGE_SIZE = 10;

export default function InvestmentOrderListScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const [orders, setOrders] = useState<InvestmentOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState('');

  const fetchOrders = useCallback(async (pageNum = 1, isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
        setError('');
      } else if (pageNum > 1) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError('');
      }

      const result = await investService.getInvestmentOrders({
        page: pageNum,
        pageSize: PAGE_SIZE,
        sortOrder: 'desc'
      });

      const newOrders = result.orders || [];
      
      if (pageNum === 1) {
        setOrders(newOrders);
      } else {
        setOrders(prev => [...prev, ...newOrders]);
      }
      
      setHasMore(newOrders.length === PAGE_SIZE && result.currentPage < result.totalPages);
      setPage(pageNum);
    } catch (e: any) {
      setError(e?.message || 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { 
    fetchOrders(1); 
  }, [fetchOrders]));

  const onRefresh = () => { 
    fetchOrders(1, true); 
  };

  const loadMore = () => {
    if (!loadingMore && hasMore && !loading) {
      fetchOrders(page + 1);
    }
  };

  const styles = useMemo(() => StyleSheet.create({
    container: { 
      flex: 1, 
      backgroundColor: theme.colors.background 
    },
    listContent: { 
      padding: 20, 
      paddingBottom: 40 
    },
    emptyListContent: {
      flexGrow: 1,
      justifyContent: 'center'
    },
    loadingContainer: { 
      flex: 1, 
      justifyContent: 'center', 
      alignItems: 'center' 
    },
    card: { 
      borderRadius: 16, 
      padding: 20, 
      marginBottom: 16,
      backgroundColor: theme.colors.backgroundSecondary 
    },
    cardHeader: { 
      flexDirection: 'row', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      marginBottom: 16 
    },
    cardTitleRow: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 10, 
      flex: 1 
    },
    cardTitle: { 
      fontSize: 18, 
      fontWeight: '600', 
      flex: 1,
      color: theme.colors.text
    },
    statusBadge: { 
      paddingHorizontal: 12, 
      paddingVertical: 4, 
      borderRadius: 12 
    },
    statusText: { 
      fontSize: 12, 
      fontWeight: '600' 
    },
    cardBody: { 
      gap: 10 
    },
    infoRow: { 
      flexDirection: 'row', 
      justifyContent: 'space-between' 
    },
    label: { 
      fontSize: 14,
      color: theme.colors.textSecondary
    },
    value: { 
      fontSize: 14, 
      fontWeight: '600',
      color: theme.colors.text
    },
    progressOuter: { 
      height: 6, 
      borderRadius: 3, 
      marginTop: 16, 
      overflow: 'hidden',
      backgroundColor: theme.colors.border || '#E5E7EB'
    },
    progressInner: { 
      height: '100%', 
      borderRadius: 3 
    },
    emptyContainer: { 
      alignItems: 'center', 
      paddingHorizontal: 32,
      marginTop: -40
    },
    emptyIconWrapper: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: theme.colors.backgroundSecondary, 
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 24,
      shadowColor: theme.colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 16,
      elevation: 4
    },
    emptyTitle: { 
      fontSize: 22, 
      fontWeight: '700', 
      color: theme.colors.text,
      textAlign: 'center',
      marginBottom: 12
    },
    emptySubtitle: { 
      fontSize: 14, 
      textAlign: 'center', 
      color: theme.colors.textSecondary,
      lineHeight: 22,
      marginBottom: 32
    },
    createButton: { 
      flexDirection: 'row', 
      alignItems: 'center', 
      gap: 8, 
      paddingHorizontal: 28, 
      paddingVertical: 16, 
      borderRadius: 28,
      backgroundColor: theme.colors.primary 
    },
    createButtonText: { 
      color: theme.colors.onPrimary || '#fff', 
      fontSize: 16, 
      fontWeight: '700' 
    },
  }), [theme]);

  const renderItem = ({ item }: { item: InvestmentOrderItem }) => {
    const matchPct = item.totalNodes > 0 ? Math.round((item.matchedNodes / item.totalNodes) * 100) : 0;
    const isClosed = item.status === 'closed';

    const statusBadgeColor = isClosed ? '#EF4444' + '20' : theme.colors.primary + '20';
    const statusTextColor = isClosed ? '#EF4444' : theme.colors.primary;
    const progressColor = isClosed ? (theme.colors.success || '#4edea3') : theme.colors.primary;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('InvestmentOrderDetail', { orderId: item._id })}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Ionicons
              name={isClosed ? 'lock-closed' : 'folder-open'}
              size={20}
              color={statusTextColor}
            />
            <Text style={styles.cardTitle} numberOfLines={1}>
              {item.name || `Lệnh #${item._id.slice(-6)}`}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusBadgeColor }]}>
            <Text style={[styles.statusText, { color: statusTextColor }]}>
              {isClosed ? 'Đóng' : 'Mở'}
            </Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Vốn đầu tư</Text>
            <Text style={styles.value}>
              {item.capital.toLocaleString('vi-VN')} ₫
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Đã ghép</Text>
            <Text style={[styles.value, { color: theme.colors.primary }]}>
              {item.matchedCapital.toLocaleString('vi-VN')} ₫ ({matchPct}%)
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Khoản vay</Text>
            <Text style={styles.value}>
              {item.loans?.length || 0} khoản
            </Text>
          </View>
        </View>

        <View style={styles.progressOuter}>
          <View
            style={[styles.progressInner, {
              width: `${matchPct}%`,
              backgroundColor: progressColor,
            }]}
          />
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconWrapper}>
            <Ionicons name="trending-up" size={56} color={theme.colors.primary} />
        </View>
        <Text style={styles.emptyTitle}>Chưa có lệnh đầu tư nào</Text>
        <Text style={styles.emptySubtitle}>
          Tạo lệnh đầu tư để hệ thống tự động tìm và ghép khoản vay phù hợp.
        </Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => navigation.navigate('InvestmentOrderCreate')}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={20} color={theme.colors.onPrimary || '#fff'} />
          <Text style={styles.createButtonText}>Tạo lệnh đầu tư</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderFooter = () => {
    if (!loadingMore) return <View style={{ height: 40 }} />;
    return (
      <View style={{ paddingVertical: 20 }}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <BinanceHeader
        mode="standard"
        title="Lệnh đầu tư"
        showBack={false}
        rightComponents={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <TouchableOpacity
              onPress={() => navigation.navigate('InvestmentOrderCreate')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="add" size={28} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
        }
      />

      {loading && !refreshing && orders.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={item => item._id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={orders.length === 0 ? styles.emptyListContent : styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
        />
      )}
    </View>
  );
}
