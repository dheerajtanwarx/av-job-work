import { Image, type ImageSource } from "expo-image";
import { useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

/** Full-screen image with pinch, pan and double-tap zoom. Panning is only enabled while zoomed, so a pager can swipe. */
export function ZoomableImage({ source, onZoomChange }: { source: ImageSource; onZoomChange?: (zoomed: boolean) => void }) {
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);

  const reset = () => {
    "worklet";
    scale.value = withTiming(1);
    saved.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    sx.value = 0;
    sy.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(5, saved.value * e.scale));
    })
    .onEnd(() => {
      saved.value = scale.value;
      if (scale.value <= 1.02) reset();
      if (onZoomChange) onZoomChange(scale.value > 1.02);
    })
    .runOnJS(true);
  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_e, state) => {
      if (saved.value > 1) state.activate();
      else state.fail();
    })
    .onUpdate((e) => {
      tx.value = sx.value + e.translationX;
      ty.value = sy.value + e.translationY;
    })
    .onEnd(() => {
      sx.value = tx.value;
      sy.value = ty.value;
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (saved.value > 1) {
        reset();
        if (onZoomChange) onZoomChange(false);
      } else {
        scale.value = withTiming(2.5);
        saved.value = 2.5;
        tx.value = withTiming((width / 2 - e.x) * 1.5);
        ty.value = withTiming((height / 2 - e.y) * 1.5);
        sx.value = (width / 2 - e.x) * 1.5;
        sy.value = (height / 2 - e.y) * 1.5;
        if (onZoomChange) onZoomChange(true);
      }
    })
    .runOnJS(true);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }] }));
  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
      <Animated.View style={[{ width, height, alignItems: "center", justifyContent: "center" }, style]}>
        <Image source={source} style={{ width, height }} contentFit="contain" transition={150} />
      </Animated.View>
    </GestureDetector>
  );
}
