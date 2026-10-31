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
});
