/**
 * RangeSlider — 1 track, 2 thumb (min/max)
 * Dùng onResponder trực tiếp, không PanResponder phức tạp
 */
import React, { useRef, useState, useCallback } from 'react';
import { View, StyleSheet, Text, GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { useTheme } from '../../../contexts/ThemeContext';

interface RangeSliderProps {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly low: number;
  readonly high: number;
  readonly onValueChange: (low: number, high: number) => void;
  readonly trackColor?: string;
  readonly activeColor?: string;
  readonly thumbColor?: string;
  readonly labelColor?: string;
  readonly formatLabel?: (v: number) => string;
}

const THUMB = 26;
const TRACK_H = 4;

export default function RangeSlider({
  min, max, step, low, high, onValueChange,
  trackColor, activeColor, thumbColor, labelColor, formatLabel,
}: RangeSliderProps) {
  const { theme } = useTheme();
  const resolvedTrackColor = trackColor ?? theme.colors.border;
  const resolvedActiveColor = activeColor ?? theme.colors.primary;
  const resolvedThumbColor = thumbColor ?? theme.colors.primary;
  const resolvedLabelColor = labelColor ?? theme.colors.textMuted;
  const trackRef = useRef<View>(null);
  const trackX = useRef(0);
  const trackW = useRef(1);
  const dragging = useRef<'low' | 'high' | null>(null);

  const snap = (v: number) => {
    const s = Math.round(v / step) * step;
    return Math.max(min, Math.min(max, parseFloat(s.toFixed(10))));
  };

  const xToVal = (pageX: number) => {
    const ratio = Math.max(0, Math.min(1, (pageX - trackX.current) / trackW.current));
    return snap(min + ratio * (max - min));
  };

  const valToPercent = (v: number) => ((v - min) / (max - min)) * 100;

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    trackW.current = e.nativeEvent.layout.width;
    // Measure absolute position
    trackRef.current?.measureInWindow((x) => {
      trackX.current = x;
    });
  }, []);

  const onTouchStart = (e: GestureResponderEvent) => {
    // Re-measure position in case of scroll
    trackRef.current?.measureInWindow((x) => {
      trackX.current = x;
    });

    const px = e.nativeEvent.pageX;
    const val = xToVal(px);
    const distLow = Math.abs(val - low);
    const distHigh = Math.abs(val - high);

    // Pick closest thumb
    if (distLow <= distHigh) {
      dragging.current = 'low';
      if (val < high) onValueChange(snap(val), high);
    } else {
      dragging.current = 'high';
      if (val > low) onValueChange(low, snap(val));
    }
  };

  const onTouchMove = (e: GestureResponderEvent) => {
    const val = xToVal(e.nativeEvent.pageX);
    if (dragging.current === 'low') {
      const clamped = Math.min(val, high - step);
      if (clamped >= min) onValueChange(snap(clamped), high);
    } else if (dragging.current === 'high') {
      const clamped = Math.max(val, low + step);
      if (clamped <= max) onValueChange(low, snap(clamped));
    }
  };

  const onTouchEnd = () => { dragging.current = null; };

  const lowPct = valToPercent(low);
  const highPct = valToPercent(high);

  return (
    <View style={s.wrap}>
      {/* Touch area */}
      <View
        ref={trackRef}
        style={s.touchArea}
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onTouchStart}
        onResponderMove={onTouchMove}
        onResponderRelease={onTouchEnd}
      >
        {/* Track bg */}
        <View style={[s.track, { backgroundColor: resolvedTrackColor }]} />

        {/* Active range */}
        <View style={[s.active, {
          left: `${lowPct}%` as any,
          width: `${highPct - lowPct}%` as any,
          backgroundColor: resolvedActiveColor,
        }]} />

        {/* Low thumb */}
        <View style={[s.thumb, {
          left: `${lowPct}%` as any,
          backgroundColor: resolvedThumbColor,
          transform: [{ translateX: -THUMB / 2 }],
        }]} />

        {/* High thumb */}
        <View style={[s.thumb, {
          left: `${highPct}%` as any,
          backgroundColor: resolvedThumbColor,
          transform: [{ translateX: -THUMB / 2 }],
        }]} />
      </View>

      {/* Labels */}
      <View style={s.labels}>
        <Text style={[s.labelTxt, { color: resolvedLabelColor }]}>
          {formatLabel ? formatLabel(min) : min}
        </Text>
        <Text style={[s.labelTxt, { color: resolvedLabelColor }]}>
          {formatLabel ? formatLabel(max) : max}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginVertical: 4 },
  touchArea: {
    height: 44,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    width: '100%',
  },
  active: {
    position: 'absolute',
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    borderColor: '#fff',
    top: (44 - THUMB) / 2,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  labelTxt: { fontSize: 11, fontWeight: '500' },
});
