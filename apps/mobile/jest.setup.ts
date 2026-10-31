// The phone's secure storage (Keychain / Keystore), kept in memory for tests: what the app stores, and nothing else.
// Tests read and seed it through test-support's `secureStore`.
const mockStored = new Map<string, string>();

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key: string) => mockStored.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStored.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStored.delete(key);
  }),
}));

(globalThis as { __secureStore?: Map<string, string> }).__secureStore = mockStored;

afterEach(() => {
  mockStored.clear();
  // Undoes test-support's comeBackToTheApp, which moves the clock.
  jest.restoreAllMocks();
  // Module mocks keep their calls and queued answers otherwise; each test starts with the browser closing.
  jest.clearAllMocks();
  (jest.requireMock("expo-web-browser").openAuthSessionAsync as jest.Mock)
    .mockReset()
    .mockImplementation(async () => ({ type: "cancel" }));
  const picker = jest.requireMock("expo-image-picker");
  for (const launch of [picker.launchCameraAsync, picker.launchImageLibraryAsync] as jest.Mock[]) {
    launch.mockReset().mockImplementation(async () => ({ canceled: true, assets: null }));
  }
});

// The phone's random bytes and hashing, made predictable: tests check what is sent, not the cryptography.
jest.mock("expo-crypto", () => ({
  getRandomBytes: jest.fn((count: number) => new Uint8Array(count).fill(7)),
  digestStringAsync: jest.fn(async () => "q83vEjRWeJA+/w=="),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  CryptoEncoding: { BASE64: "base64", HEX: "hex" },
}));

// The camera and the photo library: a test says what the User picks (test-support's `photoPicked`); permission is given.
jest.mock("expo-image-picker", () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

// The in-app browser: a test says how the provider sign-in in it ends (test-support's `browserReturns`).
jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(async () => ({ type: "cancel" })),
}));
