import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { CommonButton } from '../../../components/common/CommonButton';
import { CommonCard } from '../../../components/common/CommonCard';

const { width: screenWidth } = Dimensions.get('window');

const KYCIntro: React.FC = () => {
    const { theme } = useTheme();
    const { user } = useAuth();
    const c = theme.colors;
    const navigation = useNavigation<any>();

    const isPending = user?.kycStatus === 'PENDING';
    const isRejected = user?.kycStatus === 'REJECTED';

    const benefits = [
        {
            icon: 'shield-checkmark-outline' as const,
            title: 'Bảo mật tuyệt đối',
            desc: 'Tài khoản của bạn sẽ được bảo vệ bởi lớp định danh sinh trắc học.',
        },
        {
            icon: 'flash-outline' as const,
            title: 'Hạn mức giao dịch cao',
            desc: 'Nâng hạn mức rút tiền và giao dịch hàng ngày lên mức tối đa.',
        },
        {
            icon: 'star-outline' as const,
            title: 'Ưu tiên hỗ trợ',
            desc: 'Được ưu tiên xử lý các khiếu nại và phản hồi từ hệ thống.',
        },
    ];

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="close" size={24} color={c.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Định danh tài khoản</Text>
                <View style={{ width: 44 }} />
            </View>

            <ScrollView contentContainerStyle={[styles.scrollContent, isPending && { flexGrow: 1 }]} showsVerticalScrollIndicator={false}>
                {/* Pending Banner */}
                {isPending && (
                    <View style={[styles.statusBanner, { backgroundColor: 'rgba(240, 185, 11, 0.1)', borderColor: 'rgba(240, 185, 11, 0.3)' }]}>
                        <Ionicons name="time-outline" size={24} color="#F0B90B" />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={[styles.bannerTitle, { color: c.textPrimary }]}>Hồ sơ đang chờ duyệt</Text>
                            <Text style={[styles.bannerDesc, { color: c.textSecondary }]}>
                                Hệ thống sẽ xử lý trong vòng 24h làm việc. Bạn sẽ nhận được thông báo khi hoàn tất.
                            </Text>
                        </View>
                    </View>
                )}

                {/* Rejected Banner */}
                {isRejected && (
                    <View style={[styles.statusBanner, { backgroundColor: 'rgba(255, 77, 79, 0.08)', borderColor: 'rgba(255, 77, 79, 0.25)' }]}>
                        <Ionicons name="close-circle-outline" size={24} color="#FF4D4F" />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={[styles.bannerTitle, { color: '#FF4D4F' }]}>Hồ sơ bị từ chối</Text>
                            <Text style={[styles.bannerDesc, { color: c.textSecondary }]}>
                                {user?.kycRejectReason || 'Hồ sơ không đạt yêu cầu. Vui lòng kiểm tra và nộp lại.'}
                            </Text>
                        </View>
                    </View>
                )}

                <View style={[styles.heroSection, isPending && { flex: 1, justifyContent: 'center', marginTop: 0 }]}>
                    <View style={[styles.illustrationContainer, { backgroundColor: isPending ? 'rgba(240, 185, 11, 0.08)' : c.primaryGlass }]}>
                        <Ionicons
                            name={isPending ? "hourglass-outline" : isRejected ? "refresh-outline" : "shield-checkmark"}
                            size={100}
                            color={isPending ? '#F0B90B' : isRejected ? '#FF4D4F' : c.primary}
                        />
                    </View>
                    <Text style={[styles.title, { color: c.textPrimary }]}>
                        {isPending ? 'Đang xử lý...' : isRejected ? 'Nộp lại hồ sơ' : 'Xác minh eKYC'}
                    </Text>
                    <Text style={[styles.subtitle, { color: c.textSecondary }]}>
                        {isPending
                            ? 'Hồ sơ của bạn đang được đội ngũ kiểm duyệt xem xét.'
                            : isRejected
                                ? 'Hãy chụp lại CCCD rõ nét hơn và thực hiện lại quy trình.'
                                : 'Quy trình xác minh nhanh chóng trong vòng 2 phút để mở khóa mọi tính năng.'}
                    </Text>
                </View>

                {!isPending && (
                    <>
                        <View style={styles.section}>
                            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Tại sao cần xác minh?</Text>
                            {benefits.map((item, index) => (
                                <View
                                    key={index}
                                    style={[styles.benefitItem, { borderBottomColor: c.border }]}
                                >
                                    <View style={[styles.iconBox, { backgroundColor: c.surfaceLight }]}>
                                        <Ionicons name={item.icon} size={24} color={c.primary} />
                                    </View>
                                    <View style={styles.benefitText}>
                                        <Text style={[styles.benefitTitle, { color: c.textPrimary }]}>{item.title}</Text>
                                        <Text style={[styles.benefitDesc, { color: c.textSecondary }]}>{item.desc}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>

                        <View style={styles.prepSection}>
                            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Cần chuẩn bị gì?</Text>
                            <CommonCard style={styles.prepCard}>
                                <View style={styles.prepItem}>
                                    <Ionicons name="card-outline" size={20} color={c.primary} />
                                    <Text style={[styles.prepText, { color: c.textPrimary }]}>CCCD/CMND còn hiệu lực</Text>
                                </View>
                                <View style={styles.prepItem}>
                                    <Ionicons name="sunny-outline" size={20} color={c.primary} />
                                    <Text style={[styles.prepText, { color: c.textPrimary }]}>Nơi có đủ ánh sáng</Text>
                                </View>
                                <View style={styles.prepItem}>
                                    <Ionicons name="videocam-outline" size={20} color={c.primary} />
                                    <Text style={[styles.prepText, { color: c.textPrimary }]}>Khuôn mặt không che chắn</Text>
                                </View>
                            </CommonCard>
                        </View>
                    </>
                )}
            </ScrollView>

            {!isPending && (
                <View style={[styles.footer, { borderTopColor: c.border }]}>
                    <CommonButton
                        title={isRejected ? 'Nộp lại hồ sơ' : 'Bắt đầu ngay'}
                        onPress={() => navigation.navigate('KYCUpdate')}
                    />
                </View>
            )}
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        height: 56,
    },
    backBtn: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontFamily: 'Poppins_700Bold',
    },
    scrollContent: {
        paddingHorizontal: 20,
        paddingBottom: 40,
    },
    heroSection: {
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 40,
    },
    illustrationContainer: {
        width: 160,
        height: 160,
        borderRadius: 80,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 12,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 15,
        fontFamily: 'Poppins_400Regular',
        textAlign: 'center',
        lineHeight: 22,
        paddingHorizontal: 20,
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 18,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 16,
    },
    benefitItem: {
        flexDirection: 'row',
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    iconBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    benefitText: {
        flex: 1,
    },
    benefitTitle: {
        fontSize: 16,
        fontFamily: 'Poppins_600SemiBold',
        marginBottom: 4,
    },
    benefitDesc: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 18,
    },
    prepSection: {
        marginBottom: 20,
    },
    prepCard: {
        padding: 16,
        gap: 12,
    },
    prepItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    prepText: {
        fontSize: 14,
        fontFamily: 'Poppins_500Medium',
    },
    footer: {
        padding: 24,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    statusBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 16,
    },
    bannerTitle: {
        fontSize: 15,
        fontFamily: 'Poppins_700Bold',
        marginBottom: 4,
    },
    bannerDesc: {
        fontSize: 13,
        fontFamily: 'Poppins_400Regular',
        lineHeight: 18,
    },
});

export default KYCIntro;
