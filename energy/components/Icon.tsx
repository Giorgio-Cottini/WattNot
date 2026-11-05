// SF Symbols for the few icons of the app.
// [iOS-only] SymbolView renders nothing on Android. Android equivalent:
// MaterialIcons from @expo/vector-icons (expand-more, info-outline, check).

import { SymbolView, type SFSymbol } from "expo-symbols";

interface Props {
  name: SFSymbol;
  size: number;
  color: string;
}

export function Icon({ name, size, color }: Props) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      weight="semibold"
      fallback={null}
    />
  );
}
