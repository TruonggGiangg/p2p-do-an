import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    StatusBar,
    ImageBackground
} from 'react-native';
import { Text, Surface, Button, Avatar, IconButton } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import { loanApi } from '../../services';
import { LoanContract, LoanStatus } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { Colors } from '../../theme';

// Format number with commas
const formatNumber = (num: number | undefined | null): string => {
    if (num === undefined || num === null) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

// Format date
const formatDateDisplay = (dateStr: string | undefined): string => {
    if (!dateStr) return '--/--/----';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '--/--/----';
        return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    } catch (e) {
        return '--/--/----';
    }
};

const getStatusInfo = (status: LoanStatus) => {
    switch (status) {
        case 'waiting': return { label: 'Chờ đầu tư', color: Colors.warning, bg: '#FFF8E1', icon: 'clock-outline' };
        case 'pending': return { label: 'Chờ duyệt', color: Colors.warning, bg: '#FFF8E1', icon: 'clock-outline' };
        case 'approved': return { label: 'Đã duyệt', color: Colors.success, bg: '#E8F5E9', icon: 'check-decagram' };
        case 'success': return { label: 'Đã giải ngân', color: Colors.success, bg: '#E8F5E9', icon: 'check-circle-outline' };
        case 'active':
        case 'on_going': return { label: 'Đang hoạt động', color: Colors.primary, bg: '#E3F2FD', icon: 'trending-up' };
        case 'done':
        case 'closed':
        case 'clean': return { label: 'Đã tất toán', color: Colors.textSecondary, bg: '#ECEFF1', icon: 'check-all' };
        case 'overdue': return { label: 'Quá hạn', color: Colors.error, bg: '#FFEBEE', icon: 'alert-circle-outline' };
        case 'fail':
        case 'rejected': return { label: 'Từ chối', color: Colors.error, bg: '#FFEBEE', icon: 'close-circle-outline' };
        case 'withdrawn': return { label: 'Đã rút', color: Colors.textSecondary, bg: '#ECEFF1', icon: 'cancel' };
        default: return { label: 'Không xác định', color: Colors.textSecondary, bg: '#F5F5F5', icon: 'help-circle-outline' };
    }
};

interface Props {
    navigation: any;
}

