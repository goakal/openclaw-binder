import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
const { setRuntime: setBinderRuntime, getRuntime: getBinderRuntime } = createPluginRuntimeStore("Binder runtime not initialized");
export { getBinderRuntime, setBinderRuntime };
