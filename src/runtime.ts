import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "openclaw/plugin-sdk/plugin-runtime";

const { setRuntime: setBinderRuntime, getRuntime: getBinderRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Binder runtime not initialized");

export { getBinderRuntime, setBinderRuntime };
