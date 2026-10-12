import { NativeTabs } from "expo-router/unstable-native-tabs";
import { font, useTheme } from "@/theme";

/** Same five destinations as the web app's phone bar, so moving between the two feels familiar. */
export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <NativeTabs
      backgroundColor={c.surface}
      indicatorColor={c.accentSubtle}
      rippleColor={c.surface3}
      iconColor={{ default: c.fgMuted, selected: c.accent }}
      labelStyle={{ default: { color: c.fgMuted, fontFamily: font.medium, fontSize: 12 }, selected: { color: c.fg, fontFamily: font.semibold, fontSize: 12 } }}
      labelVisibilityMode="labeled"
      backBehavior="initialRoute"
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="jobs">
        <NativeTabs.Trigger.Label>Challans</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="receipt_long" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="returns">
        <NativeTabs.Trigger.Label>Returns</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="move_to_inbox" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bills">
        <NativeTabs.Trigger.Label>Payments</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="payments" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="menu" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
