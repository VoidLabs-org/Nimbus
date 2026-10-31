import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform } from "react-native";

/**
 * The `User-Agent` every request sends, such as "Nimbus/1.0.0 (iPhone; iOS 18.1)". The API names the Session after
 * it in the Sessions list: "Nimbus for iPhone", "Nimbus for iPad" or "Nimbus for Android".
 */
export function nimbusUserAgent(): string {
  const version = Constants.expoConfig?.version ?? "0.0.0";
  return `Nimbus/${version} (${phone()})`;
}

function phone(): string {
  if (Platform.OS === "ios") {
    return Device.deviceType === Device.DeviceType.TABLET
      ? `iPad; iPadOS ${Device.osVersion ?? ""}`.trim()
      : `iPhone; iOS ${Device.osVersion ?? ""}`.trim();
  }
  return `Android ${Device.osVersion ?? Platform.Version}`;
}
