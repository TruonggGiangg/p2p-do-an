/**
 * ImagePickerSheet - Beautiful custom image picker with grid gallery
 * Uses expo-media-library for photo access + expo-image-picker for camera
 * Works with Expo Go (no native modules required)
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    FlatList,
    Dimensions,
    ActivityIndicator,
    Animated,
    Platform,
    Alert,
    StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const ITEM_SPACING = 2;
const ITEM_SIZE = (SCREEN_WIDTH - ITEM_SPACING * (NUM_COLUMNS + 1)) / NUM_COLUMNS;
const PAGE_SIZE = 60;

export interface ImagePickerResult {
    uri: string;
    width?: number;
    height?: number;
    type?: string;
    fileName?: string;
}

interface Props {
    visible: boolean;
    onClose: () => void;
    onSelect: (result: ImagePickerResult) => void;
    title?: string;
    allowCamera?: boolean;
    aspect?: [number, number];
    quality?: number;
    allowsEditing?: boolean;
}

interface AlbumOption {
    id: string;
    title: string;
    count: number;
}

export default function ImagePickerSheet({
    visible,
    onClose,
    onSelect,
    title = 'Chọn ảnh',
    allowCamera = true,
    aspect,
    quality = 0.85,
    allowsEditing = false,
}: Props) {
    const { theme } = useTheme();
    const insets = useSafeAreaInsets();
    const c = theme.colors;

    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [permissionChecked, setPermissionChecked] = useState(false);
    const [assets, setAssets] = useState<MediaLibrary.Asset[]>([]);
    const [endCursor, setEndCursor] = useState<string | undefined>(undefined);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(true);
    const [albums, setAlbums] = useState<AlbumOption[]>([]);
    const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);
    const [showAlbumPicker, setShowAlbumPicker] = useState(false);
    const [selectedUri, setSelectedUri] = useState<string | null>(null);

    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    // Request permission — check existing status first (instant), then request if needed
    // Android 13+ (API 33) requires granular permissions: 'photo' instead of READ_EXTERNAL_STORAGE
    useEffect(() => {
        if (!visible) return;
        (async () => {
            try {
                // First try a non-blocking check — pass granularPermissions for Android 13+
                const existing = await MediaLibrary.getPermissionsAsync(
                    false,
                    ['photo']
                );
                const alreadyGranted = existing.status === 'granted'
                    || (existing as any).accessPrivileges === 'limited'
                    || (existing as any).accessPrivileges === 'all';
                if (alreadyGranted) {
                    setHasPermission(true);
                    setPermissionChecked(true);
                    return;
                }
                // Mark as checked so we show action buttons immediately
                setPermissionChecked(true);
                // Request in background — pass granularPermissions for Android 13+ (READ_MEDIA_IMAGES)
                const permResponse = await MediaLibrary.requestPermissionsAsync(
                    false,
                    ['photo']
                );
                const granted = permResponse.status === 'granted'
                    || (permResponse as any).accessPrivileges === 'limited'
                    || (permResponse as any).accessPrivileges === 'all';
                setHasPermission(granted);
            } catch (err) {
                console.warn('MediaLibrary permission error:', err);
                setPermissionChecked(true);
                setHasPermission(false);
            }
        })();
    }, [visible]);

    // Load albums
    useEffect(() => {
        if (!visible || !hasPermission) return;
        (async () => {
            try {
                const albumList = await MediaLibrary.getAlbumsAsync();
                const albumOptions: AlbumOption[] = [
                    { id: '__all__', title: 'Tất cả ảnh', count: 0 },
                    ...albumList
                        .filter((a) => a.assetCount > 0)
                        .sort((a, b) => b.assetCount - a.assetCount)
                        .map((a) => ({ id: a.id, title: a.title || 'Album', count: a.assetCount })),
                ];
                setAlbums(albumOptions);
            } catch {
                setAlbums([{ id: '__all__', title: 'Tất cả ảnh', count: 0 }]);
            }
        })();
    }, [visible, hasPermission]);

    // Load photos
    const loadPhotos = useCallback(async (reset = false) => {
        if (!hasPermission) return;
        setLoading(true);
        try {
            const options: MediaLibrary.AssetsOptions = {
                first: PAGE_SIZE,
                mediaType: MediaLibrary.MediaType.photo,
                sortBy: [MediaLibrary.SortBy.creationTime],
            };
            if (!reset && endCursor) {
                options.after = endCursor;
            }
            if (selectedAlbum && selectedAlbum !== '__all__') {
                options.album = selectedAlbum;
            }
            const result = await MediaLibrary.getAssetsAsync(options);
            if (reset) {
                setAssets(result.assets);
            } else {
                setAssets((prev) => [...prev, ...result.assets]);
            }
            setEndCursor(result.endCursor);
            setHasMore(result.hasNextPage);
        } catch (err) {
            console.warn('Failed to load photos:', err);
        } finally {
            setLoading(false);
        }
    }, [hasPermission, endCursor, selectedAlbum]);

    // Reset & load when album changes or modal opens
    useEffect(() => {
        if (!visible || !hasPermission) return;
        setAssets([]);
        setEndCursor(undefined);
        setHasMore(true);
        setSelectedUri(null);
        loadPhotos(true);
    }, [visible, hasPermission, selectedAlbum]);

    // Animate sheet
    useEffect(() => {
        if (visible) {
            Animated.spring(slideAnim, {
                toValue: 0,
                damping: 20,
                stiffness: 200,
                useNativeDriver: true,
            }).start();
        } else {
            slideAnim.setValue(SCREEN_HEIGHT);
        }
    }, [visible]);

    const handleClose = useCallback(() => {
        Animated.timing(slideAnim, {
            toValue: SCREEN_HEIGHT,
            duration: 250,
            useNativeDriver: true,
        }).start(() => {
            onClose();
        });
    }, [onClose]);

    const handleSelectAsset = useCallback(async (asset: MediaLibrary.Asset) => {
        try {
            const info = await MediaLibrary.getAssetInfoAsync(asset);
            const uri = info.localUri ?? info.uri;
            if (allowsEditing && aspect) {
                // Use expo-image-picker for editing/cropping
                const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: 'images',
                    allowsEditing: true,
                    aspect,
                    quality,
                });
                if (!result.canceled) {
                    onSelect({
                        uri: result.assets[0].uri,
                        width: result.assets[0].width,
                        height: result.assets[0].height,
                        type: result.assets[0].mimeType || 'image/jpeg',
                        fileName: result.assets[0].fileName || asset.filename,
                    });
                    handleClose();
                }
            } else {
                onSelect({
                    uri,
                    width: asset.width,
                    height: asset.height,
                    type: asset.mediaType === 'photo' ? 'image/jpeg' : 'image/png',
                    fileName: asset.filename,
                });
                handleClose();
            }
        } catch (err) {
            console.warn('Failed to get asset info:', err);
        }
    }, [allowsEditing, aspect, quality, onSelect, handleClose]);

    const handleCamera = useCallback(async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Cần quyền Camera', 'Vui lòng cấp quyền Camera trong Cài đặt');
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            mediaTypes: 'images',
            allowsEditing: allowsEditing,
            aspect,
            quality,
        });
        if (!result.canceled) {
            onSelect({
                uri: result.assets[0].uri,
                width: result.assets[0].width,
                height: result.assets[0].height,
                type: result.assets[0].mimeType || 'image/jpeg',
                fileName: result.assets[0].fileName || 'photo.jpg',
            });
            handleClose();
        }
    }, [allowsEditing, aspect, quality, onSelect, handleClose]);

    // Fallback: dùng expo-image-picker thay vì expo-media-library
    // Luôn hoạt động ngay cả khi MediaLibrary bị từ chối quyền
    const handlePickFromLibrary = useCallback(async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: 'images',
            allowsEditing: allowsEditing,
            aspect,
            quality,
        });
        if (!result.canceled) {
            onSelect({
                uri: result.assets[0].uri,
                width: result.assets[0].width,
                height: result.assets[0].height,
                type: result.assets[0].mimeType || 'image/jpeg',
                fileName: result.assets[0].fileName || 'photo.jpg',
            });
            handleClose();
        }
    }, [allowsEditing, aspect, quality, onSelect, handleClose]);

    const loadMore = useCallback(() => {
        if (hasMore && !loading) {
            loadPhotos(false);
        }
    }, [hasMore, loading, loadPhotos]);

    const renderItem = useCallback(({ item }: { item: MediaLibrary.Asset }) => {
        // Android: asset.uri from MediaLibrary may use 'asset://' scheme which
        // expo-image can't render. Convert to content:// URI for Android.
        const imageUri = Platform.OS === 'android'
            ? `content://media/external/images/media/${item.id}`
            : item.uri;

        return (
            <TouchableOpacity
                style={imgStyles.item}
                onPress={() => handleSelectAsset(item)}
                activeOpacity={0.75}
            >
                <Image
                    source={{ uri: imageUri }}
                    style={imgStyles.image}
                    contentFit="cover"
                    recyclingKey={item.id}
                />
                {item.duration && item.duration > 0 && (
                    <View style={imgStyles.videoBadge}>
                        <Ionicons name="play-circle" size={14} color="#fff" />
                    </View>
                )}
            </TouchableOpacity>
        );
    }, [handleSelectAsset]);

    const renderHeader = () => (
        <View>
            {/* Camera button */}
            {allowCamera && (
                <TouchableOpacity
                    style={[imgStyles.cameraBtn, { backgroundColor: c.primary + '12', borderColor: c.primary + '30' }]}
                    onPress={handleCamera}
                    activeOpacity={0.7}
                >
                    <View style={[imgStyles.cameraBtnIcon, { backgroundColor: c.primary + '20' }]}>
                        <Ionicons name="camera" size={24} color={c.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={[imgStyles.cameraBtnTitle, { color: c.primary }]}>Chụp ảnh</Text>
                        <Text style={[imgStyles.cameraBtnSub, { color: c.textDim }]}>Mở camera để chụp</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={c.textDim} />
                </TouchableOpacity>
            )}
            {/* Fallback picker - luôn hiện, dùng ImagePicker thay vì MediaLibrary */}
            <TouchableOpacity
                style={[imgStyles.cameraBtn, { backgroundColor: c.accent + '12', borderColor: c.accent + '30' }]}
                onPress={handlePickFromLibrary}
                activeOpacity={0.7}
            >
                <View style={[imgStyles.cameraBtnIcon, { backgroundColor: c.accent + '20' }]}>
                    <Ionicons name="images" size={24} color={c.accent} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[imgStyles.cameraBtnTitle, { color: c.accent }]}>Tải ảnh từ thư viện</Text>
                    <Text style={[imgStyles.cameraBtnSub, { color: c.textDim }]}>Chọn ảnh có sẵn trên máy</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={c.textDim} />
            </TouchableOpacity>
        </View>
    );

    const currentAlbumName = useMemo(() => {
        if (!selectedAlbum || selectedAlbum === '__all__') return 'Tất cả ảnh';
        return albums.find((a) => a.id === selectedAlbum)?.title ?? 'Tất cả ảnh';
    }, [selectedAlbum, albums]);

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={handleClose}
        >
            <View style={[imgStyles.overlay]}>
                <TouchableOpacity style={imgStyles.overlayTouchable} onPress={handleClose} activeOpacity={1} />

                <Animated.View
                    style={[
                        imgStyles.sheet,
                        {
                            backgroundColor: c.surface,
                            paddingBottom: insets.bottom,
                            transform: [{ translateY: slideAnim }],
                        },
                    ]}
                >
                    {/* Handle bar */}
                    <View style={imgStyles.handleBar}>
                        <View style={[imgStyles.handle, { backgroundColor: c.border }]} />
                    </View>

                    {/* Header */}
                    <View style={[imgStyles.header, { borderBottomColor: c.border }]}>
                        <TouchableOpacity onPress={handleClose} style={imgStyles.headerBtn}>
                            <Ionicons name="close" size={22} color={c.textPrimary} />
                        </TouchableOpacity>
                        <Text style={[imgStyles.headerTitle, { color: c.textPrimary }]}>{title}</Text>
                        <View style={imgStyles.headerBtn} />
                    </View>

                    {/* Album selector */}
                    {albums.length > 1 && (
                        <TouchableOpacity
                            style={[imgStyles.albumSelector, { borderBottomColor: c.border }]}
                            onPress={() => setShowAlbumPicker(!showAlbumPicker)}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="images" size={18} color={c.primary} />
                            <Text style={[imgStyles.albumName, { color: c.textPrimary }]}>{currentAlbumName}</Text>
                            <Ionicons
                                name={showAlbumPicker ? 'chevron-up' : 'chevron-down'}
                                size={18}
                                color={c.textDim}
                            />
                        </TouchableOpacity>
                    )}

                    {/* Album list dropdown */}
                    {showAlbumPicker && (
                        <View style={[imgStyles.albumDropdown, { backgroundColor: c.surfaceLight, borderColor: c.border }]}>
                            <FlatList
                                data={albums}
                                keyExtractor={(a) => a.id}
                                style={{ maxHeight: 200 }}
                                renderItem={({ item: album }) => (
                                    <TouchableOpacity
                                        style={[
                                            imgStyles.albumItem,
                                            (selectedAlbum ?? '__all__') === album.id && { backgroundColor: c.primary + '10' },
                                        ]}
                                        onPress={() => {
                                            setSelectedAlbum(album.id === '__all__' ? null : album.id);
                                            setShowAlbumPicker(false);
                                        }}
                                    >
                                        <Text style={[
                                            imgStyles.albumItemText,
                                            { color: (selectedAlbum ?? '__all__') === album.id ? c.primary : c.textPrimary },
                                        ]}>
                                            {album.title || 'Album'}
                                        </Text>
                                        {album.count > 0 && (
                                            <Text style={[imgStyles.albumItemCount, { color: c.textDim }]}>{album.count}</Text>
                                        )}
                                        {(selectedAlbum ?? '__all__') === album.id && (
                                            <Ionicons name="checkmark" size={16} color={c.primary} />
                                        )}
                                    </TouchableOpacity>
                                )}
                            />
                        </View>
                    )}

                    {/* Always show action buttons immediately — no loading spinner */}
                    {!hasPermission && (
                        <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
                            {allowCamera && (
                                <TouchableOpacity
                                    style={[imgStyles.cameraBtn, { backgroundColor: c.primary + '12', borderColor: c.primary + '30' }]}
                                    onPress={handleCamera}
                                    activeOpacity={0.7}
                                >
                                    <View style={[imgStyles.cameraBtnIcon, { backgroundColor: c.primary + '20' }]}>
                                        <Ionicons name="camera" size={24} color={c.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[imgStyles.cameraBtnTitle, { color: c.primary }]}>Tự chụp ảnh</Text>
                                        <Text style={[imgStyles.cameraBtnSub, { color: c.textDim }]}>Mở camera để chụp</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color={c.textDim} />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={[imgStyles.cameraBtn, { backgroundColor: c.accent + '12', borderColor: c.accent + '30' }]}
                                onPress={handlePickFromLibrary}
                                activeOpacity={0.7}
                            >
                                <View style={[imgStyles.cameraBtnIcon, { backgroundColor: c.accent + '20' }]}>
                                    <Ionicons name="images" size={24} color={c.accent} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[imgStyles.cameraBtnTitle, { color: c.accent }]}>Tải ảnh từ thư viện</Text>
                                    <Text style={[imgStyles.cameraBtnSub, { color: c.textDim }]}>Chọn ảnh có sẵn trên máy</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={c.textDim} />
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Photo grid */}
                    {hasPermission && (
                        <FlatList
                            data={assets}
                            keyExtractor={(item) => item.id}
                            numColumns={NUM_COLUMNS}
                            renderItem={renderItem}
                            ListHeaderComponent={renderHeader}
                            ListEmptyComponent={
                                loading ? (
                                    <View style={imgStyles.loadingContainer}>
                                        <ActivityIndicator size="large" color={c.primary} />
                                        <Text style={[imgStyles.loadingText, { color: c.textDim }]}>Đang tải ảnh...</Text>
                                    </View>
                                ) : (
                                    <View style={imgStyles.emptyContainer}>
                                        <Ionicons name="image-outline" size={48} color={c.textDim} />
                                        <Text style={[imgStyles.emptyText, { color: c.textSecondary }]}>Không có ảnh nào</Text>
                                    </View>
                                )
                            }
                            onEndReached={loadMore}
                            onEndReachedThreshold={0.5}
                            ListFooterComponent={
                                hasMore && assets.length > 0 ? (
                                    <View style={imgStyles.footer}>
                                        <ActivityIndicator size="small" color={c.primary} />
                                    </View>
                                ) : null
                            }
                            contentContainerStyle={imgStyles.gridContent}
                            columnWrapperStyle={imgStyles.gridRow}
                            showsVerticalScrollIndicator={false}
                            initialNumToRender={18}
                            maxToRenderPerBatch={30}
                            windowSize={5}
                        />
                    )}
                </Animated.View>
            </View>

            {/* Album picker modal */}
        </Modal>
    );
}

const imgStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    overlayTouchable: {
        flex: 0.12,
    },
    sheet: {
        flex: 0.88,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        overflow: 'hidden',
    },
    handleBar: {
        alignItems: 'center',
        paddingVertical: 8,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
    },
    headerBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: 17,
        fontWeight: '700',
    },
    albumSelector: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    albumName: {
        fontSize: 14,
        fontWeight: '600',
    },
    albumDropdown: {
        borderBottomWidth: 1,
        paddingVertical: 4,
    },
    albumItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    albumItemText: {
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
    },
    albumItemCount: {
        fontSize: 12,
    },
    cameraBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginHorizontal: ITEM_SPACING,
        marginVertical: 8,
        padding: 14,
        borderRadius: 16,
        borderWidth: 1,
    },
    cameraBtnIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cameraBtnTitle: {
        fontSize: 15,
        fontWeight: '700',
    },
    cameraBtnSub: {
        fontSize: 12,
        marginTop: 2,
    },
    gridContent: {
        paddingBottom: 20,
    },
    gridRow: {
        gap: ITEM_SPACING,
        paddingHorizontal: ITEM_SPACING,
    },
    item: {
        width: ITEM_SIZE,
        height: ITEM_SIZE,
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: ITEM_SPACING,
    },
    image: {
        width: '100%',
        height: '100%',
    },
    videoBadge: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 10,
        padding: 2,
    },
    loadingContainer: {
        paddingTop: 60,
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
    },
    emptyContainer: {
        paddingTop: 60,
        alignItems: 'center',
        gap: 8,
    },
    emptyText: {
        fontSize: 15,
        fontWeight: '600',
    },
    emptySubText: {
        fontSize: 13,
    },
    footer: {
        paddingVertical: 16,
        alignItems: 'center',
    },
});
