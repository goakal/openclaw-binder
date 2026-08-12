import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { binderPlugin } from "./src/channel.js";
import { setBinderRuntime } from "./src/runtime.js";
import { BINDER_SCHEDULING_TOOL_NAMES, createBinderSchedulingTools, } from "./src/scheduling-tools.js";
export default defineChannelPluginEntry({
    id: "binder",
    name: "Binder",
    description: "OpenClaw Binder channel plugin — respond to @mentions in Binder groups",
    plugin: binderPlugin,
    registerFull(api) {
        setBinderRuntime(api.runtime);
        api.registerTool((ctx) => createBinderSchedulingTools(ctx), { names: [...BINDER_SCHEDULING_TOOL_NAMES] });
    },
});
