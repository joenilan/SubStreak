# SubStreak Changelog

## 0.1.4

- Reworked the overlay into independent elements (daily goal, streak, custom text) with a grouped/ungrouped layout model.
- Grouped mode lays items out as a vertical/horizontal block with left/center/right justification and a gap; ungrouped gives each element its own position, scale, and rotation.
- Added editor tooling: 3×3 quick-position presets, center buttons, grid snapping, magnetic alignment guides, arrow-key + d-pad nudging, numeric transform inputs, and reset controls.
- Custom text elements can be added, duplicated, hidden, and styled (size/color) per line.
- Overlay editor canvas scales with the window so it's large when maximized.
- Kept the React editor and the Rust loopback overlay HTML in sync for the new model.

## 0.1.3

- Added a dual-PC / LAN overlay source mode for OBS on another machine.
- Added an open-in-browser button beside the overlay URL copy button.
- Added an in-app update check button next to the footer version number.
- The footer update indicator now changes color for checking, current, available, install, and error states.

## 0.1.2

- Added an in-app update check button next to the footer version number.
- The footer update indicator now changes color for checking, current, available, install, and error states.

## 0.1.1

- Replaced the daily goal preset dropdown with a custom numeric input.
- Streamers can now set any whole-number sub goal per day.

## 0.1.0

- Initial build: daily sub goal + daily streak with a set-and-forget tray app.
- Twitch device-code login with secure native token storage and auto-refresh.
- EventSub ingestion of subs, resubs, gift subs, and stream.online.
- Configurable goal target and day-rollover hour.
- Minimize/close to system tray.
