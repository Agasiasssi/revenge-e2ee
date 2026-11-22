/*
 * ctx.ts — Revenge (Bunny) runtime access layer.
 *
 * Everything here reads `window.bunny`, which the Revenge bundle assigns
 * before it loads any plugin, under both the Plugin Browser (bunny) loader
 * and the Vendetta URL-install loader. No react/react-native imports: those
 * come from the runtime through bunny.metro.common, because plugin bundles
 * have no `require`.
 */

const bunny: any = (globalThis as any).bunny;
if (!bunny) throw new Error("E2EE: Revenge runtime not found (window.bunny is missing)");

export const metro = bunny.metro;
export const patcher = bunny.api.patcher; // spitroast: instead/before/after(ident, obj, prop, cb(thisArg, args, orig))
export const fluxDispatcher = bunny.api.flux?.dispatcher ?? bunny.metro.common.FluxDispatcher;
export const React: any = bunny.metro.common.React;
export const RN: any = bunny.metro.common.ReactNative;
export const C: any = bunny.metro.common.components; // AlertModal, AlertActionButton, Stack, TableRowGroup, TableSwitchRow, TextInput, Button...
export const Toaster: any = bunny.metro.common.toasts; // Discord ToastActionCreators
export const alerts: any = bunny.ui.alerts; // { openAlert, dismissAlert }
export const findInReactTree: Function = bunny.utils.findInReactTree;
export const h = React.createElement;

// Scoped per-plugin storage: bunny loader passes bunny.plugin.createStorage,
// vendetta loader only has the global factory — fall back to a fixed path.
export const pluginStorage: any = (bunny.plugin?.createStorage
    ? bunny.plugin.createStorage()
    : bunny.api.storage.createStorage("plugins/storage/com.tobi437a.e2ee.json"));

// ------------------------------ Discord module handles ------------------------------

export const MessageActions: any = metro.findByPropsLazy("sendMessage", "editMessage");
export const UserStore: any = metro.findByStoreNameLazy("UserStore");
export const ChannelStore: any = metro.findByStoreNameLazy("ChannelStore");
export const MessageStore: any = metro.findByStoreNameLazy("MessageStore");
export const SelectedChannelStore: any = metro.findByStoreNameLazy("SelectedChannelStore");

const ChatInputActionsPath = "modules/chat_input/native/action_buttons/ChatInputActions.tsx";
/** Resolved lazily by the lock-button setup; undefined until found. */
export let chatInputActions: any = undefined;
export function findChatInputActions(): any {
    if (chatInputActions) return chatInputActions;
    try {
        const found = metro.findByFilePath(ChatInputActionsPath, true);
        if (found) chatInputActions = found;
    } catch { /* module not loaded yet */ }
    return chatInputActions;
}
