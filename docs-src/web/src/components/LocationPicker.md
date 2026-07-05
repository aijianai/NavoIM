# LocationPicker.tsx

## Purpose

Location picker UI with map preview, place search, and current location button. Uses AMap REST API for geocoding and POI search.

## Exports

- `LocationPickerBody({ embedded, onClose })` — Shared picker body used by LocationPickerHost.

## Key Logic

- **POI search**: `searchPlaces()` calls AMap v5 REST API with keyword.
- **Reverse geocode**: `reverseGeocode()` resolves coordinates to address.
- **Static map**: Preview updates when user picks a result or moves crosshair.
- **Current location**: `navigator.geolocation.getCurrentPosition()` with permission handling.
- **Permission states**: `permissionAsked`, `permissionDenied` for UX feedback.
- **Abort controller**: Cancels in-flight requests on new searches.

## Dependencies

- `useLocationPicker` — open, openPicker, closePicker
- `cn`
- AMap REST API endpoints

## Constraints and Gotchas

- AMap API key is hardcoded.
- `PoiItem` interface: id, name, address, lng, lat.
- `makeStaticMap()` generates static map URL with dimensions.
- `embedded` prop used for mobile full-screen layout.

## Interactions

- `openPicker(callback)` called from Composer to open picker.
- Selected location passed back via callback as `LocationPayload`.