export default function LoanListScreen({ navigation }: Props) {
    const { user } = useAuth();
    const [loans, setLoans] = useState<LoanContract[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({ totalActive: 0, totalDebt: 0 });

    const fetchLoans = useCallback(async () => {
        try {
            setLoading(true);
            const data = await loanApi.getMyLoans();
            setLoans(data);

            // Calculate simple stats
            const activeLoans = data.filter(l => ['active', 'disbursed', 'overdue'].includes(l.status));
            const totalDebt = activeLoans.reduce((sum, l) => sum + (l.info.entirelyPay || 0), 0);
            setStats({ totalActive: activeLoans.length, totalDebt });
        } catch (error) {
            console.error('Failed to fetch loans:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    const testFineractUser = async () => {
        try {
            const response = await loanApi.testFineractUser();
            console.log('[DEBUG] Fineract User Test:', JSON.stringify(response, null, 2));
            const data = response.data;
            const msg = `=== KEYCLOAK ===
Username: ${data.keycloak.username}
Name (Token): ${data.keycloak.nameFromToken}
Keycloak ID: ${data.keycloak.keycloakUserId}

=== FINERACT ===
Resolved: ${data.fineract.resolved}
Client ID: ${data.fineract.clientId}
Client Name: ${data.fineract.clientName}
External ID: ${data.fineract.externalId}
Lookup Method: ${data.fineract.lookupMethod}`;
            alert(msg);
        } catch (error: any) {
            alert('Test failed: ' + error.message);
        }
    };

    useEffect(() => { fetchLoans(); }, [fetchLoans]);
    useFocusEffect(useCallback(() => { fetchLoans(); }, [fetchLoans]));

    const handleRefresh = () => { setRefreshing(true); fetchLoans(); };

    const renderLoanItem = ({ item }: { item: LoanContract }) => {
        const status = getStatusInfo(item.status);

        return (
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => navigation.navigate('LoanDetail', { loanId: item.contractId })}
            >
                <Surface style={styles.card} elevation={0}>
                    <View style={styles.cardHeader}>
                        <View style={styles.row}>
                            <View style={[styles.iconBox, { backgroundColor: status.bg }]}>
                                <MaterialCommunityIcons name={status.icon} size={20} color={status.color} />
                            </View>
                            <View style={{ marginLeft: 12 }}>
                                <Text style={styles.loanTitle}>Khoản vay tiêu dùng</Text>
                                <Text style={styles.loanId}>#{item.contractId}</Text>
                            </View>
                        </View>
                        <View style={[styles.badge, { backgroundColor: status.bg }]}>
                            <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.cardBody}>
                        <View style={styles.infoCol}>
                            <Text style={styles.label}>Số tiền vay</Text>
                            <Text style={styles.valueHighlight}>{formatNumber(item.info.capital)} ₫</Text>
                        </View>
                        <View style={styles.infoColRight}>
                            <Text style={styles.label}>Kỳ hạn</Text>
                            <Text style={styles.value}>{item.info.periodMonth} tháng</Text>
                        </View>
                    </View>

                    <View style={styles.cardFooter}>
                        <View style={styles.row}>
                            <MaterialCommunityIcons name="calendar-month" size={14} color={Colors.textSecondary} />
                            <Text style={styles.dateText}> {formatDateDisplay(item.info.createdDate)}</Text>
                        </View>
                        <Text style={styles.rateText}>{item.info.rate}% / tháng</Text>
                    </View>
                </Surface>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

            {/* Header Dashboard Section */}
            <LinearGradient
                colors={[Colors.primary, '#64B5F6']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.headerGradient}
            >
                <View style={styles.headerTop}>
                    <View>
                        <Text style={styles.welcomeText}>Xin chào,</Text>
                        <Text style={styles.userName}>{user?.name || 'Borrower'}!</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <TouchableOpacity onPress={testFineractUser} style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 8, borderRadius: 8 }}>
                            <MaterialCommunityIcons name="bug" size={20} color="white" />
                        </TouchableOpacity>
                        <Avatar.Image size={40} source={{ uri: 'https://i.pravatar.cc/150' }} style={{ backgroundColor: 'white' }} />
                    </View>
                </View>

                <View style={styles.statsContainer}>
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>Dư nợ hiện tại</Text>
                        <Text style={styles.statValue}>{formatNumber(stats.totalDebt)} ₫</Text>
                    </View>
                    <View style={styles.verticalLine} />
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>Khoản vay active</Text>
                        <Text style={styles.statValue}>{stats.totalActive}</Text>
                    </View>
                </View>
            </LinearGradient>

            <View style={styles.contentContainer}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Danh sách khoản vay</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('LoanCreate')}>
                        <Text style={styles.seeAll}>+ Tạo mới</Text>
                    </TouchableOpacity>
                </View>

                <FlatList
                    data={loans}
                    renderItem={renderLoanItem}
                    keyExtractor={(item) => item.contractId}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[Colors.primary]} />}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons name="clipboard-text-outline" size={60} color="#E0E0E0" />
                            <Text style={styles.emptyText}>Bạn chưa có khoản vay nào</Text>
                            <Button mode="contained" onPress={() => navigation.navigate('LoanCreate')} style={styles.createBtn}>
                                Tạo ngay
                            </Button>
                        </View>
                    }
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    headerGradient: {
        paddingTop: 60,
        paddingHorizontal: 20,
        paddingBottom: 40,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    welcomeText: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
    },
    userName: {
        fontFamily: 'Poppins_700Bold',
        fontSize: 24,
        color: '#ffffff',
    },
    statsContainer: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 16,
        padding: 15,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    verticalLine: {
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    statLabel: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 12,
        color: '#E3F2FD',
    },
    statValue: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 18,
        color: '#ffffff',
        marginTop: 4,
    },
    contentContainer: {
        flex: 1,
        marginTop: -20,
        paddingHorizontal: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
        paddingHorizontal: 5,
    },
    sectionTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 16,
        color: Colors.text,
    },
    seeAll: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 14,
        color: Colors.primary,
    },
    list: {
        paddingBottom: 20,
    },
    // Card Styles
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 1, // Minimal elevation for Android
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loanTitle: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 14,
        color: Colors.text,
    },
    loanId: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 12,
        color: Colors.textSecondary,
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    badgeText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 11,
    },
    divider: {
        height: 1,
        backgroundColor: '#F5F5F5',
        marginVertical: 12,
    },
    cardBody: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    infoCol: {
        alignItems: 'flex-start',
    },
    infoColRight: {
        alignItems: 'flex-end',
    },
    label: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 12,
        color: Colors.textSecondary,
        marginBottom: 4,
    },
    value: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 15,
        color: Colors.text,
    },
    valueHighlight: {
        fontFamily: 'Poppins_600SemiBold',
        fontSize: 16,
        color: Colors.primary,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 8,
    },
    dateText: {
        fontFamily: 'Poppins_400Regular',
        fontSize: 12,
        color: Colors.textSecondary,
    },
    rateText: {
        fontFamily: 'Poppins_500Medium',
        fontSize: 12,
        color: Colors.secondary,
    },
    emptyState: {
        alignItems: 'center',
        paddingTop: 50,
    },
    emptyText: {
        fontFamily: 'Poppins_400Regular',
        color: Colors.textSecondary,
        marginTop: 10,
        marginBottom: 20,
    },
    createBtn: {
        borderRadius: 12,
        paddingHorizontal: 20,
    }
});
