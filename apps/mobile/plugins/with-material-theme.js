// Makes the Android app theme a Material Components theme.
//
// DateField opens @react-native-community/datetimepicker with `design: "material"` (Google's MaterialDatePicker), which
// throws "requires a value for the materialCalendarTheme attribute" — killing the app — under Expo's default
// Theme.AppCompat parent. The ".Bridge" variant adds the Material base attributes while keeping every other widget's
// AppCompat styling, so nothing else in the app changes. The Bridge themes do NOT set the calendar theme attributes
// (only the full Theme.MaterialComponents does), so those are added explicitly. android/ is regenerated on every
// prebuild, so the edit lives here rather than in styles.xml.
const { withAndroidStyles } = require("expo/config-plugins");

const PARENT = "Theme.MaterialComponents.DayNight.NoActionBar.Bridge";

const ITEMS = {
  materialCalendarStyle: "@style/Widget.MaterialComponents.MaterialCalendar",
  materialCalendarTheme: "@style/ThemeOverlay.MaterialComponents.MaterialCalendar",
  materialCalendarFullscreenTheme: "@style/ThemeOverlay.MaterialComponents.MaterialCalendar.Fullscreen",
};

module.exports = function withMaterialTheme(config) {
  return withAndroidStyles(config, (cfg) => {
    const appTheme = cfg.modResults.resources.style?.find((s) => s.$.name === "AppTheme");
    if (!appTheme) throw new Error("with-material-theme: AppTheme not found in styles.xml");
    appTheme.$.parent = PARENT;
    appTheme.item = (appTheme.item ?? []).filter((i) => !(i.$.name in ITEMS));
    for (const [name, value] of Object.entries(ITEMS)) appTheme.item.push({ $: { name }, _: value });
    return cfg;
  });
};
