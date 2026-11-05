# Archived: the Usage view

Decision D08 of `docs/overhaul/PLAN.md` makes v1 a price viewer. The Usage view (the appliance scheduler and its
savings estimate) is kept here, out of the build, instead of being deleted.

## Contents

The files keep their paths relative to the repository root:

| Archived path | Original path |
| --- | --- |
| `energy/app/usage.tsx` | `energy/app/usage.tsx` (the route) |
| `energy/components/usage/**` | `energy/components/usage/**` (charts and frames) |
| `energy/services/usage/SchedulerService.ts` | `energy/services/usage/SchedulerService.ts` (the scheduler) |
| `energy/context/usage/SettingsContext.tsx` | `energy/context/usage/SettingsContext.tsx` (appliances and house settings) |
| `energy/constants/Weights.ts` | `energy/constants/Weights.ts` (hourly load weights) |
| `hourly_load_weights.png`, `loads_distribution.png` | repository root (the weight study) |

## Excluded from the build

`archive/` lies outside `energy/`, the Expo project root. Metro bundles only from `energy/`, `energy/tsconfig.json`
includes only files under `energy/`, and `npx expo lint` lints only `energy/`. Nothing here is compiled, linted or
shipped.

## Depends on the data layer of commit 6a6ec05

The view was written against the data layer that the v1 overhaul replaces. It imports these modules, which no longer
exist on the v1 branch:

- `@/context/common/ThemeContext` (`useTheme`) and `@/constants/Colors`
- `@/context/common/RegionContext` (`useRegions`)
- `@/services/prices/PriceDataService` and the types of `@/domain/types` (`HourlyPrice`)
- `@/components/common/frames/Frame`, `@/components/common/frames/FrameColouredTop`
- `@/components/common/navigation/FloatingBottomBar`
- `@/utils/styles/shadow` (`getShadowStyle`)

It also needs the packages `react-native-svg`, `@expo/vector-icons` and `@react-native-async-storage/async-storage`.

## How to restore it

1. Move the files back: `git mv archive/usage-view/energy/<path> energy/<path>` for each row above.
2. Either check out the old data layer from `6a6ec05` (`git checkout 6a6ec05 -- <path>` for each module listed
   above, with their own imports), or port the view to the v1 store `energy/data/store.ts` and the pure modules in
   `energy/lib/`. The port is the right path: the old layer carries the defects F04, F05, F08, F21 to F24 of
   `docs/audit/2026-10-26/REPORT.md`.
3. Add the route back to `energy/app/_layout.tsx`, wrap the tree in `SettingsProvider`, and add a way to navigate
   to it.
4. Install any package listed above that is missing from `energy/package.json` with `npx expo install <name>`.
5. Fix the scheduler findings F36 to F42 of the audit report before the view ships again.
